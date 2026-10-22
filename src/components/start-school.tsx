import { DaySwitcher } from "@/components/day-switcher";
import { MyDayList, SchoolHeading, SchoolLines, TimelineLegend } from "@/components/school-items";
import { t } from "@/lib/i18n";
import { daysBetween, type CalendarDate } from "@/lib/dates";
import { formatSchoolHours, myDayEntries, timelineLegend, type EventEntry, type TodayView } from "@/lib/plan-view";

/**
 * "Min dag": the selected day's (default today) school periods and events (calendar and school events) in one chronological list, school
 * periods green and everything else orange (with a legend), plus today's messages ("Husk").
 */
export function StartSchool({ view, events, date, today }: { view: TodayView; events: EventEntry[]; date: CalendarDate; today: CalendarDate }) {
  const hoursLabel = formatSchoolHours(view.hours?.starts_at, view.hours?.ends_at);
  const entries = myDayEntries(view.periods, view.hours, events);
  const legend = timelineLegend(entries);

  return (
    <section className="space-y-4" aria-labelledby="school-title">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <h2 id="school-title" className="text-3xl font-bold">
            {t.start.myDay}
          </h2>
          <DaySwitcher date={date} today={today} />
        </div>
        {hoursLabel && <p className="mt-1 text-lg font-bold text-muted">{t.start.schoolHours(hoursLabel)}</p>}
      </div>

      {entries.length === 0 ? <p className="text-base text-muted">{daysBetween(today, date) === 0 ? t.start.nothingToday : t.start.nothingOnDay}</p> : <MyDayList entries={entries} />}

      <div className="pl-[4.25rem]">
        <TimelineLegend legend={legend} label={t.start.myDay} />
      </div>

      {view.messages.length > 0 && (
        <div className="pt-4">
          <SchoolHeading>{t.start.remember}</SchoolHeading>
          <SchoolLines items={view.messages} />
        </div>
      )}
    </section>
  );
}
