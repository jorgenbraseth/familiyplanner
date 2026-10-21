import Link from "next/link";
import { addDays, dayKey, daysBetween, relativeDayLabel, type CalendarDate } from "@/lib/dates";
import { t } from "@/lib/i18n";

const NAV =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-line bg-chip text-2xl font-extrabold leading-none text-chip-ink hover:bg-surface";

function hrefFor(date: CalendarDate, today: CalendarDate): string {
  return daysBetween(today, date) === 0 ? "/" : `/?dag=${dayKey(date)}`;
}

/** Previous/next day buttons around the day label (server-rendered links; fixed height so nothing jumps). */
export function DaySwitcher({ date, today }: { date: CalendarDate; today: CalendarDate }) {
  const isToday = daysBetween(today, date) === 0;
  return (
    <div className="flex h-11 items-center gap-2">
      <Link href={hrefFor(addDays(date, -1), today)} scroll={false} aria-label={t.start.previousDay} className={NAV}>
        ‹
      </Link>
      <p className="min-w-0 flex-1 truncate text-center text-lg font-bold" aria-live="polite">
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
        className={`inline-flex h-11 shrink-0 items-center rounded-full border-2 border-line bg-chip px-4 text-base font-extrabold text-chip-ink hover:bg-surface ${isToday ? "invisible" : ""}`}
      >
        {t.start.toToday}
      </Link>
    </div>
  );
}
