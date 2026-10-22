import "server-only";
import { carriedItems, carryQueryFromKey, type CarriedItem } from "./homework-carry";
import { addDays, dateInTimeZone, dayKey, mondayOf, type CalendarDate } from "./dates";
import type { DocumentRow, DocumentType, PlanItemRow } from "./plan";
import type { SchoolHours, Timetable } from "./plan-view";
import { createClient } from "./supabase/server";
import { fetchHoursOverrides, fetchTimetable } from "./timetable";

export type SchoolDocument = Pick<DocumentRow, "id" | "type" | "iso_week">;

export type SchoolWeek = {
  monday: CalendarDate;
  today: CalendarDate;
  /** Ukeplan items of published documents (no legacy lessons), including the Monday after the week. */
  items: PlanItemRow[];
  /** Unfinished homework due today or earlier (see `carriedOverHomework`); only for the current week (offset 0). */
  carriedOver: CarriedItem[];
  /** The member's timetable (latest published timeplan); empty when there is none. */
  timetable: Timetable;
  /** Old per-date school hours that override the timetable for that exact date. */
  hoursOverrides: Map<string, SchoolHours>;
  /** Documents the items come from, so the UI can link the originals. */
  documents: SchoolDocument[];
};

export const ITEM_COLUMNS =
  "id, document_id, member_id, date, kind, subject, text, done, sort, audience, whole_week, period, starts_at, ends_at";

/**
 * The member's ukeplan items for one ISO week (shifted by `weekOffset`) plus the Monday after it
 * (homework due next Monday is shown on a Friday), their timetable and hours overrides. Only items of published
 * documents are returned, so a parent previewing a child sees what the child sees (RLS would show parents the ones
 * in review too). For the current week the same query also reaches back for unfinished homework to carry over
 * (`carriedOver`, see homework-carry.ts); `items` stays the week only. Audience is not filtered here: use `filterByAudience` in plan-view for the viewer.
 */
export async function loadSchoolWeek(memberId: string, weekOffset = 0, now = new Date()): Promise<SchoolWeek> {
  const today = dateInTimeZone(now);
  const monday = addDays(mondayOf(today), weekOffset * 7);
  const supabase = await createClient();
  const carry = weekOffset === 0;
  const mondayKey = dayKey(monday);

  let itemsQuery = supabase
    .from("plan_items")
    .select(`${ITEM_COLUMNS}, documents!inner(status)`)
    .eq("documents.status", "published")
    .eq("member_id", memberId)
    .neq("kind", "lesson")
    .lte("date", dayKey(addDays(monday, 7)));
  // Current week: also homework from the look-back window before Monday (nothing else from before the week).
  itemsQuery = carry
    ? itemsQuery.gte("date", carryQueryFromKey(today)).or(`date.gte.${mondayKey},kind.eq.homework`)
    : itemsQuery.gte("date", mondayKey);

  const [itemsResult, timetable, hoursOverrides] = await Promise.all([
    itemsQuery.order("date").order("sort"),
    fetchTimetable(supabase, memberId),
    fetchHoursOverrides(supabase, memberId, dayKey(monday), dayKey(addDays(monday, 6))),
  ]);
  if (itemsResult.error) throw new Error("Could not read the plan items");
  // Rows also carry the joined `documents` column, which is only there for the filter.
  const rows = (itemsResult.data ?? []) as unknown as PlanItemRow[];
  const items = rows.filter((i) => i.date >= mondayKey);
  const carriedOver = carry ? carriedItems(rows, today) : [];

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
    documents = (docs ?? []) as { id: string; type: DocumentType; iso_week: number | null }[];
  }
  return { monday, today, items, carriedOver, timetable, hoursOverrides, documents };
}

/**
 * Messages and events of published ukeplans for the parents' "Beskjeder til foreldre": this week and the next
 * (parents upload next week's plan on Fridays). Audience child/parent/both is filtered by the caller.
 */
export async function loadParentNoteItems(memberId: string, now = new Date()): Promise<PlanItemRow[]> {
  const monday = mondayOf(dateInTimeZone(now));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_items")
    .select(`${ITEM_COLUMNS}, documents!inner(status)`)
    .eq("documents.status", "published")
    .eq("member_id", memberId)
    .in("kind", ["message", "event"])
    .neq("audience", "child")
    .gte("date", dayKey(monday))
    .lte("date", dayKey(addDays(monday, 13)))
    .order("date")
    .order("sort");
  if (error) throw new Error("Could not read the plan items");
  return (data ?? []) as unknown as PlanItemRow[];
}

/** Published ukeplan events of some members in a date range (for the calendar views); audience is filtered by the caller. */
export async function loadSchoolEvents(memberIds: string[], fromKey: string, toKey: string): Promise<PlanItemRow[]> {
  if (memberIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_items")
    .select(`${ITEM_COLUMNS}, documents!inner(status)`)
    .eq("documents.status", "published")
    .in("member_id", memberIds)
    .eq("kind", "event")
    .eq("whole_week", false)
    .gte("date", fromKey)
    .lte("date", toKey)
    .order("date")
    .order("sort");
  if (error) throw new Error("Could not read the plan items");
  return (data ?? []) as unknown as PlanItemRow[];
}
