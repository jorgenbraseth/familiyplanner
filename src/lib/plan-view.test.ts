import { describe, expect, it } from "vitest";
import { dayKey } from "./dates";
import type { PlanAudience, PlanItemKind, PlanItemRow } from "./plan";
import {
  filterByAudience,
  formatSchoolHours,
  formatWeekday,
  groupItemsByDay,
  hoursForDate,
  isWeekPlanDayEmpty,
  mergeEntries,
  myDayEntries,
  type PeriodLine,
  nextSchoolDay,
  parentNoteWeeks,
  periodsForDate,
  schoolEventEntry,
  schoolEventsOn,
  splitWeekItems,
  todayView,
  visibleDays,
  visibleTo,
  weekPlan, weekLegend,
  wholeWeekSection,
  withoutEmptyDays,
  type EventEntry,
  type Timetable,
} from "./plan-view";

let n = 0;
function item(
  date: string,
  kind: PlanItemKind,
  text = "Test",
  over: Partial<PlanItemRow> = {},
): PlanItemRow {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    document_id: "00000000-0000-4000-8000-00000000ffff",
    member_id: "00000000-0000-4000-8000-00000000eeee",
    date,
    kind,
    subject: null,
    text,
    done: false,
    sort: 0,
    audience: "both" as PlanAudience,
    whole_week: false,
    period: null,
    starts_at: null,
    ends_at: null,
    ...over,
  };
}

// 2026-10-19 is a Monday.
const monday = { year: 2026, month: 10, day: 19 };

const timetable: Timetable = {
  days: [
    { weekday: 1, starts_at: "08:15:00", ends_at: "14:00:00" },
    { weekday: 3, starts_at: "08:15:00", ends_at: "12:30:00" },
  ],
  periods: [
    { id: "w2", weekday: 3, period: 2, starts_at: "09:00:00", ends_at: "09:45:00", subject: "Mat", sort: 1 },
    { id: "w1", weekday: 3, period: 1, starts_at: "08:15:00", ends_at: "09:00:00", subject: "Norsk", sort: 0 },
    { id: "wf", weekday: 3, period: null, starts_at: null, ends_at: null, subject: "Fri", sort: 5 },
    { id: "m1", weekday: 1, period: 1, starts_at: "08:15:00", ends_at: "09:00:00", subject: "Engelsk", sort: 0 },
  ],
};

describe("audience", () => {
  const all = [
    item("2026-10-20", "message", "kid", { audience: "child" }),
    item("2026-10-20", "message", "parent", { audience: "parent" }),
    item("2026-10-20", "message", "both", { audience: "both" }),
    item("2026-10-20", "homework", "hw", { audience: "parent" }),
    item("2026-10-20", "lesson", "legacy"),
  ];
  it("kids see child/both, parents parent/both, homework regardless, legacy lessons never", () => {
    expect(filterByAudience(all, "kid").map((i) => i.text)).toEqual(["kid", "both", "hw"]);
    expect(filterByAudience(all, "parent").map((i) => i.text)).toEqual(["parent", "both", "hw"]);
    expect(filterByAudience(all, "all").map((i) => i.text)).toEqual(["kid", "parent", "both", "hw"]);
    expect(visibleTo(all[4], "all")).toBe(false);
  });
});

describe("groupItemsByDay", () => {
  it("returns every day, ordering by kind then time then sort, leaving out whole-week and legacy items", () => {
    const items = [
      item("2026-10-19", "event", "e2", { starts_at: "12:00:00" }),
      item("2026-10-19", "event", "e1", { starts_at: "10:00:00" }),
      item("2026-10-19", "message", "m"),
      item("2026-10-19", "homework", "h"),
      item("2026-10-19", "lesson", "legacy"),
      item("2026-10-19", "homework", "week", { whole_week: true }),
      item("2026-10-21", "homework", "w"),
      item("2026-10-30", "homework", "outside"),
    ];
    const days = groupItemsByDay(items, monday, 7);
    expect(days).toHaveLength(7);
    expect(days[0].items.map((i) => i.text)).toEqual(["h", "m", "e1", "e2"]);
    expect(days[1].items).toEqual([]);
    expect(days[2].items.map((i) => i.text)).toEqual(["w"]);
  });
});

