import { describe, expect, it } from "vitest";
import { findNextOccurrence } from "./next-occurrence";
import type { Timetable } from "../plan-view";

// Made-up timetable. ISO weekdays: 1 Monday ... 5 Friday.
let id = 0;
const period = (weekday: number, n: number, start: string, end: string, subject: string) => ({
  id: `p${id++}`, weekday, period: n, starts_at: start, ends_at: end, subject, sort: n,
});
const day = (weekday: number) => ({ weekday, starts_at: "08:15:00", ends_at: "14:00:00" });

const mia: Timetable = {
  days: [1, 2, 3, 4, 5].map(day),
  periods: [
    period(1, 1, "08:15", "09:00", "Norsk"),
    period(3, 1, "08:15", "09:00", "Kroppsøving"), // Wednesday morning
    period(3, 2, "09:00", "09:45", "Matematikk"),
    period(5, 1, "08:15", "09:00", "Kroppsøving"), // Friday
  ],
};
const emil: Timetable = {
  days: [1, 2, 3, 4, 5].map(day),
  periods: [period(1, 3, "10:00", "10:45", "Gym"), period(2, 1, "08:15", "09:00", "Norsk")],
};

// Wednesday 2026-10-21, 10:00 local (08:00 UTC, CEST is over on 25 Oct)
const wednesdayTen = new Date("2026-10-21T08:00:00Z");

describe("findNextOccurrence", () => {
  it("skips today's lesson that already started and finds the next one on Friday", () => {
    const r = findNextOccurrence({ now: wednesdayTen, query: "gymnastikk", timetable: mia });
    expect(r.next).toMatchObject({ date: "2026-10-23", weekday: "fredag", when: "på fredag", days_from_now: 2, time: "08:15–09:00", title: "Kroppsøving", source: "timetable" });
  });

  it("finds a lesson later today", () => {
    const earlier = new Date("2026-10-21T05:00:00Z"); // 07:00 local
    const r = findNextOccurrence({ now: earlier, query: "gym", timetable: mia });
    expect(r.next).toMatchObject({ date: "2026-10-21", when: "i dag" });
  });

  it("crosses a weekend to Monday", () => {
    const saturday = new Date("2026-10-24T09:00:00Z");
    const r = findNextOccurrence({ now: saturday, query: "gym", timetable: emil });
    expect(r.next).toMatchObject({ date: "2026-10-26", weekday: "mandag", when: "på mandag", days_from_now: 2, time: "10:00–10:45" });
  });

  it("says i morgen for tomorrow", () => {
    const nextWeek = findNextOccurrence({ now: wednesdayTen, query: "norsk", timetable: emil });
    expect(nextWeek.next).toMatchObject({ date: "2026-10-27", days_from_now: 6, when: "på tirsdag" });
    const mondayNight = findNextOccurrence({ now: new Date("2026-10-26T18:00:00Z"), query: "norsk", timetable: emil });
    expect(mondayNight.next).toMatchObject({ date: "2026-10-27", when: "i morgen", days_from_now: 1 });
  });

  it("reports the searched range when nothing is found", () => {
    const r = findNextOccurrence({ now: wednesdayTen, query: "svømming", timetable: mia });
    expect(r).toEqual({ next: null, searched_from: "2026-10-21", searched_to: "2026-11-11", none_within_days: 21 });
  });

  it("does not look beyond 21 days", () => {
    const sparse: Timetable = { days: [], periods: [period(3, 1, "08:15", "09:00", "Gym")] };
    // Wednesday 2026-10-21 10:00: next Wednesdays are 28 Oct, 4 Nov, 11 Nov (day 21), then 18 Nov (day 28).
    const late = findNextOccurrence({ now: new Date("2026-11-11T09:00:00Z"), query: "gym", timetable: sparse });
    expect(late.next?.date).toBe("2026-11-18");
    const r = findNextOccurrence({ now: new Date("2026-11-11T09:00:00Z"), query: "gym", timetable: sparse, days: 3 });
    expect(r.next).toBeNull();
  });

  it("includes ukeplan and calendar events, earliest first", () => {
    const r = findNextOccurrence({
      now: wednesdayTen,
      query: "gymnastikk",
      timetable: mia,
      schoolEvents: [{ date: "2026-10-22", subject: null, text: "Gymnastikk i hallen", starts_at: "12:00:00", ends_at: "13:00:00" }],
      calendarEvents: [{ title: "Turn", start: "2026-10-24T08:00:00Z", end: "2026-10-24T09:00:00Z", allDay: false }],
    });
    expect(r.next).toMatchObject({ date: "2026-10-22", when: "i morgen", source: "ukeplan", time: "12:00–13:00" });
    const cal = findNextOccurrence({
      now: wednesdayTen,
      query: "turn",
      timetable: mia,
      calendarEvents: [{ title: "Turn", start: "2026-10-24T08:00:00Z", end: "2026-10-24T09:00:00Z", allDay: false }],
    });
    expect(cal.next).toMatchObject({ date: "2026-10-24", source: "calendar", time: "10:00–11:00" });
  });

  it("skips calendar events and ukeplan events that already started today, and whole-week items", () => {
    const r = findNextOccurrence({
      now: wednesdayTen,
      query: "foreldremøte",
      timetable: mia,
      schoolEvents: [
        { date: "2026-10-21", subject: null, text: "Foreldremøte", starts_at: "08:00:00", ends_at: "09:00:00" },
        { date: "2026-10-19", subject: null, text: "Foreldremøte", starts_at: null, ends_at: null, whole_week: true },
      ],
      calendarEvents: [{ title: "Foreldremøte", start: "2026-10-21T06:00:00Z", end: "2026-10-21T07:00:00Z", allDay: false }],
    });
    expect(r.next).toBeNull();
  });
});
