import { describe, expect, it } from "vitest";
import { dayHref, isoWeekAtOffset, shownDay, weekHref } from "./day-nav";

const today = { year: 2026, month: 10, day: 22 };

describe("dayHref", () => {
  it("links today to the bare start page", () => {
    expect(dayHref(today, today)).toBe("/");
  });
  it("links other days with ?dag=", () => {
    expect(dayHref({ year: 2026, month: 10, day: 23 }, today)).toBe("/?dag=2026-10-23");
    expect(dayHref({ year: 2026, month: 10, day: 21 }, today)).toBe("/?dag=2026-10-21");
  });
});

describe("weekHref", () => {
  it("uses the bare path for this week", () => {
    expect(weekHref("/family", 0)).toBe("/family");
  });
  it("adds ?week= for other weeks", () => {
    expect(weekHref("/family", 1)).toBe("/family?week=1");
    expect(weekHref("/ukeplan", -2)).toBe("/ukeplan?week=-2");
  });
});

describe("shownDay", () => {
  const target = { year: 2026, month: 10, day: 24 };
  it("shows the page's day when nothing is pending", () => {
    expect(shownDay(today, target, false)).toBe(today);
    expect(shownDay(today, null, true)).toBe(today);
  });
  it("shows the target while pending", () => {
    expect(shownDay(today, target, true)).toBe(target);
  });
});

describe("isoWeekAtOffset", () => {
  it("counts weeks from the current one, across the year end", () => {
    expect(isoWeekAtOffset(today, 0)).toBe(43);
    expect(isoWeekAtOffset(today, 1)).toBe(44);
    expect(isoWeekAtOffset(today, -1)).toBe(42);
    expect(isoWeekAtOffset({ year: 2026, month: 12, day: 28 }, 1)).toBe(1);
  });
});
