import { DayList, type MemberDot } from "@/components/day-list";
import type { DayView } from "@/lib/calendar/view";
import { t } from "@/lib/i18n";

/** A parent's own things on the family screen: the calendar today and the next days, read-only. */
export function ScreenParentView({
  heading,
  isToday,
  today,
  upcoming,
  me,
  pending,
}: {
  /** The selected day's heading ("I dag", "I morgen", "fredag 30. oktober"). */
  heading: string;
  isToday: boolean;
  /** The selected day (one entry). */
  today: DayView[];
  /** The days after the selected day. */
  upcoming: DayView[];
  me: MemberDot;
  pending: number;
}) {
  return (
    <div className="space-y-12">
      {pending > 0 && <p className="rounded-3xl bg-warning-soft p-5 text-lg font-bold text-on-warning-soft">{t.screen.parentPending(pending)}</p>}
      <section className="space-y-4" aria-labelledby="screen-today">
        <h2 id="screen-today" className="text-3xl font-bold first-letter:uppercase">{heading}</h2>
        {today.length === 0 || today[0].events.length === 0 ? (
          <p className="text-lg text-muted">{isToday ? t.screen.nothingToday : t.screen.nothingOnDay}</p>
        ) : (
          <DayList days={today} members={[me]} />
        )}
      </section>
      <section className="space-y-4" aria-labelledby="screen-upcoming">
        <h2 id="screen-upcoming" className="text-3xl font-bold">{t.screen.nextDays}</h2>
        {upcoming.every((d) => d.events.length === 0) ? (
          <p className="text-lg text-muted">{t.screen.nothingNextDays}</p>
        ) : (
          <DayList days={upcoming.filter((d) => d.events.length > 0)} members={[me]} />
        )}
      </section>
    </div>
  );
}
