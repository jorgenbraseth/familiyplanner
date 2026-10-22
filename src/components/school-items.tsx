import { t } from "@/lib/i18n";
import type { PlanItemRow } from "@/lib/plan";
import type { MyDayEntry } from "@/lib/plan-view";
import { SchoolDoneCheckbox } from "./school-done-checkbox";
import { StructuredText } from "./structured-text";

export function SchoolHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-1 text-xl font-bold">{children}</h4>;
}

/** Messages: plain lines, subject first. */
export function SchoolLines({ items }: { items: PlanItemRow[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="text-lg break-words">
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
    <ul>
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

const TIME_COLUMN = "w-14 shrink-0 text-right text-sm font-bold tabular-nums text-muted";

/**
 * The kids' "Min dag": school periods (green), pauses (blue-grey) and other entries (orange) as soft flat strips
 * in one timeline (see `dayTimeline`). A time marker that starts a strip becomes the small time in the strip's
 * left column; other markers (an end time) stand alone, and a fixed-height gap shows empty time ("friminutt"
 * inside school hours, tinted like a pause). Strips only show their own time when they have no markers
 * (overlapping or all-day entries).
 */
export function MyDayList({ entries }: { entries: MyDayEntry[] }) {
  const rows: React.ReactNode[] = [];
  let time: string | null = null;
  entries.forEach((entry, i) => {
    if (entry.type === "divider") {
      const next = entries[i + 1];
      if (next && next.type !== "divider" && next.type !== "gap") {
        time = entry.time;
        return;
      }
      rows.push(
        <li key={`d${i}`} className="flex items-center gap-3">
          <span className={TIME_COLUMN}>{entry.time}</span>
        </li>,
      );
      return;
    }
    if (entry.type === "gap") {
      // Fixed height whatever the length of the break: it only marks that nothing happens.
      rows.push(
        <li key={`g${i}`} className="flex h-8 items-center gap-3">
          <span className={TIME_COLUMN} aria-hidden />
          <span
            className={`flex h-full min-w-0 flex-1 items-center justify-center rounded-2xl text-xs font-bold ${
              entry.school ? "bg-pause-soft/50 text-on-pause-soft" : ""
            }`}
          >
            {entry.school ? t.start.breakLabel : null}
          </span>
        </li>,
      );
      return;
    }
    const left = time;
    time = null;
    if (entry.type === "event") {
      const { event } = entry;
      rows.push(
        <li key={event.id} className="flex items-center gap-3">
          <span className={TIME_COLUMN}>{left}</span>
          <div className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl bg-event-soft px-4 py-2 text-lg text-on-event-soft">
            {entry.showTime && <span className="shrink-0 text-base font-extrabold">{event.timeLabel}</span>}
            <span className="min-w-0 flex-1 break-words font-extrabold">{event.title}</span>
          </div>
        </li>,
      );
      return;
    }
    const pause = entry.type === "pause";
    rows.push(
      <li key={entry.line.id} className="flex items-center gap-3">
        <span className={TIME_COLUMN}>{left}</span>
        <div
          className={`flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 py-2 text-lg ${
            pause ? "bg-pause-soft text-on-pause-soft" : "bg-school-soft text-on-school-soft"
          }`}
        >
          <span className="min-w-0 flex-1 break-words font-extrabold">{entry.line.title}</span>
          {entry.showTime && entry.line.time && <span className="shrink-0 text-base font-extrabold">{entry.line.time}</span>}
        </div>
      </li>,
    );
  });
  return <ol className="space-y-1.5">{rows}</ol>;
}

function LegendDot({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`size-2.5 rounded-full ${dot}`} />
      {children}
    </li>
  );
}

/** The Skole/Pause/Avtaler legend (plain coloured dots and text) for the kinds present in `legend`; nothing when none is. */
export function TimelineLegend({ legend, label }: { legend: { school: boolean; pause: boolean; appointments: boolean }; label: string }) {
  if (!legend.school && !legend.pause && !legend.appointments) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-muted" aria-label={label}>
      {legend.school && <LegendDot dot="bg-school-line">{t.start.legendSchool}</LegendDot>}
      {legend.pause && <LegendDot dot="bg-pause-line">{t.start.legendPause}</LegendDot>}
      {legend.appointments && <LegendDot dot="bg-event-line">{t.start.legendAppointments}</LegendDot>}
    </ul>
  );
}
