// "What is next?": the first upcoming occurrence of a subject or keyword for one member, searched forward from
// now. Pure: no server access. Sources: the recurring timetable (with date overrides for the hours), ukeplan
// events and calendar events whose title matches. Anything that started before now is skipped.

import { addDays, dateInTimeZone, dayKey, formatTime, parseDayKey } from "../dates";
import type { CalendarEvent } from "../calendar/events";
import { formatHm, hoursForDate, minutesOf, periodsForDate, type SchoolHours, type Timetable } from "../plan-view";
import { daysBetween, minutesNowCopenhagen, relativeDayLabel, weekdayName } from "./range";
import { matchesSubject } from "./subject-match";

/** How many days ahead (counted from today) the search goes. */
export const NEXT_SEARCH_DAYS = 21;

export type SchoolEventInput = {
  date: string;
  subject: string | null;
  text: string;
  starts_at: string | null;
  ends_at: string | null;
  whole_week?: boolean;
};

export type NextOccurrence = {
  date: string;
  weekday: string;
  /** "i dag", "i morgen", "på torsdag"... computed in code. */
  when: string;
  days_from_now: number;
  /** "08:15–09:00", or null when the source gives no time (all-day events, lessons without times). */
  time: string | null;
  title: string;
  source: "timetable" | "ukeplan" | "calendar";
};

type Candidate = NextOccurrence & { startKey: number };

export type NextSearch = {
  now: Date;
  /** What the person asked for: a subject, an alias or a keyword. */
  query: string;
  timetable: Timetable;
  overrides?: ReadonlyMap<string, SchoolHours>;
  schoolEvents?: readonly SchoolEventInput[];
  calendarEvents?: readonly Pick<CalendarEvent, "title" | "start" | "end" | "allDay">[];
  days?: number;
};

export type NextResult = {
  next: NextOccurrence | null;
  /** The days searched, inclusive: today through today plus `none_within_days`. */
  searched_from: string;
  searched_to: string;
  none_within_days?: number;
};

/** The first occurrence at or after now across all sources, or `next: null` with the searched range. */
export function findNextOccurrence(search: NextSearch): NextResult {
  const days = search.days ?? NEXT_SEARCH_DAYS;
  const today = dateInTimeZone(search.now);
  const todayKey = dayKey(today);
  const lastKey = dayKey(addDays(today, days));
  const nowMinutes = minutesNowCopenhagen(search.now);
  const candidates: Candidate[] = [];

  const make = (
    key: string,
    start: number | null,
    time: string | null,
    title: string,
    source: NextOccurrence["source"],
  ): Candidate => ({
    date: key,
    weekday: weekdayName(key),
    when: relativeDayLabel(todayKey, key),
    days_from_now: daysBetween(todayKey, key),
    time,
    title,
    source,
    startKey: start ?? -1,
  });
  // Today's items that started before now are over (or running): not "next". Untimed ones stay.
  const upcoming = (key: string, start: number | null) => key > todayKey || start === null || start >= nowMinutes;

  for (let i = 0, key = todayKey; i <= days; i++) {
    const hours = hoursForDate(key, search.timetable, search.overrides);
    for (const p of periodsForDate(key, search.timetable)) {
      if (!matchesSubject(search.query, p.title)) continue;
      const start = minutesOf(p.startsAt ?? hours?.starts_at);
      if (!upcoming(key, start)) continue;
      const time = p.time ?? (p.startsAt ? formatHm(p.startsAt) : null);
      candidates.push(make(key, start, time, p.title, "timetable"));
    }
    key = dayKey(addDays(parseDayKey(key), 1));
  }

  for (const e of search.schoolEvents ?? []) {
    if (e.whole_week || e.date < todayKey || e.date > lastKey) continue;
    const title = e.subject?.trim() ? `${e.subject.trim()}: ${e.text}` : e.text;
    if (!matchesSubject(search.query, title)) continue;
    const start = minutesOf(e.starts_at);
    if (!upcoming(e.date, start)) continue;
    const from = formatHm(e.starts_at);
    const to = formatHm(e.ends_at);
    candidates.push(make(e.date, start, from && to ? `${from}–${to}` : from, title, "ukeplan"));
  }

  for (const e of search.calendarEvents ?? []) {
    if (!matchesSubject(search.query, e.title)) continue;
    const startAt = new Date(e.start);
    const key = dayKey(dateInTimeZone(startAt));
    if (key < todayKey || key > lastKey) continue;
    const start = e.allDay ? null : minutesNowCopenhagen(startAt);
    if (!upcoming(key, start)) continue;
    candidates.push(make(key, start, e.allDay ? null : `${formatTime(startAt)}–${formatTime(new Date(e.end))}`, e.title, "calendar"));
  }

  candidates.sort((a, b) => a.date.localeCompare(b.date) || a.startKey - b.startKey);
  const first = candidates[0];
  const range = { searched_from: todayKey, searched_to: lastKey };
  if (!first) return { next: null, ...range, none_within_days: days };
  const { startKey: _startKey, ...next } = first;
  void _startKey;
  return { next, ...range };
}
