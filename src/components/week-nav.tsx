"use client";

import { useState } from "react";
import { NavLink, useNavPending } from "@/components/nav-pending";
import type { CalendarDate } from "@/lib/dates";
import { isoWeekAtOffset, weekHref } from "@/lib/day-nav";
import { t } from "@/lib/i18n";

/**
 * Previous / this / next week links, using ?week=<offset>. Must sit inside a `NavPendingScope`: a click shows the
 * target week number at once and pulses it while the content (wrapped in `PendingContent`) loads; the neighbouring
 * weeks are prefetched.
 */
export function WeekNav({ path, offset, today }: { path: string; offset: number; today: CalendarDate }) {
  const pending = useNavPending();
  const [target, setTarget] = useState<number | null>(null);
  const shown = pending && target !== null ? target : offset;
  const to = (o: number) => ({ href: weekHref(path, o), onClick: () => setTarget(o) });
  const prev = to(shown - 1);
  const next = to(shown + 1);
  const link = "btn btn-secondary min-w-11 px-3 text-primary-strong";
  return (
    <nav className="flex items-center justify-between gap-2" aria-busy={pending}>
      <NavLink href={prev.href} prefetch onClick={prev.onClick} className={link} aria-label={t.calendar.previousWeek}>
        ←
      </NavLink>
      <span className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <span
          aria-live="polite"
          className={`rounded-full bg-accent px-4 py-1 font-display text-base font-extrabold text-on-accent ${pending ? "animate-pulse motion-reduce:animate-none" : ""}`}
        >
          {t.home.week(isoWeekAtOffset(today, shown))}
        </span>
        {shown !== 0 && (
          <NavLink href={path} onClick={() => setTarget(0)} className="inline-flex min-h-11 items-center font-bold text-primary-strong underline-offset-4 hover:underline">
            {t.calendar.thisWeek}
          </NavLink>
        )}
      </span>
      <NavLink href={next.href} prefetch onClick={next.onClick} className={link} aria-label={t.calendar.nextWeek}>
        →
      </NavLink>
      <span role="status" className="sr-only">
        {pending ? t.loading : ""}
      </span>
    </nav>
  );
}
