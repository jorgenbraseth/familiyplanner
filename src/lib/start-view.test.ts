import { describe, expect, it } from "vitest";
import type { PlanItemRow } from "./plan";
import type { RoutineItemRow } from "./routines";
import { isTomorrow, lessonLine, slotView } from "./start-view";

const item = (id: string, slot: "morning" | "evening", sort: number, name = id): RoutineItemRow => ({
  id,
  member_id: "kid",
  slot,
  name,
  sort,
  created_at: "2026-10-20T08:00:00Z",
});

describe("slotView", () => {
  const items = [item("a", "morning", 2), item("b", "morning", 1), item("c", "evening", 0)];

  it("keeps one slot in sort order and counts only its checks", () => {
    const view = slotView(items, [{ item_id: "b" }, { item_id: "c" }], "morning");
    expect(view.items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(view.checkedIds).toEqual(["b"]);
    expect(view.progress).toEqual({ done: 1, total: 2, complete: false });
  });

  it("is complete when every item is checked", () => {
    const view = slotView(items, [{ item_id: "a" }, { item_id: "b" }], "morning");
    expect(view.progress.complete).toBe(true);
  });

  it("is empty and never complete without items", () => {
    const view = slotView([], [], "evening");
    expect(view.progress).toEqual({ done: 0, total: 0, complete: false });
  });
});

describe("lessonLine", () => {
  const lesson = (over: Partial<PlanItemRow>): PlanItemRow =>
    ({ id: "l", subject: "Norsk", text: "Lesing", period: 2, starts_at: "09:00:00", ends_at: "09:45:00", ...over }) as PlanItemRow;

  it("shows period, time range and subject", () => {
    expect(lessonLine(lesson({}))).toEqual({ id: "l", period: 2, time: "09:00–09:45", title: "Norsk" });
  });

  it("falls back to the text and handles missing times", () => {
    expect(lessonLine(lesson({ subject: null, starts_at: null, ends_at: null, period: null }))).toEqual({
      id: "l",
      period: null,
      time: null,
      title: "Lesing",
    });
  });
});

describe("isTomorrow", () => {
  it("is true for the next day and false across a weekend", () => {
    expect(isTomorrow({ year: 2026, month: 10, day: 21 }, { year: 2026, month: 10, day: 22 })).toBe(true);
    expect(isTomorrow({ year: 2026, month: 10, day: 23 }, { year: 2026, month: 10, day: 26 })).toBe(false);
  });
});
