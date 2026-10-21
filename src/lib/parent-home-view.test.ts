import { describe, expect, it } from "vitest";
import { parseUploadDefaults, schoolEndSummary, uploadHref, uploadWeekFor } from "./parent-home-view";

const day = (year: number, month: number, d: number) => ({ year, month, day: d });

describe("uploadWeekFor", () => {
  it.each([
    [day(2026, 10, 19), 43], // Monday
    [day(2026, 10, 22), 43], // Thursday
    [day(2026, 10, 23), 44], // Friday
    [day(2026, 10, 25), 44], // Sunday
  ])("%j gives week %i", (today, week) => {
    expect(uploadWeekFor(today)).toEqual({ isoYear: 2026, isoWeek: week });
  });

  it("rolls into the next ISO year at the end of the year", () => {
    expect(uploadWeekFor(day(2026, 12, 31))).toEqual({ isoYear: 2026, isoWeek: 53 }); // Thursday
    expect(uploadWeekFor(day(2027, 1, 1))).toEqual({ isoYear: 2027, isoWeek: 1 }); // Friday
    expect(uploadWeekFor(day(2025, 12, 26))).toEqual({ isoYear: 2026, isoWeek: 1 }); // Friday
  });
});

describe("uploadHref and parseUploadDefaults", () => {
  const ids = ["kid-a", "kid-b"];
  const fallback = { isoYear: 2026, isoWeek: 43 };

  it("round-trips a link", () => {
    const href = uploadHref("kid-b", { isoYear: 2026, isoWeek: 44 });
    expect(href).toBe("/documents/new?child=kid-b&type=week_schedule&week=44&year=2026");
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseUploadDefaults(params, ids, fallback)).toEqual({ childId: "kid-b", type: "week_schedule", week: 44, year: 2026 });
  });

  it("falls back on anything invalid", () => {
    expect(parseUploadDefaults({ child: "stranger", type: "x", week: "54", year: "1999" }, ids, fallback)).toEqual({
      childId: "kid-a",
      type: "week_schedule",
      week: 43,
      year: 2026,
    });
    expect(parseUploadDefaults({ week: "0", year: "abc" }, ids, fallback)).toMatchObject({ week: 43, year: 2026 });
    expect(parseUploadDefaults({ week: "1.5", year: "20 26" }, ids, fallback)).toMatchObject({ week: 43, year: 2026 });
    expect(parseUploadDefaults({}, [], fallback).childId).toBeUndefined();
  });

  it("accepts other document types and takes the first of repeated params", () => {
    expect(parseUploadDefaults({ type: "homework", week: ["53", "2"], child: ["kid-b", "kid-a"] }, ids, fallback)).toMatchObject({
      childId: "kid-b",
      type: "homework",
      week: 53,
    });
  });
});

describe("schoolEndSummary", () => {
  it("shows the end time", () => {
    expect(schoolEndSummary({ starts_at: "08:15:00", ends_at: "14:00:00" }, 5)).toEqual({ kind: "time", time: "14:00" });
  });
  it("is unknown when the school day has no end time", () => {
    expect(schoolEndSummary({ starts_at: "08:15:00", ends_at: null }, 0)).toEqual({ kind: "unknown" });
    expect(schoolEndSummary(undefined, 3)).toEqual({ kind: "unknown" });
  });
  it("is none without a school day", () => {
    expect(schoolEndSummary(undefined, 0)).toEqual({ kind: "none" });
  });
});
