import { describe, expect, it } from "vitest";
import { buildParentDay, type DayCalendarEvent, type DayMember } from "./parent-day";

const mom: DayMember = { id: "m", name: "Mor Test", colour: "#111111" };
const kidA: DayMember = { id: "a", name: "Kari Test", colour: "#222222" };
const kidB: DayMember = { id: "b", name: "Ola Test", colour: "#333333" };
const members = [mom, kidA, kidB];

// 2026-10-21 in Copenhagen (UTC+2 until 25 Oct).
const dayStart = new Date("2026-10-20T22:00:00Z");
const dayEnd = new Date("2026-10-21T22:00:00Z");
const base = { members, dayStart, dayEnd, calendarEvents: [], schoolEvents: [], schoolHours: [] };

const ev = (memberId: string, title: string, start: string, end: string, allDay = false): DayCalendarEvent => ({
  memberId,
  title,
  start,
  end,
  allDay,
});

describe("buildParentDay", () => {
  it("is empty without anything", () => {
    expect(buildParentDay(base)).toEqual([]);
  });

  it("orders chronologically with all-day first", () => {
    const out = buildParentDay({
      ...base,
      calendarEvents: [
        ev("m", "Møte", "2026-10-21T13:00:00Z", "2026-10-21T14:00:00Z"),
        ev("a", "Tannlege", "2026-10-21T07:00:00Z", "2026-10-21T07:30:00Z"),
        ev("b", "Fridag", "2026-10-20T22:00:00Z", "2026-10-21T22:00:00Z", true),
      ],
      schoolEvents: [{ memberId: "a", subject: null, text: "Svømming", startsAt: "10:00:00", endsAt: null }],
    });
    expect(out.map((e) => e.title)).toEqual(["Fridag", "Tannlege", "Svømming", "Møte"]);
    expect(out[0].timeLabel).toBe("Hele dagen");
    expect(out[1].timeLabel).toBe("09:00–09:30");
    expect(out[2]).toMatchObject({ kind: "school", timeLabel: "10:00" });
  });

  it("shows a shared event once with all names in member order", () => {
    const out = buildParentDay({
      ...base,
      calendarEvents: [
        ev("b", " Familiemiddag ", "2026-10-21T16:00:00Z", "2026-10-21T17:00:00Z"),
        ev("m", "familiemiddag", "2026-10-21T16:00:00Z", "2026-10-21T17:00:00Z"),
        ev("a", "Familiemiddag", "2026-10-21T16:00:00Z", "2026-10-21T18:00:00Z"),
      ],
    });
    expect(out).toHaveLength(2);
    expect(out.find((e) => e.members.length === 2)?.members.map((m) => m.name)).toEqual(["Mor Test", "Ola Test"]);
  });

  it("gives each child one school entry and merges equal hours", () => {
    const out = buildParentDay({
      ...base,
      schoolHours: [
        { memberId: "a", startsAt: "08:15:00", endsAt: "13:30:00" },
        { memberId: "b", startsAt: "08:15:00", endsAt: "13:30:00" },
        { memberId: "m", startsAt: null, endsAt: null },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: "Skole", kind: "school", timeLabel: "08:15–13:30" });
    expect(out[0].members.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("keeps different hours apart, ignores other days and unknown members", () => {
    const out = buildParentDay({
      ...base,
      schoolHours: [
        { memberId: "a", startsAt: "08:15", endsAt: "13:30" },
        { memberId: "b", startsAt: "08:15", endsAt: "14:30" },
        { memberId: "x", startsAt: "08:15", endsAt: "14:30" },
      ],
      calendarEvents: [ev("m", "I går", "2026-10-20T10:00:00Z", "2026-10-20T11:00:00Z")],
    });
    expect(out.map((e) => e.timeLabel)).toEqual(["08:15–13:30", "08:15–14:30"]);
  });

  it("treats untimed school events as all-day", () => {
    const out = buildParentDay({
      ...base,
      schoolEvents: [{ memberId: "a", subject: "Norsk", text: "Tur", startsAt: null, endsAt: null }],
    });
    expect(out[0]).toMatchObject({ title: "Norsk: Tur", allDay: true, timeLabel: "Hele dagen" });
  });
});
