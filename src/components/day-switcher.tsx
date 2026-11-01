"use client";

import { useState } from "react";
import { NavLink, useNavPending } from "@/components/nav-pending";
import { addDays, relativeDayLabel, daysBetween, type CalendarDate } from "@/lib/dates";
import { dayHref, shownDay, type DayHrefBase } from "@/lib/day-nav";
import { t } from "@/lib/i18n";

const NAV =
  "inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none text-primary-strong hover:bg-chip";
const SIZES = {
  // Kids' page: 56px targets.
  page: { nav: "size-14 text-4xl", label: "text-2xl", back: "text-lg" },
  // Familieskjerm: a tablet used at arm's length, 72px targets.
  screen: { nav: "size-[4.5rem] text-5xl", label: "text-4xl", back: "text-2xl" },
} as const;

/**
 * Previous/next day links around the day label (fixed height so nothing jumps). Must sit inside a `NavPendingScope`:
 * a click shows the target day at once, pulses the label and dims the content until the page has loaded; the
 * neighbouring days are prefetched so the next tap is usually instant.
 */
export function DaySwitcher({
  date,
  today,
  base,
  size = "page",
}: {
  date: CalendarDate;
  today: CalendarDate;
  base?: DayHrefBase;
  size?: keyof typeof SIZES;
}) {
  const sz = SIZES[size];
  const pending = useNavPending();
  const [target, setTarget] = useState<CalendarDate | null>(null);
  const shown = shownDay(date, target, pending);
  const isToday = daysBetween(today, shown) === 0;
  const to = (step: number) => {
    const next = addDays(shown, step);
    return { href: dayHref(next, today, base), onClick: () => setTarget(next) };
  };
  const prev = to(-1);
  const next = to(1);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-busy={pending}>
      <div className="flex w-full min-w-0 items-center sm:w-auto">
        <NavLink href={prev.href} prefetch scroll={false} onClick={prev.onClick} aria-label={t.start.previousDay} className={`${NAV} ${sz.nav}`}>
          ‹
        </NavLink>
        <p
          className={`min-w-0 flex-1 truncate text-center font-extrabold first-letter:uppercase sm:min-w-56 sm:flex-none ${sz.label} ${isToday ? "" : "text-primary-strong"} ${pending ? "animate-pulse motion-reduce:animate-none" : ""}`}
          aria-live="polite"
        >
          {relativeDayLabel(shown, today)}
        </p>
        <NavLink href={next.href} prefetch scroll={false} onClick={next.onClick} aria-label={t.start.nextDay} className={`${NAV} ${sz.nav}`}>
          ›
        </NavLink>
      </div>
      {/* On phones it sits under the day row and is absent on today; from sm up it is always rendered (invisible on today) so the row keeps its size. */}
      <NavLink
        href={dayHref(today, today, base)}
        scroll={false}
        onClick={() => setTarget(today)}
        aria-hidden={isToday}
        tabIndex={isToday ? -1 : undefined}
        className={`btn btn-text shrink-0 ${sz.back} ${isToday ? "hidden sm:inline-flex sm:invisible" : ""}`}
      >
        {t.start.backToToday}
      </NavLink>
      <span role="status" className="sr-only">
        {pending ? t.loading : ""}
      </span>
    </div>
  );
}
