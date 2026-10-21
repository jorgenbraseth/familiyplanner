// Pure helpers that shape a child's plan items for the Today and This week views.

import { addDays, dayKey, type CalendarDate } from "./dates";
import { locale } from "./i18n";
import type { PlanItemKind, PlanItemRow } from "./plan";

const KIND_ORDER: Record<PlanItemKind, number> = { lesson: 0, homework: 1, message: 2, event: 3 };

// Interim mapping until the views are rebuilt: child-only messages are the old "bring" list;
// other messages and events are the old "notes" list.
const isBringItem = (i: PlanItemRow) => i.kind === "message" && i.audience === "child";
const isNoteItem = (i: PlanItemRow) => (i.kind === "message" && i.audience !== "child") || i.kind === "event";

export type DayItems = { key: string; date: CalendarDate; items: PlanItemRow[] };

function compareItems(a: PlanItemRow, b: PlanItemRow): number {
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || Number(a.audience !== "child") - Number(b.audience !== "child") || a.sort - b.sort;
}

/** `days` consecutive days from `firstDay`, each with its items (lesson, homework, bring, note, then `sort`). */
export function groupItemsByDay(items: PlanItemRow[], firstDay: CalendarDate, days: number): DayItems[] {
  const result: DayItems[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(firstDay, i);
    const key = dayKey(date);
    result.push({ key, date, items: items.filter((item) => item.date === key).sort(compareItems) });
  }
  return result;
}

/** The next Monday–Friday after `today` (Friday, Saturday and Sunday give Monday). */
export function nextSchoolDay(today: CalendarDate): CalendarDate {
  let next = addDays(today, 1);
  for (;;) {
    const weekday = new Date(Date.UTC(next.year, next.month - 1, next.day)).getUTCDay();
    if (weekday >= 1 && weekday <= 5) return next;
    next = addDays(next, 1);
  }
}

export type TodayView = {
  lessons: PlanItemRow[];
  bring: PlanItemRow[];
  notes: PlanItemRow[];
  /** Homework due on the next school day. */
  homeworkDue: PlanItemRow[];
  nextSchoolDay: CalendarDate;
  nextSchoolDayKey: string;
};

export function todayView(items: PlanItemRow[], today: CalendarDate): TodayView {
  const todayKey = dayKey(today);
  const next = nextSchoolDay(today);
  const nextKey = dayKey(next);
  const sorted = [...items].sort(compareItems);
  const todays = (kind: PlanItemKind) => sorted.filter((i) => i.date === todayKey && i.kind === kind);
  const todaysDay = sorted.filter((i) => i.date === todayKey);
  return {
    lessons: todays("lesson"),
    bring: todaysDay.filter(isBringItem),
    notes: todaysDay.filter(isNoteItem),
    homeworkDue: sorted.filter((i) => i.date === nextKey && i.kind === "homework"),
    nextSchoolDay: next,
    nextSchoolDayKey: nextKey,
  };
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

export type SchoolHours = { starts_at: string | null; ends_at: string | null };

/** Lessons in school order: by period (those without one after, by `sort`), then time. */
export function sortLessons(lessons: PlanItemRow[]): PlanItemRow[] {
  const rank = (i: PlanItemRow) => i.period ?? Number.POSITIVE_INFINITY;
  return [...lessons].sort(
    (a, b) =>
      (rank(a) === rank(b) ? 0 : rank(a) < rank(b) ? -1 : 1) ||
      (a.starts_at ?? "").localeCompare(b.starts_at ?? "") ||
      a.sort - b.sort,
  );
}

export type WeekPlanDay = {
  key: string;
  date: CalendarDate;
  /** "08:15–14:00" when the plan says so. */
  hours: string | null;
  lessons: PlanItemRow[];
  homework: PlanItemRow[];
  bring: PlanItemRow[];
  notes: PlanItemRow[];
};

/** Whether a day has nothing at all: no school hours, lessons, homework, things to bring or notes. */
export function isWeekPlanDayEmpty(day: Pick<WeekPlanDay, "hours" | "lessons" | "homework" | "bring" | "notes">): boolean {
  return !day.hours && day.lessons.length + day.homework.length + day.bring.length + day.notes.length === 0;
}

/** Drops the days for which `isEmpty` is true (kids' week views show no empty weekdays). */
export function withoutEmptyDays<T>(days: T[], isEmpty: (day: T) => boolean): T[] {
  return days.filter((d) => !isEmpty(d));
}

/**
 * The "Ukeplan" cards: Monday–Friday always (unless `hideEmpty`, which drops every day with nothing on it),
 * Saturday/Sunday only when they have items, and (current week only) no days before today.
 * `schoolDays` maps "YYYY-MM-DD" to the school hours.
 */
export function weekPlan(
  items: PlanItemRow[],
  schoolDays: Map<string, SchoolHours>,
  monday: CalendarDate,
  todayKey: string,
  weekOffset: number,
  hideEmpty = false,
): WeekPlanDay[] {
  const days = groupItemsByDay(items, monday, 7).filter((d, i) => i < 5 || d.items.length > 0);
  const planned = visibleDays(days, todayKey, weekOffset).map((d) => {
    const of = (kind: PlanItemKind) => d.items.filter((i) => i.kind === kind);
    const hours = schoolDays.get(d.key);
    return {
      key: d.key,
      date: d.date,
      hours: formatSchoolHours(hours?.starts_at, hours?.ends_at),
      lessons: sortLessons(of("lesson")),
      homework: of("homework"),
      bring: d.items.filter(isBringItem),
      notes: d.items.filter(isNoteItem),
    };
  });
  return hideEmpty ? withoutEmptyDays(planned, isWeekPlanDayEmpty) : planned;
}
