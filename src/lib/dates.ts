// Dates and times are shown in Europe/Copenhagen; weeks are ISO weeks (Monday first).

export const TIME_ZONE = "Europe/Copenhagen";

export type CalendarDate = { year: number; month: number; day: number };
export type IsoWeek = { isoYear: number; isoWeek: number };

/** The calendar date of an instant in the family's time zone. */
export function dateInTimeZone(instant: Date, timeZone: string = TIME_ZONE): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** ISO 8601 week and week-year of a calendar date. */
export function isoWeekOf({ year, month, day }: CalendarDate): IsoWeek {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  // The Thursday of this week decides the week-year.
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const isoWeek = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return { isoYear, isoWeek };
}

/** ISO week of an instant, as seen in the family's time zone. */
export function isoWeekNow(instant: Date = new Date()): IsoWeek {
  return isoWeekOf(dateInTimeZone(instant));
}
