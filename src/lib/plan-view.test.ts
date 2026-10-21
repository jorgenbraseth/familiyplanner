import { describe, expect, it } from "vitest";
import { dayKey } from "./dates";
import type { PlanItemKind, PlanItemRow } from "./plan";
import { formatSchoolHours, formatWeekday, groupItemsByDay, isWeekPlanDayEmpty, nextSchoolDay, todayView, visibleDays, weekPlan, withoutEmptyDays } from "./plan-view";

let n = 0;
function item(date: string, kind: PlanItemKind, sort = 0, text = "Test"): PlanItemRow {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    document_id: "00000000-0000-4000-8000-00000000ffff",
    member_id: "00000000-0000-4000-8000-00000000eeee",
    date,
    kind,
    subject: null,
    text,
    done: false,
    sort,
    period: null,
    starts_at: null,
    ends_at: null,
  };
}

// 2026-10-19 is a Monday.
const monday = { year: 2026, month: 10, day: 19 };

describe("groupItemsByDay", () => {
  it("returns every day, ordering by kind then sort", () => {
    const items = [
      item("2026-10-19", "note", 0, "n"),
      item("2026-10-19", "bring", 0, "b"),
      item("2026-10-19", "homework", 0, "h"),
      item("2026-10-19", "lesson", 2, "l2"),
      item("2026-10-19", "lesson", 1, "l1"),
      item("2026-10-21", "lesson", 0, "w"),
      item("2026-10-30", "lesson", 0, "outside"),
    ];
    const days = groupItemsByDay(items, monday, 7);
    expect(days).toHaveLength(7);
    expect(days[0].key).toBe("2026-10-19");
    expect(days[0].items.map((i) => i.text)).toEqual(["l1", "l2", "h", "b", "n"]);
    expect(days[1].items).toEqual([]);
    expect(days[2].items.map((i) => i.text)).toEqual(["w"]);
  });
});

describe("nextSchoolDay", () => {
  it.each([
    ["2026-10-19", "2026-10-20"], // Monday → Tuesday
    ["2026-10-22", "2026-10-23"], // Thursday → Friday
    ["2026-10-23", "2026-10-26"], // Friday → Monday
    ["2026-10-24", "2026-10-26"], // Saturday → Monday
    ["2026-10-25", "2026-10-26"], // Sunday → Monday
  ])("after %s is %s", (today, expected) => {
    const [year, month, day] = today.split("-").map(Number);
    expect(dayKey(nextSchoolDay({ year, month, day }))).toBe(expected);
  });
});

describe("todayView", () => {
  const items = [
    item("2026-10-21", "lesson", 1, "Matte"),
    item("2026-10-21", "bring", 0, "Gymtøy"),
    item("2026-10-21", "note", 0, "Foreldremøte"),
    item("2026-10-21", "homework", 0, "Today's homework"),
    item("2026-10-22", "homework", 0, "Lesing"),
    item("2026-10-22", "lesson", 0, "Norsk"),
    item("2026-10-23", "homework", 0, "Later"),
  ];

  it("splits today and homework due next school day", () => {
    const view = todayView(items, { year: 2026, month: 10, day: 21 });
    expect(view.lessons.map((i) => i.text)).toEqual(["Matte"]);
    expect(view.bring.map((i) => i.text)).toEqual(["Gymtøy"]);
    expect(view.notes.map((i) => i.text)).toEqual(["Foreldremøte"]);
    expect(view.homeworkDue.map((i) => i.text)).toEqual(["Lesing"]);
    expect(view.nextSchoolDayKey).toBe("2026-10-22");
  });

  it("looks to Monday on a Friday", () => {
    const view = todayView([item("2026-10-26", "homework", 0, "Mandag")], { year: 2026, month: 10, day: 23 });
    expect(view.homeworkDue.map((i) => i.text)).toEqual(["Mandag"]);
  });
});

