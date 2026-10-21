import { describe, expect, it } from "vitest";
import { groupByDay, normalizeGoogleEvent, type CalendarEvent } from "./events";

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
