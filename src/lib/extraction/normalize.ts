import { addDays, dayKey, mondayOfIsoWeek, parseDayKey } from "../dates";
import { PLAN_ITEM_KINDS, type ExtractedItem, type PlanItemKind } from "../plan";
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
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * Validates Claude's output and turns it into plan items for one ISO week.
 * Dates must fall between Monday of the week and a week after Sunday (homework can be due next week).
 */
export function normalizeExtraction(raw: unknown, isoYear: number, isoWeek: number): ExtractedItem[] {
  const parsed = extractionSchema.safeParse(raw);
  if (!parsed.success) throw new ExtractionError("bad_result", "The extraction result had an unexpected shape.");

  const monday = mondayOfIsoWeek(isoYear, isoWeek);
  const first = dayKey(monday);
  const last = dayKey(addDays(monday, 13));

  const candidates: ExtractedItem[] = [];
  for (const day of parsed.data.days) {
    const date = day.date.trim();
    if (!isRealDate(date) || date < first || date > last) continue;
    for (const item of day.items) {
      candidates.push({ date, kind: item.kind, subject: item.subject, text: item.text });
    }
  }
  const notes = parsed.data.notes?.trim();
  if (notes) candidates.push({ date: first, kind: "note", subject: null, text: notes });

  const seen = new Set<string>();
  const items: ExtractedItem[] = [];
  for (const c of candidates) {
    const text = c.text.trim().slice(0, MAX_TEXT).trim();
    if (!text) continue;
    const subject = c.subject?.trim().slice(0, MAX_SUBJECT).trim() || null;
    const key = JSON.stringify([c.date, c.kind, subject, text]);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ date: c.date, kind: c.kind, subject, text });
  }

  const order = (kind: PlanItemKind) => PLAN_ITEM_KINDS.indexOf(kind);
  // Array.prototype.sort is stable, so items keep their document order within a kind.
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : order(a.kind) - order(b.kind)));
  return items.slice(0, MAX_ITEMS);
}
