"use client";

import { useState } from "react";
import { DayList, type MemberDot } from "@/components/day-list";
import type { DayView } from "@/lib/calendar/view";
import { t } from "@/lib/i18n";
import { withoutEmptyDays } from "@/lib/plan-view";

/** Merged family week with a toggle chip per person. */
export function FamilyCalendar({
  days,
  members,
  onlyMemberId,
  hideEmptyDays = false,
}: {
  days: DayView[];
  members: MemberDot[];
  /** Start with only this member's calendar on (the others can be switched on). */
  onlyMemberId?: string;
  /** Kids' view: weekdays with no events (for the people shown) are left out. */
  hideEmptyDays?: boolean;
}) {
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(onlyMemberId ? members.filter((m) => m.id !== onlyMemberId).map((m) => m.id) : []),
  );
  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filtered = days.map((day) => ({ ...day, events: day.events.filter((e) => !hidden.has(e.memberId)) }));
  const visibleDays = hideEmptyDays ? withoutEmptyDays(filtered, (day) => day.events.length === 0) : filtered;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t.family.showWho}>
        {members.map((m) => {
          const on = !hidden.has(m.id);
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(m.id)}
              className={`flex items-center gap-2 min-h-11 rounded-full border-2 px-4 text-sm font-bold ${
                on ? "border-line bg-surface" : "border-dashed border-line opacity-60"
              }`}
            >
              <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: m.colour }} />
              {m.name}
            </button>
          );
        })}
      </div>
      {hideEmptyDays && visibleDays.length === 0 ? (
        <p className="card p-4 text-lg">{t.family.weekEmpty}</p>
      ) : (
        <DayList days={visibleDays} members={members} />
      )}
    </div>
  );
}
