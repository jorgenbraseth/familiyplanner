// Dates and times are shown in Europe/Copenhagen; weeks are ISO weeks (Monday first).

import { locale, t } from "./i18n";

export const TIME_ZONE = "Europe/Copenhagen";

export type CalendarDate = { year: number; month: number; day: number };
export type IsoWeek = { isoYear: number; isoWeek: number };

const DAY_MS = 86_400_000;

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
  const isoWeek = Math.ceil(((date.getTime() - yearStart) / DAY_MS + 1) / 7);
  return { isoYear, isoWeek };
}

/** ISO week of an instant, as seen in the family's time zone. */
export function isoWeekNow(instant: Date = new Date()): IsoWeek {
  return isoWeekOf(dateInTimeZone(instant));
}

export function addDays({ year, month, day }: CalendarDate, days: number): CalendarDate {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** Monday of the ISO week that contains the date. */
export function mondayOf(date: CalendarDate): CalendarDate {
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay() || 7;
  return addDays(date, 1 - weekday);
}

/** "YYYY-MM-DD", the key used to group things by day. */
export function dayKey({ year, month, day }: CalendarDate): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseDayKey(key: string): CalendarDate {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

/** Minutes the time zone is ahead of UTC at an instant. */
function offsetMinutes(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant) / 60_000);
}

/** The instant a calendar date starts (local midnight) in the family's time zone. */
export function startOfDay(date: CalendarDate, timeZone: string = TIME_ZONE): Date {
  const guess = Date.UTC(date.year, date.month - 1, date.day);
  let instant = guess - offsetMinutes(guess, timeZone) * 60_000;
  // Re-check in case the guess and the result fall on different sides of a DST change.
  instant = guess - offsetMinutes(instant, timeZone) * 60_000;
  return new Date(instant);
}

export function formatTime(instant: Date): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}

/** E.g. "onsdag 21. oktober". */
export function formatDayHeading(date: CalendarDate): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
}

/** Monday of ISO week `isoWeek` in ISO week-year `isoYear` (4 January is always in week 1). */
export function mondayOfIsoWeek(isoYear: number, isoWeek: number): CalendarDate {
  const week1Monday = mondayOf({ year: isoYear, month: 1, day: 4 });
  return addDays(week1Monday, (isoWeek - 1) * 7);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return Math.round((Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / DAY_MS);
}

/**
 * The day selected by a `?dag=YYYY-MM-DD` search param: a real calendar date within `maxDays` of today, otherwise
 * today (missing, malformed, impossible like 2026-02-30, or out of range).
 */
export function parseDayParam(value: string | string[] | undefined, today: CalendarDate, maxDays = 60): CalendarDate {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return today;
  const date = parseDayKey(raw);
  const real = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (real.getUTCFullYear() !== date.year || real.getUTCMonth() + 1 !== date.month || real.getUTCDate() !== date.day) return today;
  return Math.abs(daysBetween(today, date)) > maxDays ? today : date;
}

/** Label of a day relative to today: "I dag", "I morgen", "I går", otherwise "torsdag 23. oktober". */
export function relativeDayLabel(date: CalendarDate, today: CalendarDate): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return t.start.dayToday;
  if (diff === 1) return t.start.dayTomorrow;
  if (diff === -1) return t.start.dayYesterday;
  return formatDayHeading(date);
}
