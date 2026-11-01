// What the children's start page (and the family screen) shows right now. Pure helpers, no database or server access.
// All times are wall-clock time in Europe/Copenhagen.

import { parseMinutes, wallClockMinutes, type RoutineSettingsRow, type RoutineSlot } from "./routines";
import type { TimelineEntry } from "./plan-view";

/** A visibility window in minutes after midnight: shown from `from` (inclusive) until `until` (exclusive). */
export type SlotWindow = { from: number; until: number };
export type RoutineWindows = Record<RoutineSlot, SlotWindow>;

export const END_OF_DAY = 24 * 60;
/** A saved end at or after 23:59 (the latest a time field can hold) means "to the end of the day". */
const LATEST_END = END_OF_DAY - 1;

/** Morgenstell until 10:00, Kveldstell from 18:00 (until midnight). */
export const DEFAULT_WINDOWS: RoutineWindows = {
  morning: { from: 0, until: 10 * 60 },
  evening: { from: 18 * 60, until: END_OF_DAY },
};

/** The window of each slot from the child's settings rows; missing rows, missing or unusable times fall back to the defaults. */
export function resolveWindows(rows: readonly Pick<RoutineSettingsRow, "slot" | "visible_from" | "visible_until">[]): RoutineWindows {
  const windows: RoutineWindows = { morning: { ...DEFAULT_WINDOWS.morning }, evening: { ...DEFAULT_WINDOWS.evening } };
  for (const row of rows) {
    const base = DEFAULT_WINDOWS[row.slot];
    if (!base) continue;
    const from = parseMinutes(row.visible_from) ?? base.from;
    let until = parseMinutes(row.visible_until) ?? base.until;
    if (until >= LATEST_END) until = END_OF_DAY;
    // An empty or reversed window would hide the list for good: use the defaults instead.
    windows[row.slot] = from < until ? { from, until } : { ...base };
  }
  return windows;
}

/** Minutes after midnight as "HH:MM" for a time field (the end of the day is shown as 23:59). */
export function clockOf(minutes: number): string {
  const m = Math.min(minutes, LATEST_END);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function inWindow(minutes: number, window: SlotWindow): boolean {
  return minutes >= window.from && minutes < window.until;
}

export type SlotProgress = { total: number; complete: boolean };

/**
 * The routine lists to show now, morning first. A list shows when the time is inside its window AND it has items AND
 * it is not finished. When both windows are open (they may overlap) and both qualify, both show.
 */
export function visibleRoutineSlots(
  now: Date,
  windows: RoutineWindows,
  progress: Record<RoutineSlot, SlotProgress>,
): RoutineSlot[] {
  const minutes = wallClockMinutes(now);
  return (["morning", "evening"] as const).filter(
    (slot) => inWindow(minutes, windows[slot]) && progress[slot].total > 0 && !progress[slot].complete,
  );
}

/** Minutes an event without a known end is assumed to last. */
export const UNKNOWN_END_MINUTES = 60;

/**
 * Whether something is still going on today: a school period, the school day, or a timed calendar event that ends
 * after `now`. An event without an end counts for an hour after it starts. All-day/untimed events never keep the
 * day alive (they would otherwise show "Min dag" until midnight), so a day with only those hides at once.
 */
export function dayStillActive(
  now: Date,
  schoolDay: { hours?: { ends_at: string | null } | null; periods?: readonly { endsAt: string | null }[] },
  events: readonly { sortKey: number; endKey?: number | null }[],
): boolean {
  const minutes = wallClockMinutes(now);
  const ends: number[] = [];
  const schoolEnd = parseMinutes(schoolDay.hours?.ends_at);
  if (schoolEnd !== null) ends.push(schoolEnd);
  for (const p of schoolDay.periods ?? []) {
    const end = parseMinutes(p.endsAt);
    if (end !== null) ends.push(end);
  }
  for (const e of events) {
    if (e.sortKey < 0) continue;
    ends.push(e.endKey != null && e.endKey > e.sortKey ? e.endKey : e.sortKey + UNKNOWN_END_MINUTES);
  }
  return ends.some((end) => end > minutes);
}

/** Lekser show only while at least one homework item (carried over, due, or for the whole week) is not done. */
export function homeworkVisible(...lists: readonly (readonly { done: boolean }[])[]): boolean {
  return lists.some((items) => items.some((i) => !i.done));
}

function minutesOfTime(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/**
 * Where the "now" marker goes in a day timeline (see `dayTimeline`). The dividers carry the times:
 *  - `{ before: i }`: a line of its own before entry `i` (before the first divider that is later than now, or at the
 *    end with `i = entries.length`);
 *  - `{ inside: i, fraction }`: across entry `i` (a card or a gap) at that fraction of its height, because now falls
 *    between the divider before it and the one after it.
 * Null when the timeline has no dividers (only all-day or untimed entries), so there is nothing to place it against.
 */
export type NowSpot = { before: number } | { inside: number; fraction: number };

export function nowSpot(entries: readonly TimelineEntry[], nowMinutes: number): NowSpot | null {
  let lastDivider = -1;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type !== "divider") continue;
    const at = minutesOfTime(entry.time);
    if (at <= nowMinutes) {
      lastDivider = i;
      continue;
    }
    if (lastDivider < 0) return { before: i };
    // Now is between divider `lastDivider` and divider `i`: the first card or gap in between holds it.
    const holder = entries.findIndex((e, k) => k > lastDivider && k < i && e.type !== "divider");
    if (holder < 0) return { before: i };
    const from = minutesOfTime((entries[lastDivider] as { time: string }).time);
    const fraction = entries[holder].type === "gap" ? 0.5 : (nowMinutes - from) / (at - from);
    return { inside: holder, fraction: Math.min(1, Math.max(0, fraction)) };
  }
  return lastDivider < 0 ? null : { before: entries.length };
}
