"use client";

import { useState } from "react";
import { NavLink, useNavPending } from "@/components/nav-pending";
import { addDays, relativeDayLabel, daysBetween, type CalendarDate } from "@/lib/dates";
import { dayHref, shownDay } from "@/lib/day-nav";
import { t } from "@/lib/i18n";

const NAV =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-3xl font-bold leading-none text-primary-strong hover:bg-chip";

/**
 * Previous/next day links around the day label (fixed height so nothing jumps). Must sit inside a `NavPendingScope`:
 * a click shows the target day at once, pulses the label and dims the content until the page has loaded; the
 * neighbouring days are prefetched so the next tap is usually instant.
 */
export function DaySwitcher({ date, today }: { date: CalendarDate; today: CalendarDate }) {
  const pending = useNavPending();
  const [target, setTarget] = useState<CalendarDate | null>(null);
  const shown = shownDay(date, target, pending);
  const isToday = daysBetween(today, shown) === 0;
  const to = (step: number) => {
    const next = addDays(shown, step);
    return { href: dayHref(next, today), onClick: () => setTarget(next) };
  };
  const prev = to(-1);
  const next = to(1);
  return (
    <div className="flex h-11 items-center" aria-busy={pending}>
      <NavLink href={prev.href} prefetch scroll={false} onClick={prev.onClick} aria-label={t.start.previousDay} className={NAV}>
        ‹
      </NavLink>
      <p
        className={`min-w-16 truncate text-center text-base font-extrabold ${pending ? "animate-pulse motion-reduce:animate-none" : ""}`}
        aria-live="polite"
      >
        {relativeDayLabel(shown, today)}
      </p>
      <NavLink href={next.href} prefetch scroll={false} onClick={next.onClick} aria-label={t.start.nextDay} className={NAV}>
        ›
      </NavLink>
      {/* Always rendered so the row keeps its size; hidden on today. */}
      <NavLink
        href="/"
        scroll={false}
        onClick={() => setTarget(today)}
        aria-hidden={isToday}
        tabIndex={isToday ? -1 : undefined}
        className={`btn btn-text shrink-0 text-base ${isToday ? "invisible" : ""}`}
      >
        {t.start.toToday}
      </NavLink>
      <span role="status" className="sr-only">
        {pending ? t.loading : ""}
      </span>
    </div>
  );
}
