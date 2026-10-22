import { t } from "@/lib/i18n";
import type { PlanItemRow } from "@/lib/plan";
import type { MyDayEntry } from "@/lib/plan-view";
import { SchoolDoneCheckbox } from "./school-done-checkbox";
import { StructuredText } from "./structured-text";

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
          {item.subject && <span className="block font-semibold">{item.subject}</span>}
          <StructuredText text={item.text} />
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

/**
 * The kids' "Min dag": school periods (green), pauses (blue-grey) and other entries (orange) in one timeline
 * (see `dayTimeline`): dividers show the times, and a fixed-height dashed gap shows empty time ("friminutt" inside
 * school hours, tinted like a pause). Cards only show their own time when they have no dividers (overlapping or all-day entries).
 */
export function MyDayList({ entries }: { entries: MyDayEntry[] }) {
  return (
    <ol className="space-y-1">
      {entries.map((entry, i) => {
        if (entry.type === "divider") {
          return (
            <li key={`d${i}`} className="flex items-center gap-2 text-sm font-bold text-muted" aria-label={entry.time}>
              <span aria-hidden className="h-0.5 flex-1 bg-line" />
              <span aria-hidden>{entry.time}</span>
              <span aria-hidden className="h-0.5 flex-1 bg-line" />
            </li>
          );
        }
        if (entry.type === "gap") {
          // Fixed height whatever the length of the break: it only marks that nothing happens.
          return (
            <li
              key={`g${i}`}
              className={`flex h-8 items-center justify-center rounded-xl border-2 border-dashed text-xs font-bold ${
                entry.school ? "border-pause-line bg-pause-soft/50 text-on-pause-soft" : "border-line text-muted"
              }`}
            >
              {entry.school ? t.start.breakLabel : null}
            </li>
          );
        }
        if (entry.type === "event") {
          const { event } = entry;
          return (
            <li
              key={event.id}
              className="flex min-h-12 items-center gap-3 rounded-2xl border-2 border-line border-l-[6px] border-l-event-line bg-event-soft px-3 py-2 text-lg text-on-event-soft"
            >
              {entry.showTime && <span className="w-24 shrink-0 text-base font-extrabold">{event.timeLabel}</span>}
              <span className="min-w-0 flex-1 break-words font-semibold">{event.title}</span>
            </li>
          );
        }
        const pause = entry.type === "pause";
        return (
          <li
            key={entry.line.id}
            className={`flex min-h-12 items-center gap-3 rounded-2xl border-2 border-l-[6px] border-line px-3 py-2 text-lg ${
              pause
                ? "border-l-pause-line bg-pause-soft text-on-pause-soft"
                : "border-l-school-line bg-school-soft text-on-school-soft"
            }`}
          >
            <span className="min-w-0 flex-1 break-words font-semibold">{entry.line.title}</span>
            {entry.showTime && entry.line.time && <span className="shrink-0 text-base font-extrabold">{entry.line.time}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function LegendChip({ className, children }: { className: string; children: React.ReactNode }) {
  return <li className={`rounded-full border-2 border-line px-3 py-0.5 ${className}`}>{children}</li>;
}

/** The Skole/Pause/Avtaler chips for the kinds present in `legend`; nothing when none is. */
export function TimelineLegend({ legend, label }: { legend: { school: boolean; pause: boolean; appointments: boolean }; label: string }) {
  if (!legend.school && !legend.pause && !legend.appointments) return null;
  return (
    <ul className="flex flex-wrap gap-2 text-sm font-bold" aria-label={label}>
      {legend.school && <LegendChip className="border-l-[6px] border-l-school-line bg-school-soft text-on-school-soft">{t.start.legendSchool}</LegendChip>}
      {legend.pause && <LegendChip className="border-l-[6px] border-l-pause-line bg-pause-soft text-on-pause-soft">{t.start.legendPause}</LegendChip>}
      {legend.appointments && <LegendChip className="border-l-[6px] border-l-event-line bg-event-soft text-on-event-soft">{t.start.legendAppointments}</LegendChip>}
    </ul>
  );
}
