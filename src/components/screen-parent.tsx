import { DayList, type MemberDot } from "@/components/day-list";
import type { WeekView } from "@/lib/calendar/view";
import { t } from "@/lib/i18n";

/** A parent's own things on the family screen: the calendar today and the rest of the week, read-only. */
export function ScreenParentView({ week, me, pending }: { week: WeekView; me: MemberDot; pending: number }) {
  const today = week.days.filter((d) => d.isToday);
  const rest = week.days.filter((d) => d.key > week.todayKey);
  return (
    <div className="space-y-12">
      {pending > 0 && <p className="rounded-3xl bg-warning-soft p-5 text-lg font-bold text-on-warning-soft">{t.screen.parentPending(pending)}</p>}
      <section className="space-y-4" aria-labelledby="screen-today">
        <h2 id="screen-today" className="text-3xl font-bold">{t.screen.today}</h2>
        {today.length === 0 || today[0].events.length === 0 ? (
          <p className="text-lg text-muted">{t.screen.nothingToday}</p>
        ) : (
          <DayList days={today} members={[me]} />
        )}
      </section>
      <section className="space-y-4" aria-labelledby="screen-rest">
        <h2 id="screen-rest" className="text-3xl font-bold">{t.screen.restOfWeek}</h2>
        {rest.every((d) => d.events.length === 0) ? (
          <p className="text-lg text-muted">{t.screen.nothingRestOfWeek}</p>
        ) : (
          <DayList days={rest.filter((d) => d.events.length > 0)} members={[me]} />
        )}
      </section>
    </div>
  );
}
