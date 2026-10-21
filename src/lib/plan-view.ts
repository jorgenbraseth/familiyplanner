// Pure helpers that shape a child's timetable and ukeplan items for the start page, Lekser and Ukeplan views.

import { addDays, dayKey, parseDayKey, type CalendarDate } from "./dates";
import { locale } from "./i18n";
import type { PlanItemKind, PlanItemRow, TimetableDayRow, TimetablePeriodRow } from "./plan";

// ---------- Audience ----------

/** kid: what a child sees (also "Se som barn"). parent: parent-facing views. all: no audience filter. */
export type AudienceView = "kid" | "parent" | "all";

/**
 * Kids see child/both items, parents' views see parent/both items. Homework is shown to everyone regardless of
 * audience (parents must see the homework their child has). Legacy lessons are never shown.
 */
export function visibleTo(item: Pick<PlanItemRow, "kind" | "audience">, view: AudienceView): boolean {
  if (item.kind === "lesson") return false;
  if (view === "all" || item.kind === "homework") return true;
  return view === "kid" ? item.audience !== "parent" : item.audience !== "child";
}

export function filterByAudience<T extends Pick<PlanItemRow, "kind" | "audience">>(items: readonly T[], view: AudienceView): T[] {
  return items.filter((i) => visibleTo(i, view));
}

// ---------- Item grouping ----------

const KIND_ORDER: Record<PlanItemKind, number> = { lesson: 0, homework: 1, message: 2, event: 3 };

export type DayItems = { key: string; date: CalendarDate; items: PlanItemRow[] };

function compareItems(a: PlanItemRow, b: PlanItemRow): number {
  return (
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    (a.starts_at ?? "").localeCompare(b.starts_at ?? "") ||
    Number(a.audience !== "child") - Number(b.audience !== "child") ||
    a.sort - b.sort
  );
}

/** `days` consecutive days from `firstDay`, each with its day items (whole-week items are left out). */
export function groupItemsByDay(items: PlanItemRow[], firstDay: CalendarDate, days: number): DayItems[] {
  const result: DayItems[] = [];
  const dayItems = items.filter((i) => !i.whole_week && i.kind !== "lesson");
  for (let i = 0; i < days; i++) {
    const date = addDays(firstDay, i);
    const key = dayKey(date);
    result.push({ key, date, items: dayItems.filter((item) => item.date === key).sort(compareItems) });
  }
  return result;
}

/** Items that belong to the whole week starting `mondayKey` (whole_week items are dated that Monday). */
export function wholeWeekItems(items: readonly PlanItemRow[], mondayKey: string): PlanItemRow[] {
  return items.filter((i) => i.whole_week && i.date === mondayKey && i.kind !== "lesson").sort(compareItems);
}

/** Splits items into day items and whole-week items of the week starting `mondayKey` (other weeks' are dropped). */
export function splitWeekItems(items: readonly PlanItemRow[], mondayKey: string): { day: PlanItemRow[]; whole: PlanItemRow[] } {
  return {
    day: items.filter((i) => !i.whole_week && i.kind !== "lesson").sort(compareItems),
    whole: wholeWeekItems(items, mondayKey),
  };
}

/** Not-done items first, otherwise in the given order. */
export function notDoneFirst<T extends { done: boolean }>(items: readonly T[]): T[] {
  return [...items.filter((i) => !i.done), ...items.filter((i) => i.done)];
}

// ---------- Dates ----------

/** The next Monday–Friday after `today` (Friday, Saturday and Sunday give Monday). */
export function nextSchoolDay(today: CalendarDate): CalendarDate {
  let next = addDays(today, 1);
  for (;;) {
    const weekday = new Date(Date.UTC(next.year, next.month - 1, next.day)).getUTCDay();
    if (weekday >= 1 && weekday <= 5) return next;
    next = addDays(next, 1);
  }
}

/** ISO weekday of a "YYYY-MM-DD" key or a date: Monday = 1 … Sunday = 7. */
export function isoWeekday(date: CalendarDate | string): number {
  const d = typeof date === "string" ? parseDayKey(date) : date;
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() || 7;
}

/** "Mandag": the weekday name only, capitalised (kids' headings show no date). */
export function formatWeekday(date: CalendarDate): string {
  const name = new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "long" }).format(
    new Date(Date.UTC(date.year, date.month - 1, date.day)),
  );
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

