import { redirect } from "next/navigation";
import { Notice } from "@/components/notice";
import { SchoolDoneCheckbox } from "@/components/school-done-checkbox";
import { addDays, dayKey } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { formatWeekday, todayView } from "@/lib/plan-view";
import { loadSchoolWeek } from "@/lib/school";
import { getViewer } from "@/lib/view-as";

/** Only the homework due on the next school day, in big text. */
export default async function HomeworkPage() {
  const { viewing, previewing } = await getViewer();
  if (viewing.role !== "child") redirect("/preview");
  const school = await loadSchoolWeek(viewing.id, 0);
  const view = todayView(school.items, school.today);
  const items = view.homeworkDue;
  const tomorrow = view.nextSchoolDayKey === dayKey(addDays(school.today, 1));
  const weekday = formatWeekday(view.nextSchoolDay).toLocaleLowerCase();
  const heading = tomorrow ? t.school.homeworkTomorrow : t.school.homeworkFor(weekday);
  const docIds = new Set(items.map((i) => i.document_id));
  const link = school.documents.find((d) => docIds.has(d.id));

  return (
    <>
      <h1 className="text-3xl font-extrabold">{heading}</h1>
      {previewing && <Notice>{t.preview.readOnly}</Notice>}
      {items.length === 0 ? (
        <p className="card p-6 text-2xl font-extrabold">
          {tomorrow ? t.school.homeworkEmptyTomorrow : t.school.homeworkEmptyFor(weekday)}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="card px-3 py-2">
              <SchoolDoneCheckbox
                id={item.id}
                done={item.done}
                label={item.text}
                detail={item.subject}
                readOnly={previewing}
                large
              />
            </li>
          ))}
        </ul>
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
