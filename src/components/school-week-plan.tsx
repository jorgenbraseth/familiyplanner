import { t } from "@/lib/i18n";
import { formatHm, formatWeekday, type WeekPlanDay } from "@/lib/plan-view";
import type { SchoolDocument } from "@/lib/school";
import { SchoolHeading, SchoolHomework, SchoolLines, SchoolNotes } from "./school-items";

/** One card per day for the kids' "Ukeplan": school hours, the periods, homework, things to bring, notes. */
export function SchoolWeekPlan({
  days,
  todayKey,
  documents,
  readOnly = false,
}: {
  days: WeekPlanDay[];
  todayKey: string;
  documents: SchoolDocument[];
  readOnly?: boolean;
}) {
  // The caller has already dropped empty days (weekPlan with hideEmpty), so no days means an empty week.
  if (days.length === 0) return <p className="card p-4 text-lg">{t.school.weekPlanEmpty}</p>;
  return (
    <div className="space-y-4">
      <ol className="space-y-4">
        {days.map((day) => {
          const isToday = day.key === todayKey;
          return (
            <li key={day.key} className={`card space-y-3 p-3 ${isToday ? "border-accent bg-warning-soft" : ""}`}>
              <div>
                <h2 className={`text-2xl font-extrabold ${isToday ? "text-on-warning-soft" : ""}`}>{formatWeekday(day.date)}</h2>
                {day.hours && <p className="text-base font-semibold text-muted">{t.school.schoolHours(day.hours)}</p>}
              </div>
              {day.lessons.length > 0 && (
                <ul className="divide-y-2 divide-line rounded-xl bg-surface px-3">
                  {day.lessons.map((lesson) => {
                    const time = formatHm(lesson.starts_at);
                    const meta = [lesson.period ? t.school.periodLabel(lesson.period) : null, time].filter(Boolean).join(" · ");
                    return (
                      <li key={lesson.id} className="flex items-baseline gap-3 py-2 text-lg">
                        {meta && <span className="w-28 shrink-0 text-sm tabular-nums text-muted">{meta}</span>}
                        <span className="min-w-0 flex-1 break-words">
                          <span className="font-extrabold">{lesson.subject ?? lesson.text}</span>
                          {lesson.subject && lesson.text && <span className="block text-sm text-muted">{lesson.text}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {day.homework.length > 0 && (
                <div>
                  <SchoolHeading>{t.school.homework}</SchoolHeading>
                  <SchoolHomework items={day.homework} readOnly={readOnly} />
                </div>
              )}
              {day.bring.length > 0 && (
                <div>
                  <SchoolHeading>{t.school.bring}</SchoolHeading>
                  <SchoolLines items={day.bring} />
                </div>
              )}
              {day.notes.length > 0 && <SchoolNotes items={day.notes} />}
            </li>
          );
        })}
      </ol>
      {documents.length > 0 && (
        <ul className="space-y-1">
          {documents.map((doc) => (
            <li key={doc.id}>
              <a
                href={`/documents/${doc.id}/file`}
                className="inline-flex min-h-11 items-center text-base font-bold text-primary-strong underline underline-offset-4"
              >
                {documents.length === 1 ? t.school.originalFile : t.school.originalFileFor(t.school.documentTypes[doc.type], doc.iso_week as number)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
