import "server-only";
import { dateInTimeZone, dayKey } from "./dates";
import type { RoutineCheckRow, RoutineItemRow, RoutineSlot } from "./routines";
import { createClient } from "./supabase/server";

export type RoutineToday = {
  /** "YYYY-MM-DD" in the family's time zone. */
  todayKey: string;
  /** Items of both slots. */
  items: RoutineItemRow[];
  /** Today's checks. */
  checks: RoutineCheckRow[];
  /** The star task each slot gives, when the parent picked one. */
  starTaskIds: Record<RoutineSlot, string | null>;
  /** Slots whose star was already requested today. */
  requested: Record<RoutineSlot, boolean>;
};

const ITEM_COLUMNS = "id, member_id, slot, name, sort, created_at";
const CHECK_COLUMNS = "id, item_id, member_id, date, checked_at";

/** A child's routine items, today's checks and settings (user-scoped client: RLS shows a child only their own rows). */
export async function loadRoutineToday(memberId: string, now = new Date()): Promise<RoutineToday> {
  const todayKey = dayKey(dateInTimeZone(now));
  const supabase = await createClient();
  const [itemsResult, checksResult, settingsResult, starsResult] = await Promise.all([
    supabase.from("routine_items").select(ITEM_COLUMNS).eq("member_id", memberId).order("sort").order("created_at"),
    supabase.from("routine_checks").select(CHECK_COLUMNS).eq("member_id", memberId).eq("date", todayKey),
    supabase.from("routine_settings").select("slot, star_task_id").eq("member_id", memberId),
    supabase.from("stars").select("routine_slot").eq("member_id", memberId).eq("routine_date", todayKey),
  ]);
  if (itemsResult.error) throw new Error("Could not read the routine items");
  if (checksResult.error) throw new Error("Could not read the routine checks");
  if (settingsResult.error) throw new Error("Could not read the routine settings");
  if (starsResult.error) throw new Error("Could not read today's routine stars");

  const starTaskIds: Record<RoutineSlot, string | null> = { morning: null, evening: null };
  for (const row of (settingsResult.data ?? []) as { slot: RoutineSlot; star_task_id: string | null }[]) {
    starTaskIds[row.slot] = row.star_task_id;
  }
  const requested: Record<RoutineSlot, boolean> = { morning: false, evening: false };
  for (const row of (starsResult.data ?? []) as { routine_slot: RoutineSlot | null }[]) {
    if (row.routine_slot) requested[row.routine_slot] = true;
  }
  return {
    todayKey,
    items: (itemsResult.data ?? []) as RoutineItemRow[],
    checks: (checksResult.data ?? []) as RoutineCheckRow[],
    starTaskIds,
    requested,
  };
}
