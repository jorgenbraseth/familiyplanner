// Reading a member's timetable (their latest published timeplan) and old per-date school hours.
// Takes the Supabase client as a parameter so the assistant (user-scoped client in its context) can use it too.
// Always call it with a user-scoped client: RLS decides what is readable.

import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_TIMETABLE, type SchoolHours, type Timetable } from "./plan-view";
import type { SchoolDayRow } from "./plan";

/** The member's active timetable: the days and periods of their latest published timeplan (empty if none). */
export async function fetchTimetable(supabase: SupabaseClient, memberId: string): Promise<Timetable> {
  const { data: documentId, error: docError } = await supabase.rpc("active_timeplan_document", { member: memberId });
  if (docError) throw new Error("Could not read the timetable");
  if (typeof documentId !== "string") return EMPTY_TIMETABLE;

  const [days, periods] = await Promise.all([
    supabase.from("timetable_days").select("weekday, starts_at, ends_at").eq("document_id", documentId),
    supabase
      .from("timetable_periods")
      .select("id, weekday, period, starts_at, ends_at, subject, sort")
      .eq("document_id", documentId),
  ]);
  if (days.error || periods.error) throw new Error("Could not read the timetable");
  return {
    days: (days.data ?? []) as Timetable["days"],
    periods: (periods.data ?? []) as Timetable["periods"],
  };
}

/**
 * Old `school_days` rows of published week plans in a date range, keyed "YYYY-MM-DD". They only override the
 * timetable for that exact date. If two documents give the same day, the one that knows more times wins.
 */
export async function fetchHoursOverrides(
  supabase: SupabaseClient,
  memberId: string,
  fromKey: string,
  toKey: string,
): Promise<Map<string, SchoolHours>> {
  const { data, error } = await supabase
    .from("school_days")
    .select("date, starts_at, ends_at, documents!inner(status)")
    .eq("documents.status", "published")
    .eq("member_id", memberId)
    .gte("date", fromKey)
    .lte("date", toKey);
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
