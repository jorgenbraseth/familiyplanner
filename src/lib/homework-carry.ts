// Homework that was not finished carries over within the current ISO week: it stays on the list until it is ticked off. Pure helpers, no server access.

import { addDays, daysBetween, dayKey, formatDayHeading, mondayOf, parseDayKey, type CalendarDate } from "./dates";
import { t } from "./i18n";
import type { PlanItemRow } from "./plan";
import { formatWeekday } from "./plan-view";

/** The fields the carry-over rule looks at (so the assistant's rows work too). */
export type CarryCandidate = Pick<PlanItemRow, "date" | "kind" | "done" | "whole_week" | "sort">;

/**
 * The day an item is due. A day item is due on its date; a whole-week item (dated the Monday) is due by the
 * Sunday of that week.
 */
export function dueKeyOf(item: Pick<CarryCandidate, "date" | "whole_week">): string {
  return item.whole_week ? dayKey(addDays(parseDayKey(item.date), 6)) : item.date;
}

/** The earliest `date` a row can have and still be carried over: Monday of the current ISO week. */
export function carryQueryFromKey(today: CalendarDate): string {
  return dayKey(mondayOf(today));
}

/**
 * Unfinished homework from earlier days of THIS ISO week: not done, a day item due from Monday of the current week up
 * to today (an item due today is still on the list, instead of vanishing at midnight to reappear tomorrow). Homework
 * from earlier weeks is never carried, and a whole-week item is simply this week's ("Denne uken"), never carried.
 * Oldest first. Callers pass published items only.
 */
export function carriedOverHomework<T extends CarryCandidate>(items: readonly T[], today: CalendarDate): T[] {
  const todayKey = dayKey(today);
  const fromKey = carryQueryFromKey(today);
  return items
    .filter((i) => i.kind === "homework" && !i.done && !i.whole_week && i.date >= fromKey && i.date <= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date) || a.sort - b.sort);
}

/** The small muted label of a carried-over item: "Til i dag", "Fra i går", "Fra mandag". */
export function carryLabel(item: Pick<CarryCandidate, "date" | "whole_week">, today: CalendarDate): string {
  const date = parseDayKey(item.date);
  const diff = daysBetween(date, today);
  if (diff <= 0) return t.school.carriedToday;
  if (diff === 1) return t.school.carriedYesterday;
  if (diff < 7) return t.school.carriedFrom(formatWeekday(date).toLocaleLowerCase());
  return t.school.carriedFrom(formatDayHeading(date));
}

export type CarriedItem = { item: PlanItemRow; label: string };

/** Carried-over homework with its label, ready for the lists. */
export function carriedItems(items: readonly PlanItemRow[], today: CalendarDate): CarriedItem[] {
  return carriedOverHomework(items, today).map((item) => ({ item, label: carryLabel(item, today) }));
}
