import { SchoolHeading, SchoolLines } from "@/components/school-items";
import { t } from "@/lib/i18n";
import type { PlanItemRow } from "@/lib/plan";
import { formatSchoolHours, sortLessons, type TodayView } from "@/lib/plan-view";
import { lessonLine } from "@/lib/start-view";

type SchoolDay = { starts_at: string | null; ends_at: string | null } | undefined;
type CalendarEvent = { id: string; title: string; timeLabel: string };

/** "Skoledagen": today's school hours and lessons in period order, plus the child's calendar for today. */
export function StartSchool({
  view,
  hours,
  events,
}: {
  view: TodayView;
  hours: SchoolDay;
  events: CalendarEvent[];
}) {
  const lessons = sortLessons(view.lessons).map(lessonLine);
  const hoursLabel = formatSchoolHours(hours?.starts_at, hours?.ends_at);
  const hasSchool = lessons.length > 0 || hoursLabel !== null;
  const asLines = (items: PlanItemRow[]) => <SchoolLines items={items} />;

  return (
    <section className="card space-y-4 p-4" aria-labelledby="school-title">
      <div>
        <h2 id="school-title" className="text-2xl font-extrabold">
          {t.start.schoolDay}
        </h2>
        <p className="text-lg font-bold text-muted">
          {hasSchool ? (hoursLabel ? t.start.schoolHours(hoursLabel) : "") : t.start.noSchool}
        </p>
      </div>

      {hasSchool && (
        <div>
          {lessons.length === 0 ? (
            <p className="text-base text-muted">{t.start.noLessons}</p>
          ) : (
            <ol className="divide-y-2 divide-line">
              {lessons.map((lesson) => (
                <li key={lesson.id} className="flex min-h-12 items-center gap-3 py-2 text-lg">
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-chip text-base font-extrabold text-chip-ink"
                  >
                    {lesson.period ?? "·"}
                  </span>
                  <span className="min-w-0 flex-1 break-words font-semibold">{lesson.title}</span>
                  {lesson.time && <span className="shrink-0 text-base font-bold text-muted">{lesson.time}</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {view.bring.length > 0 && (
        <div>
          <SchoolHeading>{t.school.bring}</SchoolHeading>
          {asLines(view.bring)}
        </div>
      )}
      {view.notes.length > 0 && (
        <div>
          <SchoolHeading>{t.school.notes}</SchoolHeading>
          {asLines(view.notes)}
        </div>
      )}

      <div>
        <SchoolHeading>{t.start.calendarTitle}</SchoolHeading>
        {events.length === 0 ? (
          <p className="text-base text-muted">{t.start.noEvents}</p>
        ) : (
          <ul className="divide-y-2 divide-line">
            {events.map((event) => (
              <li key={event.id} className="flex min-h-12 items-center gap-3 py-2 text-lg">
                <span className="w-24 shrink-0 text-base font-bold text-muted">{event.timeLabel}</span>
                <span className="min-w-0 flex-1 break-words font-semibold">{event.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
