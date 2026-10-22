import { addDays, dayKey, daysBetween, mondayOf, isoWeekOf, type CalendarDate } from "./dates";

/** The URL of a day on the start page: `/` for today, otherwise `/?dag=YYYY-MM-DD`. */
export function dayHref(date: CalendarDate, today: CalendarDate): string {
  return daysBetween(today, date) === 0 ? "/" : `/?dag=${dayKey(date)}`;
}

/** The URL of a week (`offset` weeks from this one) of a page: the bare path for this week, otherwise `?week=<offset>`. */
export function weekHref(path: string, offset: number): string {
  return offset === 0 ? path : `${path}?week=${offset}`;
}

/**
 * The day the switcher shows. While a navigation is pending this is the optimistic target (the day the last click
 * went to), so the label updates at once and the next click steps from it instead of from the old page.
 */
export function shownDay(date: CalendarDate, pendingTarget: CalendarDate | null, pending: boolean): CalendarDate {
  return pending && pendingTarget ? pendingTarget : date;
}

/** The ISO week number of the week `offset` weeks from the one containing `today`. */
export function isoWeekAtOffset(today: CalendarDate, offset: number): number {
  return isoWeekOf(addDays(mondayOf(today), offset * 7)).isoWeek;
}