/** In the current week (offset 0) days before today are dropped; other weeks keep every day. */
export function visibleDays<T extends { key: string }>(days: T[], todayKey: string, weekOffset: number): T[] {
  return weekOffset === 0 ? days.filter((d) => d.key >= todayKey) : days;
}

/** "08:15:00" or "08:15" gives "08:15"; null/empty gives null. */
export function formatHm(time: string | null | undefined): string | null {
  const match = time?.match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

/** "08:15–14:00", or just one end when only one is known, or null. */
export function formatSchoolHours(startsAt: string | null | undefined, endsAt: string | null | undefined): string | null {
  const from = formatHm(startsAt);
  const to = formatHm(endsAt);
  if (from && to) return `${from}–${to}`;
  return from ?? to;
}

/** Minutes after midnight of "HH:MM[:SS]", or null. */
export function minutesOf(time: string | null | undefined): number | null {
  const hm = formatHm(time);
  return hm ? Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)) : null;
}

// ---------- Timetable ----------

export type SchoolHours = { starts_at: string | null; ends_at: string | null };

export type Timetable = {
  days: Pick<TimetableDayRow, "weekday" | "starts_at" | "ends_at">[];
  periods: Pick<TimetablePeriodRow, "id" | "weekday" | "period" | "starts_at" | "ends_at" | "subject" | "sort">[];
};

export const EMPTY_TIMETABLE: Timetable = { days: [], periods: [] };

/**
 * School start/end for a date: an exact-date override (an old week plan's school_days row) wins, otherwise the
 * timetable row for the date's ISO weekday. undefined when the timetable has no such day.
 */
export function hoursForDate(
  key: string,
  timetable: Timetable,
  overrides?: ReadonlyMap<string, SchoolHours>,
): SchoolHours | undefined {
  const override = overrides?.get(key);
  if (override) return { starts_at: override.starts_at, ends_at: override.ends_at };
  const row = timetable.days.find((d) => d.weekday === isoWeekday(key));
  return row ? { starts_at: row.starts_at, ends_at: row.ends_at } : undefined;
}

export type PeriodLine = {
  id: string;
  period: number | null;
  time: string | null;
  title: string;
  /** "HH:MM" start/end of the period when known (the start page's timeline puts them between the cards). */
  startsAt: string | null;
  endsAt: string | null;
};

/** What one timetable period shows: period number, time range and subject. */
export function periodLine(row: Timetable["periods"][number]): PeriodLine {
  return {
    id: row.id,
    period: row.period,
    time: formatSchoolHours(row.starts_at, row.ends_at),
    title: row.subject,
    startsAt: formatHm(row.starts_at),
    endsAt: formatHm(row.ends_at),
  };
}

/** A time marker between two period cards: one time, or a break (period ended at `from`, next starts at `to`). */
export type TimelineDivider = { kind: "time"; time: string } | { kind: "break"; from: string; to: string };

export type PeriodTimelineEntry =
  | { type: "divider"; divider: TimelineDivider }
  | { type: "period"; line: PeriodLine };

/**
 * The periods of a day as a timeline: dividers with times between the period cards instead of a time range on each.
 * First divider: the first period's start (else the school start); last: the last period's end (else the school end);
 * between two periods: one time when one ends as the next starts, a break (both times) when there is a gap, and
 * whichever time is known when only one is. No known time means no divider there.
 */
export function periodTimeline(periods: readonly PeriodLine[], hours?: SchoolHours): PeriodTimelineEntry[] {
  const out: PeriodTimelineEntry[] = [];
  const push = (divider: TimelineDivider | null) => {
    if (divider) out.push({ type: "divider", divider });
  };
  const single = (time: string | null): TimelineDivider | null => (time ? { kind: "time", time } : null);
  periods.forEach((line, i) => {
    if (i === 0) push(single(line.startsAt ?? formatHm(hours?.starts_at)));
    else {
      const ended = periods[i - 1].endsAt;
      const starts = line.startsAt;
      if (ended && starts && ended < starts) push({ kind: "break", from: ended, to: starts });
      else push(single(starts ?? ended));
    }
    out.push({ type: "period", line });
    if (i === periods.length - 1) push(single(line.endsAt ?? formatHm(hours?.ends_at)));
  });
  return out;
}

