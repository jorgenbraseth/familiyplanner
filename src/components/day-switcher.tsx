import Link from "next/link";
import { addDays, dayKey, daysBetween, relativeDayLabel, type CalendarDate } from "@/lib/dates";
import { t } from "@/lib/i18n";

const NAV =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-3xl font-bold leading-none text-primary-strong hover:bg-chip";

function hrefFor(date: CalendarDate, today: CalendarDate): string {
  return daysBetween(today, date) === 0 ? "/" : `/?dag=${dayKey(date)}`;
}

/** Text-only previous/next day links around the day label (server-rendered; fixed height so nothing jumps). */
export function DaySwitcher({ date, today }: { date: CalendarDate; today: CalendarDate }) {
  const isToday = daysBetween(today, date) === 0;
  return (
    <div className="flex h-11 items-center">
      <Link href={hrefFor(addDays(date, -1), today)} scroll={false} aria-label={t.start.previousDay} className={NAV}>
        ‹
      </Link>
      <p className="min-w-16 truncate text-center text-base font-extrabold" aria-live="polite">
        {relativeDayLabel(date, today)}
      </p>
      <Link href={hrefFor(addDays(date, 1), today)} scroll={false} aria-label={t.start.nextDay} className={NAV}>
        ›
      </Link>
      {/* Always rendered so the row keeps its size; hidden on today. */}
      <Link
        href="/"
        scroll={false}
        aria-hidden={isToday}
        tabIndex={isToday ? -1 : undefined}
        className={`btn btn-text shrink-0 text-base ${isToday ? "invisible" : ""}`}
      >
        {t.start.toToday}
      </Link>
    </div>
  );
}
