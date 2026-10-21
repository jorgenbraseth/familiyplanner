import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type PushPayload = { title: string; body: string; url: string; tag?: string };

const TTL_SECONDS = 60 * 60 * 24;

let configured: boolean | null = null;

/** Sets the VAPID details once. Returns false (and logs once) when push isn't configured. */
function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    console.warn("push disabled: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY or VAPID_SUBJECT is not set");
    configured = false;
    return false;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch {
    console.warn("push disabled: the VAPID settings are invalid");
    configured = false;
  }
  return configured;
}

type SubscriptionRow = { id: string; member_id: string; endpoint: string; keys: { p256dh?: string; auth?: string } | null };

/**
 * Sends a push to every device of the given members. Never throws; no-op without VAPID settings.
 * Logs only status codes and ids, never the payload text.
 */
export async function notifyMembers(memberIds: string[], payload: PushPayload): Promise<void> {
  try {
    if (memberIds.length === 0 || !ensureConfigured()) return;

    // Service-role client on purpose: RLS only lets a member read their own subscriptions,
    // but here one member's action (a parent publishing, a child asking for a star) pushes to others.
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("push_subscriptions")
      .select("id, member_id, endpoint, keys")
      .in("member_id", memberIds);
    if (error) {
      console.error("push: could not read subscriptions", error.code);
      return;
    }

    const body = JSON.stringify(payload);
    const rows = (data ?? []) as SubscriptionRow[];
    const results = await Promise.allSettled(
      rows.map(async (row) => {
        const { p256dh, auth } = row.keys ?? {};
        if (!p256dh || !auth) return { row, gone: true };
        try {
          await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh, auth } }, body, { TTL: TTL_SECONDS });
          return { row, gone: false };
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          console.error("push: send failed", row.id, status ?? "no status");
          return { row, gone: status === 404 || status === 410 };
        }
      }),
    );

    const goneIds = results.flatMap((r) => (r.status === "fulfilled" && r.value.gone ? [r.value.row.id] : []));
    if (goneIds.length > 0) {
      const { error: deleteError } = await admin.from("push_subscriptions").delete().in("id", goneIds);
      if (deleteError) console.error("push: could not delete expired subscriptions", deleteError.code);
    }
  } catch {
    console.error("push: notifyMembers failed");
  }
}

/** Pushes to every parent. */
export async function notifyParents(payload: PushPayload): Promise<void> {
  try {
    if (!ensureConfigured()) return;
    // Service-role client: the caller may be a child, who can't list the parents' ids under RLS.
    const admin = createAdminClient();
    const { data, error } = await admin.from("members").select("id").eq("role", "parent");
    if (error) {
      console.error("push: could not read parents", error.code);
      return;
    }
    await notifyMembers((data ?? []).map((m) => m.id as string), payload);
  } catch {
    console.error("push: notifyParents failed");
  }
}
