import { describe, expect, it } from "vitest";
import { carriedItems, carriedOverHomework, carryLabel, CARRY_OVER_DAYS, dueKeyOf, type CarryCandidate } from "./homework-carry";
import type { PlanItemRow } from "./plan";

// Wednesday 2026-10-21.
const today = { year: 2026, month: 10, day: 21 };

function hw(date: string, over: Partial<CarryCandidate> = {}): CarryCandidate {
  return { date, kind: "homework", done: false, whole_week: false, sort: 0, ...over };
}

describe("carriedOverHomework", () => {
  it("keeps unfinished homework due today or earlier, oldest first", () => {
    const result = carriedOverHomework(
      [hw("2026-10-21", { sort: 1 }), hw("2026-10-19"), hw("2026-10-20", { sort: 2 }), hw("2026-10-20", { sort: 1 })],
      today,
    );
    expect(result.map((i) => `${i.date}/${i.sort}`)).toEqual(["2026-10-19/0", "2026-10-20/1", "2026-10-20/2", "2026-10-21/1"]);
  });

  it("drops done items, future items and other kinds", () => {
    const result = carriedOverHomework(
      [hw("2026-10-20", { done: true }), hw("2026-10-22"), hw("2026-10-20", { kind: "message" }), hw("2026-10-20")],
      today,
    );
    expect(result).toHaveLength(1);
  });

  it("only reaches back CARRY_OVER_DAYS days", () => {
    expect(CARRY_OVER_DAYS).toBe(14);
    const result = carriedOverHomework([hw("2026-10-07"), hw("2026-10-06")], today);
    expect(result.map((i) => i.date)).toEqual(["2026-10-07"]);
  });

  it("carries a whole-week item only once its week is over", () => {
    // Week of Monday 2026-10-19 is the current week: it stays in "Denne uken".
    expect(carriedOverHomework([hw("2026-10-19", { whole_week: true })], today)).toEqual([]);
    expect(carriedOverHomework([hw("2026-10-19", { whole_week: true })], { year: 2026, month: 10, day: 26 })).toHaveLength(1);
    // Not on the Sunday itself.
    expect(carriedOverHomework([hw("2026-10-19", { whole_week: true })], { year: 2026, month: 10, day: 25 })).toEqual([]);
    expect(dueKeyOf(hw("2026-10-19", { whole_week: true }))).toBe("2026-10-25");
  });

  it("drops a whole-week item older than the window", () => {
    expect(carriedOverHomework([hw("2026-09-28", { whole_week: true })], today)).toEqual([]);
  });
});

describe("carryLabel", () => {
  it("uses relative day names", () => {
    expect(carryLabel(hw("2026-10-21"), today)).toBe("Til i dag");
    expect(carryLabel(hw("2026-10-20"), today)).toBe("Fra i går");
    expect(carryLabel(hw("2026-10-19"), today)).toBe("Fra mandag");
    expect(carryLabel(hw("2026-10-12"), today)).toBe("Fra mandag 12. oktober");
    expect(carryLabel(hw("2026-10-12", { whole_week: true }), today)).toBe("Fra uke 42");
  });
});

describe("carriedItems", () => {
  it("pairs each item with its label", () => {
    const row = { ...hw("2026-10-19"), id: "x" } as PlanItemRow;
    expect(carriedItems([row], today)).toEqual([{ item: row, label: "Fra mandag" }]);
  });
});
