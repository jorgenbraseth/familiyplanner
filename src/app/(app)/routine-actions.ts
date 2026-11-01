"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentMember } from "@/lib/auth";
import { dateInTimeZone, dayKey } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { notifyParents } from "@/lib/push";
import { routineProgress, type RoutineSlot } from "@/lib/routines";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/view-as";

const inputSchema = z.object({ itemId: z.uuid(), checked: z.boolean() });

export type RoutineToggleResult = { ok: boolean; complete?: boolean; starRequested?: boolean };

type Client = Awaited<ReturnType<typeof createClient>>;

/** Requests the slot's star task when the routine is complete. Returns true when a new request was made. */
async function requestRoutineStar(
  supabase: Client,
  member: { id: string; name: string },
  slot: RoutineSlot,
  today: string,
  requestedBy: string,
): Promise<boolean> {
  const { data: settings } = await supabase
    .from("routine_settings")
    .select("star_task_id")
    .eq("member_id", member.id)
    .eq("slot", slot)
    .maybeSingle();
  const taskId = (settings?.star_task_id as string | null | undefined) ?? null;
  if (!taskId) return false;

  const { data: track } = await supabase
    .from("star_tracks")
    .select("id")
    .eq("member_id", member.id)
    .eq("status", "active")
    .maybeSingle();
  if (!track) return false;

  const { error } = await supabase.from("stars").insert({
    track_id: track.id,
    member_id: member.id,
    reason: t.routines[slot],
    task_id: taskId,
    status: "pending",
    requested_by: requestedBy,
    routine_slot: slot,
    routine_date: today,
  });
  if (error) {
    // 23505: already requested for this slot today (e.g. unticked and ticked again).
    if (error.code !== "23505") console.error("requestRoutineStar failed", error.code);
    return false;
  }

  await notifyParents({
    title: t.routines.pushTitle,
    body: t.routines.pushBody(member.name, slot),
    url: "/stars",
    tag: `routine-${member.id}-${slot}`,
  });
  return true;
}

/**
 * Tick or untick one of today's routine items. RLS lets a child change only their own checks for today;
 * the shared family screen may do it for any child (the item names the child). The star request stays
 * pending for a parent either way.
 * Ticking the last item of a slot requests the slot's star (once per day).
 */
export async function toggleRoutineCheck(itemId: string, checked: boolean): Promise<RoutineToggleResult> {
  const me = await getCurrentMember();
  // A parent previewing a child's app can only look.
  if ((me.role !== "child" && me.role !== "screen") || (await getViewer()).previewing) return { ok: false };
  const parsed = inputSchema.safeParse({ itemId, checked });
  if (!parsed.success) return { ok: false };

  const supabase = await createClient();
  let itemQuery = supabase.from("routine_items").select("id, slot, member_id").eq("id", parsed.data.itemId);
  if (me.role === "child") itemQuery = itemQuery.eq("member_id", me.id);
  const { data: item, error: itemError } = await itemQuery.maybeSingle();
  if (itemError || !item) {
    if (itemError) console.error("toggleRoutineCheck failed", itemError.code);
    return { ok: false };
  }
  // The child the item belongs to: the member themselves, or (on the screen) whoever owns the item.
  let child: { id: string; name: string } = me;
  if (me.role === "screen") {
    const { data: owner } = await supabase.from("members").select("id, name, role").eq("id", item.member_id as string).maybeSingle();
    if (!owner || owner.role !== "child") return { ok: false };
    child = { id: owner.id as string, name: owner.name as string };
  }
  const slot = item.slot as RoutineSlot;
  const today = dayKey(dateInTimeZone(new Date()));

  if (parsed.data.checked) {
    const { error } = await supabase
      .from("routine_checks")
      .insert({ item_id: item.id, member_id: child.id, date: today });
    // 23505: already ticked today (a double tap); that's fine.
    if (error && error.code !== "23505") {
      console.error("toggleRoutineCheck failed", error.code);
      return { ok: false };
    }
  } else {
    const { error } = await supabase.from("routine_checks").delete().eq("item_id", item.id).eq("member_id", child.id).eq("date", today);
    if (error) {
      console.error("toggleRoutineCheck failed", error.code);
      return { ok: false };
    }
  }

  let complete = false;
  let starRequested = false;
  if (parsed.data.checked) {
    const [itemsResult, checksResult] = await Promise.all([
      supabase.from("routine_items").select("id").eq("member_id", child.id).eq("slot", slot),
      supabase.from("routine_checks").select("item_id").eq("member_id", child.id).eq("date", today),
    ]);
    if (!itemsResult.error && !checksResult.error) {
      complete = routineProgress(
        (itemsResult.data ?? []) as { id: string }[],
        (checksResult.data ?? []) as { item_id: string }[],
      ).complete;
    }
    if (complete) starRequested = await requestRoutineStar(supabase, child, slot, today, me.id);
  }

  revalidatePath("/");
  revalidatePath("/stars");
  revalidatePath("/skjerm");
  return { ok: true, complete, starRequested };
}
