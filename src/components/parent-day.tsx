"use client";

import { useMemo, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { buildTracksFromEntries } from "@/lib/parent-day";
import type { ParentDay } from "@/lib/parent-day-data";
import { t } from "@/lib/i18n";

// Fixed row heights: the axis is not proportional to time, so empty time never makes the page taller.
const DIVIDER = "1.25rem";
const SEGMENT = "3rem";
const GAP = "1rem";
const LANE_MIN = "4.25rem";
const GUTTER = "2.5rem";

const KIND = {
  school: "bg-school-soft text-on-school-soft",
  event: "bg-event-soft text-on-event-soft",
} as const;

/**
 * The parents' "Dagen i dag": one vertical track per family member on one shared time axis (see
 * `buildParentTracks` for the row model). Scrolls sideways inside its own container when it does not fit.
 */
const STORAGE_KEY = "parentDay.hidden";
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const readSaved = (): string => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
};

export function ParentDayCard({ day, isToday, switcher }: { day: ParentDay; isToday: boolean; switcher: ReactNode }) {
  // Everyone is visible on the server and first paint; the saved selection is read after hydration.
  const saved = useSyncExternalStore(subscribe, readSaved, () => "");
  const hidden = useMemo(() => {
    const known = new Set(day.members.map((m) => m.id));
    let ids: string[] = [];
    try {
      const raw: unknown = JSON.parse(saved || "[]");
      if (Array.isArray(raw)) ids = raw.filter((id): id is string => typeof id === "string" && known.has(id));
    } catch {
      // corrupt value: keep everyone visible
    }
    return ids.length < day.members.length ? ids : [];
  }, [saved, day.members]);

  const toggle = (id: string) => {
    const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
    if (next.length >= day.members.length) return; // at least one person stays visible
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable: selection is not kept
    }
    listeners.forEach((l) => l());
  };

  const visible = useMemo(() => day.members.filter((m) => !hidden.includes(m.id)), [day.members, hidden]);
  const tracks = useMemo(
    () => (hidden.length === 0 ? day.tracks : buildTracksFromEntries(visible, day.entries)),
    [hidden, visible, day.tracks, day.entries],
  );
  const headerRows = tracks.hasAllDay ? 2 : 1;
  const rowTemplate = [
    "auto",
    ...(tracks.hasAllDay ? ["auto"] : []),
    ...tracks.rows.map((r) => (r.kind === "divider" ? DIVIDER : r.kind === "gap" ? GAP : SEGMENT)),
  ].join(" ");
  const style: CSSProperties = {
    gridTemplateColumns: `${GUTTER} ${tracks.columns.map((c) => `repeat(${c.lanes}, minmax(${LANE_MIN}, 1fr))`).join(" ")}`,
    gridTemplateRows: rowTemplate,
  };
  const axisRow = (row: number) => row + headerRows;

  return (
    <section className="card space-y-3 p-4" aria-labelledby="day-title">
      <h2 id="day-title" className="text-xl font-extrabold">{isToday ? t.parentDay.title : t.parentDay.titleOtherDay}</h2>
      {switcher}
      {day.failedNames.length > 0 && <p className="text-sm text-muted">{t.parentDay.failed(day.failedNames.join(", "))}</p>}
      {day.members.length > 1 && (
        <div role="group" aria-label={t.parentDay.people} className="flex flex-wrap gap-2">
          {day.members.map((m) => {
            const on = !hidden.includes(m.id);
            const last = on && visible.length === 1;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                disabled={last}
                onClick={() => toggle(m.id)}
                className={`flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-bold ${
                  on ? "border-line bg-surface" : "border-line bg-transparent text-muted opacity-60"
                }`}
              >
                <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: m.colour, opacity: on ? 1 : 0.4 }} />
                <span className="max-w-32 truncate">{m.name}</span>
              </button>
            );
          })}
        </div>
      )}
      {tracks.empty ? (
        <p className="text-base text-muted">{isToday ? t.parentDay.empty : t.parentDay.emptyOtherDay}</p>
      ) : (
        <div className="isolate overflow-x-auto">
          <div className="grid gap-x-1" style={style}>
            {tracks.columns.map((c) => (
              <div
                key={`h-${c.member.id}`}
                className="flex min-w-0 items-center justify-center gap-1.5 pb-1 text-sm font-bold"
                style={{ gridRow: 1, gridColumn: `${c.firstColumn} / span ${c.lanes}` }}
              >
                <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: c.member.colour }} />
                <span className="truncate">{c.member.name}</span>
              </div>
            ))}
            {tracks.hasAllDay &&
              tracks.columns.map((c) => (
                <div
                  key={`a-${c.member.id}`}
                  className="flex min-w-0 flex-col gap-1 pb-1"
                  style={{ gridRow: 2, gridColumn: `${c.firstColumn} / span ${c.lanes}` }}
                >
                  {c.allDay.map((a) => (
                    <div key={a.key} className={`rounded-lg px-1.5 py-1 text-xs font-bold ${KIND[a.kind]}`}>
                      <span className="sr-only">{t.parentDay.allDay}: </span>
                      <span className="line-clamp-2 break-words">{a.title}</span>
                    </div>
                  ))}
                </div>
              ))}
            {tracks.rows.map((r) =>
              r.kind === "divider" ? (
                <div
                  key={`r-${r.row}`}
                  aria-hidden
                  className="relative flex items-center"
                  style={{ gridRow: axisRow(r.row), gridColumn: "1 / -1" }}
                >
                  <span className="z-[1] w-10 shrink-0 text-xs font-bold tabular-nums text-muted">{r.label}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              ) : r.kind === "gap" ? (
                <div
                  key={`r-${r.row}`}
                  aria-hidden
                  className="my-0.5 rounded-lg border border-dashed border-pause-line"
                  style={{ gridRow: axisRow(r.row), gridColumn: "2 / -1" }}
                />
              ) : null,
            )}
            {tracks.columns.flatMap((c) =>
              c.blocks.map((b) => (
                <div
                  key={b.key}
                  title={`${b.title} ${b.timeLabel}`}
                  className={`z-[2] my-0.5 min-w-0 overflow-hidden rounded-lg px-1.5 py-1 text-xs font-bold leading-tight ${KIND[b.kind]}`}
                  style={{ gridRow: `${axisRow(b.rowStart)} / ${axisRow(b.rowEnd)}`, gridColumn: c.firstColumn + b.lane }}
                >
                  <span className="sr-only">{b.timeLabel}: </span>
                  <span className="line-clamp-2 break-words">{b.title}</span>
                  {b.location && <span className="line-clamp-1 break-words font-normal opacity-80">{b.location}</span>}
                </div>
              )),
            )}
          </div>
        </div>
      )}
    </section>
  );
}
