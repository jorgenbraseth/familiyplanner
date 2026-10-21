import type { DayView } from "@/lib/calendar/view";
import { t } from "@/lib/i18n";

export type MemberDot = { id: string; name: string; colour: string };

/** Days with their events. Shows a coloured dot (and name) per member when `members` is given. */
export function DayList({ days, members }: { days: DayView[]; members?: MemberDot[] }) {
  const byId = new Map(members?.map((m) => [m.id, m]));
  return (
    <ol className="space-y-4">
      {days.map((day) => (
        <li key={day.key}>
          <h3
            className={`mb-1 font-display text-base font-extrabold capitalize ${day.isToday ? "text-primary-strong" : "text-muted"}`}
          >
            {day.heading}
          </h3>
          {day.events.length === 0 ? (
            <p className="text-sm text-muted">{t.calendar.empty}</p>
          ) : (
            <ul className="card divide-y-2 divide-line overflow-hidden">
              {day.events.map((event) => {
                const member = byId.get(event.memberId);
                return (
                  <li key={event.id} className="flex items-start gap-3 px-3 py-2">
                    {member && (
                      <span
                        aria-hidden
                        className="mt-1.5 size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: member.colour }}
                      />
                    )}
                    <span className="w-24 shrink-0 text-sm tabular-nums text-muted">
                      {event.timeLabel}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words">
                        {event.title}
                        {event.school && (
                          <span className="ml-2 rounded-full bg-chip px-2 py-0.5 align-middle text-xs font-bold text-chip-ink">
                            {t.school.eventLabel}
                          </span>
                        )}
                      </span>
                      {(member || event.location) && (
                        <span className="block truncate text-xs text-muted">
                          {[member?.name, event.location].filter(Boolean).join(" · ")}
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
