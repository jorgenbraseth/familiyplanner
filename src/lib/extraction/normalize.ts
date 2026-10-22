import { addDays, dayKey, mondayOfIsoWeek, parseDayKey } from "../dates";
import type { PlanAudience } from "../plan";
import { normalizeItemText } from "../item-text";
import { ExtractionError } from "./errors";
import { timeplanSchema, ukeplanSchema } from "./schema";

export const MAX_ITEMS = 300;
export const MAX_PERIODS = 200;
const MAX_TEXT = 1000;
const MAX_SUBJECT = 100;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** What extraction produces for a ukeplan item. Times are "HH:MM". */
export type UkeplanItem = {
  /** "YYYY-MM-DD". Whole-week items: the Monday of the week. */
  date: string;
  whole_week: boolean;
  kind: "homework" | "event" | "message";
  subject: string | null;
  text: string;
  audience: PlanAudience;
  starts_at: string | null;
  ends_at: string | null;
};
export type UkeplanExtraction = { items: UkeplanItem[] };

export type TimeplanDay = {
  weekday: number;
  starts_at: string | null;
  ends_at: string | null;
};
export type TimeplanPeriod = {
  weekday: number;
  period: number | null;
  starts_at: string | null;
  ends_at: string | null;
  subject: string;
};
export type TimeplanExtraction = {
  days: TimeplanDay[];
  periods: TimeplanPeriod[];
};

