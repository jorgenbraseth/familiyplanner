import { describe, expect, it } from "vitest";
import { dateInTimeZone, isoWeekNow, isoWeekOf } from "./dates";

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