describe("splitWeekItems and wholeWeekSection", () => {
  const items = [
    item("2026-10-19", "homework", "done", { whole_week: true, done: true }),
    item("2026-10-19", "homework", "open", { whole_week: true }),
    item("2026-10-19", "message", "msg", { whole_week: true }),
    item("2026-10-19", "message", "parentmsg", { whole_week: true, audience: "parent" }),
    item("2026-10-26", "homework", "next week", { whole_week: true }),
    item("2026-10-20", "homework", "day"),
  ];
  it("separates day items from the whole-week items of that week", () => {
    const { day, whole } = splitWeekItems(items, "2026-10-19");
    expect(day.map((i) => i.text)).toEqual(["day"]);
    expect(whole.map((i) => i.text).sort()).toEqual(["done", "msg", "open", "parentmsg"]);
  });
  it("wholeWeekSection filters by audience and puts not-done homework first", () => {
    const kid = wholeWeekSection(items, "2026-10-19", "kid");
    expect(kid.homework.map((i) => i.text)).toEqual(["open", "done"]);
    expect(kid.messages.map((i) => i.text)).toEqual(["msg"]);
    expect(wholeWeekSection(items, "2026-10-19", "parent").messages.map((i) => i.text).sort()).toEqual(["msg", "parentmsg"]);
  });
});

describe("nextSchoolDay", () => {
  it.each([
    ["2026-10-19", "2026-10-20"], // Monday → Tuesday
    ["2026-10-22", "2026-10-23"], // Thursday → Friday
    ["2026-10-23", "2026-10-26"], // Friday → Monday
    ["2026-10-24", "2026-10-26"], // Saturday → Monday
    ["2026-10-25", "2026-10-26"], // Sunday → Monday
  ])("after %s is %s", (today, expected) => {
    const [year, month, day] = today.split("-").map(Number);
    expect(dayKey(nextSchoolDay({ year, month, day }))).toBe(expected);
  });
});

describe("timetable", () => {
  it("gives the hours of the date's weekday, or undefined", () => {
    expect(hoursForDate("2026-10-21", timetable)).toEqual({ starts_at: "08:15:00", ends_at: "12:30:00" }); // Wednesday
    expect(hoursForDate("2026-10-20", timetable)).toBeUndefined(); // Tuesday
  });
  it("lets an exact-date override win", () => {
    const overrides = new Map([["2026-10-21", { starts_at: "10:00:00", ends_at: "11:00:00" }]]);
    expect(hoursForDate("2026-10-21", timetable, overrides)).toEqual({ starts_at: "10:00:00", ends_at: "11:00:00" });
    expect(hoursForDate("2026-10-28", timetable, overrides)).toEqual({ starts_at: "08:15:00", ends_at: "12:30:00" });
  });
  it("orders periods by period number, those without one last", () => {
    const lines = periodsForDate("2026-10-21", timetable);
    expect(lines.map((l) => l.title)).toEqual(["Norsk", "Mat", "Fri"]);
    expect(lines[0]).toMatchObject({ period: 1, time: "08:15–09:00" });
    expect(lines[2].time).toBeNull();
    expect(periodsForDate("2026-10-20", timetable)).toEqual([]);
  });
});

describe("events as entries", () => {
  it("formats timed and untimed school events and sorts untimed first", () => {
    const timed = schoolEventEntry(item("2026-10-21", "event", "Tur", { subject: "Klassen", starts_at: "09:30:00", ends_at: "11:00:00" }), "Hele dagen");
    const untimed = schoolEventEntry(item("2026-10-21", "event", "Fotodag"), "Hele dagen");
    expect(timed).toMatchObject({ title: "Klassen: Tur", timeLabel: "09:30–11:00", sortKey: 570, school: true });
    expect(untimed).toMatchObject({ title: "Fotodag", timeLabel: "Hele dagen", sortKey: -1 });
  });
  it("mergeEntries interleaves by time, all-day first, stable for equal times", () => {
    const e = (id: string, sortKey: number): EventEntry => ({ id, memberId: "m", title: id, timeLabel: "", sortKey });
    const merged = mergeEntries([e("g-10", 600), e("g-all", -1), e("g-12", 720)], [e("s-11", 660), e("s-all", -1), e("s-10", 600)]);
    expect(merged.map((x) => x.id)).toEqual(["g-all", "s-all", "g-10", "s-10", "s-11", "g-12"]);
  });
  it("schoolEventsOn takes one day's events for the audience", () => {
    const items = [
      item("2026-10-21", "event", "kid", { audience: "child" }),
      item("2026-10-21", "event", "parent", { audience: "parent" }),
      item("2026-10-21", "event", "other day", { date: "2026-10-22" }),
      item("2026-10-21", "homework", "not an event"),
    ];
    expect(schoolEventsOn(items, "2026-10-21", "kid", "x").map((e) => e.title)).toEqual(["kid"]);
    expect(schoolEventsOn(items, "2026-10-21", "all", "x").map((e) => e.title)).toEqual(["kid", "parent"]);
  });
});

