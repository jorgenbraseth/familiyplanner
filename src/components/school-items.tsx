import { t } from "@/lib/i18n";
import type { PlanItemRow } from "@/lib/plan";
import type { EventEntry, MyDayEntry, PeriodLine, PeriodTimelineEntry } from "@/lib/plan-view";
import { SchoolDoneCheckbox } from "./school-done-checkbox";

export function SchoolHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-1 text-lg font-extrabold">{children}</h4>;
}

const listClass =
  "card divide-y-2 divide-line px-3";

/** Messages: plain lines, subject first. */
export function SchoolLines({ items }: { items: PlanItemRow[] }) {
  return (
    <ul className={listClass}>
      {items.map((item) => (
        <li key={item.id} className="py-2 text-lg break-words">
          {item.subject && <span className="font-semibold">{item.subject}</span>}
          {item.subject && " – "}
          {item.text}
        </li>
      ))}
    </ul>
  );
}

/** Homework with tick boxes. */
export function SchoolHomework({ items, readOnly = false }: { items: PlanItemRow[]; readOnly?: boolean }) {
  return (
    <ul className={listClass}>
      {items.map((item) => (
        <li key={item.id}>
          <SchoolDoneCheckbox id={item.id} done={item.done} label={item.text} detail={item.subject} readOnly={readOnly} />
        </li>
      ))}
    </ul>
  );
}

export function SchoolMessages({ items }: { items: PlanItemRow[] }) {
  return (
    <div>
      <SchoolHeading>{t.school.messages}</SchoolHeading>
      <SchoolLines items={items} />
    </div>
  );
}

/** The timetable periods of a day: period number, subject and time. */
export function SchoolPeriods({ periods }: { periods: PeriodLine[] }) {
  return (
    <ol className="divide-y-2 divide-line">
      {periods.map((p) => (
        <li key={p.id} className="flex min-h-12 items-center gap-3 py-2 text-lg">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-chip text-base font-extrabold text-chip-ink"
          >
            {p.period ?? "·"}
          </span>
          <span className="min-w-0 flex-1 break-words font-semibold">{p.title}</span>
          {p.time && <span className="shrink-0 text-base font-bold text-muted">{p.time}</span>}
        </li>
      ))}
    </ol>
  );
}

/**
 * The kids' "Min dag": school periods (green, with the period number) and other entries (orange, with their time)
 * in one list, with time dividers between the periods (see `myDayEntries`).
 */
export function MyDayList({ entries }: { entries: MyDayEntry[] }) {
  return (
    <ol className="space-y-1">
      {entries.map((entry, i) => {
        if (entry.type === "divider") {
          return (
            <li key={`d${i}`} className="flex items-center gap-2 text-sm font-bold text-muted" aria-label={dividerText(entry)}>
              <span aria-hidden className="h-0.5 flex-1 bg-line" />
              <span aria-hidden>{dividerText(entry)}</span>
              <span aria-hidden className="h-0.5 flex-1 bg-line" />
            </li>
          );
        }
        if (entry.type === "event") {
          const { event } = entry;
          return (
            <li
              key={event.id}
              className="flex min-h-12 items-center gap-3 rounded-2xl border-2 border-line bg-event-soft px-3 py-2 text-lg text-on-event-soft"
            >
              <span className="w-24 shrink-0 text-base font-extrabold">{event.timeLabel}</span>
              <span className="min-w-0 flex-1 break-words font-semibold">{event.title}</span>
            </li>
          );
        }
        return (
          <li
            key={entry.line.id}
            className="flex min-h-12 items-center gap-3 rounded-2xl border-2 border-line bg-school-soft px-3 py-2 text-lg text-on-school-soft"
          >
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-base font-extrabold text-on-school-soft"
            >
              {entry.line.period ?? "·"}
            </span>
            <span className="min-w-0 flex-1 break-words font-semibold">{entry.line.title}</span>
          </li>
        );
      })}
    </ol>
  );
}

function dividerText(entry: Extract<PeriodTimelineEntry, { type: "divider" }>): string {
  const d = entry.divider;
  return d.kind === "time" ? d.time : t.start.breakBetween(d.from, d.to);
}

/** Calendar-like lines (Google events and school events, in time order); school events get a small "Skole" label. */
export function SchoolEventLines({ events }: { events: EventEntry[] }) {
  return (
    <ul className="divide-y-2 divide-line">
      {events.map((event) => (
        <li key={event.id} className="flex min-h-12 items-center gap-3 py-2 text-lg">
          <span className="w-24 shrink-0 text-base font-bold text-muted">{event.timeLabel}</span>
          <span className="min-w-0 flex-1 break-words font-semibold">
            {event.title}
            {event.school && (
              <span className="ml-2 rounded-full bg-chip px-2 py-0.5 align-middle text-xs font-bold text-chip-ink">
                {t.school.eventLabel}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
