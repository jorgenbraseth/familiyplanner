import { redirect } from "next/navigation";
import { Notice } from "@/components/notice";
import { SchoolWeekPlan } from "@/components/school-week-plan";
import { WeekNav } from "@/components/week-nav";
import { parseWeekOffset } from "@/lib/calendar/view";
import { addDays, dayKey, isoWeekOf } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { weekPlan } from "@/lib/plan-view";
import { loadSchoolHours, loadSchoolWeek } from "@/lib/school";
import { getViewer } from "@/lib/view-as";

export default async function WeekPlanPage({ searchParams }: PageProps<"/ukeplan">) {
  const { viewing, previewing } = await getViewer();
  if (viewing.role !== "child") redirect("/preview");
  const offset = parseWeekOffset((await searchParams).week);
  const school = await loadSchoolWeek(viewing.id, offset);
  const hours = await loadSchoolHours(viewing.id, school.monday);
  const todayKey = dayKey(school.today);
  const sunday = dayKey(addDays(school.monday, 6));
  // loadSchoolWeek also returns the Monday after, which belongs to the next week.
  const items = school.items.filter((i) => i.date <= sunday);
  const days = weekPlan(items, hours, school.monday, todayKey, offset);
  const usedIds = new Set(items.map((i) => i.document_id));
  const documents = school.documents.filter((d) => usedIds.has(d.id));

  return (
    <>
      <h1 className="text-3xl font-extrabold">{t.school.weekPlanTitle}</h1>
      {previewing && <Notice>{t.preview.readOnly}</Notice>}
      <WeekNav path="/ukeplan" offset={offset} isoWeek={isoWeekOf(school.monday).isoWeek} />
      <SchoolWeekPlan days={days} todayKey={todayKey} documents={documents} readOnly={previewing} />
    </>
  );
}