function isRealDate(key: string): boolean {
  if (!DAY_KEY.test(key)) return false;
  const { year, month, day } = parseDayKey(key);
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/** Accepts "8:15", "8.15", "08.15", "08:15:00"; returns "HH:MM" or null when it is not a time of day. */
export function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{1,2})[.:](\d{2})(?:[.:]\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

/** Both times, or neither when the end isn't after the start. */
function timePair(
  start: string | null | undefined,
  end: string | null | undefined,
) {
  let starts = normalizeTime(start);
  let ends = normalizeTime(end);
  if (starts && ends && ends <= starts) starts = ends = null;
  return { starts, ends };
}

function normalizePeriod(value: number | null): number | null {
  if (value === null || !Number.isInteger(value) || value < 1 || value > 15)
    return null;
  return value;
}

function validWeekday(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

const cmp = <T extends string | number>(a: T, b: T) =>
  a < b ? -1 : a > b ? 1 : 0;

/** Validates Claude's output for a timeplan: weekdays 1..7, periods 1..15, HH:MM times, one row per weekday. */
export function normalizeTimeplan(raw: unknown): TimeplanExtraction {
  const parsed = timeplanSchema.safeParse(raw);
  if (!parsed.success)
    throw new ExtractionError(
      "bad_result",
      "The extraction result had an unexpected shape.",
    );

  const dayMap = new Map<number, TimeplanDay>();
  for (const day of parsed.data.days) {
    if (!validWeekday(day.weekday)) continue;
    const { starts, ends } = timePair(day.starts_at, day.ends_at);
    if (!starts && !ends) continue;
    const known = dayMap.get(day.weekday);
    dayMap.set(day.weekday, {
      weekday: day.weekday,
      starts_at: known?.starts_at ?? starts,
      ends_at: known?.ends_at ?? ends,
    });
  }

  const seen = new Set<string>();
  const periods: TimeplanPeriod[] = [];
  for (const p of parsed.data.periods) {
    if (!validWeekday(p.weekday)) continue;
    const subject = p.subject.trim().slice(0, MAX_SUBJECT).trim();
    if (!subject) continue;
    const period = normalizePeriod(p.period);
    const { starts, ends } = timePair(p.starts_at, p.ends_at);
    const key = JSON.stringify([p.weekday, period, starts, ends, subject]);
    if (seen.has(key)) continue;
    seen.add(key);
    periods.push({
      weekday: p.weekday,
      period,
      starts_at: starts,
      ends_at: ends,
      subject,
    });
  }
  // Stable sort: periods without a number keep document order after the numbered ones.
  periods.sort(
    (a, b) =>
      cmp(a.weekday, b.weekday) ||
      cmp(a.period ?? 99, b.period ?? 99) ||
      cmp(a.starts_at ?? "99:99", b.starts_at ?? "99:99"),
  );
  const days = [...dayMap.values()].sort((a, b) => cmp(a.weekday, b.weekday));
  return { days, periods: periods.slice(0, MAX_PERIODS) };
}

/**
 * Phrases that mean "every day" (bokmål, nynorsk, English). Unicode-aware boundaries so that e.g.
 * "hverdagen", "dagligvare" or "hver dagsorden" don't match.
 */
export const DAILY_PATTERN =
  /(?<![\p{L}\p{N}])(?:(?:hver|kvar)\s+(?:skole|ukes?)?dag(?:en)?|(?:each|every)\s+(?:school\s+)?day|alle\s+(?:skole|uke)?dag(?:ar|er)|dagl(?:ig|ige|eg|ege)|everyday)(?![\p{L}\p{N}])/iu;

/** True when the text mentions that something applies every (school) day. */
export function isDailyText(
  ...parts: Array<string | null | undefined>
): boolean {
  return parts.some((p) => !!p && DAILY_PATTERN.test(p));
}

/** The "YYYY-MM-DD" keys of Monday..Friday of an ISO week. */
export function schoolDayKeys(isoYear: number, isoWeek: number): string[] {
  const monday = mondayOfIsoWeek(isoYear, isoWeek);
  return [0, 1, 2, 3, 4].map((n) => dayKey(addDays(monday, n)));
}

const KIND_ORDER = ["homework", "event", "message"] as const;

/**
 * Validates Claude's output for a ukeplan of one ISO week. Items without a date are whole-week items
 * (date = Monday). Homework and events may sit in the week or the week after; messages only in the week.
 */
export function normalizeUkeplan(
  raw: unknown,
  isoYear: number,
  isoWeek: number,
): UkeplanExtraction {
  const parsed = ukeplanSchema.safeParse(raw);
  if (!parsed.success)
    throw new ExtractionError(
      "bad_result",
      "The extraction result had an unexpected shape.",
    );

  const monday = mondayOfIsoWeek(isoYear, isoWeek);
  const first = dayKey(monday);
  const lastOfWeek = dayKey(addDays(monday, 6));
  const lastOfNext = dayKey(addDays(monday, 13));

  const seen = new Set<string>();
  const items: UkeplanItem[] = [];
  for (const raw of parsed.data.items) {
    const text = normalizeItemText(raw.text).slice(0, MAX_TEXT).trim();
    if (!text) continue;
    const subject = raw.subject?.trim().slice(0, MAX_SUBJECT).trim() || null;

    const rawDate = raw.date?.trim() ?? "";
    const wholeWeek = rawDate === "";
    let date = first;
    if (!wholeWeek) {
      const last = raw.kind === "message" ? lastOfWeek : lastOfNext;
      if (!isRealDate(rawDate) || rawDate < first || rawDate > last) continue;
      date = rawDate;
    }
    // Safety net: daily homework that arrived as one whole-week item becomes one item per school day.
    const daily =
      wholeWeek && raw.kind === "homework" && isDailyText(text, subject);
    const dates = daily ? schoolDayKeys(isoYear, isoWeek) : [date];
    const isWholeWeek = wholeWeek && !daily;

    let startsAt: string | null = null;
    let endsAt: string | null = null;
    if (raw.kind === "event") {
      const { starts, ends } = timePair(raw.starts_at, raw.ends_at);
      startsAt = starts;
      endsAt = ends;
    }
    const audience: PlanAudience =
      raw.audience ?? (raw.kind === "homework" ? "child" : "both");

    for (const day of dates) {
      const key = JSON.stringify([
        day,
        isWholeWeek,
        raw.kind,
        subject,
        text,
        audience,
        startsAt,
        endsAt,
      ]);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        date: day,
        whole_week: isWholeWeek,
        kind: raw.kind,
        subject,
        text,
        audience,
        starts_at: startsAt,
        ends_at: endsAt,
      });
    }
  }

  // Array.prototype.sort is stable, so items keep their document order otherwise.
  items.sort(
    (a, b) =>
      cmp(a.whole_week ? 0 : 1, b.whole_week ? 0 : 1) ||
      cmp(a.date, b.date) ||
      cmp(KIND_ORDER.indexOf(a.kind), KIND_ORDER.indexOf(b.kind)) ||
      cmp(a.audience === "child" ? 0 : 1, b.audience === "child" ? 0 : 1) ||
      cmp(a.starts_at ?? "99:99", b.starts_at ?? "99:99"),
  );
  return { items: items.slice(0, MAX_ITEMS) };
}
