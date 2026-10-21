// Calendar events as the app uses them, and the pure logic around them.
// Fetching from Google lives in ./google.ts (server only).

import { z } from "zod";
import { addDays, dayKey, parseDayKey, startOfDay, type CalendarDate } from "../dates";

export type CalendarEvent = {
  id: string;
  memberId: string;
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

export type DayEvents = { date: CalendarDate; key: string; events: CalendarEvent[] };

/**
 * Puts events on every day (in the family's time zone) they overlap, from `first` for `days` days.
 * Within a day: all-day events first, then by start time, then by title.
 */
export function groupByDay(events: CalendarEvent[], first: CalendarDate, days: number): DayEvents[] {
  const result: DayEvents[] = [];
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