/** The periods of the date's ISO weekday in school order: by period (those without one after), time, then `sort`. */
export function periodsForDate(key: string, timetable: Timetable): PeriodLine[] {
  const weekday = isoWeekday(key);
  const rank = (p: Timetable["periods"][number]) => p.period ?? Number.POSITIVE_INFINITY;
  return timetable.periods
    .filter((p) => p.weekday === weekday)
    .sort(
      (a, b) =>
        (rank(a) === rank(b) ? 0 : rank(a) < rank(b) ? -1 : 1) ||
        (a.starts_at ?? "").localeCompare(b.starts_at ?? "") ||
        a.sort - b.sort,
    )
    .map(periodLine);
}

// ---------- Events as calendar-like entries ----------

/** A line in a day list: a Google Calendar event or a school event from the ukeplan. */
export type EventEntry = {
  id: string;
  memberId: string;
  title: string;
  timeLabel: string;
  /** Minutes after midnight the entry starts; -1 for all-day/untimed (these come first). */
  sortKey: number;
  location?: string;
  /** A ukeplan event (marked with a small "Skole" label). */
  school?: boolean;
};

/** A ukeplan event as a calendar-like entry. Untimed events get `allDayLabel` and sort first. */
export function schoolEventEntry(item: PlanItemRow, allDayLabel: string): EventEntry {
  const start = minutesOf(item.starts_at);
  const title = item.subject?.trim() ? `${item.subject.trim()}: ${item.text}` : item.text;
  return {
    id: `school:${item.id}`,
    memberId: item.member_id,
    title,
    timeLabel: formatSchoolHours(item.starts_at, item.ends_at) ?? allDayLabel,
    sortKey: start ?? -1,
    school: true,
  };
}

/** Merges entries by start time; all-day/untimed first. Equal times keep the order given (earlier lists first). */
export function mergeEntries<T extends { sortKey: number }>(...lists: T[][]): T[] {
  return lists.flat().map((e, i) => ({ e, i })).sort((a, b) => a.e.sortKey - b.e.sortKey || a.i - b.i).map(({ e }) => e);
}

/** Ukeplan events (day items of kind event) of one date as calendar-like entries, for the audience view. */
export function schoolEventsOn(items: readonly PlanItemRow[], key: string, view: AudienceView, allDayLabel: string): EventEntry[] {
  return filterByAudience(items, view)
    .filter((i) => i.kind === "event" && !i.whole_week && i.date === key)
    .sort(compareItems)
    .map((i) => schoolEventEntry(i, allDayLabel));
}

// ---------- Start page ----------

export type TodayView = {
  hours: SchoolHours | undefined;
  periods: PeriodLine[];
  /** Today's messages for the child ("Husk"). */
  messages: PlanItemRow[];
  /** Homework due on the next school day. */
  homeworkDue: PlanItemRow[];
  /** Whole-week homework of the current week, not done first. */
  weekHomework: PlanItemRow[];
  nextSchoolDay: CalendarDate;
  nextSchoolDayKey: string;
};

/** Everything of the kid's start page that comes from the timetable and the ukeplan items (events: see `schoolEventsOn`). */
export function todayView(
  items: PlanItemRow[],
  today: CalendarDate,
  timetable: Timetable = EMPTY_TIMETABLE,
  overrides?: ReadonlyMap<string, SchoolHours>,
  view: AudienceView = "kid",
): TodayView {
  const todayKey = dayKey(today);
  const next = nextSchoolDay(today);
  const nextKey = dayKey(next);
  const visible = filterByAudience(items, view);
  const { day, whole } = splitWeekItems(visible, dayKey(addDays(today, 1 - isoWeekday(today))));
  return {
    hours: hoursForDate(todayKey, timetable, overrides),
    periods: periodsForDate(todayKey, timetable),
    messages: day.filter((i) => i.date === todayKey && i.kind === "message"),
    homeworkDue: day.filter((i) => i.date === nextKey && i.kind === "homework"),
    weekHomework: notDoneFirst(whole.filter((i) => i.kind === "homework")),
    nextSchoolDay: next,
    nextSchoolDayKey: nextKey,
  };
}

// ---------- Ukeplan ----------

