import type { DayView } from "@/lib/calendar/view";
import { t } from "@/lib/i18n";

export type MemberDot = { id: string; name: string; colour: string; avatarUrl?: string | null };

/** Days with their events. Shows a coloured dot (and name) per member when `members` is given. */
export function DayList({ days, members }: { days: DayView[]; members?: MemberDot[] }) {
  const byId = new Map(members?.map((m) => [m.id, m]));
  return (
    <ol className="grid md:grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] md:items-start gap-8">
      {days.map((day) => (
        <li key={day.key}>
          <h3
            className={`mb-2 font-display text-lg font-bold capitalize ${day.isToday ? "text-primary-strong" : "text-muted"}`}
          >
            {day.heading}
          </h3>
          {day.events.length === 0 ? (
            <p className="text-sm text-muted">{t.calendar.empty}</p>
          ) : (
            <ul className="space-y-1.5">
              {day.events.map((event) => {
                const people = (event.memberIds ?? [event.memberId])
                  .map((id) => byId.get(id))
                  .filter((m): m is MemberDot => m !== undefined);
                return (
                  <li key={event.id} className="flex items-start gap-3 rounded-2xl bg-chip px-3 py-2">
                    {people.length > 0 && (
                      <span aria-hidden className="mt-1.5 flex shrink-0 gap-0.5">
                        {people.map((m) => (
                          <span key={m.id} className="size-2.5 rounded-full" style={{ backgroundColor: m.colour }} />
                        ))}
                      </span>
                    )}
                    <span className="w-24 shrink-0 text-sm tabular-nums text-muted">
                      {event.timeLabel}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words">
                        {event.title}
                        {event.school && (
                          <span className="ml-2 rounded-full bg-surface px-2 py-0.5 align-middle text-xs font-bold text-chip-ink">
                            {t.school.eventLabel}
                          </span>
                        )}
                      </span>
                      {(people.length > 0 || event.location) && (
                        <span className="block truncate text-xs text-muted">
                          {[people.length > 0 ? t.calendar.people(people.map((m) => m.name)) : null, event.location].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
