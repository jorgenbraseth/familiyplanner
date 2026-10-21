import { describe, expect, it } from "vitest";
import { dateInTimeZone, dayKey, isoWeekNow, isoWeekOf, mondayOf, parseDayKey, startOfDay } from "./dates";

describe("isoWeekOf", () => {
  it.each([
    [{ year: 2026, month: 10, day: 21 }, { isoYear: 2026, isoWeek: 43 }],
    [{ year: 2026, month: 1, day: 1 }, { isoYear: 2026, isoWeek: 1 }],
    // 1 Jan 2027 is a Friday, so it belongs to week 53 of 2026.
    [{ year: 2027, month: 1, day: 1 }, { isoYear: 2026, isoWeek: 53 }],
    // 29 Dec 2025 is a Monday in week 1 of 2026.
    [{ year: 2025, month: 12, day: 29 }, { isoYear: 2026, isoWeek: 1 }],
    [{ year: 2025, month: 12, day: 28 }, { isoYear: 2025, isoWeek: 52 }],
  ])("%o is %o", (date, expected) => {
    expect(isoWeekOf(date)).toEqual(expected);
  });
});

describe("dateInTimeZone", () => {
  it("uses Copenhagen time, not UTC", () => {
    // 23:30 UTC on Sunday is already Monday in Copenhagen (UTC+1 in winter).
    const instant = new Date("2026-01-04T23:30:00Z");
    expect(dateInTimeZone(instant)).toEqual({ year: 2026, month: 1, day: 5 });
    expect(isoWeekNow(instant)).toEqual({ isoYear: 2026, isoWeek: 2 });
  });
});

describe("week and day helpers", () => {
  it("finds the Monday of an ISO week, also across a year boundary", () => {
    expect(mondayOf({ year: 2026, month: 10, day: 21 })).toEqual({ year: 2026, month: 10, day: 19 });
    expect(mondayOf({ year: 2027, month: 1, day: 3 })).toEqual({ year: 2026, month: 12, day: 28 });
    expect(mondayOf({ year: 2026, month: 10, day: 19 })).toEqual({ year: 2026, month: 10, day: 19 });
  });

  it("round-trips day keys", () => {
    expect(dayKey({ year: 2026, month: 3, day: 5 })).toBe("2026-03-05");
    expect(parseDayKey("2026-03-05")).toEqual({ year: 2026, month: 3, day: 5 });
  });

  it("finds local midnight in summer and winter time", () => {
    expect(startOfDay({ year: 2026, month: 10, day: 21 }).toISOString()).toBe("2026-10-20T22:00:00.000Z");
    expect(startOfDay({ year: 2026, month: 12, day: 1 }).toISOString()).toBe("2026-11-30T23:00:00.000Z");
    // DST starts 29 March 2026 at 02:00; midnight is still winter time.
    expect(startOfDay({ year: 2026, month: 3, day: 29 }).toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(startOfDay({ year: 2026, month: 3, day: 30 }).toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });
});
