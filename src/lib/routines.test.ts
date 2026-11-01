import { describe, expect, it } from "vitest";
import { parseMinutes, routineCollapsed, routineProgress, wallClockMinutes } from "./routines";

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

describe("wallClockMinutes", () => {
  it("follows the Copenhagen wall clock, summer and winter", () => {
    expect(wallClockMinutes(new Date("2026-10-21T06:15:00Z"))).toBe(8 * 60 + 15); // CEST
    expect(wallClockMinutes(new Date("2026-01-14T06:15:00Z"))).toBe(7 * 60 + 15); // CET
    expect(wallClockMinutes(new Date("2026-10-21T22:00:00Z"))).toBe(0);
  });
});

describe("parseMinutes", () => {
  it("reads HH:MM and HH:MM:SS, rejects the rest", () => {
    expect(parseMinutes("18:00:00")).toBe(1080);
    expect(parseMinutes("9:05")).toBe(545);
    expect(parseMinutes("24:00")).toBeNull();
    expect(parseMinutes("soon")).toBeNull();
    expect(parseMinutes(null)).toBeNull();
  });
});
