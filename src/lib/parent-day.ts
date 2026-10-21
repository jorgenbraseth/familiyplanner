// Pure helpers for the parents' "Dagen i dag": the parent's own events and all the children's events of one day,
// merged chronologically, with shared events shown once. No database or network access here.

import { formatTime } from "./dates";
import { t } from "./i18n";

export type DayMember = { id: string; name: string; colour: string };

/** A Google Calendar event as `getEvents` returns it (ISO instants). */
export type DayCalendarEvent = { memberId: string; title: string; start: string; end: string; allDay: boolean; location?: string };

/** A published ukeplan event (day item of kind event). */
export type DaySchoolEvent = { memberId: string; subject: string | null; text: string; startsAt: string | null; endsAt: string | null };

/** A child's school hours for the day (from the timetable or an override). */
export type DaySchoolHours = { memberId: string; startsAt: string | null; endsAt: string | null };

export type ParentDayEntry = {
  /** Stable key: kind, title and time. Entries with the same key are one shared entry. */
  key: string;
  kind: "school" | "event";
  title: string;
  /** "Hele dagen", "08:15–13:30" or "14:00". */
  timeLabel: string;
  allDay: boolean;
  /** Minutes after midnight the entry starts; -1 for all-day (these come first). */
  sortKey: number;
  location?: string;
  /** Everyone it belongs to, in the order given in `members`. */
  members: DayMember[];
};

function hm(time: string | null | undefined): string | null {
  const match = time?.match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

function range(from: string | null, to: string | null): string | null {
  if (from && to) return from === to ? from : `${from}–${to}`;
  return from ?? to;
}

const minutes = (value: string | null): number => (value ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : -1);

type Raw = Omit<ParentDayEntry, "key" | "members"> & { memberId: string; dedupe: string };

function calendarEntry(e: DayCalendarEvent, dayStart: number, dayEnd: number): Raw | null {
  const start = new Date(e.start).getTime();
  const end = new Date(e.end).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= dayStart || start >= dayEnd) return null;
  const allDay = e.allDay || (start <= dayStart && end >= dayEnd);
  const from = start < dayStart ? "" : formatTime(new Date(start));
  const to = end > dayEnd ? "" : formatTime(new Date(end));
  return {
    kind: "event",
    title: e.title,
    allDay,
    timeLabel: allDay ? t.calendar.allDay : from === to ? from : `${from}–${to}`,
    sortKey: allDay || start <= dayStart ? -1 : Math.round((start - dayStart) / 60_000),
    location: e.location,
    memberId: e.memberId,
    dedupe: allDay ? "all-day" : `${start}-${end}`,
  };
}

function schoolEventEntry(e: DaySchoolEvent): Raw {
  const from = hm(e.startsAt);
  const to = hm(e.endsAt);
  const label = range(from, to);
  const subject = e.subject?.trim();
  return {
    kind: "school",
    title: subject ? `${subject}: ${e.text}` : e.text,
    allDay: label === null,
    timeLabel: label ?? t.calendar.allDay,
    sortKey: minutes(from),
    memberId: e.memberId,
    dedupe: label ?? "all-day",
  };
}

function schoolDayEntry(h: DaySchoolHours): Raw | null {
  const label = range(hm(h.startsAt), hm(h.endsAt));
  if (!label) return null;
  return {
    kind: "school",
    title: t.parentDay.school,
    allDay: false,
    timeLabel: label,
    sortKey: minutes(hm(h.startsAt)),
    memberId: h.memberId,
    dedupe: label,
  };
}

/**
 * One day of everyone's events, oldest start first, all-day first. `dayStart`/`dayEnd` are the instants the
 * Copenhagen day starts and ends (calendar events outside them are ignored). Entries with the same kind, title and
 * time (a family calendar seen by several members, the same ukeplan event for two siblings, two children with the
 * same school hours) are shown once with every name. Events of members not in `members` are dropped.
 */
export function buildParentDay(input: {
  members: readonly DayMember[];
  dayStart: Date;
  dayEnd: Date;
  calendarEvents: readonly DayCalendarEvent[];
  schoolEvents: readonly DaySchoolEvent[];
  schoolHours: readonly DaySchoolHours[];
}): ParentDayEntry[] {
  const { members, calendarEvents, schoolEvents, schoolHours } = input;
  const dayStart = input.dayStart.getTime();
  const dayEnd = input.dayEnd.getTime();
  const raws: Raw[] = [
    ...schoolHours.map(schoolDayEntry),
    ...schoolEvents.map(schoolEventEntry),
    ...calendarEvents.map((e) => calendarEntry(e, dayStart, dayEnd)),
  ].filter((r): r is Raw => r !== null);

  const order = new Map(members.map((m, i) => [m.id, i]));
  const merged = new Map<string, ParentDayEntry>();
  for (const raw of raws) {
    const member = members[order.get(raw.memberId) ?? -1];
    if (!member) continue;
    const key = `${raw.kind}|${raw.title.trim().toLocaleLowerCase()}|${raw.dedupe}`;
    const existing = merged.get(key);
    if (!existing) {
      const { kind, title, timeLabel, allDay, sortKey, location } = raw;
      merged.set(key, { key, kind, title, timeLabel, allDay, sortKey, location, members: [member] });
    } else if (!existing.members.some((m) => m.id === member.id)) {
      existing.members.push(member);
      existing.members.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }
  }
  return [...merged.values()]
    .map((e, i) => ({ e, i }))
    .sort((a, b) => Number(b.e.allDay) - Number(a.e.allDay) || a.e.sortKey - b.e.sortKey || a.i - b.i)
    .map(({ e }) => e);
}
