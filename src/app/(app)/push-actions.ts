"use server";

import { z } from "zod";
import { getCurrentMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type PushActionResult = { ok: boolean };

const subscriptionSchema = z.object({
  endpoint: z.url().max(1000).startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export async function savePushSubscription(input: unknown): Promise<PushActionResult> {
  const member = await getCurrentMember();
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  // User-scoped client: RLS lets a member write only their own rows.
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ member_id: member.id, endpoint: parsed.data.endpoint, keys: parsed.data.keys }, { onConflict: "endpoint" });
  if (error) {
    console.error("savePushSubscription failed", error.code);
    return { ok: false };
  }
  return { ok: true };
}

export async function deletePushSubscription(endpoint: string): Promise<PushActionResult> {
  const member = await getCurrentMember();
  const parsed = z.string().max(1000).safeParse(endpoint);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("member_id", member.id)
    .eq("endpoint", parsed.data);
  if (error) {
    console.error("deletePushSubscription failed", error.code);
    return { ok: false };
  }
  return { ok: true };
}