describe("formatWeekday", () => {
  it("gives the capitalised weekday only", () => {
    expect(formatWeekday(monday)).toBe("Mandag");
    expect(formatWeekday({ year: 2026, month: 10, day: 25 })).toBe("Søndag");
  });
});

describe("visibleDays", () => {
  const days = ["2026-10-19", "2026-10-20", "2026-10-21"].map((key) => ({ key }));
  it("hides past days in the current week only", () => {
    expect(visibleDays(days, "2026-10-20", 0).map((d) => d.key)).toEqual(["2026-10-20", "2026-10-21"]);
    expect(visibleDays(days, "2026-10-20", 1)).toHaveLength(3);
    expect(visibleDays(days, "2026-10-20", -1)).toHaveLength(3);
  });
});

describe("formatSchoolHours", () => {
  it("formats known times", () => {
    expect(formatSchoolHours("08:15:00", "14:00:00")).toBe("08:15–14:00");
    expect(formatSchoolHours("8:15", null)).toBe("08:15");
    expect(formatSchoolHours(null, null)).toBeNull();
  });
});

describe("weekPlan", () => {
  const lesson = (date: string, period: number | null, text: string, sort = 0) => ({
    ...item(date, "lesson", sort, text),
    period,
    starts_at: period ? `0${7 + period}:15:00` : null,
  });
  const items = [
    lesson("2026-10-21", 2, "Norsk"),
    lesson("2026-10-21", 1, "Matte"),
    lesson("2026-10-21", null, "Fri", 5),
    item("2026-10-21", "homework", 0, "Les"),
    item("2026-10-24", "note", 0, "Tur"),
  ];
  const hours = new Map([["2026-10-21", { starts_at: "08:15:00", ends_at: "14:00:00" }]]);

  it("orders lessons by period, adds hours and keeps weekends only with items", () => {
    const days = weekPlan(items, hours, monday, "2026-10-19", 1);
    expect(days.map((d) => d.key)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
    const wed = days[2];
    expect(wed.lessons.map((l) => l.text)).toEqual(["Matte", "Norsk", "Fri"]);
    expect(wed.hours).toBe("08:15–14:00");
    expect(wed.homework).toHaveLength(1);
    expect(days[0].hours).toBeNull();
  });

  it("hides past days in the current week", () => {
    const days = weekPlan(items, hours, monday, "2026-10-22", 0);
    expect(days.map((d) => d.key)).toEqual(["2026-10-22", "2026-10-23", "2026-10-24"]);
  });
});

describe("empty days", () => {
  const empty = { hours: null, lessons: [], homework: [], bring: [], notes: [] };

  it("is empty only when there are no hours and no items", () => {
    expect(isWeekPlanDayEmpty(empty)).toBe(true);
    expect(isWeekPlanDayEmpty({ ...empty, hours: "08:15–14:00" })).toBe(false);
    expect(isWeekPlanDayEmpty({ ...empty, homework: [item("2026-10-20", "homework")] })).toBe(false);
    expect(isWeekPlanDayEmpty({ ...empty, notes: [item("2026-10-20", "note")] })).toBe(false);
  });

  it("weekPlan can drop empty days, and gives nothing for an empty week", () => {
    const items = [item("2026-10-21", "homework", 0, "Les")];
    const hours = new Map([["2026-10-23", { starts_at: null, ends_at: "13:00:00" }]]);
    expect(weekPlan(items, hours, monday, "2026-10-19", 1, true).map((d) => d.key)).toEqual(["2026-10-21", "2026-10-23"]);
    expect(weekPlan(items, hours, monday, "2026-10-19", 1).map((d) => d.key)).toHaveLength(5);
    expect(weekPlan([], new Map(), monday, "2026-10-19", 1, true)).toEqual([]);
  });

  it("withoutEmptyDays keeps the order of the days that have something", () => {
    const days = [{ key: "a", n: 0 }, { key: "b", n: 2 }, { key: "c", n: 1 }];
    expect(withoutEmptyDays(days, (d) => d.n === 0).map((d) => d.key)).toEqual(["b", "c"]);
  });
});
