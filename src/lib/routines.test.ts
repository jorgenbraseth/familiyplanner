import { describe, expect, it } from "vitest";
import { currentSlot, routineCollapsed, routineProgress } from "./routines";

describe("currentSlot", () => {
  // 2026-10-21 is CEST (UTC+2); 2026-01-14 is CET (UTC+1).
  it.each([
    ["2026-10-21T04:00:00Z", "08:15:00", "morning", false], // 06:00
    ["2026-10-21T06:14:00Z", "08:15:00", "morning", false], // 08:14
    ["2026-10-21T06:15:00Z", "08:15:00", "evening", true], // 08:15, school starts
    ["2026-10-21T14:59:00Z", "08:15:00", "evening", true], // 16:59
    ["2026-10-21T15:00:00Z", "08:15:00", "evening", false], // 17:00
    ["2026-10-21T21:59:00Z", "08:15:00", "evening", false], // 23:59
    ["2026-10-21T22:00:00Z", "08:15:00", "morning", false], // 00:00 next day
  ])("%s with school at %s is %s (upcoming %s)", (iso, school, slot, upcoming) => {
    expect(currentSlot(new Date(iso), school)).toEqual({ slot, upcoming });
  });

  it("falls back to 12:00 without a school start", () => {
    expect(currentSlot(new Date("2026-10-21T09:59:00Z"), null)).toEqual({ slot: "morning", upcoming: false });
    expect(currentSlot(new Date("2026-10-21T10:00:00Z"), null)).toEqual({ slot: "evening", upcoming: true });
  });

  it("falls back to 12:00 for an unparsable time", () => {
    expect(currentSlot(new Date("2026-10-21T08:00:00Z"), "soon")).toEqual({ slot: "morning", upcoming: false });
  });

  it("uses winter time in winter", () => {
    expect(currentSlot(new Date("2026-01-14T10:59:00Z"), null)).toEqual({ slot: "morning", upcoming: false });
    expect(currentSlot(new Date("2026-01-14T11:00:00Z"), null)).toEqual({ slot: "evening", upcoming: true });
    expect(currentSlot(new Date("2026-01-14T15:59:00Z"), null)).toEqual({ slot: "evening", upcoming: true });
    expect(currentSlot(new Date("2026-01-14T16:00:00Z"), null)).toEqual({ slot: "evening", upcoming: false });
  });

  it("follows the wall clock on DST change days", () => {
    // 2026-03-29: clocks go 02:00 -> 03:00 (UTC+1 to UTC+2). 00:30 CET = 23:30Z the day before.
    expect(currentSlot(new Date("2026-03-28T23:30:00Z"), null)).toEqual({ slot: "morning", upcoming: false });
    // 12:00 CEST = 10:00Z.
    expect(currentSlot(new Date("2026-03-29T09:59:00Z"), null)).toEqual({ slot: "morning", upcoming: false });
    expect(currentSlot(new Date("2026-03-29T10:00:00Z"), null)).toEqual({ slot: "evening", upcoming: true });
    // 2026-10-25: clocks go 03:00 -> 02:00. 17:00 CET = 16:00Z.
    expect(currentSlot(new Date("2026-10-25T15:59:00Z"), null)).toEqual({ slot: "evening", upcoming: true });
    expect(currentSlot(new Date("2026-10-25T16:00:00Z"), null)).toEqual({ slot: "evening", upcoming: false });
    // Midnight CET after the change is 23:00Z.
    expect(currentSlot(new Date("2026-10-25T23:00:00Z"), null)).toEqual({ slot: "morning", upcoming: false });
  });
});

describe("routineProgress", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("counts checked items", () => {
    expect(routineProgress(items, [{ item_id: "a" }])).toEqual({ done: 1, total: 3, complete: false });
  });

  it("is complete when every item is checked, ignoring other items and duplicates", () => {
    const checks = [{ item_id: "a" }, { item_id: "b" }, { item_id: "b" }, { item_id: "c" }, { item_id: "x" }];
    expect(routineProgress(items, checks)).toEqual({ done: 3, total: 3, complete: true });
  });

  it("an empty routine is never complete", () => {
    expect(routineProgress([], [])).toEqual({ done: 0, total: 0, complete: false });
  });
});

describe("routineCollapsed", () => {
  it("folds up only a finished routine that is not opened", () => {
    expect(routineCollapsed(true, false)).toBe(true);
    expect(routineCollapsed(true, true)).toBe(false);
    expect(routineCollapsed(false, false)).toBe(false);
    expect(routineCollapsed(false, true)).toBe(false);
  });
});
