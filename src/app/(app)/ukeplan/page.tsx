import { redirect } from "next/navigation";
import { Notice } from "@/components/notice";
import { SchoolWeekPlan } from "@/components/school-week-plan";
import { WeekNav } from "@/components/week-nav";
import { loadWeek, parseWeekOffset } from "@/lib/calendar/view";
import { addDays, dayKey, isoWeekOf } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { filterByAudience, weekPlan, wholeWeekSection } from "@/lib/plan-view";
import { loadSchoolWeek } from "@/lib/school";
import { getViewer } from "@/lib/view-as";

export default async function WeekPlanPage({ searchParams }: PageProps<"/ukeplan">) {
  const { viewing, previewing } = await getViewer();
  if (viewing.role !== "child") redirect("/preview");
  const offset = parseWeekOffset((await searchParams).week);
  const now = new Date();
  const [school, calendar] = await Promise.all([
    loadSchoolWeek(viewing.id, offset, now),
    // Calendar events and school events interleaved by time, per day.
    loadWeek([viewing], offset, now, { schoolEvents: { view: "kid", memberIds: [viewing.id] } }),
  ]);
  const todayKey = dayKey(school.today);
  const mondayKey = dayKey(school.monday);
  const sunday = dayKey(addDays(school.monday, 6));
  // loadSchoolWeek also returns the Monday after, which belongs to the next week.
  const items = filterByAudience(school.items, "kid").filter((i) => i.date <= sunday);
  const eventsByDay = new Map(calendar.days.map((d) => [d.key, d.events]));
  const days = weekPlan(items, school.timetable, school.hoursOverrides, eventsByDay, school.monday, todayKey, offset, true);
  const wholeWeek = wholeWeekSection(items, mondayKey, "kid");
  const usedIds = new Set(items.map((i) => i.document_id));
  const documents = school.documents.filter((d) => usedIds.has(d.id));

  return (
    <>
      <h1 className="text-3xl font-extrabold">{t.school.weekPlanTitle}</h1>
      {previewing && <Notice>{t.preview.readOnly}</Notice>}
      {calendar.failedNames.length > 0 && <Notice>{t.calendar.failed(calendar.failedNames.join(", "))}</Notice>}
      <WeekNav path="/ukeplan" offset={offset} isoWeek={isoWeekOf(school.monday).isoWeek} />
      <SchoolWeekPlan days={days} wholeWeek={wholeWeek} todayKey={todayKey} documents={documents} readOnly={previewing} />
    </>
  );
}
