import { describe, expect, it } from "vitest";
import { carriedItems, carriedOverHomework, carryLabel, carryQueryFromKey, dueKeyOf, type CarryCandidate } from "./homework-carry";
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

  it("only carries within the current ISO week (Monday of this week to today)", () => {
    // Monday 2026-10-19 is in; the Sunday before is not.
    const result = carriedOverHomework([hw("2026-10-18"), hw("2026-10-19"), hw("2026-10-12")], today);
    expect(result.map((i) => i.date)).toEqual(["2026-10-19"]);
    // On a Monday only today's own items count, nothing from last week.
    expect(carriedOverHomework([hw("2026-10-23"), hw("2026-10-26")], { year: 2026, month: 10, day: 26 }).map((i) => i.date)).toEqual(["2026-10-26"]);
    // On a Sunday the week's Monday still counts.
    expect(carriedOverHomework([hw("2026-10-19")], { year: 2026, month: 10, day: 25 })).toHaveLength(1);
  });

  it("never carries a whole-week item, not even once its week is over", () => {
    expect(carriedOverHomework([hw("2026-10-19", { whole_week: true })], today)).toEqual([]);
    expect(carriedOverHomework([hw("2026-10-19", { whole_week: true })], { year: 2026, month: 10, day: 26 })).toEqual([]);
    expect(dueKeyOf(hw("2026-10-19", { whole_week: true }))).toBe("2026-10-25");
  });
});

describe("carryQueryFromKey", () => {
  it("is Monday of the current week", () => {
    expect(carryQueryFromKey(today)).toBe("2026-10-19");
    expect(carryQueryFromKey({ year: 2026, month: 10, day: 25 })).toBe("2026-10-19");
  });
});

describe("carryLabel", () => {
  it("uses relative day names", () => {
    expect(carryLabel(hw("2026-10-21"), today)).toBe("Til i dag");
    expect(carryLabel(hw("2026-10-20"), today)).toBe("Fra i går");
    expect(carryLabel(hw("2026-10-19"), today)).toBe("Fra mandag");
    expect(carryLabel(hw("2026-10-12"), today)).toBe("Fra mandag 12. oktober");
  });
});

describe("carriedItems", () => {
  it("pairs each item with its label", () => {
    const row = { ...hw("2026-10-19"), id: "x" } as PlanItemRow;
    expect(carriedItems([row], today)).toEqual([{ item: row, label: "Fra mandag" }]);
  });
});
