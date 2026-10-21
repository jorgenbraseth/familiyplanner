import "server-only";
import { dateInTimeZone } from "./dates";
import type { Member } from "./members";
import { MEMBER_COLUMNS } from "./members";
import { schoolEndSummary, uploadWeekFor, type SchoolEnd } from "./parent-home-view";
import type { PlanItemRow } from "./plan";
import { parentNoteWeeks, todayView, type ParentNoteWeek } from "./plan-view";
import { loadParentNoteItems, loadSchoolWeek } from "./school";
import { loadAllChildStars, type ChildStars } from "./star-data";
import type { StarRow } from "./stars";
import { createClient } from "./supabase/server";
import { isTomorrow } from "./start-view";
import type { CalendarDate, IsoWeek } from "./dates";

export type ParentHomeChild = {
  child: Member;
  /** Active star track with its tasks (declined stars included: this is the parents' view), or null. */
  stars: ChildStars | null;
  /** Pending star requests of this child. */
  pending: StarRow[];
  /** Homework due on the next school day, from published documents only (as the child sees it). */
  homework: PlanItemRow[];
  nextSchoolDay: CalendarDate;
  homeworkTomorrow: boolean;
  schoolEnd: SchoolEnd;
  /** Parent/both messages and events of this and next week, newest week first ("Beskjeder til foreldre"). */
  notes: ParentNoteWeek[];
};

export type ParentHome = {
  children: ParentHomeChild[];
  uploadWeek: IsoWeek;
};

/** Everything the parents' home page shows about the children. Uses the user-scoped client only (RLS applies). */
export async function loadParentHome(now = new Date()): Promise<ParentHome> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("members").select(MEMBER_COLUMNS).eq("role", "child").order("created_at");
  if (error) throw new Error("Could not read members");
  const kids = (data ?? []) as Member[];

  const starRows = await loadAllChildStars(kids);
  const children = await Promise.all(
    starRows.map(async ({ child, active }): Promise<ParentHomeChild> => {
      const [school, noteItems] = await Promise.all([loadSchoolWeek(child.id, 0, now), loadParentNoteItems(child.id, now)]);
      const view = todayView(school.items, school.today, school.timetable, school.hoursOverrides, "parent");
      return {
        child,
        stars: active,
        pending: active?.stars.filter((s) => s.status === "pending").reverse() ?? [],
        homework: view.homeworkDue,
        nextSchoolDay: view.nextSchoolDay,
        homeworkTomorrow: isTomorrow(school.today, view.nextSchoolDay),
        schoolEnd: schoolEndSummary(view.hours, view.periods.length),
        notes: parentNoteWeeks(noteItems),
      };
    }),
  );
  return { children, uploadWeek: uploadWeekFor(dateInTimeZone(now)) };
}
