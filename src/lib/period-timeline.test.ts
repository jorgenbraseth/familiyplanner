import { describe, expect, it } from "vitest";
import { periodTimeline, type PeriodLine } from "./plan-view";

const p = (id: string, startsAt: string | null, endsAt: string | null): PeriodLine => ({
  id,
  period: 1,
  time: null,
  title: id,
  startsAt,
  endsAt,
});

const shape = (entries: ReturnType<typeof periodTimeline>) =>
  entries.map((e) =>
    e.type === "period" ? e.line.id : e.divider.kind === "time" ? e.divider.time : `${e.divider.from}>${e.divider.to}`,
  );

describe("periodTimeline", () => {
  it("shows one time when a period ends as the next starts", () => {
    expect(shape(periodTimeline([p("a", "08:15", "09:00"), p("b", "09:00", "09:45")]))).toEqual([
      "08:15", "a", "09:00", "b", "09:45",
    ]);
  });
  it("shows both times as a break when there is a gap", () => {
    expect(shape(periodTimeline([p("a", "09:00", "10:15"), p("b", "10:30", "11:15")]))).toEqual([
      "09:00", "a", "10:15>10:30", "b", "11:15",
    ]);
  });
  it("handles a single period", () => {
    expect(shape(periodTimeline([p("a", "08:15", "09:00")]))).toEqual(["08:15", "a", "09:00"]);
  });
  it("falls back to the school hours for the first and last divider", () => {
    const hours = { starts_at: "08:00:00", ends_at: "14:00:00" };
    expect(shape(periodTimeline([p("a", null, null)], hours))).toEqual(["08:00", "a", "14:00"]);
  });
  it("leaves out dividers without a known time", () => {
    expect(shape(periodTimeline([p("a", null, null), p("b", null, null)]))).toEqual(["a", "b"]);
    expect(shape(periodTimeline([p("a", "08:15", null), p("b", null, "10:00")]))).toEqual(["08:15", "a", "b", "10:00"]);
  });
  it("uses the one known time between periods", () => {
    expect(shape(periodTimeline([p("a", "08:15", "09:00"), p("b", null, null)]))).toEqual(["08:15", "a", "09:00", "b"]);
  });
  it("is empty without periods", () => {
    expect(periodTimeline([])).toEqual([]);
  });
});
