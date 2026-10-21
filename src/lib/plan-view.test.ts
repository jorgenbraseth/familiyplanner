import { describe, expect, it } from "vitest";
import { dayKey } from "./dates";
import type { PlanItemKind, PlanItemRow } from "./plan";
import { groupItemsByDay, nextSchoolDay, todayView } from "./plan-view";

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
