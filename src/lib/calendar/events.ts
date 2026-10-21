// Calendar events as the app uses them, and the pure logic around them.
// Fetching from Google lives in ./google.ts (server only).

import { z } from "zod";
import { addDays, dayKey, parseDayKey, startOfDay, type CalendarDate } from "../dates";

export type CalendarEvent = {
  id: string;
  memberId: string;
  /** The Google calendar it came from (server side only; shared calendars give the same event to several members). */
  calendarId?: string;
  title: string;
  /** ISO instants. For all-day events: start of the first day / end of the last day (exclusive). */
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
};

// The parts of a Google Calendar events.list item we use. Validated, since it comes from the network.
const googleEventSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  summary: z.string().optional(),
  location: z.string().optional(),
  start: z.object({ date: z.string().optional(), dateTime: z.string().optional() }),
  end: z.object({ date: z.string().optional(), dateTime: z.string().optional() }),
});

export const googleEventsResponseSchema = z.object({
  items: z.array(z.unknown()).default([]),
  nextPageToken: z.string().optional(),
});

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Turns one Google event into a CalendarEvent, or null if it's cancelled or malformed. */
export function normalizeGoogleEvent(
  raw: unknown,
  memberId: string,
  untitled: string,
): CalendarEvent | null {
  const parsed = googleEventSchema.safeParse(raw);
  if (!parsed.success) return null;
  const event = parsed.data;
  if (event.status === "cancelled") return null;

  const title = event.summary?.trim() || untitled;
  const base = { id: event.id, memberId, title, location: event.location || undefined };

  if (event.start.date && event.end.date) {
    if (!DATE_ONLY.test(event.start.date) || !DATE_ONLY.test(event.end.date)) return null;
    return {
      ...base,
      allDay: true,
      start: startOfDay(parseDayKey(event.start.date)).toISOString(),
      end: startOfDay(parseDayKey(event.end.date)).toISOString(),
    };
  }
  if (event.start.dateTime && event.end.dateTime) {
    const start = new Date(event.start.dateTime);
    const end = new Date(event.end.dateTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return { ...base, allDay: false, start: start.toISOString(), end: end.toISOString() };
  }
  return null;
}

export type DayEvents<T extends CalendarEvent = CalendarEvent> = { date: CalendarDate; key: string; events: T[] };

/**
 * Puts events on every day (in the family's time zone) they overlap, from `first` for `days` days.
 * Within a day: all-day events first, then by start time, then by title.
 */
export function groupByDay<T extends CalendarEvent>(events: T[], first: CalendarDate, days: number): DayEvents<T>[] {
  const result: DayEvents<T>[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(first, i);
    const dayStart = startOfDay(date).getTime();
    const dayEnd = startOfDay(addDays(date, 1)).getTime();
    const onDay = events.filter((event) => {
      const start = new Date(event.start).getTime();
      const end = new Date(event.end).getTime();
      // A zero-length event still shows on the day it happens.
      return start < dayEnd && (end > dayStart || (end === start && start >= dayStart));
    });
    onDay.sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) ||
        a.start.localeCompare(b.start) ||
        a.title.localeCompare(b.title),
    );
    result.push({ date, key: dayKey(date), events: onDay });
  }
  return result;
}

export type MemberCalendars = { memberId: string; calendarIds: readonly string[] };

/** What fetching one calendar gave: its raw Google items, or a failure. */
export type CalendarFetch = { ok: true; items: readonly unknown[] } | { ok: false };

/** Every calendar id once, in first-seen order (a calendar shared by two kids is fetched once). */
export function distinctCalendarIds(members: readonly MemberCalendars[]): string[] {
  return [...new Set(members.flatMap((m) => m.calendarIds).filter((id) => id !== ""))];
}

/**
 * Each member's events from the fetched calendars: the member gets every event of all their calendars (a shared
 * calendar gives the same event to each member it belongs to), deduped per member by calendar and event id, and
 * by event id alone across that member's calendars. A member is in `failedMemberIds` when any of their calendars failed.
 */
export function assembleEvents(
  members: readonly MemberCalendars[],
  fetched: ReadonlyMap<string, CalendarFetch>,
  untitled: string,
): { events: CalendarEvent[]; failedMemberIds: string[] } {
  const events: CalendarEvent[] = [];
  const failedMemberIds: string[] = [];
  for (const member of members) {
    const seen = new Set<string>();
    let failed = false;
    for (const calendarId of new Set(member.calendarIds)) {
      const result = fetched.get(calendarId);
      if (!result || !result.ok) {
        failed = true;
        continue;
      }
      for (const raw of result.items) {
        const event = normalizeGoogleEvent(raw, member.memberId, untitled);
        if (!event || seen.has(event.id)) continue;
        seen.add(event.id);
        events.push({ ...event, calendarId });
      }
    }
    if (failed) failedMemberIds.push(member.memberId);
  }
  return { events, failedMemberIds };
}

/** An event for one or more members: `memberIds` lists everyone it applies to (first = `memberId`). */
export type SharedEvent = CalendarEvent & { memberIds: string[] };

/**
 * Folds the per-member copies of one event (same calendar and event id: a shared calendar) into a single entry
 * that lists all its members, for lists that mix members. Order follows the first copy. Events without a
 * calendar id are never merged.
 */
export function mergeSharedEvents(events: readonly CalendarEvent[]): SharedEvent[] {
  const byKey = new Map<string, SharedEvent>();
  const result: SharedEvent[] = [];
  for (const event of events) {
    const key = event.calendarId === undefined ? null : `${event.calendarId}\n${event.id}`;
    const existing = key === null ? undefined : byKey.get(key);
    if (existing) {
      if (!existing.memberIds.includes(event.memberId)) existing.memberIds.push(event.memberId);
      continue;
    }
    const shared: SharedEvent = { ...event, memberIds: [event.memberId] };
    if (key !== null) byKey.set(key, shared);
    result.push(shared);
  }
  return result;
}
