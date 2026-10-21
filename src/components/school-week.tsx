import { formatDayHeading } from "@/lib/dates";
import { t } from "@/lib/i18n";
import type { PlanItemRow } from "@/lib/plan";
import type { DayItems } from "@/lib/plan-view";
import type { SchoolDocument } from "@/lib/school";
import { SchoolHeading, SchoolHomework, SchoolLines, SchoolNotes } from "./school-items";

/** The week's school plan per day; days without items are skipped. */
export function SchoolWeek({
  days,
  documents,
  todayKey,
  readOnly = false,
}: {
  days: DayItems[];
  documents: SchoolDocument[];
  todayKey: string;
  readOnly?: boolean;
}) {
  const filled = days.filter((d) => d.items.length > 0);
  if (filled.length === 0) return null;
  const usedIds = new Set(filled.flatMap((d) => d.items.map((i) => i.document_id)));
  const links = documents.filter((d) => usedIds.has(d.id));
  const of = (items: PlanItemRow[], kind: PlanItemRow["kind"]) => items.filter((i) => i.kind === kind);

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-extrabold">{t.school.title}</h3>
      <ol className="space-y-5">
        {filled.map((day) => {
          const lessons = of(day.items, "lesson");
          const homework = of(day.items, "homework");
          const bring = of(day.items, "bring");
          const notes = of(day.items, "note");
          return (
            <li key={day.key} className="space-y-3">
              <h4
                className={`text-base font-extrabold capitalize ${day.key === todayKey ? "text-primary-strong" : "text-muted"}`}
              >
                {formatDayHeading(day.date)}
              </h4>
              {lessons.length > 0 && (
                <div>
                  <SchoolHeading>{t.school.timetable}</SchoolHeading>
                  <SchoolLines items={lessons} />
                </div>
              )}
              {homework.length > 0 && (
                <div>
                  <SchoolHeading>{t.school.homework}</SchoolHeading>
                  <SchoolHomework items={homework} readOnly={readOnly} />
                </div>
              )}
              {bring.length > 0 && (
                <div>
                  <SchoolHeading>{t.school.bring}</SchoolHeading>
                  <SchoolLines items={bring} />
                </div>
              )}
              {notes.length > 0 && <SchoolNotes items={notes} />}
            </li>
          );
        })}
      </ol>
      {links.length > 0 && (
        <ul className="space-y-1">
          {links.map((doc) => (
            <li key={doc.id}>
              <a
                href={`/documents/${doc.id}/file`}
                className="inline-flex min-h-11 items-center text-base font-bold text-primary-strong underline underline-offset-4"
              >
                {links.length === 1 ? t.school.originalFile : t.school.originalFileFor(t.school.documentTypes[doc.type], doc.iso_week)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
