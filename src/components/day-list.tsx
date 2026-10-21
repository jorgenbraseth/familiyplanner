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
            className={`mb-1 text-sm font-semibold capitalize ${day.isToday ? "text-blue-600" : "text-zinc-500 dark:text-zinc-400"}`}
          >
            {day.heading}
          </h3>
          {day.events.length === 0 ? (
            <p className="text-sm text-zinc-400 dark:text-zinc-500">{t.calendar.empty}</p>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
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
                    <span className="w-24 shrink-0 text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                      {event.timeLabel}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words">{event.title}</span>
                      {(member || event.location) && (
                        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
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
