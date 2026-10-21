import "server-only";
import { addDays, dateInTimeZone, dayKey, mondayOf, type CalendarDate } from "./dates";
import type { DocumentRow, DocumentType, PlanItemRow, SchoolDayRow } from "./plan";
import type { SchoolHours } from "./plan-view";
import { createClient } from "./supabase/server";

export type SchoolDocument = Pick<DocumentRow, "id" | "type" | "iso_week">;

export type SchoolWeek = {
  monday: CalendarDate;
  today: CalendarDate;
  items: PlanItemRow[];
  /** Documents the items come from, so the UI can link the originals. */
  documents: SchoolDocument[];
};

const ITEM_COLUMNS = "id, document_id, member_id, date, kind, subject, text, done, sort, period, starts_at, ends_at";

/**
 * The member's plan items for one ISO week (shifted by `weekOffset`) plus the Monday after it
 * (homework due next Monday is shown on a Friday). Only items of published documents are returned, so a
 * parent previewing a child sees exactly what the child sees (RLS would show parents the ones in review too).
 */
export async function loadSchoolWeek(memberId: string, weekOffset = 0, now = new Date()): Promise<SchoolWeek> {
  const today = dateInTimeZone(now);
  const monday = addDays(mondayOf(today), weekOffset * 7);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("plan_items")
    .select(`${ITEM_COLUMNS}, documents!inner(status)`)
    .eq("documents.status", "published")
    .eq("member_id", memberId)
    .gte("date", dayKey(monday))
    .lte("date", dayKey(addDays(monday, 7)))
    .order("date")
    .order("sort");
  if (error) throw new Error("Could not read the plan items");
  // Rows also carry the joined `documents` column, which is only there for the filter.
  const items = (data ?? []) as unknown as PlanItemRow[];

  const documentIds = [...new Set(items.map((i) => i.document_id))];
  let documents: SchoolDocument[] = [];
  if (documentIds.length > 0) {
    const { data: docs, error: docError } = await supabase
      .from("documents")
      .select("id, type, iso_week")
      .in("id", documentIds)
      .order("iso_week")
      .order("created_at");
    if (docError) throw new Error("Could not read the documents");
    documents = (docs ?? []) as { id: string; type: DocumentType; iso_week: number }[];
  }
  return { monday, today, items, documents };
}

/**
 * School start/end per day of one week (Monday + 6 days), keyed "YYYY-MM-DD". Published documents only.
 * If two documents give the same day, the one that knows more times wins.
 */
export async function loadSchoolHours(memberId: string, monday: CalendarDate): Promise<Map<string, SchoolHours>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_days")
    .select("date, starts_at, ends_at, documents!inner(status)")
    .eq("documents.status", "published")
    .eq("member_id", memberId)
    .gte("date", dayKey(monday))
    .lte("date", dayKey(addDays(monday, 6)));
  if (error) throw new Error("Could not read the school days");
  const rows = (data ?? []) as unknown as Pick<SchoolDayRow, "date" | "starts_at" | "ends_at">[];
  const known = (r: SchoolHours) => Number(r.starts_at !== null) + Number(r.ends_at !== null);
  const result = new Map<string, SchoolHours>();
  for (const row of rows) {
    const existing = result.get(row.date);
    if (!existing || known(row) > known(existing)) result.set(row.date, { starts_at: row.starts_at, ends_at: row.ends_at });
  }
  return result;
}
