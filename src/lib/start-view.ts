// Pure helpers for the children's start page. No database or server access here.

import { t } from "./i18n";
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

/** Stars left to the next reward (0 when there is none or it is already reached). */
export function starsLeft(approved: number, nextMilestone: number | null): number {
  return nextMilestone === null ? 0 : Math.max(0, nextMilestone - approved);
}

export type StarGrid = {
  /** Approved stars shown filled (never more than `total`). */
  filled: number;
  /** Grey stars up to the next milestone. */
  empty: number;
  /** Icons in the grid: the next milestone, or the goal once everything is reached. */
  total: number;
  /** No next milestone: the goal is reached. */
  reached: boolean;
};

/** The star grid of the start page: one icon per star up to the next milestone (all goal stars once the goal is reached). */
export function starGrid(approved: number, nextMilestone: number | null, goal: number): StarGrid {
  const reached = nextMilestone === null;
  const total = Math.max(0, reached ? goal : nextMilestone);
  const filled = Math.min(Math.max(0, approved), total);
  return { filled, empty: total - filled, total, reached };
}

/** "5 stjerner igjen!"; null when there is no next reward (goal reached). */
export function starsLeftText(approved: number, nextMilestone: number | null): string | null {
  if (nextMilestone === null) return null;
  const left = starsLeft(approved, nextMilestone);
  return left > 0 ? t.start.starsLeftShort(left) : null;
}
