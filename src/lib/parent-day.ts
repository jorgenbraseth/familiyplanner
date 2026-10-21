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

/** `startMin`/`endMin`: clock minutes after midnight (end null when unknown); both null for all-day entries. */
type Raw = Omit<ParentDayEntry, "key" | "members"> & { memberId: string; dedupe: string; startMin: number | null; endMin: number | null };

function calendarEntry(e: DayCalendarEvent, dayStart: number, dayEnd: number): Raw | null {
  const start = new Date(e.start).getTime();
  const end = new Date(e.end).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= dayStart || start >= dayEnd) return null;
  const allDay = e.allDay || (start <= dayStart && end >= dayEnd);
  const from = start < dayStart ? "" : formatTime(new Date(start));
  const to = end > dayEnd ? "" : formatTime(new Date(end));
  const startMin = allDay ? null : start <= dayStart ? 0 : minutes(hm(from));
  const endMin = allDay ? null : end >= dayEnd ? 1440 : minutes(hm(to));
  return {
    startMin,
    endMin,
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
    startMin: from ? minutes(from) : null,
    endMin: from && to ? minutes(to) : null,
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
    startMin: hm(h.startsAt) ? minutes(hm(h.startsAt)) : null,
    endMin: hm(h.endsAt) ? minutes(hm(h.endsAt)) : null,
    kind: "school",
    title: t.parentDay.school,
    allDay: false,
    timeLabel: label,
    sortKey: minutes(hm(h.startsAt)),
    memberId: h.memberId,
    dedupe: label,
  };
}

type DayInput = {
  members: readonly DayMember[];
  dayStart: Date;
  dayEnd: Date;
  calendarEvents: readonly DayCalendarEvent[];
  schoolEvents: readonly DaySchoolEvent[];
  schoolHours: readonly DaySchoolHours[];
};

function collect(input: DayInput): Raw[] {
  const dayStart = input.dayStart.getTime();
  const dayEnd = input.dayEnd.getTime();
  return [
    ...input.schoolHours.map(schoolDayEntry),
    ...input.schoolEvents.map(schoolEventEntry),
    ...input.calendarEvents.map((e) => calendarEntry(e, dayStart, dayEnd)),
  ].filter((r): r is Raw => r !== null);
}

/**
 * One day of everyone's events, oldest start first, all-day first. `dayStart`/`dayEnd` are the instants the
 * Copenhagen day starts and ends (calendar events outside them are ignored). Entries with the same kind, title and
 * time (a family calendar seen by several members, the same ukeplan event for two siblings, two children with the
 * same school hours) are shown once with every name. Events of members not in `members` are dropped.
 */
