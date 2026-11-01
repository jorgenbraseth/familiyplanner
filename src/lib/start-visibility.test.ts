import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "./plan-view";
import {
  DEFAULT_WINDOWS,
  dayStillActive,
  homeworkVisible,
  nowSpot,
  resolveWindows,
  visibleRoutineSlots,
  type SlotProgress,
} from "./start-visibility";

// 2026-10-21 is CEST (UTC+2): 07:30 local = 05:30Z.
const at = (hhmm: string) => new Date(Date.UTC(2026, 9, 21) + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) - 120) * 60_000);
const open: Record<"morning" | "evening", SlotProgress> = { morning: { total: 4, complete: false }, evening: { total: 4, complete: false } };

describe("resolveWindows", () => {
  it("uses the defaults without settings rows", () => {
    expect(resolveWindows([])).toEqual(DEFAULT_WINDOWS);
    expect(DEFAULT_WINDOWS.morning).toEqual({ from: 0, until: 600 });
    expect(DEFAULT_WINDOWS.evening).toEqual({ from: 1080, until: 1440 });
  });

  it("reads saved times per slot and falls back per field", () => {
    const w = resolveWindows([
      { slot: "morning", visible_from: "05:30:00", visible_until: "09:00:00" },
      { slot: "evening", visible_from: null, visible_until: null },
    ]);
    expect(w.morning).toEqual({ from: 330, until: 540 });
    expect(w.evening).toEqual(DEFAULT_WINDOWS.evening);
    expect(resolveWindows([{ slot: "evening", visible_from: "17:00", visible_until: null }]).evening).toEqual({ from: 1020, until: 1440 });
  });

  it("treats 23:59 as the end of the day and ignores reversed windows", () => {
    expect(resolveWindows([{ slot: "evening", visible_from: "17:00", visible_until: "23:59:00" }]).evening.until).toBe(1440);
    expect(resolveWindows([{ slot: "morning", visible_from: "11:00", visible_until: "10:00" }]).morning).toEqual(DEFAULT_WINDOWS.morning);
  });
});

describe("visibleRoutineSlots", () => {
  const w = DEFAULT_WINDOWS;
  it.each([
    ["00:00", ["morning"]],
    ["07:30", ["morning"]],
    ["09:59", ["morning"]],
    ["10:00", []],
    ["12:30", []],
    ["17:59", []],
    ["18:00", ["evening"]],
    ["23:59", ["evening"]],
  ])("at %s shows %j", (time, expected) => {
    expect(visibleRoutineSlots(at(time), w, open)).toEqual(expected);
  });

  it("hides a finished list and a list without items", () => {
    expect(visibleRoutineSlots(at("07:30"), w, { ...open, morning: { total: 4, complete: true } })).toEqual([]);
    expect(visibleRoutineSlots(at("07:30"), w, { ...open, morning: { total: 0, complete: false } })).toEqual([]);
    expect(visibleRoutineSlots(at("19:00"), w, { ...open, evening: { total: 4, complete: true } })).toEqual([]);
  });

  it("shows both, morning first, when the windows overlap and both qualify", () => {
    const overlapping = resolveWindows([
      { slot: "morning", visible_from: "00:00", visible_until: "12:00" },
      { slot: "evening", visible_from: "11:00", visible_until: "23:59" },
    ]);
    expect(visibleRoutineSlots(at("11:30"), overlapping, open)).toEqual(["morning", "evening"]);
    expect(visibleRoutineSlots(at("11:30"), overlapping, { ...open, morning: { total: 4, complete: true } })).toEqual(["evening"]);
  });

  it("follows the wall clock in winter time too", () => {
    // 2026-01-14 is CET (UTC+1): 09:59 local = 08:59Z, 10:00 = 09:00Z.
    expect(visibleRoutineSlots(new Date("2026-01-14T08:59:00Z"), w, open)).toEqual(["morning"]);
    expect(visibleRoutineSlots(new Date("2026-01-14T09:00:00Z"), w, open)).toEqual([]);
  });
});

describe("dayStillActive", () => {
  const school = { hours: { ends_at: "14:30:00" }, periods: [{ endsAt: "13:30" }, { endsAt: null }] };
  it("is active until the school day ends", () => {
    expect(dayStillActive(at("07:30"), school, [])).toBe(true);
    expect(dayStillActive(at("14:29"), school, [])).toBe(true);
    expect(dayStillActive(at("14:30"), school, [])).toBe(false);
  });

  it("stays active while a later timed event is on", () => {
    const training = { sortKey: 17 * 60, endKey: 18 * 60 + 30 };
    expect(dayStillActive(at("16:00"), school, [training])).toBe(true);
    expect(dayStillActive(at("18:29"), school, [training])).toBe(true);
    expect(dayStillActive(at("18:30"), school, [training])).toBe(false);
  });

  it("gives an event without an end an hour", () => {
    expect(dayStillActive(at("19:59"), {}, [{ sortKey: 19 * 60 }])).toBe(true);
    expect(dayStillActive(at("20:00"), {}, [{ sortKey: 19 * 60 }])).toBe(false);
  });

  it("ignores all-day events and an empty day", () => {
    expect(dayStillActive(at("08:00"), {}, [{ sortKey: -1 }])).toBe(false);
    expect(dayStillActive(at("08:00"), {}, [])).toBe(false);
    expect(dayStillActive(at("15:00"), school, [{ sortKey: -1 }])).toBe(false);
  });
});

describe("homeworkVisible", () => {
  it("shows only when something is not done, across the lists", () => {
    expect(homeworkVisible([], [], [])).toBe(false);
    expect(homeworkVisible([{ done: true }], [{ done: true }])).toBe(false);
    expect(homeworkVisible([], [{ done: true }], [{ done: false }])).toBe(true);
    expect(homeworkVisible([{ done: false }])).toBe(true);
  });
});

describe("nowSpot", () => {
  const line = (id: string) => ({ id, period: 1, time: null, title: id, startsAt: null, endsAt: null });
  const entries: TimelineEntry[] = [
    { type: "divider", time: "08:00" }, // 0
    { type: "period", line: line("a"), showTime: false }, // 1
    { type: "divider", time: "09:00" }, // 2
    { type: "gap", school: true }, // 3
    { type: "divider", time: "10:00" }, // 4
    { type: "period", line: line("b"), showTime: false }, // 5
    { type: "divider", time: "11:00" }, // 6
  ];
  it("sits before the first divider when the day has not started", () => {
    expect(nowSpot(entries, 7 * 60 + 30)).toEqual({ before: 0 });
  });
  it("sits across the running card at the elapsed fraction", () => {
    expect(nowSpot(entries, 8 * 60 + 15)).toEqual({ inside: 1, fraction: 0.25 });
    expect(nowSpot(entries, 8 * 60)).toEqual({ inside: 1, fraction: 0 });
  });
  it("sits in the middle of a gap", () => {
    expect(nowSpot(entries, 9 * 60 + 20)).toEqual({ inside: 3, fraction: 0.5 });
  });
  it("sits at the end when the day is over", () => {
    expect(nowSpot(entries, 11 * 60)).toEqual({ before: entries.length });
  });
  it("has no spot without dividers", () => {
    expect(nowSpot([], 600)).toBeNull();
    expect(nowSpot([{ type: "event", event: { id: "x", memberId: "m", title: "t", timeLabel: "", sortKey: -1 }, showTime: true }], 600)).toBeNull();
  });
});
