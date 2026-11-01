// Which sections of the kids' overview (start page and Familieskjerm) show for the selected day, and which homework.
// Pure helpers, no database or server access.

import { daysBetween, dayKey, mondayOf, type CalendarDate } from "./dates";
import type { CarriedItem } from "./homework-carry";
import type { PlanItemRow } from "./plan";
import { isTomorrow } from "./start-view";
import { homeworkVisible } from "./start-visibility";

export type OverviewHomework = {
  /** Whether the Lekser section is rendered at all. */
  show: boolean;
  /** Unfinished homework from earlier days of this week; today only. */
  carried: CarriedItem[];
  /** Homework due on the next school day after the selected day. */
  items: PlanItemRow[];
  /** Whole-week homework that is not done; today only. */
  weekItems: PlanItemRow[];
  /** Heading says "til i morgen" (today only; other days name the weekday). */
  tomorrow: boolean;
  /** Another day than today: show a muted "Ingen lekser" when there is none, instead of the cheerful empty line. */
  otherDay: boolean;
};

export type DayOverview = {
  isToday: boolean;
  /** Morgenstell/Kveldstell are today's checklists. */
  showRoutines: boolean;
  /** "Min dag": today it goes away once nothing more happens; other days always show. */
  showDay: boolean;
  homework: OverviewHomework;
  /** "Alt er gjort for i dag" (today only). */
  allClear: boolean;
};

/**
 * What the overview shows for the selected day. Today: routines in their window, "Min dag" while something is left,
 * Lekser with carried-over, due and this-week homework while any is not done. Any other day (past or future): the
 * whole day of that date, no routines, and Lekser = only the homework due on the next school day after that day
 * (nothing carried over, no "Denne uken"), always shown.
 *
 * `homeworkDue` and `weekHomework` come from `todayView(items, selected, ...)`, whose next school day is relative to
 * the selected day (Friday and the weekend give Monday of the next week).
 */
export function overviewForDay(input: {
  today: CalendarDate;
  selected: CalendarDate;
  /** Today only: whether anything in "Min dag" is still ahead (`dayStillActive`). */
  dayActive: boolean;
  /** Today only: how many routine lists are visible now. */
  visibleRoutineCount: number;
  carriedOver: readonly CarriedItem[];
  homeworkDue: readonly PlanItemRow[];
  weekHomework: readonly PlanItemRow[];
  nextSchoolDay: CalendarDate;
}): DayOverview {
  const isToday = dayKey(input.today) === dayKey(input.selected);
  if (!isToday) {
    return {
      isToday,
      showRoutines: false,
      showDay: true,
      homework: { show: true, carried: [], items: [...input.homeworkDue], weekItems: [], tomorrow: false, otherDay: true },
      allClear: false,
    };
  }
  const show = homeworkVisible(
    input.carriedOver.map((c) => c.item),
    input.homeworkDue,
    input.weekHomework,
  );
  return {
    isToday,
    showRoutines: true,
    showDay: input.dayActive,
    homework: {
      show,
      carried: [...input.carriedOver],
      items: [...input.homeworkDue],
      weekItems: input.weekHomework.filter((i) => !i.done),
      tomorrow: isTomorrow(input.today, input.nextSchoolDay),
      otherDay: false,
    },
    allClear: input.visibleRoutineCount === 0 && !input.dayActive && !show,
  };
}

/** Whole weeks between this week and the selected day's week (0 unless the day is in another week). */
export function weekOffsetFor(today: CalendarDate, selected: CalendarDate): number {
  return Math.round(daysBetween(mondayOf(today), mondayOf(selected)) / 7);
}
