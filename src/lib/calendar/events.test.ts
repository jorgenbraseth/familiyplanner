import { describe, expect, it } from "vitest";
import {
  assembleEvents,
  distinctCalendarIds,
  groupByDay,
  mergeSharedEvents,
  normalizeGoogleEvent,
  type CalendarEvent,
  type CalendarFetch,
} from "./events";

describe("normalizeGoogleEvent", () => {
  it("normalizes a timed event", () => {
    expect(
      normalizeGoogleEvent(
        {
          id: "a",
          summary: "Fotballtrening",
          location: "Banen",
          start: { dateTime: "2026-10-21T17:00:00+02:00" },
          end: { dateTime: "2026-10-21T18:30:00+02:00" },
        },
        "m1",
        "Uten tittel",
      ),
    ).toEqual({
      id: "a",
      memberId: "m1",
      title: "Fotballtrening",
      location: "Banen",
      allDay: false,
      start: "2026-10-21T15:00:00.000Z",
      end: "2026-10-21T16:30:00.000Z",
    });
  });

  it("normalizes an all-day event to Copenhagen midnights", () => {
    const event = normalizeGoogleEvent(
      { id: "b", start: { date: "2026-10-21" }, end: { date: "2026-10-22" } },
      "m1",
      "Uten tittel",
    );
    expect(event).toMatchObject({
      title: "Uten tittel",
      allDay: true,
      start: "2026-10-20T22:00:00.000Z",
      end: "2026-10-21T22:00:00.000Z",
    });
  });

  it("drops cancelled and malformed events", () => {
    const times = { start: { date: "2026-10-21" }, end: { date: "2026-10-22" } };
    expect(normalizeGoogleEvent({ id: "c", status: "cancelled", ...times }, "m1", "x")).toBeNull();
    expect(normalizeGoogleEvent({ id: "d", start: {}, end: {} }, "m1", "x")).toBeNull();
    expect(normalizeGoogleEvent({ summary: "no id", ...times }, "m1", "x")).toBeNull();
    expect(normalizeGoogleEvent("nonsense", "m1", "x")).toBeNull();
    expect(
      normalizeGoogleEvent({ id: "e", start: { dateTime: "soon" }, end: { dateTime: "later" } }, "m1", "x"),
    ).toBeNull();
  });
});

describe("groupByDay", () => {
  const event = (id: string, start: string, end: string, allDay = false): CalendarEvent => ({
    id,
    memberId: "m1",
    title: id,
    start,
    end,
    allDay,
  });
  const monday = { year: 2026, month: 10, day: 19 };

  it("puts events on the Copenhagen day they happen and sorts them", () => {
    const days = groupByDay(
      [
        event("late", "2026-10-19T18:00:00.000Z", "2026-10-19T19:00:00.000Z"),
        event("early", "2026-10-19T06:00:00.000Z", "2026-10-19T07:00:00.000Z"),
        event("allday", "2026-10-18T22:00:00.000Z", "2026-10-19T22:00:00.000Z", true),
        // 23:30 UTC Monday is 01:30 Tuesday in Copenhagen.
        event("tuesday-night", "2026-10-19T23:30:00.000Z", "2026-10-20T00:30:00.000Z"),
      ],
      monday,
      2,
    );
    expect(days.map((d) => d.key)).toEqual(["2026-10-19", "2026-10-20"]);
    expect(days[0].events.map((e) => e.id)).toEqual(["allday", "early", "late"]);
    expect(days[1].events.map((e) => e.id)).toEqual(["tuesday-night"]);
  });

  it("shows multi-day events on every day they cover, ends exclusive", () => {
    const days = groupByDay(
      [event("trip", "2026-10-19T22:00:00.000Z", "2026-10-22T22:00:00.000Z", true)],
      monday,
      7,
    );
    expect(days.map((d) => d.events.length)).toEqual([0, 1, 1, 1, 0, 0, 0]);
  });

  it("keeps zero-length events", () => {
    const days = groupByDay([event("reminder", "2026-10-19T08:00:00.000Z", "2026-10-19T08:00:00.000Z")], monday, 1);
    expect(days[0].events).toHaveLength(1);
  });
});

