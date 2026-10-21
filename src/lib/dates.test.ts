import { describe, expect, it } from "vitest";
import { dateInTimeZone, daysBetween, parseDayParam, relativeDayLabel, dayKey, isoWeekNow, isoWeekOf, mondayOf, mondayOfIsoWeek, parseDayKey, startOfDay } from "./dates";

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

describe("mondayOfIsoWeek", () => {
  it.each([
    [2026, 43, "2026-10-19"],
    [2026, 1, "2025-12-29"],
    [2026, 53, "2026-12-28"],
    [2025, 1, "2024-12-30"],
    [2024, 1, "2024-01-01"],
  ])("week %i-%i starts on %s", (isoYear, isoWeek, expected) => {
    expect(dayKey(mondayOfIsoWeek(isoYear, isoWeek))).toBe(expected);
  });

  it("round-trips with isoWeekOf", () => {
    const monday = mondayOfIsoWeek(2027, 10);
    expect(isoWeekOf(monday)).toEqual({ isoYear: 2027, isoWeek: 10 });
  });
});

describe("parseDayParam", () => {
  const today = { year: 2026, month: 10, day: 21 };
  it("accepts a real date within range", () => {
    expect(parseDayParam("2026-10-23", today)).toEqual({ year: 2026, month: 10, day: 23 });
    expect(parseDayParam(["2026-10-20", "x"], today)).toEqual({ year: 2026, month: 10, day: 20 });
  });
  it.each([undefined, "", "abc", "2026-02-30", "2026-13-01", "2026-1-5", "2027-10-21", "2026-08-01"])(
    "falls back to today for %s",
    (v) => expect(parseDayParam(v, today)).toEqual(today),
  );
  it("clamps at the limit", () => {
    expect(parseDayParam("2026-12-20", today)).toEqual({ year: 2026, month: 12, day: 20 });
    expect(parseDayParam("2026-12-21", today)).toEqual(today);
  });
});

describe("daysBetween", () => {
  it("counts days across months and DST", () => {
    expect(daysBetween({ year: 2026, month: 10, day: 21 }, { year: 2026, month: 10, day: 25 })).toBe(4);
    expect(daysBetween({ year: 2026, month: 10, day: 21 }, { year: 2026, month: 10, day: 20 })).toBe(-1);
    expect(daysBetween({ year: 2026, month: 10, day: 20 }, { year: 2026, month: 11, day: 3 })).toBe(14);
  });
});

describe("relativeDayLabel", () => {
  const today = { year: 2026, month: 10, day: 21 };
  it("names today, tomorrow and yesterday, else the weekday and date", () => {
    expect(relativeDayLabel(today, today)).toBe("I dag");
    expect(relativeDayLabel({ year: 2026, month: 10, day: 22 }, today)).toBe("I morgen");
    expect(relativeDayLabel({ year: 2026, month: 10, day: 20 }, today)).toBe("I går");
    expect(relativeDayLabel({ year: 2026, month: 10, day: 23 }, today)).toBe("fredag 23. oktober");
  });
});
