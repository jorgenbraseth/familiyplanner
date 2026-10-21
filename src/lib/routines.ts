// Morning/evening routines. Shapes match supabase/migrations/20261026090000_routines.sql.

import { TIME_ZONE } from "./dates";

export type RoutineSlot = "morning" | "evening";

export type RoutineItemRow = {
  id: string;
  member_id: string;
  slot: RoutineSlot;
  name: string;
  sort: number;
  created_at: string;
};

export type RoutineSettingsRow = {
  member_id: string;
  slot: RoutineSlot;
  star_task_id: string | null;
};

export type RoutineCheckRow = {
  id: string;
  item_id: string;
  member_id: string;
  /** "YYYY-MM-DD" */
  date: string;
  checked_at: string;
};

export const ROUTINE_MAX_ITEMS_PER_SLOT = 15;
export const ROUTINE_NAME_MAX = 60;

const DEFAULT_MORNING_END_MINUTES = 12 * 60;
const EVENING_STARTS_MINUTES = 17 * 60;

/** Minutes after local midnight on the wall clock in the family's time zone (DST-safe). */
function wallClockMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return get("hour") * 60 + get("minute");
}

/** "HH:MM" or "HH:MM:SS" to minutes after midnight, or null when it isn't a valid time. */
function parseMinutes(time: string | null): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Which routine to show. Morning until school starts today (12:00 when unknown); from then until
 * 17:00 the evening routine is shown as `upcoming`; from 17:00 it is the current one. After
 * midnight it is morning again.
 */
export function currentSlot(
  now: Date,
  schoolStartsAt: string | null,
): { slot: RoutineSlot; upcoming: boolean } {
  const minutes = wallClockMinutes(now);
  const morningEnds = parseMinutes(schoolStartsAt) ?? DEFAULT_MORNING_END_MINUTES;
  if (minutes < morningEnds) return { slot: "morning", upcoming: false };
  if (minutes < EVENING_STARTS_MINUTES) return { slot: "evening", upcoming: true };
  return { slot: "evening", upcoming: false };
}

/** Progress of one slot's items against that day's checks (checks for other items are ignored). */
export function routineProgress(
  items: Pick<RoutineItemRow, "id">[],
  checks: Pick<RoutineCheckRow, "item_id">[],
): { done: number; total: number; complete: boolean } {
  const checked = new Set(checks.map((c) => c.item_id));
  const total = items.length;
  const done = items.filter((i) => checked.has(i.id)).length;
  return { done, total, complete: total > 0 && done === total };
}
