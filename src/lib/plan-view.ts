// Pure helpers that shape a child's plan items for the Today and This week views.

import { addDays, dayKey, type CalendarDate } from "./dates";
import type { PlanItemKind, PlanItemRow } from "./plan";

const KIND_ORDER: Record<PlanItemKind, number> = { lesson: 0, homework: 1, bring: 2, note: 3 };

export type DayItems = { key: string; date: CalendarDate; items: PlanItemRow[] };

function compareItems(a: PlanItemRow, b: PlanItemRow): number {
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.sort - b.sort;
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
  return {
    lessons: todays("lesson"),
    bring: todays("bring"),
    notes: todays("note"),
    homeworkDue: sorted.filter((i) => i.date === nextKey && i.kind === "homework"),
    nextSchoolDay: next,
    nextSchoolDayKey: nextKey,
  };
}
