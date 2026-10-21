import { t } from "@/lib/i18n";
import { formatWeekday, weekLegend, type WeekPlanDay, type WholeWeek } from "@/lib/plan-view";
import type { SchoolDocument } from "@/lib/school";
import { MyDayList, SchoolHeading, SchoolHomework, SchoolLines, TimelineLegend } from "./school-items";

/**
 * The kids' "Ukeplan": a "Hele uken" card (whole-week homework and messages) followed by one card per day with
 * school hours, periods, events, homework and messages.
 */
export function SchoolWeekPlan({
  days,
  wholeWeek,
  todayKey,
  documents,
  readOnly = false,
}: {
  days: WeekPlanDay[];
  wholeWeek: WholeWeek;
  todayKey: string;
  documents: SchoolDocument[];
  readOnly?: boolean;
}) {
  const hasWhole = wholeWeek.homework.length + wholeWeek.messages.length > 0;
  // The caller has already dropped empty days (weekPlan with hideEmpty), so nothing at all means an empty week.
  if (days.length === 0 && !hasWhole) return <p className="card p-4 text-lg">{t.school.weekPlanEmpty}</p>;
  return (
    <div className="space-y-4">
      {hasWhole && (
        <section className="card space-y-3 p-3" aria-labelledby="whole-week-title">
          <h2 id="whole-week-title" className="text-2xl font-extrabold">{t.school.wholeWeek}</h2>
          {wholeWeek.homework.length > 0 && (
            <div>
              <SchoolHeading>{t.school.homework}</SchoolHeading>
              <SchoolHomework items={wholeWeek.homework} readOnly={readOnly} />
            </div>
          )}
          {wholeWeek.messages.length > 0 && (
            <div>
              <SchoolHeading>{t.school.messages}</SchoolHeading>
              <SchoolLines items={wholeWeek.messages} />
            </div>
          )}
        </section>
      )}
      <TimelineLegend legend={weekLegend(days)} label={t.start.myDay} />
      <ol className="space-y-4">
        {days.map((day) => {
          const isToday = day.key === todayKey;
          return (
            <li key={day.key} className={`card space-y-3 p-3 ${isToday ? "border-accent bg-warning-soft" : ""}`}>
              <div>
                <h2 className={`text-2xl font-extrabold ${isToday ? "text-on-warning-soft" : ""}`}>{formatWeekday(day.date)}</h2>
                {day.hours && <p className="text-base font-semibold text-muted">{t.school.schoolHours(day.hours)}</p>}
              </div>
              {day.timeline.length > 0 && <MyDayList entries={day.timeline} />}
              {day.homework.length > 0 && (
                <div>
                  <SchoolHeading>{t.school.homework}</SchoolHeading>
                  <SchoolHomework items={day.homework} readOnly={readOnly} />
                </div>
              )}
              {day.messages.length > 0 && (
                <div>
                  <SchoolHeading>{t.school.messages}</SchoolHeading>
                  <SchoolLines items={day.messages} />
                </div>
              )}
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
                {documents.length === 1 || doc.iso_week === null
                  ? t.school.originalFile
                  : t.school.originalFileFor(t.school.documentTypes[doc.type], doc.iso_week)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
