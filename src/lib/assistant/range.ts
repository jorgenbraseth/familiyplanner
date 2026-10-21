// Date-range helpers for the assistant's tools. Pure: no server access.

import { addDays, dayKey, parseDayKey, type CalendarDate } from "../dates";

export const MAX_RANGE_DAYS = 31;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in "YYYY-MM-DD" form, or null. */
export function parseStrictDay(value: string): CalendarDate | null {
  if (!DAY_KEY.test(value)) return null;
  const date = parseDayKey(value);
  const check = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (check.getUTCFullYear() !== date.year || check.getUTCMonth() !== date.month - 1 || check.getUTCDate() !== date.day) return null;
  return date;
}

export type RangeResult =
  | { ok: true; from: CalendarDate; to: CalendarDate; fromKey: string; toKey: string; clamped: boolean }
  | { ok: false; error: string };

/** Validates an inclusive day range; a range longer than 31 days is cut short (`clamped`). */
export function validateRange(from: string, to: string): RangeResult {
  const start = parseStrictDay(from);
  const end = parseStrictDay(to);
  if (!start || !end) return { ok: false, error: "Dates must be real dates in YYYY-MM-DD format." };
  const startKey = dayKey(start);
  const endKey = dayKey(end);
  if (startKey > endKey) return { ok: false, error: "`from` must not be after `to`." };
  const last = addDays(start, MAX_RANGE_DAYS - 1);
  const clamped = endKey > dayKey(last);
  const finalEnd = clamped ? last : end;
  return { ok: true, from: start, to: finalEnd, fromKey: startKey, toKey: dayKey(finalEnd), clamped };
}

const weekdayFormat = new Intl.DateTimeFormat("nb-NO", { timeZone: "UTC", weekday: "long" });

/** Norwegian weekday name of a "YYYY-MM-DD" day, e.g. "onsdag". */
export function weekdayName(key: string): string {
  const date = parseStrictDay(key);
  if (!date) return "";
  return weekdayFormat.format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
}
