// Homework that was not finished carries over: it stays on the list until it is ticked off. Pure helpers, no server access.

import { addDays, daysBetween, dayKey, formatDayHeading, isoWeekOf, parseDayKey, type CalendarDate } from "./dates";
import { t } from "./i18n";
import type { PlanItemRow } from "./plan";
import { formatWeekday } from "./plan-view";

/** How far back unfinished homework is carried over: items due up to 14 days before today. Older ones are dropped. */
export const CARRY_OVER_DAYS = 14;

/** The fields the carry-over rule looks at (so the assistant's rows work too). */
export type CarryCandidate = Pick<PlanItemRow, "date" | "kind" | "done" | "whole_week" | "sort">;

/**
 * The day an item is due. A day item is due on its date; a whole-week item (dated the Monday) is due by the
 * Sunday of that week, so it only counts as overdue once its week is over (during the week it is in "Denne uken").
 */
export function dueKeyOf(item: Pick<CarryCandidate, "date" | "whole_week">): string {
  return item.whole_week ? dayKey(addDays(parseDayKey(item.date), 6)) : item.date;
}

/** The earliest `date` a row can have and still be carried over (whole-week items are dated the Monday, up to 6 days before their due day). */
export function carryQueryFromKey(today: CalendarDate): string {
  return dayKey(addDays(today, -(CARRY_OVER_DAYS + 6)));
}

/**
 * Unfinished homework from before: not done, due today or earlier (an item due today is still on the list, instead
 * of vanishing at midnight to reappear tomorrow) and at most CARRY_OVER_DAYS old. Whole-week items count once their
 * week is over. Oldest first. Callers pass published items only.
 */
export function carriedOverHomework<T extends CarryCandidate>(items: readonly T[], today: CalendarDate): T[] {
  const todayKey = dayKey(today);
  const fromKey = dayKey(addDays(today, -CARRY_OVER_DAYS));
  return items
    .filter((i) => {
      if (i.kind !== "homework" || i.done) return false;
      const due = dueKeyOf(i);
      return due >= fromKey && (i.whole_week ? due < todayKey : due <= todayKey);
    })
    .sort((a, b) => dueKeyOf(a).localeCompare(dueKeyOf(b)) || a.sort - b.sort);
}

/** The small muted label of a carried-over item: "Til i dag", "Fra i går", "Fra mandag", "Fra uke 42". */
export function carryLabel(item: Pick<CarryCandidate, "date" | "whole_week">, today: CalendarDate): string {
  if (item.whole_week) return t.school.carriedFromWeek(isoWeekOf(parseDayKey(item.date)).isoWeek);
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
