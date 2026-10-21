import type { ParentDay } from "@/lib/parent-day-data";
import { t } from "@/lib/i18n";

/** The parents' "Dagen i dag": own and children's events of today in one list, coloured and labelled by kind. */
export function ParentDayCard({ day }: { day: ParentDay }) {
  return (
    <section className="card space-y-3 p-4" aria-labelledby="day-title">
      <h2 id="day-title" className="text-xl font-extrabold">{t.parentDay.title}</h2>
      {day.failedNames.length > 0 && <p className="text-sm text-muted">{t.parentDay.failed(day.failedNames.join(", "))}</p>}
      {day.entries.length === 0 ? (
        <p className="text-base text-muted">{t.parentDay.empty}</p>
      ) : (
        <ul className="space-y-2">
          {day.entries.map((entry) => {
            const school = entry.kind === "school";
            return (
              <li
                key={entry.key}
                className={`flex items-start gap-3 rounded-xl p-3 ${school ? "bg-school-soft text-on-school-soft" : "bg-event-soft text-on-event-soft"}`}
              >
                <span className="w-24 shrink-0 text-sm font-bold tabular-nums">{entry.timeLabel}</span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-base font-bold">
                    {entry.title}
                    <span className="ml-2 rounded-full bg-surface px-2 py-0.5 align-middle text-xs font-bold text-ink">
                      {school ? t.parentDay.schoolLabel : t.parentDay.eventLabel}
                    </span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                    {entry.members.map((m) => (
                      <span key={m.id} className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: m.colour }} />
                        {m.name}
                      </span>
                    ))}
                    {entry.location && <span className="min-w-0 break-words opacity-80">{entry.location}</span>}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
