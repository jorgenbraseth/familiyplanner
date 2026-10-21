import "server-only";
import { addDays, dateInTimeZone, dayKey, formatDayHeading, formatTime, isoWeekOf, mondayOf, startOfDay } from "../dates";
import { t } from "../i18n";
import { formatWeekday } from "../plan-view";
import type { Member } from "../members";
import { groupByDay, type CalendarEvent } from "./events";
import { getEvents } from "./google";

// Server-side view models for calendar screens. Times are formatted here so server and browser
// render the same text.

export type EventView = {
  id: string;
  memberId: string;
  title: string;
  timeLabel: string;
  location?: string;
};

export type DayView = { key: string; heading: string; isToday: boolean; events: EventView[] };

export type WeekView = {
  isoWeek: number;
  todayKey: string;
  days: DayView[];
  failedNames: string[];
};

function timeLabel(event: CalendarEvent, dayStart: number, dayEnd: number): string {
  if (event.allDay) return t.calendar.allDay;
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  if (start <= dayStart && end >= dayEnd) return t.calendar.allDay;
  const from = start < dayStart ? "" : formatTime(new Date(start));
  const to = end > dayEnd ? "" : formatTime(new Date(end));
  return from === to ? from : `${from}–${to}`;
}

/** Clamp a week offset from the URL to something sensible. */
export function parseWeekOffset(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) ? Math.max(-52, Math.min(52, n)) : 0;
}

/** One ISO week (Monday–Sunday, Copenhagen) of events for the given members. */
export async function loadWeek(
  members: Member[],
  weekOffset = 0,
  now = new Date(),
  /** Kids' headings: "Mandag" without the date. */
  weekdayOnly = false,
): Promise<WeekView> {
  const today = dateInTimeZone(now);
  const monday = addDays(mondayOf(today), weekOffset * 7);
  const { events, failedMemberIds } = await getEvents(
    members.map((m) => ({ memberId: m.id, calendarId: m.calendar_id })),
    startOfDay(monday),
    startOfDay(addDays(monday, 7)),
  );
  const todayKey = dayKey(today);
  const days = groupByDay(events, monday, 7).map(({ date, key, events: dayEvents }) => {
    const dayStart = startOfDay(date).getTime();
    const dayEnd = startOfDay(addDays(date, 1)).getTime();
    return {
      key,
      heading: weekdayOnly ? formatWeekday(date) : formatDayHeading(date),
      isToday: key === todayKey,
      events: dayEvents.map((e) => ({
        id: `${e.memberId}:${e.id}`,
        memberId: e.memberId,
        title: e.title,
        timeLabel: timeLabel(e, dayStart, dayEnd),
        location: e.location,
      })),
    };
  });
  return {
    isoWeek: isoWeekOf(monday).isoWeek,
    todayKey,
    days,
    failedNames: members.filter((m) => failedMemberIds.includes(m.id)).map((m) => m.name),
  };
}
