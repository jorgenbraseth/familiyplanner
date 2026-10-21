import { MyDayList, SchoolHeading, SchoolLines, TimelineLegend } from "@/components/school-items";
import { t } from "@/lib/i18n";
import { formatSchoolHours, myDayEntries, timelineLegend, type EventEntry, type TodayView } from "@/lib/plan-view";

/**
 * "Min dag": today's school periods and events (calendar and school events) in one chronological list, school
 * periods green and everything else orange (with a legend), plus today's messages ("Husk").
 */
export function StartSchool({ view, events }: { view: TodayView; events: EventEntry[] }) {
  const hoursLabel = formatSchoolHours(view.hours?.starts_at, view.hours?.ends_at);
  const entries = myDayEntries(view.periods, view.hours, events);
  const legend = timelineLegend(entries);

  return (
    <section className="card space-y-4 p-4" aria-labelledby="school-title">
      <div>
        <h2 id="school-title" className="text-2xl font-extrabold">
          {t.start.myDay}
        </h2>
        {hoursLabel && <p className="text-lg font-bold text-muted">{t.start.schoolHours(hoursLabel)}</p>}
        <div className="mt-2">
          <TimelineLegend legend={legend} label={t.start.myDay} />
        </div>
      </div>

      {entries.length === 0 ? <p className="text-base text-muted">{t.start.nothingToday}</p> : <MyDayList entries={entries} />}

      {view.messages.length > 0 && (
        <div>
          <SchoolHeading>{t.start.remember}</SchoolHeading>
          <SchoolLines items={view.messages} />
        </div>
      )}
    </section>
  );
}