export function buildParentDay(input: DayInput): ParentDayEntry[] {
  const { members } = input;
  const raws = collect(input);

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

// ---- Vertical tracks on one shared time axis ("Dagen i dag") ----

export type TrackBlock = {
  key: string;
  kind: "school" | "event";
  title: string;
  location?: string;
  timeLabel: string;
  /** Clock minutes, as drawn: `endMin` is the real end, or the next boundary / start + 30 when unknown. */
  startMin: number;
  endMin: number;
  /** Sub-column inside the member's column, 0-based (overlapping entries sit side by side). */
  lane: number;
  /** 1-based grid rows of the time axis (the first divider is row 1), end exclusive. */
  rowStart: number;
  rowEnd: number;
};

export type TrackAllDay = { key: string; kind: "school" | "event"; title: string };

export type TrackColumn = {
  member: DayMember;
  /** Sub-columns this member needs: the most entries overlapping at any time (at least 1). */
  lanes: number;
  /** 1-based grid column of the first lane; column 1 is the time gutter. */
  firstColumn: number;
  allDay: TrackAllDay[];
  blocks: TrackBlock[];
};

export type TrackRow =
  | { kind: "divider"; row: number; minute: number; label: string }
  /** A time between two boundaries with at least one entry; `gap` is a segment where nobody has anything. */
  | { kind: "segment" | "gap"; row: number; from: number; to: number };

export type ParentTracks = {
  columns: TrackColumn[];
  boundaries: number[];
  /** Alternating divider, segment/gap, divider ... divider; rows are consecutive from 1. */
  rows: TrackRow[];
  hasAllDay: boolean;
  /** Total grid columns including the gutter. */
  columnCount: number;
  empty: boolean;
};

const UNKNOWN_END_MINUTES = 30;

export const minuteLabel = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Layout model: one column per member (given order, each with `lanes` sub-columns). All start/end minutes of all
 * timed entries form sorted unique boundaries b0..bn. The time axis has rows divider(b0), segment(b0..b1),
 * divider(b1) ... divider(bn): divider i is row 2i+1 and segment i is row 2i+2. An entry from boundary s to e spans
 * rows 2s+2 .. 2e (end exclusive 2e+1). Segment heights are fixed by the view, never proportional to duration; a
 * segment no entry covers is a `gap`. An entry without a known end (or with end <= start) runs to the next boundary
 * after its start, or 30 minutes when there is none. Overlaps inside one column are put in lanes, greedily in start
 * order (first lane that is free); a column gets as many lanes as its busiest moment. All-day entries are listed
 * per column outside the axis. Shared events are not merged: every member gets their own block.
 */
export function buildParentTracks(input: DayInput): ParentTracks {
  const raws = collect(input);
  const known = input.members.map((m) => m.id);
  const timed = raws.filter((r) => r.startMin !== null && known.includes(r.memberId));

  const set = new Set<number>();
  for (const r of timed) {
    set.add(r.startMin as number);
    if (r.endMin !== null && r.endMin > (r.startMin as number)) set.add(r.endMin);
  }
  // Unknown ends need a boundary after their start: take the next one, else start + 30 (max 24:00).
  const sortedKnown = [...set].sort((a, b) => a - b);
  const resolved = timed.map((r) => {
    const start = r.startMin as number;
    let end = r.endMin !== null && r.endMin > start ? r.endMin : null;
    if (end === null) {
      end = sortedKnown.find((b) => b > start) ?? Math.min(1440, start + UNKNOWN_END_MINUTES);
      if (end <= start) end = start; // an entry at 24:00 cannot grow
      set.add(end);
    }
    return { r, start, end };
  });
  const boundaries = [...set].sort((a, b) => a - b);
  const index = new Map(boundaries.map((b, i) => [b, i]));

  const covered = new Set<number>();
  const columns: TrackColumn[] = [];
  let nextColumn = 2;
  for (const member of input.members) {
    const mine = resolved
      .filter((x) => x.r.memberId === member.id)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const laneEnds: number[] = [];
    const blocks: TrackBlock[] = mine.map(({ r, start, end }, i) => {
      let lane = laneEnds.findIndex((e) => e <= start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = end;
      const s = index.get(start) as number;
      const e = Math.max(index.get(end) as number, s + 1);
      for (let seg = s; seg < e; seg++) covered.add(seg);
      return {
        key: `${member.id}|${r.kind}|${r.title}|${i}`,
        kind: r.kind,
        title: r.title,
        location: r.location,
        timeLabel: r.timeLabel,
        startMin: start,
        endMin: end,
        lane,
        rowStart: 2 * s + 2,
        rowEnd: 2 * e + 1,
      };
    });
    const lanes = Math.max(1, laneEnds.length);
    const allDay = raws
      .filter((r) => r.memberId === member.id && r.allDay)
      .map((r, i) => ({ key: `${member.id}|${r.kind}|${r.title}|${i}`, kind: r.kind, title: r.title }));
    columns.push({ member, lanes, firstColumn: nextColumn, allDay, blocks });
    nextColumn += lanes;
  }

  const rows: TrackRow[] = [];
  boundaries.forEach((minute, i) => {
    rows.push({ kind: "divider", row: 2 * i + 1, minute, label: minuteLabel(minute) });
    if (i < boundaries.length - 1) {
      rows.push({ kind: covered.has(i) ? "segment" : "gap", row: 2 * i + 2, from: minute, to: boundaries[i + 1] });
    }
  });

  const hasAllDay = columns.some((c) => c.allDay.length > 0);
  return {
    columns,
    boundaries,
    rows,
    hasAllDay,
    columnCount: nextColumn,
    empty: !hasAllDay && boundaries.length === 0,
  };
}
