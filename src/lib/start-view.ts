// Pure helpers for the children's start page. No database or server access here.

import { addDays, dayKey, type CalendarDate } from "./dates";
import { routineProgress, type RoutineCheckRow, type RoutineItemRow, type RoutineSlot } from "./routines";

export type SlotView = {
  slot: RoutineSlot;
  items: Pick<RoutineItemRow, "id" | "name">[];
  checkedIds: string[];
  progress: { done: number; total: number; complete: boolean };
};

/** One slot's items in the parent's order with today's checks. Checks of other slots' items are ignored. */
export function slotView(
  items: readonly RoutineItemRow[],
  checks: readonly Pick<RoutineCheckRow, "item_id">[],
  slot: RoutineSlot,
): SlotView {
  const own = items
    .filter((i) => i.slot === slot)
    .sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at))
    .map((i) => ({ id: i.id, name: i.name }));
  const ids = new Set(own.map((i) => i.id));
  const checkedIds = [...new Set(checks.map((c) => c.item_id))].filter((id) => ids.has(id));
  return { slot, items: own, checkedIds, progress: routineProgress(own, [...checks]) };
}

/** Whether the next school day is tomorrow (otherwise the heading names the weekday, e.g. "mandag"). */
export function isTomorrow(today: CalendarDate, nextSchoolDay: CalendarDate): boolean {
  return dayKey(nextSchoolDay) === dayKey(addDays(today, 1));
}
