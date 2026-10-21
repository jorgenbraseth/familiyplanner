import { describe, expect, it } from "vitest";
import { isBreakSubject, periodTimeline, timelineLegend, type PeriodLine } from "./plan-view";

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
    e.type === "period" || e.type === "pause" ? e.line.id : e.type === "divider" ? e.time : e.type === "gap" ? (e.school ? "gap:school" : "gap") : `e:${e.event.id}`,
  );

describe("periodTimeline", () => {
  it("shows one time when a period ends as the next starts", () => {
    expect(shape(periodTimeline([p("a", "08:15", "09:00"), p("b", "09:00", "09:45")]))).toEqual([
      "08:15", "a", "09:00", "b", "09:45",
    ]);
  });
  it("shows a divider, a school gap and a divider when there is a gap", () => {
    expect(shape(periodTimeline([p("a", "09:00", "10:15"), p("b", "10:30", "11:15")]))).toEqual([
      "09:00", "a", "10:15", "gap:school", "10:30", "b", "11:15",
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

describe("isBreakSubject", () => {
  it("recognises breaks, case-insensitively and trimmed", () => {
    for (const s of ["Lunsj", " friminutt ", "FRIMINUTT", "Storefri", "Spising", "Eting", "Pause", "Fruktpause", "Mat", "Mat og lek", "Lunsj/friminutt", "Uteleik", "Lunch"]) {
      expect(isBreakSubject(s), s).toBe(true);
    }
  });

  it("keeps school subjects as periods", () => {
    for (const s of ["Matematikk", "Matte", "Mat og helse", "Norsk", "Kroppsøving", "Frukt og grønt", "", "  "]) {
      expect(isBreakSubject(s), s).toBe(false);
    }
    expect(isBreakSubject(null)).toBe(false);
  });
});

describe("pause entries", () => {
  const named = (id: string, title: string, startsAt: string, endsAt: string): PeriodLine => ({ ...p(id, startsAt, endsAt), title });

  it("turns break periods into pause entries that keep their dividers", () => {
    const entries = periodTimeline([named("a", "Norsk", "08:15", "09:00"), named("b", "Lunsj", "09:00", "09:20"), named("c", "Matte", "09:30", "10:15")]);
    expect(entries.map((e) => e.type)).toEqual(["divider", "period", "divider", "pause", "divider", "gap", "divider", "period", "divider"]);
    expect(shape(entries)).toEqual(["08:15", "a", "09:00", "b", "09:20", "gap:school", "09:30", "c", "10:15"]);
  });

  it("decides the legend chips from the kinds present", () => {
    const only = periodTimeline([named("a", "Friminutt", "10:00", "10:15")]);
    expect(timelineLegend(only)).toEqual({ school: false, pause: true, appointments: false });
    const mixed = periodTimeline([named("a", "Norsk", "08:00", "09:00"), named("b", "Lunsj", "09:00", "09:20")]);
    expect(timelineLegend(mixed)).toEqual({ school: true, pause: true, appointments: false });
    expect(timelineLegend([])).toEqual({ school: false, pause: false, appointments: false });
  });
});
