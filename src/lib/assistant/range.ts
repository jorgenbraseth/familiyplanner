// Date-range helpers for the assistant's tools. Pure: no server access.

import { TIME_ZONE, addDays, dayKey, formatDayHeading, parseDayKey, type CalendarDate } from "../dates";

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

/**
 * Where a day is relative to today, in Norwegian bokmål, so the model never has to count days:
 * "i dag", "i morgen", "på torsdag" (within the coming week), otherwise "på torsdag 5. november".
 */
export function relativeDayLabel(todayKey: string, key: string): string {
  const today = parseStrictDay(todayKey);
  const day = parseStrictDay(key);
  if (!today || !day) return key;
  const diff = Math.round((Date.UTC(day.year, day.month - 1, day.day) - Date.UTC(today.year, today.month - 1, today.day)) / 86_400_000);
  if (diff === 0) return "i dag";
  if (diff === 1) return "i morgen";
  if (diff === -1) return "i går";
  if (diff < 0) return formatDayHeading(day);
  if (diff < 7) return `på ${weekdayName(key)}`;
  return `på ${formatDayHeading(day)}`;
}

/** Whole days from `fromKey` to `toKey` (negative when `toKey` is earlier). */
export function daysBetween(fromKey: string, toKey: string): number {
  const a = parseStrictDay(fromKey);
  const b = parseStrictDay(toKey);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

const clockFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hourCycle: "h23", hour: "2-digit", minute: "2-digit" });

/** Minutes after midnight, Europe/Copenhagen, at an instant. */
export function minutesNowCopenhagen(now: Date): number {
  const parts = clockFormat.formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return get("hour") * 60 + get("minute");
}
