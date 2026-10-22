// Pure helpers that shape a child's timetable and ukeplan items for the start page, Lekser and Ukeplan views.

import { addDays, dayKey, parseDayKey, type CalendarDate } from "./dates";
import { locale } from "./i18n";
import { flattenItemText } from "./item-text";
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

/** Sort time of an item: only events have a time of day (homework rows saved with one are ignored). */
function itemTime(item: Pick<PlanItemRow, "kind" | "starts_at">): string {
  return item.kind === "event" ? (item.starts_at ?? "") : "";
}

function compareItems(a: PlanItemRow, b: PlanItemRow): number {
  return (
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    itemTime(a).localeCompare(itemTime(b)) ||
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

/**
 * Subjects of a timetable period that are a break (lunch, recess, fruit time...), not a lesson. Whole words
 * only, lowercase: "mat" is a break on its own or with other break words ("Mat og lek") but "Mat og helse" and
 * "Matematikk" are school subjects. Classified at render time, nothing is stored.
 */
export const BREAK_WORDS: readonly string[] = [
  "friminutt",
  "friminutter",
  "storefri",
  "storefriminutt",
  "langfri",
  "langfriminutt",
  "fri",
  "lunsj",
  "lunch",
  "matpause",
  "mattid",
  "mat",
  "spising",
  "spise",
  "eting",
  "pause",
  "pausen",
  "frukt",
  "fruktpause",
  "uteleik",
  "utetid",
  "lek",
  "leik",
];

const BREAK_WORD_SET = new Set(BREAK_WORDS);

/** True when every word of the subject (ignoring "og" and punctuation) is a break word, e.g. "Lunsj", "Mat og lek". */
export function isBreakSubject(subject: string | null | undefined): boolean {
  if (!subject) return false;
  const words = subject
    .trim()
    .toLowerCase()
    .split(/[\s,/+&.:;()\-–]+/)
    .filter((w) => w && w !== "og");
  return words.length > 0 && words.every((w) => BREAK_WORD_SET.has(w));
}

/** "HH:MM" of minutes after midnight. */
function hmOfMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * One row of a day timeline (the kids' "Min dag"). Time is shown by dividers and empty time by a gap:
 *  - `divider`: a time marker; an entry on the timeline has one before (its start) and one after (its end);
 *  - `gap`: nothing happens between the divider before and the one after. It is drawn at a fixed small height,
 *    never scaled by its length; `school` is true inside school hours (labelled "friminutt");
 *  - `period` / `pause` / `event`: the cards (`pause` is a timetable period whose subject is a break, see
 *    `isBreakSubject`; it has dividers like a period). `showTime` is true when the card has to show its own time: entries that
 *    overlap an earlier one (no dividers) and events without a known end. All-day events are `event` with
 *    `showTime` true (their label is "Hele dagen").
 */
export type TimelineEntry =
  | { type: "divider"; time: string }
  | { type: "gap"; school: boolean }
  | { type: "period"; line: PeriodLine; showTime: boolean }
  | { type: "pause"; line: PeriodLine; showTime: boolean }
  | { type: "event"; event: EventEntry; showTime: boolean };

export type PeriodTimelineEntry = TimelineEntry;
export type MyDayEntry = TimelineEntry;

type TimelineItem = {
  card: { type: "period"; line: PeriodLine } | { type: "event"; event: EventEntry };
  start: number | null;
  end: number | null;
  startStr: string | null;
  endStr: string | null;
  sortAt: number;
};

/**
 * The day as a timeline of school periods and timed events, with dividers for time and gaps for empty time.
 * Deterministic rules:
 *  - all-day/untimed events (`sortKey < 0`) come first, in their given order, with no dividers;
 *  - the rest is ordered by start (a period without a known start is ranked by the previous period's end/start);
 *    ties: periods before events, then the given order. The first period's missing start falls back to the school
 *    start and the last period's missing end to the school end;
 *  - walking in that order, an entry that starts before the latest end seen so far overlaps: it stays a card
 *    right after the entry it overlaps, shows its own time, gets no dividers, and moves the "latest end" later
 *    if it ends after it;
 *  - any other entry gets a divider with its start before it and, after it, one with its end. When the next entry
 *    starts exactly then, the divider is shared; when later, the end divider, a gap and the next start divider
 *    follow (the gap is `school` when inside the school hours, else when both neighbours are periods and the
 *    hours are unknown);
 *  - an unknown start or end gives no divider on that side and no gap (an unknown start next to a known end
 *    still shows that end); an event with an unknown end keeps its time label on the card.
 */
export function dayTimeline(
  periods: readonly PeriodLine[],
  hours: SchoolHours | undefined,
  events: readonly EventEntry[],
): TimelineEntry[] {
  const items: TimelineItem[] = [];
  let rank = 0;
  periods.forEach((line, i) => {
    const startStr = line.startsAt ?? (i === 0 ? formatHm(hours?.starts_at) : null);
    const endStr = line.endsAt ?? (i === periods.length - 1 ? formatHm(hours?.ends_at) : null);
    const start = minutesOf(startStr);
    const end = minutesOf(endStr);
    rank = start ?? rank;
    items.push({ card: { type: "period", line }, start, end, startStr, endStr, sortAt: rank });
    rank = end ?? rank;
  });
  const timed = events.filter((e) => e.sortKey >= 0);
  timed.forEach((event) => {
    const end = event.endKey != null && event.endKey > event.sortKey ? event.endKey : null;
    items.push({
      card: { type: "event", event },
      start: event.sortKey,
      end,
      startStr: hmOfMinutes(event.sortKey),
      endStr: end === null ? null : hmOfMinutes(end),
      sortAt: event.sortKey,
    });
  });
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        a.item.sortAt - b.item.sortAt ||
        (a.item.card.type === b.item.card.type ? 0 : a.item.card.type === "period" ? -1 : 1) ||
        a.index - b.index,
    )
    .map(({ item }) => item);

  const out: TimelineEntry[] = events
    .filter((e) => e.sortKey < 0)
    .map((event) => ({ type: "event", event, showTime: true }));
  const hoursStart = minutesOf(hours?.starts_at);
  const hoursEnd = minutesOf(hours?.ends_at);
  const divider = (time: string) => out.push({ type: "divider", time });
  const push = (item: TimelineItem, showTime: boolean) =>
    out.push(
      item.card.type === "period"
        ? { type: isBreakSubject(item.card.line.title) ? "pause" : "period", line: item.card.line, showTime }
        : { type: "event", event: item.card.event, showTime },
    );

  let latestEnd: number | null = null;
  type PendingEnd = { str: string; min: number; kind: "period" | "event" };
  let pending = null as PendingEnd | null;
  for (const item of ordered) {
    if (latestEnd !== null && item.start !== null && item.start < latestEnd) {
      push(item, true);
      if (item.end !== null && item.end > latestEnd) {
        latestEnd = item.end;
        if (pending) pending = { str: hmOfMinutes(item.end), min: item.end, kind: (pending as PendingEnd).kind };
      }
      continue;
    }
    if (pending) {
      if (item.startStr && item.start !== null) {
        divider(pending.str);
        if (pending.min < item.start) {
          const school =
            hoursStart !== null && hoursEnd !== null
              ? pending.min >= hoursStart && item.start <= hoursEnd
              : pending.kind === "period" && item.card.type === "period";
          out.push({ type: "gap", school });
          divider(item.startStr);
        }
      } else divider(pending.str);
    } else if (item.startStr) divider(item.startStr);
    push(item, item.card.type === "event" && item.endStr === null);
    pending = item.endStr && item.end !== null ? { str: item.endStr, min: item.end, kind: item.card.type } : null;
    if (item.end !== null) latestEnd = Math.max(latestEnd ?? 0, item.end);
  }
  if (pending) divider(pending.str);
  return out;
}

/** Which legend chips a timeline needs: one per kind of card that is present. */
export function timelineLegend(entries: readonly TimelineEntry[]): { school: boolean; pause: boolean; appointments: boolean } {
  return {
    school: entries.some((e) => e.type === "period"),
    pause: entries.some((e) => e.type === "pause"),
    appointments: entries.some((e) => e.type === "event"),
  };
}

/** The periods of a day as a timeline (see `dayTimeline`) without events. */
export function periodTimeline(periods: readonly PeriodLine[], hours?: SchoolHours): TimelineEntry[] {
  return dayTimeline(periods, hours, []);
}

/** "Min dag": the day's school periods and events as one timeline; see `dayTimeline` for the rules. */
export function myDayEntries(
  periods: readonly PeriodLine[],
  hours: SchoolHours | undefined,
  events: readonly EventEntry[],
): MyDayEntry[] {
  return dayTimeline(periods, hours, events);
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
  /** Everyone the entry applies to when a shared calendar event is listed once for several members (includes `memberId`). */
  memberIds?: string[];
  title: string;
  timeLabel: string;
  /** Minutes after midnight the entry starts; -1 for all-day/untimed (these come first). */
  sortKey: number;
  /** Minutes after midnight the entry ends when known and later than the start (else null/absent). */
  endKey?: number | null;
  location?: string;
  /** A ukeplan event (marked with a small "Skole" label). */
  school?: boolean;
};

/** A ukeplan event as a calendar-like entry. Untimed events get `allDayLabel` and sort first. */
export function schoolEventEntry(item: PlanItemRow, allDayLabel: string): EventEntry {
  const start = minutesOf(item.starts_at);
  const text = flattenItemText(item.text);
  const title = item.subject?.trim() ? `${item.subject.trim()}: ${text}` : text;
  return {
    id: `school:${item.id}`,
    memberId: item.member_id,
    title,
    timeLabel: formatSchoolHours(item.starts_at, item.ends_at) ?? allDayLabel,
    sortKey: start ?? -1,
    endKey: minutesOf(item.ends_at),
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
  /** The day's "Min dag" timeline (see `dayTimeline`), built from periods, school hours and events. */
  timeline: MyDayEntry[];
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

/** One legend for a whole week: a kind is shown when any day's timeline has it. */
export function weekLegend(days: readonly Pick<WeekPlanDay, "timeline">[]): ReturnType<typeof timelineLegend> {
  const legend = { school: false, pause: false, appointments: false };
  for (const day of days) {
    const l = timelineLegend(day.timeline);
    legend.school ||= l.school;
    legend.pause ||= l.pause;
    legend.appointments ||= l.appointments;
  }
  return legend;
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
    const periods = periodsForDate(d.key, timetable);
    const events = eventsByDay.get(d.key) ?? [];
    return {
      key: d.key,
      date: d.date,
      hours: formatSchoolHours(hours?.starts_at, hours?.ends_at),
      periods,
      events,
      timeline: myDayEntries(periods, hours, events),
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
          itemTime(a).localeCompare(itemTime(b)) ||
          a.sort - b.sort,
      ),
    }));
}
