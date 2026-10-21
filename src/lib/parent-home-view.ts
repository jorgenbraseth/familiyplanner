// Pure helpers for the parents' home page. No database or server access here.

import { addDays, isoWeekOf, mondayOf, type CalendarDate, type IsoWeek } from "./dates";
import { DOCUMENT_TYPES, type DocumentType } from "./plan";
import { formatHm } from "./plan-view";

/**
 * The ISO week a parent most likely uploads a plan for: Monday–Thursday the current week,
 * Friday–Sunday the next one (the plan for the coming week is what gets handed out then).
 */
export function uploadWeekFor(today: CalendarDate): IsoWeek {
  const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay() || 7; // Monday = 1
  return isoWeekOf(weekday >= 5 ? addDays(mondayOf(today), 7) : today);
}

/** Link to the upload form with child, type and week prefilled (read back by `parseUploadDefaults`). */
export function uploadHref(childId: string, week: IsoWeek, type: DocumentType = "ukeplan"): string {
  const query = new URLSearchParams({ child: childId, type, week: String(week.isoWeek), year: String(week.isoYear) });
  return `/documents/new?${query.toString()}`;
}

export type UploadDefaults = { childId: string | undefined; type: DocumentType; week: number; year: number };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function integerIn(value: string | undefined, min: number, max: number): number | null {
  if (value === undefined || !/^\d{1,4}$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

/**
 * The upload form's defaults from the URL. Anything invalid (a child that isn't one of `childIds`, week outside
 * 1..53, year outside 2000..2100, unknown type) falls back: first child, week_schedule, and `fallback` week/year.
 */
export function parseUploadDefaults(
  params: Record<string, string | string[] | undefined>,
  childIds: readonly string[],
  fallback: IsoWeek,
): UploadDefaults {
  const child = first(params.child);
  const type = first(params.type);
  return {
    childId: child !== undefined && childIds.includes(child) ? child : childIds[0],
    type: DOCUMENT_TYPES.find((d) => d === type) ?? "ukeplan",
    week: integerIn(first(params.week), 1, 53) ?? fallback.isoWeek,
    year: integerIn(first(params.year), 2000, 2100) ?? fallback.isoYear,
  };
}

export type SchoolEnd =
  | { kind: "none" }
  | { kind: "unknown" }
  | { kind: "time"; time: string };

/**
 * When school ends today. `hours` is today's school_days row of a published plan (if any); `lessonsToday` counts
 * today's lessons. No row and no lessons: no school. A school day without a known end time: unknown.
 */
export function schoolEndSummary(
  hours: { starts_at: string | null; ends_at: string | null } | undefined,
  lessonsToday: number,
): SchoolEnd {
  if (!hours && lessonsToday === 0) return { kind: "none" };
  const time = formatHm(hours?.ends_at);
  return time ? { kind: "time", time } : { kind: "unknown" };
}
