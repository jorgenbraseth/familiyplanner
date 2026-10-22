import { redirect } from "next/navigation";
import { Notice } from "@/components/notice";
import { SchoolDoneCheckbox } from "@/components/school-done-checkbox";
import { addDays, dayKey } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { formatWeekday, todayView } from "@/lib/plan-view";
import { loadSchoolWeek } from "@/lib/school";
import { getViewer } from "@/lib/view-as";

/** Homework due on the next school day, then this week's whole-week homework (not done first), in big text. */
export default async function HomeworkPage() {
  const { viewing, previewing } = await getViewer();
  if (viewing.role !== "child") redirect("/preview");
  const school = await loadSchoolWeek(viewing.id, 0);
  const view = todayView(school.items, school.today, school.timetable, school.hoursOverrides, "kid");
  const items = view.homeworkDue;
  const weekItems = view.weekHomework;
  const tomorrow = view.nextSchoolDayKey === dayKey(addDays(school.today, 1));
  const weekday = formatWeekday(view.nextSchoolDay).toLocaleLowerCase();
  const heading = tomorrow ? t.school.homeworkTomorrow : t.school.homeworkFor(weekday);
  const docIds = new Set([...items, ...weekItems].map((i) => i.document_id));
  const link = school.documents.find((d) => docIds.has(d.id));

  return (
    <>
      <h1 className="text-4xl font-bold leading-tight">{heading}</h1>
      {previewing && <Notice>{t.preview.readOnly}</Notice>}
      {items.length === 0 ? (
        <p className="text-2xl font-extrabold">
          {tomorrow ? t.school.homeworkEmptyTomorrow : t.school.homeworkEmptyFor(weekday)}
        </p>
      ) : (
        <HomeworkList items={items} readOnly={previewing} />
      )}
      {weekItems.length > 0 && (
        <section className="space-y-4" aria-labelledby="week-homework-title">
          <h2 id="week-homework-title" className="text-2xl font-extrabold">{t.school.homeworkThisWeek}</h2>
          <HomeworkList items={weekItems} readOnly={previewing} />
        </section>
      )}
      {link && (
        <a
          href={`/documents/${link.id}/file`}
          className="inline-flex min-h-11 items-center text-base font-bold text-primary-strong underline underline-offset-4"
        >
          {t.school.originalFile}
        </a>
      )}
    </>
  );
}

function HomeworkList({ items, readOnly }: { items: Awaited<ReturnType<typeof loadSchoolWeek>>["items"]; readOnly: boolean }) {
  return (
    <ul className="grid gap-x-8 md:grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] md:items-start">
      {items.map((item) => (
        <li key={item.id}>
          <SchoolDoneCheckbox id={item.id} done={item.done} label={item.text} detail={item.subject} readOnly={readOnly} large />
        </li>
      ))}
    </ul>
  );
}
