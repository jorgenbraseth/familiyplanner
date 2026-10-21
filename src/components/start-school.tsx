import { SchoolEventLines, SchoolHeading, SchoolLines, SchoolPeriods } from "@/components/school-items";
import { t } from "@/lib/i18n";
import { formatSchoolHours, type EventEntry, type TodayView } from "@/lib/plan-view";

/**
 * "Skoledagen": today's school hours and periods from the timetable, today's messages ("Husk") and today's
 * events (calendar and school events interleaved by time).
 */
export function StartSchool({ view, events }: { view: TodayView; events: EventEntry[] }) {
  const hoursLabel = formatSchoolHours(view.hours?.starts_at, view.hours?.ends_at);
  const hasSchool = view.periods.length > 0 || hoursLabel !== null;

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

      {hasSchool && (view.periods.length === 0 ? <p className="text-base text-muted">{t.start.noLessons}</p> : <SchoolPeriods periods={view.periods} />)}

      {view.messages.length > 0 && (
        <div>
          <SchoolHeading>{t.start.remember}</SchoolHeading>
          <SchoolLines items={view.messages} />
        </div>
      )}

      <div>
        <SchoolHeading>{t.start.calendarTitle}</SchoolHeading>
        {events.length === 0 ? <p className="text-base text-muted">{t.start.noEvents}</p> : <SchoolEventLines events={events} />}
      </div>
    </section>
  );
}
