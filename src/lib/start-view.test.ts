import { describe, expect, it } from "vitest";
import type { RoutineItemRow } from "./routines";
import { isTomorrow, slotView, starGrid, starsLeft, starsLeftText } from "./start-view";

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

describe("isTomorrow", () => {
  it("is true for the next day and false across a weekend", () => {
    expect(isTomorrow({ year: 2026, month: 10, day: 21 }, { year: 2026, month: 10, day: 22 })).toBe(true);
    expect(isTomorrow({ year: 2026, month: 10, day: 23 }, { year: 2026, month: 10, day: 26 })).toBe(false);
  });
});

describe("starsLeftText", () => {
  it("counts the stars left to the next reward", () => {
    expect(starsLeft(16, 30)).toBe(14);
    expect(starsLeftText(15, 20)).toBe("5 stjerner igjen!");
  });
  it("uses the singular for one star", () => {
    expect(starsLeftText(29, 30)).toBe("1 stjerne igjen!");
  });
  it("is empty when there is no next reward", () => {
    expect(starsLeft(30, null)).toBe(0);
    expect(starsLeftText(30, null)).toBeNull();
    expect(starsLeftText(30, 30)).toBeNull();
  });
});

describe("starGrid", () => {
  it("fills the approved stars up to the next milestone", () => {
    expect(starGrid(15, 20, 40)).toEqual({ filled: 15, empty: 5, total: 20, reached: false });
  });
  it("starts empty at zero stars", () => {
    expect(starGrid(0, 10, 30)).toEqual({ filled: 0, empty: 10, total: 10, reached: false });
  });
  it("shows every goal star filled once the goal is reached", () => {
    expect(starGrid(30, null, 30)).toEqual({ filled: 30, empty: 0, total: 30, reached: true });
    expect(starGrid(35, null, 30)).toEqual({ filled: 30, empty: 0, total: 30, reached: true });
  });
  it("handles a milestone beyond 30", () => {
    expect(starGrid(31, 40, 60)).toEqual({ filled: 31, empty: 9, total: 40, reached: false });
  });
});
