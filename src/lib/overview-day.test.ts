import { describe, expect, it } from "vitest";
import { carriedItems } from "./homework-carry";
import { overviewForDay, weekOffsetFor } from "./overview-day";
import type { PlanItemRow } from "./plan";
import { todayView } from "./plan-view";
import type { CalendarDate } from "./dates";

const d = (s: string): CalendarDate => ({ year: Number(s.slice(0, 4)), month: Number(s.slice(5, 7)), day: Number(s.slice(8, 10)) });

let n = 0;
const hw = (date: string, over: Partial<PlanItemRow> = {}): PlanItemRow =>
  ({
    id: `hw${++n}`,
    document_id: "doc",
    member_id: "m",
    date,
    kind: "homework",
    subject: null,
    text: "Les",
    done: false,
    sort: n,
    audience: "both",
    whole_week: false,
    period: null,
    starts_at: null,
    ends_at: null,
    ...over,
  }) as PlanItemRow;

// Week of Monday 2026-10-26; Monday after is 2026-11-02.
const items = [
  hw("2026-10-26"), // Monday, unfinished
  hw("2026-10-28"),
  hw("2026-10-29"),
  hw("2026-10-30"),
  hw("2026-11-02"), // next Monday
  hw("2026-10-26", { whole_week: true, text: "Hele uken" }),
];

function run(todayKey: string, selectedKey: string, dayActive = true, visibleRoutineCount = 0) {
  const today = d(todayKey);
  const selected = d(selectedKey);
  const view = todayView(items, selected);
  return overviewForDay({
    today,
    selected,
    dayActive,
    visibleRoutineCount,
    carriedOver: carriedItems(items, today),
    homeworkDue: view.homeworkDue,
    weekHomework: view.weekHomework,
    nextSchoolDay: view.nextSchoolDay,
  });
}

describe("overviewForDay", () => {
  it("today: routines, carry-over, due homework and this week's list, as before", () => {
    const o = run("2026-10-28", "2026-10-28");
    expect(o.isToday).toBe(true);
    expect(o.showRoutines).toBe(true);
    expect(o.homework.show).toBe(true);
    expect(o.homework.carried.map((c) => c.item.date)).toEqual(["2026-10-26", "2026-10-28"]);
    expect(o.homework.items.map((i) => i.date)).toEqual(["2026-10-29"]);
    expect(o.homework.weekItems).toHaveLength(1);
    expect(o.homework.tomorrow).toBe(true);
    expect(o.homework.otherDay).toBe(false);
  });

  it("today: Min dag follows dayActive and everything hidden gives allClear", () => {
    expect(run("2026-10-28", "2026-10-28", false).showDay).toBe(false);
    expect(run("2026-10-28", "2026-10-28", true).allClear).toBe(false);
  });

  it("today with nothing left gives the all-clear line", () => {
    const today = d("2026-10-28");
    const o = overviewForDay({ today, selected: today, dayActive: false, visibleRoutineCount: 0, carriedOver: [], homeworkDue: [], weekHomework: [], nextSchoolDay: d("2026-10-29") });
    expect(o.allClear).toBe(true);
    expect(o.homework.show).toBe(false);
  });

  it("a future day shows only that day's homework: no carry-over, no this-week list, no routines", () => {
    const o = run("2026-10-28", "2026-10-29");
    expect(o.isToday).toBe(false);
    expect(o.showRoutines).toBe(false);
    expect(o.showDay).toBe(true);
    expect(o.homework.show).toBe(true);
    expect(o.homework.carried).toEqual([]);
    expect(o.homework.weekItems).toEqual([]);
    expect(o.homework.items.map((i) => i.date)).toEqual(["2026-10-30"]);
    expect(o.homework.tomorrow).toBe(false);
    expect(o.allClear).toBe(false);
  });

  it("ignores Min dag hiding and the routine count on other days", () => {
    const o = run("2026-10-28", "2026-10-29", false, 0);
    expect(o.showDay).toBe(true);
  });

  it("Friday looks ahead to Monday of the next week", () => {
    const o = run("2026-10-28", "2026-10-30");
    expect(o.homework.items.map((i) => i.date)).toEqual(["2026-11-02"]);
  });

  it("a weekend day also gives next Monday", () => {
    expect(run("2026-10-28", "2026-10-31").homework.items.map((i) => i.date)).toEqual(["2026-11-02"]);
    expect(run("2026-10-28", "2026-11-01").homework.items.map((i) => i.date)).toEqual(["2026-11-02"]);
  });

  it("a past day shows what was due the school day after it, even when done; empty stays shown", () => {
    const done = [hw("2026-10-28", { done: true })];
    const today = d("2026-10-30");
    const selected = d("2026-10-27");
    const view = todayView(done, selected);
    const o = overviewForDay({
      today,
      selected,
      dayActive: false,
      visibleRoutineCount: 0,
      carriedOver: [],
      homeworkDue: view.homeworkDue,
      weekHomework: view.weekHomework,
      nextSchoolDay: view.nextSchoolDay,
    });
    expect(o.homework.items).toHaveLength(1);
    const empty = run("2026-10-30", "2026-10-27"); // Tuesday: next school day Wednesday has an item
    expect(empty.homework.items).toHaveLength(1);
    const none = run("2026-10-28", "2026-10-26"); // Monday -> Tuesday, no item
    expect(none.homework.items).toEqual([]);
    expect(none.homework.show).toBe(true);
    expect(none.homework.otherDay).toBe(true);
  });
});

describe("weekOffsetFor", () => {
  it("is 0 within the week, including Sunday, and counts whole weeks", () => {
    expect(weekOffsetFor(d("2026-10-28"), d("2026-10-26"))).toBe(0);
    expect(weekOffsetFor(d("2026-10-28"), d("2026-11-01"))).toBe(0);
    expect(weekOffsetFor(d("2026-10-30"), d("2026-11-02"))).toBe(1);
    expect(weekOffsetFor(d("2026-10-28"), d("2026-10-25"))).toBe(-1);
  });
});
