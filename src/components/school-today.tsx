import { formatDayHeading } from "@/lib/dates";
import { t } from "@/lib/i18n";
import type { PlanItemRow } from "@/lib/plan";
import type { TodayView } from "@/lib/plan-view";
import { SchoolHeading, SchoolHomework, SchoolLines, SchoolNotes } from "./school-items";

/** The school part of "I dag". Renders nothing when there is nothing to show. */
export function SchoolToday({ view }: { view: TodayView }) {
  const { lessons, bring, notes, homeworkDue } = view;
  if (lessons.length + bring.length + notes.length + homeworkDue.length === 0) return null;
  const section = (heading: React.ReactNode, children: React.ReactNode, key: string) => (
    <div key={key}>
      <SchoolHeading>{heading}</SchoolHeading>
      {children}
    </div>
  );
  const has = (items: PlanItemRow[]) => items.length > 0;
  return (
    <div className="space-y-4">
      {has(lessons) && section(t.school.timetable, <SchoolLines items={lessons} />, "lessons")}
      {has(bring) && section(t.school.bring, <SchoolLines items={bring} />, "bring")}
      {has(homeworkDue) &&
        section(t.school.homeworkFor(formatDayHeading(view.nextSchoolDay)), <SchoolHomework items={homeworkDue} />, "homework")}
      {has(notes) && <SchoolNotes items={notes} />}
    </div>
  );
}
