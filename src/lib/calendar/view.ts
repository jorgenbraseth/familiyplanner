import "server-only";
import { addDays, dateInTimeZone, dayKey, formatDayHeading, formatTime, isoWeekOf, mondayOf, startOfDay } from "../dates";
import { t } from "../i18n";
import { filterByAudience, formatWeekday, mergeEntries, schoolEventEntry, type AudienceView, type EventEntry } from "../plan-view";
import type { Member } from "../members";
import { loadSchoolEvents } from "../school";
import { groupByDay, mergeSharedEvents, type CalendarEvent } from "./events";
import { getEvents } from "./google";

// Server-side view models for calendar screens. Times are formatted here so server and browser
// render the same text.

/** One line of a day list: a Google Calendar event or a school event from the ukeplan (`school`). */
export type EventView = EventEntry;

export type DayView = { key: string; heading: string; isToday: boolean; events: EventView[] };

export type WeekView = {
  isoWeek: number;
  todayKey: string;
  days: DayView[];
  failedNames: string[];
};

/** Minutes after midnight the event starts on this day; -1 for all-day events and ones that began earlier. */
function sortKey(event: CalendarEvent, dayStart: number): number {
  const start = new Date(event.start).getTime();
  if (event.allDay || start <= dayStart) return -1;
  return Math.round((start - dayStart) / 60_000);
}

/** Minutes after midnight the event ends on this day; null when it ends after the day. */
function endKey(event: CalendarEvent, dayStart: number, dayEnd: number): number | null {
  const end = new Date(event.end).getTime();
  if (event.allDay || end >= dayEnd) return null;
  return Math.round((end - dayStart) / 60_000);
}

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

export type LoadWeekOptions = {
  /** Kids' headings: "Mandag" without the date. */
  weekdayOnly?: boolean;
  /**
   * Also interleave published ukeplan events of these members with their calendar events: `kid` shows audience
   * child/both, `all` every audience (parents' Familien page).
   */
  schoolEvents?: { view: Exclude<AudienceView, "parent">; memberIds: string[] };
};

/** One ISO week (Monday–Sunday, Copenhagen) of events for the given members. */
export async function loadWeek(
  members: Member[],
  weekOffset = 0,
  now = new Date(),
  options: LoadWeekOptions = {},
): Promise<WeekView> {
  const { weekdayOnly = false, schoolEvents } = options;
  const today = dateInTimeZone(now);
  const monday = addDays(mondayOf(today), weekOffset * 7);
  const [{ events, failedMemberIds }, planEvents] = await Promise.all([
    getEvents(
      members.map((m) => ({ memberId: m.id, calendarIds: m.calendar_ids })),
      startOfDay(monday),
      startOfDay(addDays(monday, 7)),
    ),
    schoolEvents
      ? loadSchoolEvents(schoolEvents.memberIds, dayKey(monday), dayKey(addDays(monday, 6)))
      : Promise.resolve([]),
  ]);
  const schoolItems = schoolEvents ? filterByAudience(planEvents, schoolEvents.view) : [];
  const todayKey = dayKey(today);
  const days = groupByDay(mergeSharedEvents(events), monday, 7).map(({ date, key, events: dayEvents }) => {
    const dayStart = startOfDay(date).getTime();
    const dayEnd = startOfDay(addDays(date, 1)).getTime();
    return {
      key,
      heading: weekdayOnly ? formatWeekday(date) : formatDayHeading(date),
      isToday: key === todayKey,
      events: mergeEntries<EventView>(
        dayEvents.map((e) => ({
          id: `${e.memberId}:${e.id}`,
          memberId: e.memberId,
          ...(e.memberIds.length > 1 ? { memberIds: e.memberIds } : {}),
          title: e.title,
          timeLabel: timeLabel(e, dayStart, dayEnd),
          sortKey: sortKey(e, dayStart),
          endKey: endKey(e, dayStart, dayEnd),
          location: e.location,
        })),
        schoolItems.filter((i) => i.date === key).map((i) => schoolEventEntry(i, t.calendar.allDay)),
      ),
    };
  });
  return {
    isoWeek: isoWeekOf(monday).isoWeek,
    todayKey,
    days,
    failedNames: members.filter((m) => failedMemberIds.includes(m.id)).map((m) => m.name),
  };
}
