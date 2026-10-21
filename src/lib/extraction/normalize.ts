import { addDays, dayKey, mondayOfIsoWeek, parseDayKey } from "../dates";
import {
  type ExtractedDay,
  type ExtractedItem,
  type Extraction,
  type PlanItemKind,
} from "../plan";
import { ExtractionError } from "./errors";
import { extractionSchema } from "./schema";

export const MAX_ITEMS = 300;
const MAX_TEXT = 1000;
const MAX_SUBJECT = 100;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

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

function normalizePeriod(value: number | null): number | null {
  if (value === null || !Number.isInteger(value) || value < 1 || value > 15)
    return null;
  return value;
}

/**
 * Validates Claude's output and turns it into plan items for one ISO week.
 * Dates must fall between Monday of the week and a week after Sunday (homework can be due next week).
 */
export function normalizeExtraction(
  raw: unknown,
  isoYear: number,
  isoWeek: number,
): Extraction {
  const parsed = extractionSchema.safeParse(raw);
  if (!parsed.success)
    throw new ExtractionError(
      "bad_result",
      "The extraction result had an unexpected shape.",
    );

  const monday = mondayOfIsoWeek(isoYear, isoWeek);
  const first = dayKey(monday);
  const last = dayKey(addDays(monday, 13));

  const candidates: ExtractedItem[] = [];
  const dayMap = new Map<string, ExtractedDay>();
  for (const day of parsed.data.days) {
    const date = day.date.trim();
    if (!isRealDate(date) || date < first || date > last) continue;
    let starts = normalizeTime(day.school_start);
    let ends = normalizeTime(day.school_end);
    if (starts && ends && ends <= starts) starts = ends = null;
    if (starts || ends) {
      const known = dayMap.get(date);
      dayMap.set(date, {
        date,
        starts_at: known?.starts_at ?? starts,
        ends_at: known?.ends_at ?? ends,
      });
    }
    for (const item of day.items) {
      const lesson = item.kind === "lesson";
      let startsAt = lesson ? normalizeTime(item.start) : null;
      let endsAt = lesson ? normalizeTime(item.end) : null;
      if (startsAt && endsAt && endsAt <= startsAt) startsAt = endsAt = null;
      candidates.push({
        date,
        // Interim: extraction still produces the old kinds; map them onto the new ones.
        kind: item.kind === "bring" || item.kind === "note" ? "message" : item.kind,
        subject: item.subject,
        text: item.text,
        period: lesson ? normalizePeriod(item.period) : null,
        starts_at: startsAt,
        ends_at: endsAt,
        audience: item.kind === "bring" ? "child" : "both",
        whole_week: false,
      });
    }
  }
  const notes = parsed.data.notes?.trim();
  if (notes)
    candidates.push({
      date: first,
      kind: "message",
      subject: null,
      text: notes,
      period: null,
      starts_at: null,
      ends_at: null,
      audience: "both",
      whole_week: false,
    });

  const seen = new Set<string>();
  const items: ExtractedItem[] = [];
  for (const c of candidates) {
    const text = c.text.trim().slice(0, MAX_TEXT).trim();
    if (!text) continue;
    const subject = c.subject?.trim().slice(0, MAX_SUBJECT).trim() || null;
    const key = JSON.stringify([
      c.date,
      c.kind,
      subject,
      text,
      c.period,
      c.starts_at,
      c.ends_at,
      c.audience,
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      date: c.date,
      kind: c.kind,
      subject,
      text,
      period: c.period,
      starts_at: c.starts_at,
      ends_at: c.ends_at,
      audience: c.audience,
      whole_week: c.whole_week,
    });
  }

  const KIND_ORDER: PlanItemKind[] = ["lesson", "homework", "message", "event"];
  const order = (kind: PlanItemKind) => KIND_ORDER.indexOf(kind);
  const cmp = <T extends string | number>(a: T, b: T) =>
    a < b ? -1 : a > b ? 1 : 0;
  // Array.prototype.sort is stable, so items keep their document order otherwise.
  // Lessons go by period, then start time; lessons without either keep document order after the numbered ones.
  items.sort(
    (a, b) =>
      cmp(a.date, b.date) ||
      cmp(order(a.kind), order(b.kind)) ||
      cmp(a.audience === "child" ? 0 : 1, b.audience === "child" ? 0 : 1) ||
      cmp(a.period ?? 99, b.period ?? 99) ||
      cmp(a.starts_at ?? "99:99", b.starts_at ?? "99:99"),
  );
  const days = [...dayMap.values()].sort((a, b) => cmp(a.date, b.date));
  return { items: items.slice(0, MAX_ITEMS), days };
}