describe("todayView", () => {
  const items = [
    item("2026-10-21", "message", "Gymtøy", { audience: "child" }),
    item("2026-10-21", "message", "Foreldremøte", { audience: "parent" }),
    item("2026-10-21", "homework", "Today's homework"),
    item("2026-10-22", "homework", "Lesing"),
    item("2026-10-22", "lesson", "legacy lesson"),
    item("2026-10-23", "homework", "Later"),
    item("2026-10-19", "homework", "Hele uken", { whole_week: true }),
    item("2026-10-19", "homework", "Ferdig", { whole_week: true, done: true }),
  ];
  const wednesday = { year: 2026, month: 10, day: 21 };

  it("gives hours and periods from the timetable, today's messages and homework due next school day", () => {
    const view = todayView(items, wednesday, timetable);
    expect(view.hours).toEqual({ starts_at: "08:15:00", ends_at: "12:30:00" });
    expect(view.periods.map((p) => p.title)).toEqual(["Norsk", "Mat", "Fri"]);
    expect(view.messages.map((i) => i.text)).toEqual(["Gymtøy"]);
    expect(view.homeworkDue.map((i) => i.text)).toEqual(["Lesing"]);
    expect(view.weekHomework.map((i) => i.text)).toEqual(["Hele uken", "Ferdig"]);
    expect(view.nextSchoolDayKey).toBe("2026-10-22");
  });

  it("shows parents their messages and no timetable when there is none", () => {
    const view = todayView(items, wednesday, undefined, undefined, "parent");
    expect(view.messages.map((i) => i.text)).toEqual(["Foreldremøte"]);
    expect(view.hours).toBeUndefined();
    expect(view.periods).toEqual([]);
  });

  it("looks to Monday on a Friday", () => {
    const view = todayView([item("2026-10-26", "homework", "Mandag")], { year: 2026, month: 10, day: 23 });
    expect(view.homeworkDue.map((i) => i.text)).toEqual(["Mandag"]);
  });
});

describe("formatWeekday", () => {
  it("gives the capitalised weekday only", () => {
    expect(formatWeekday(monday)).toBe("Mandag");
    expect(formatWeekday({ year: 2026, month: 10, day: 25 })).toBe("Søndag");
  });
});

describe("visibleDays", () => {
  const days = ["2026-10-19", "2026-10-20", "2026-10-21"].map((key) => ({ key }));
  it("hides past days in the current week only", () => {
    expect(visibleDays(days, "2026-10-20", 0).map((d) => d.key)).toEqual(["2026-10-20", "2026-10-21"]);
    expect(visibleDays(days, "2026-10-20", 1)).toHaveLength(3);
    expect(visibleDays(days, "2026-10-20", -1)).toHaveLength(3);
  });
});

describe("formatSchoolHours", () => {
  it("formats known times", () => {
    expect(formatSchoolHours("08:15:00", "14:00:00")).toBe("08:15–14:00");
    expect(formatSchoolHours("8:15", null)).toBe("08:15");
    expect(formatSchoolHours(null, null)).toBeNull();
  });
});