export type WeekPlanDay = {
  key: string;
  date: CalendarDate;
  /** "08:15–14:00" when the timetable says so. */
  hours: string | null;
  periods: PeriodLine[];
  events: EventEntry[];
  homework: PlanItemRow[];
  messages: PlanItemRow[];
};

/** Whether a day has nothing at all: no school hours, periods, events, homework or messages. */
export function isWeekPlanDayEmpty(day: Pick<WeekPlanDay, "hours" | "periods" | "events" | "homework" | "messages">): boolean {
  return !day.hours && day.periods.length + day.events.length + day.homework.length + day.messages.length === 0;
}

/** Drops the days for which `isEmpty` is true (kids' week views show no empty weekdays). */
export function withoutEmptyDays<T>(days: T[], isEmpty: (day: T) => boolean): T[] {
  return days.filter((d) => !isEmpty(d));
}

export type WholeWeek = { homework: PlanItemRow[]; messages: PlanItemRow[] };

/** The "Hele uken" section: whole-week homework (not done first) and messages for the audience. */
export function wholeWeekSection(items: readonly PlanItemRow[], mondayKey: string, view: AudienceView): WholeWeek {
  const whole = wholeWeekItems(filterByAudience(items, view), mondayKey);
  return {
    homework: notDoneFirst(whole.filter((i) => i.kind === "homework")),
    messages: whole.filter((i) => i.kind === "message"),
  };
}

/**
 * The "Ukeplan" cards: Monday–Friday always (unless `hideEmpty`, which drops every day with nothing on it),
 * Saturday/Sunday only when they have something, and (current week only) no days before today.
 * `eventsByDay` maps "YYYY-MM-DD" to the day's calendar-like entries (Google events and school events, merged).
 */
export function weekPlan(
  items: PlanItemRow[],
  timetable: Timetable,
  overrides: ReadonlyMap<string, SchoolHours> | undefined,
  eventsByDay: ReadonlyMap<string, EventEntry[]>,
  monday: CalendarDate,
  todayKey: string,
  weekOffset: number,
  hideEmpty = false,
  view: AudienceView = "kid",
): WeekPlanDay[] {
  const visible = filterByAudience(items, view);
  const days = groupItemsByDay(visible, monday, 7).map((d) => {
    const hours = hoursForDate(d.key, timetable, overrides);
    return {
      key: d.key,
      date: d.date,
      hours: formatSchoolHours(hours?.starts_at, hours?.ends_at),
      periods: periodsForDate(d.key, timetable),
      events: eventsByDay.get(d.key) ?? [],
      homework: d.items.filter((i) => i.kind === "homework"),
      messages: d.items.filter((i) => i.kind === "message"),
    };
  });
  const planned = visibleDays(
    days.filter((d, i) => i < 5 || !isWeekPlanDayEmpty(d)),
    todayKey,
    weekOffset,
  );
  return hideEmpty ? withoutEmptyDays(planned, isWeekPlanDayEmpty) : planned;
}

// ---------- Parents' notes ----------

export type ParentNoteWeek = { monday: CalendarDate; mondayKey: string; entries: PlanItemRow[] };

/**
 * "Beskjeder til foreldre": parent/both messages and events, grouped by the week they belong to (the Monday of
 * their date), newest week first. Inside a week whole-week items come first, then by date and start time.
 */
export function parentNoteWeeks(items: readonly PlanItemRow[]): ParentNoteWeek[] {
  const notes = items.filter((i) => (i.kind === "message" || i.kind === "event") && i.audience !== "child");
  const byWeek = new Map<string, PlanItemRow[]>();
  for (const item of notes) {
    const d = parseDayKey(item.date);
    const mondayKey = dayKey(addDays(d, 1 - isoWeekday(d)));
    byWeek.set(mondayKey, [...(byWeek.get(mondayKey) ?? []), item]);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([mondayKey, entries]) => ({
      monday: parseDayKey(mondayKey),
      mondayKey,
      entries: entries.sort(
        (a, b) =>
          Number(b.whole_week) - Number(a.whole_week) ||
          a.date.localeCompare(b.date) ||
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          (a.starts_at ?? "").localeCompare(b.starts_at ?? "") ||
          a.sort - b.sort,
      ),
    }));
}
