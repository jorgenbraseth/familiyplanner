import { describe, expect, it } from "vitest";
import { buildParentDay, buildParentTracks, type DayCalendarEvent, type DayMember } from "./parent-day";

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

describe("buildParentTracks", () => {
  const school = [{ memberId: "a", startsAt: "08:15:00", endsAt: "13:30:00" }];

  it("is empty without anything and gives one column per member", () => {
    const out = buildParentTracks(base);
    expect(out.empty).toBe(true);
    expect(out.columns.map((c) => [c.member.id, c.lanes, c.firstColumn])).toEqual([["m", 1, 2], ["a", 1, 3], ["b", 1, 4]]);
    expect(out.columnCount).toBe(5);
  });

  it("builds sorted unique boundaries, alternating rows and spans", () => {
    const out = buildParentTracks({
      ...base,
      schoolHours: school,
      calendarEvents: [ev("m", "Møte", "2026-10-21T09:00:00Z", "2026-10-21T09:30:00Z")], // 11:00-11:30
    });
    expect(out.boundaries).toEqual([495, 660, 690, 810]);
    expect(out.rows.map((r) => [r.kind, r.row])).toEqual([
      ["divider", 1], ["segment", 2], ["divider", 3], ["segment", 4], ["divider", 5], ["segment", 6], ["divider", 7],
    ]);
    expect(out.rows[0]).toMatchObject({ label: "08:15" });
    const kid = out.columns[1].blocks[0];
    expect([kid.rowStart, kid.rowEnd]).toEqual([2, 7]);
    const mom = out.columns[0].blocks[0];
    expect([mom.rowStart, mom.rowEnd]).toEqual([4, 5]);
  });

  it("turns segments nobody covers into gap rows", () => {
    const out = buildParentTracks({
      ...base,
      calendarEvents: [
        ev("m", "Tidlig", "2026-10-21T06:00:00Z", "2026-10-21T07:00:00Z"),
        ev("b", "Sent", "2026-10-21T15:00:00Z", "2026-10-21T16:00:00Z"),
      ],
    });
    expect(out.rows.map((r) => r.kind)).toEqual(["divider", "segment", "divider", "gap", "divider", "segment", "divider"]);
  });

  it("puts overlapping entries of one member in lanes", () => {
    const out = buildParentTracks({
      ...base,
      calendarEvents: [
        ev("m", "A", "2026-10-21T08:00:00Z", "2026-10-21T10:00:00Z"),
        ev("m", "B", "2026-10-21T09:00:00Z", "2026-10-21T11:00:00Z"),
        ev("m", "C", "2026-10-21T10:00:00Z", "2026-10-21T11:00:00Z"),
      ],
    });
    const [mom, kid] = out.columns;
    expect(mom.lanes).toBe(2);
    expect(mom.blocks.map((b) => [b.title, b.lane])).toEqual([["A", 0], ["B", 1], ["C", 0]]);
    expect(kid.firstColumn).toBe(4);
  });

  it("lists all-day entries per column outside the axis", () => {
    const out = buildParentTracks({
      ...base,
      calendarEvents: [ev("a", "Fridag", "2026-10-20T22:00:00Z", "2026-10-21T22:00:00Z", true)],
    });
    expect(out.hasAllDay).toBe(true);
    expect(out.empty).toBe(false);
    expect(out.columns[1].allDay.map((a) => a.title)).toEqual(["Fridag"]);
    expect(out.boundaries).toEqual([]);
    expect(out.columns[1].blocks).toEqual([]);
  });

  it("gives an entry with unknown end one segment", () => {
    const withNext = buildParentTracks({
      ...base,
      schoolEvents: [{ memberId: "a", subject: null, text: "Svømming", startsAt: "10:00:00", endsAt: null }],
      calendarEvents: [ev("m", "Møte", "2026-10-21T09:00:00Z", "2026-10-21T10:00:00Z")], // 11:00-12:00
    });
    const swim = withNext.columns[1].blocks[0];
    expect([swim.startMin, swim.endMin, swim.rowEnd - swim.rowStart]).toEqual([600, 660, 1]);
    const alone = buildParentTracks({
      ...base,
      schoolEvents: [{ memberId: "a", subject: null, text: "Svømming", startsAt: "10:00:00", endsAt: null }],
    });
    expect(alone.boundaries).toEqual([600, 630]);
    expect(alone.columns[1].blocks[0]).toMatchObject({ rowStart: 2, rowEnd: 3 });
  });

  it("does not merge shared events and drops unknown members", () => {
    const out = buildParentTracks({
      ...base,
      calendarEvents: [
        ev("m", "Middag", "2026-10-21T16:00:00Z", "2026-10-21T17:00:00Z"),
        ev("b", "Middag", "2026-10-21T16:00:00Z", "2026-10-21T17:00:00Z"),
        ev("x", "Ukjent", "2026-10-21T08:00:00Z", "2026-10-21T09:00:00Z"),
      ],
    });
    expect(out.columns.map((c) => c.blocks.length)).toEqual([1, 0, 1]);
    expect(out.boundaries).toEqual([1080, 1140]);
  });
});
