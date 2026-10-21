import "server-only";
import { addDays, dateInTimeZone, dayKey, mondayOf, type CalendarDate } from "./dates";
import type { DocumentRow, DocumentType, PlanItemRow } from "./plan";
import { createClient } from "./supabase/server";

export type SchoolDocument = Pick<DocumentRow, "id" | "type" | "iso_week">;

export type SchoolWeek = {
  monday: CalendarDate;
  today: CalendarDate;
  items: PlanItemRow[];
  /** Documents the items come from, so the UI can link the originals. */
  documents: SchoolDocument[];
};

const ITEM_COLUMNS = "id, document_id, member_id, date, kind, subject, text, done, sort";

/**
 * The member's plan items for one ISO week (shifted by `weekOffset`) plus the Monday after it
 * (homework due next Monday is shown on a Friday). RLS only returns published items of the member.
 */
export async function loadSchoolWeek(memberId: string, weekOffset = 0, now = new Date()): Promise<SchoolWeek> {
  const today = dateInTimeZone(now);
  const monday = addDays(mondayOf(today), weekOffset * 7);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("plan_items")
    .select(ITEM_COLUMNS)
    .eq("member_id", memberId)
    .gte("date", dayKey(monday))
    .lte("date", dayKey(addDays(monday, 7)))
    .order("date")
    .order("sort");
  if (error) throw new Error("Could not read the plan items");
  const items = (data ?? []) as PlanItemRow[];

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