describe("weekPlan", () => {
  const items = [
    item("2026-10-21", "homework", "Les"),
    item("2026-10-21", "message", "Husk gym", { audience: "child" }),
    item("2026-10-21", "message", "Til foreldre", { audience: "parent" }),
    item("2026-10-24", "message", "Tur"),
  ];
  const none = new Map<string, EventEntry[]>();

  it("adds timetable hours and periods, keeps weekends only with something, hides parent-only items from kids", () => {
    const days = weekPlan(items, timetable, undefined, none, monday, "2026-10-19", 1);
    expect(days.map((d) => d.key)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
    const wed = days[2];
    expect(wed.periods.map((p) => p.title)).toEqual(["Norsk", "Mat", "Fri"]);
    expect(wed.hours).toBe("08:15–12:30");
    expect(wed.homework).toHaveLength(1);
    expect(wed.messages.map((m) => m.text)).toEqual(["Husk gym"]);
    expect(days[1].hours).toBeNull();
    expect(wed.timeline.filter((e) => e.type === "period" || e.type === "pause")).toHaveLength(3);
    expect(days[1].timeline).toEqual([]);
  });

  it("builds one legend for the week from the kinds on any day", () => {
    const events = new Map([["2026-10-22", [{ id: "x", memberId: "m", title: "Tur", timeLabel: "Hele dagen", sortKey: -1 }]]]);
    const days = weekPlan(items, timetable, undefined, events, monday, "2026-10-19", 1);
    expect(weekLegend(days).school).toBe(true);
    expect(weekLegend(days).appointments).toBe(true);
    expect(weekLegend([])).toEqual({ school: false, pause: false, appointments: false });
  });

  it("shows events given per day and counts them as content", () => {
    const events = new Map([["2026-10-22", [{ id: "x", memberId: "m", title: "Tur", timeLabel: "Hele dagen", sortKey: -1 }]]]);
    const days = weekPlan([], { days: [], periods: [] }, undefined, events, monday, "2026-10-19", 1, true);
    expect(days.map((d) => d.key)).toEqual(["2026-10-22"]);
    expect(days[0].events).toHaveLength(1);
  });

  it("hides past days in the current week", () => {
    const days = weekPlan(items, timetable, undefined, none, monday, "2026-10-22", 0);
    expect(days.map((d) => d.key)).toEqual(["2026-10-22", "2026-10-23", "2026-10-24"]);
  });
});

describe("empty days", () => {
  const empty = { hours: null, periods: [], events: [], homework: [], messages: [] };

  it("is empty only when there is nothing at all", () => {
    expect(isWeekPlanDayEmpty(empty)).toBe(true);
    expect(isWeekPlanDayEmpty({ ...empty, hours: "08:15–14:00" })).toBe(false);
    expect(isWeekPlanDayEmpty({ ...empty, homework: [item("2026-10-20", "homework")] })).toBe(false);
    expect(isWeekPlanDayEmpty({ ...empty, messages: [item("2026-10-20", "message")] })).toBe(false);
    expect(isWeekPlanDayEmpty({ ...empty, events: [{ id: "e", memberId: "m", title: "t", timeLabel: "", sortKey: -1 }] })).toBe(false);
  });

  it("weekPlan can drop empty days, and gives nothing for an empty week", () => {
    const items = [item("2026-10-21", "homework", "Les")];
    const overrides = new Map([["2026-10-23", { starts_at: null, ends_at: "13:00:00" }]]);
    const none = new Map<string, EventEntry[]>();
    const empty = { days: [], periods: [] };
    expect(weekPlan(items, empty, overrides, none, monday, "2026-10-19", 1, true).map((d) => d.key)).toEqual(["2026-10-21", "2026-10-23"]);
    expect(weekPlan(items, empty, overrides, none, monday, "2026-10-19", 1)).toHaveLength(5);
    expect(weekPlan([], empty, undefined, none, monday, "2026-10-19", 1, true)).toEqual([]);
  });

  it("withoutEmptyDays keeps the order of the days that have something", () => {
    const days = [{ key: "a", n: 0 }, { key: "b", n: 2 }, { key: "c", n: 1 }];
    expect(withoutEmptyDays(days, (d) => d.n === 0).map((d) => d.key)).toEqual(["b", "c"]);
  });
});

describe("parentNoteWeeks", () => {
  const items = [
    item("2026-10-21", "message", "wed", { audience: "parent" }),
    item("2026-10-19", "message", "whole", { audience: "both", whole_week: true }),
    item("2026-10-21", "event", "meeting", { audience: "parent", starts_at: "17:00:00" }),
    item("2026-10-26", "message", "next", { audience: "both", whole_week: true }),
    item("2026-10-20", "message", "kid only", { audience: "child" }),
    item("2026-10-20", "homework", "hw", { audience: "both" }),
  ];
  it("groups parent/both messages and events by week, newest week first, whole-week items first", () => {
    const weeks = parentNoteWeeks(items);
    expect(weeks.map((w) => w.mondayKey)).toEqual(["2026-10-26", "2026-10-19"]);
    expect(weeks[1].entries.map((e) => e.text)).toEqual(["whole", "wed", "meeting"]);
  });
  it("is empty without notes", () => {
    expect(parentNoteWeeks([item("2026-10-20", "homework")])).toEqual([]);
  });
});

describe("myDayEntries", () => {
  const period = (id: string, period: number, startsAt: string, endsAt: string): PeriodLine => ({
    id,
    period,
    time: `${startsAt}–${endsAt}`,
    title: id,
    startsAt,
    endsAt,
  });
  const periods = [period("p1", 1, "08:15", "09:00"), period("p2", 2, "09:00", "09:45"), period("p3", 3, "10:00", "10:45")];
  const hours = { starts_at: "08:15", ends_at: "10:45" };
  const min = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
  const ev = (id: string, from: string | null, to: string | null = null): EventEntry => ({
    id,
    memberId: "m",
    title: id,
    timeLabel: from ? `${from}–${to ?? ""}` : "Hele dagen",
    sortKey: from ? min(from) : -1,
    endKey: to ? min(to) : null,
  });
  const names = (entries: ReturnType<typeof myDayEntries>) =>
    entries.map((e) =>
      e.type === "event"
        ? `e:${e.event.id}${e.showTime ? "*" : ""}`
        : e.type === "period" || e.type === "pause"
          ? `${e.line.id}${e.showTime ? "*" : ""}`
          : e.type === "gap"
            ? e.school ? "gap:school" : "gap"
            : e.time,
    );

  it("lists only the timeline without events and only events without periods", () => {
    expect(names(myDayEntries(periods, hours, []))).toEqual([
      "08:15", "p1", "09:00", "p2", "09:45", "gap:school", "10:00", "p3", "10:45",
    ]);
    expect(names(myDayEntries([], hours, [ev("b", "15:00", "16:00"), ev("a", "10:00", "11:00")]))).toEqual([
      "10:00", "e:a", "11:00", "gap", "15:00", "e:b", "16:00",
    ]);
    expect(myDayEntries([], undefined, [])).toEqual([]);
  });

  it("shares a divider between back-to-back entries", () => {
    expect(names(myDayEntries(periods.slice(0, 2), hours, [ev("x", "09:45", "10:30")]))).toEqual([
      "08:15", "p1", "09:00", "p2", "09:45", "e:x", "10:30",
    ]);
  });

  it("puts all-day events first with their time label and no dividers", () => {
    expect(names(myDayEntries(periods.slice(0, 1), hours, [ev("allday", null)]))).toEqual([
      "e:allday*", "08:15", "p1", "09:00",
    ]);
  });

  it("shows a gap between school end and an afternoon appointment, without a label", () => {
    expect(names(myDayEntries(periods.slice(0, 1), hours, [ev("late", "15:30", "16:30")]))).toEqual([
      "08:15", "p1", "09:00", "gap", "15:30", "e:late", "16:30",
    ]);
  });

  it("shows a gap between an appointment before school and the first period", () => {
    expect(names(myDayEntries(periods.slice(0, 1), hours, [ev("early", "07:00", "07:30")]))).toEqual([
      "07:00", "e:early", "07:30", "gap", "08:15", "p1", "09:00",
    ]);
  });

  it("keeps an appointment starting during a period as a card with its time after the period", () => {
    expect(names(myDayEntries(periods, hours, [ev("mid", "08:30", "08:50")]))).toEqual([
      "08:15", "p1", "e:mid*", "09:00", "p2", "09:45", "gap:school", "10:00", "p3", "10:45",
    ]);
  });

  it("keeps two overlapping appointments as one timeline entry and one card", () => {
    expect(names(myDayEntries([], undefined, [ev("a", "16:00", "17:00"), ev("b", "16:30", "17:30")]))).toEqual([
      "16:00", "e:a", "e:b*", "17:30",
    ]);
  });

  it("continues from the latest end when an overlapping card ends later", () => {
    expect(
      names(myDayEntries([], undefined, [ev("a", "16:00", "17:00"), ev("b", "16:30", "17:30"), ev("c", "18:00", "19:00")])),
    ).toEqual(["16:00", "e:a", "e:b*", "17:30", "gap", "18:00", "e:c", "19:00"]);
  });

  it("falls back gracefully for unknown times", () => {
    const noTimes: PeriodLine = { id: "pn", period: null, time: null, title: "pn", startsAt: null, endsAt: null };
    expect(names(myDayEntries([noTimes, noTimes].map((p, i) => ({ ...p, id: `pn${i}` })), undefined, []))).toEqual(["pn0", "pn1"]);
    // An event without a known end keeps its time label and gets no end divider or gap.
    expect(names(myDayEntries([], undefined, [ev("open", "10:00"), ev("next", "12:00", "13:00")]))).toEqual([
      "10:00", "e:open*", "12:00", "e:next", "13:00",
    ]);
  });
});