const gEvent = (id: string, summary = id) => ({
  id,
  summary,
  start: { dateTime: "2026-10-21T17:00:00+02:00" },
  end: { dateTime: "2026-10-21T18:00:00+02:00" },
});

describe("distinctCalendarIds", () => {
  it("lists a shared calendar once", () => {
    expect(
      distinctCalendarIds([
        { memberId: "a", calendarIds: ["a@x", "both@x"] },
        { memberId: "b", calendarIds: ["b@x", "both@x"] },
        { memberId: "c", calendarIds: [] },
      ]),
    ).toEqual(["a@x", "both@x", "b@x"]);
  });
});

describe("assembleEvents", () => {
  const members = [
    { memberId: "a", calendarIds: ["a@x", "both@x"] },
    { memberId: "b", calendarIds: ["b@x", "both@x"] },
  ];
  const fetched = (entries: Record<string, CalendarFetch>) => new Map(Object.entries(entries));

  it("gives each member their own calendars plus the shared one", () => {
    const { events, failedMemberIds } = assembleEvents(
      members,
      fetched({
        "a@x": { ok: true, items: [gEvent("a1")] },
        "b@x": { ok: true, items: [gEvent("b1")] },
        "both@x": { ok: true, items: [gEvent("s1", "Foreldremøte")] },
      }),
      "Uten tittel",
    );
    expect(failedMemberIds).toEqual([]);
    expect(events.map((e) => `${e.memberId}:${e.id}`)).toEqual(["a:a1", "a:s1", "b:b1", "b:s1"]);
    expect(events.find((e) => e.id === "s1")?.calendarId).toBe("both@x");
  });

  it("dedupes an event id that is on two of one member's calendars", () => {
    const { events } = assembleEvents(
      [{ memberId: "a", calendarIds: ["a@x", "both@x"] }],
      fetched({ "a@x": { ok: true, items: [gEvent("same")] }, "both@x": { ok: true, items: [gEvent("same")] } }),
      "Uten tittel",
    );
    expect(events).toHaveLength(1);
  });

  it("names every member of a failed calendar and keeps the working calendars' events", () => {
    const { events, failedMemberIds } = assembleEvents(
      members,
      fetched({
        "a@x": { ok: true, items: [gEvent("a1")] },
        "b@x": { ok: true, items: [gEvent("b1")] },
        "both@x": { ok: false },
      }),
      "Uten tittel",
    );
    expect(failedMemberIds).toEqual(["a", "b"]);
    expect(events.map((e) => e.id)).toEqual(["a1", "b1"]);
  });

  it("reports only the member whose own calendar failed", () => {
    const { failedMemberIds } = assembleEvents(
      members,
      fetched({ "a@x": { ok: false }, "b@x": { ok: true, items: [] }, "both@x": { ok: true, items: [] } }),
      "Uten tittel",
    );
    expect(failedMemberIds).toEqual(["a"]);
  });
});

describe("mergeSharedEvents", () => {
  const ev = (memberId: string, id: string, calendarId?: string): CalendarEvent => ({
    id,
    memberId,
    calendarId,
    title: id,
    start: "2026-10-21T15:00:00.000Z",
    end: "2026-10-21T16:00:00.000Z",
    allDay: false,
  });

  it("shows an event of a shared calendar once with all its members", () => {
    const merged = mergeSharedEvents([ev("a", "s1", "both@x"), ev("a", "a1", "a@x"), ev("b", "s1", "both@x")]);
    expect(merged.map((e) => [e.id, e.memberIds])).toEqual([
      ["s1", ["a", "b"]],
      ["a1", ["a"]],
    ]);
  });

  it("keeps the same event id on different calendars apart, and events without a calendar id", () => {
    expect(mergeSharedEvents([ev("a", "x", "a@x"), ev("b", "x", "b@x")])).toHaveLength(2);
    expect(mergeSharedEvents([ev("a", "x"), ev("b", "x")])).toHaveLength(2);
  });
});
