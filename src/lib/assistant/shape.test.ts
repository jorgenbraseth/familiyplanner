import { describe, expect, it } from "vitest";
import {
  MAX_PLAN_ITEMS,
  NO_ACCESS_NOTE,
  filterSchoolDaysBySubject,
  normalizeKind,
  resolveMember,
  resolveTargets,
  shapeCarriedHomework,
  shapePlanItems,
  shapeSchoolDays,
  splitSharedCalendarEvents,
} from "./shape";
import type { CalendarEvent } from "../calendar/events";

const members = [
  { id: "1", name: "Mia" },
  { id: "2", name: "Emil Hansen" },
  { id: "3", name: "Emilie" },
];

describe("resolveMember", () => {
  it("matches case-insensitively", () => {
    expect(resolveMember(members, "mia")).toEqual({ member: members[0] });
  });
  it("prefers an exact match over a partial one", () => {
    expect(resolveMember(members, "emilie")).toEqual({ member: members[2] });
  });
  it("accepts a unique partial match", () => {
    expect(resolveMember(members, "hansen")).toEqual({ member: members[1] });
  });
  it("reports ambiguity and unknown names", () => {
    expect("error" in resolveMember(members, "em")).toBe(true);
    expect("error" in resolveMember(members, "zed")).toBe(true);
    expect("error" in resolveMember(members, "  ")).toBe(true);
  });
  it("matches the first name exactly before looking at partial matches", () => {
    expect(resolveMember(members, "EMIL")).toEqual({ member: members[1] });
  });
  it("accepts a member id", () => {
    const withIds = [{ id: "0b9d6c1e-1111-4222-8333-444455556666", name: "Mia" }, { id: "x", name: "Ola" }];
    expect(resolveMember(withIds, "0B9D6C1E-1111-4222-8333-444455556666")).toEqual({ member: withIds[0] });
    expect("error" in resolveMember(withIds, "11111111-1111-4222-8333-444455556666")).toBe(true);
  });
  it("matches Norwegian letters case-insensitively", () => {
    expect(resolveMember([{ id: "1", name: "Åse Øvrebø" }], "åse")).toEqual({ member: { id: "1", name: "Åse Øvrebø" } });
    expect(resolveMember([{ id: "1", name: "Åse Øvrebø" }], "ÅSE")).toHaveProperty("member");
  });
  it("reports ambiguous partial matches", () => {
    expect("error" in resolveMember([{ id: "a", name: "Anna Lie" }, { id: "b", name: "Anne Lie" }], "lie")).toBe(true);
  });
});

describe("shapePlanItems", () => {
  it("sorts, adds weekday and keeps fields", () => {
    const r = shapePlanItems([
      { date: "2026-10-22", kind: "homework", subject: "Mat", text: "Side 4", done: false, sort: 1 },
      { date: "2026-10-21", kind: "message", subject: null, text: "Gymtøy", done: true, sort: 2 },
      { date: "2026-10-21", kind: "lesson", subject: "Norsk", text: "Lesing", done: false, sort: 1 },
    ]);
    expect(r.items.map((i) => i.text)).toEqual(["Lesing", "Gymtøy", "Side 4"]);
    expect(r.items[0].weekday).toBe("onsdag");
    expect(r.note).toBeUndefined();
  });
  it("adds a note when empty", () => {
    expect(shapePlanItems([])).toEqual({ items: [], note: NO_ACCESS_NOTE });
  });
  it("caps the list", () => {
    const rows = Array.from({ length: MAX_PLAN_ITEMS + 5 }, (_, i) => ({
      date: "2026-10-21",
      kind: "message" as const,
      subject: null,
      text: `n${i}`,
      done: false,
      sort: i,
    }));
    const r = shapePlanItems(rows);
    expect(r.items).toHaveLength(MAX_PLAN_ITEMS);
    expect(r.truncated).toBe(true);
  });
});

describe("normalizeKind", () => {
  it("accepts the current kinds, null and legacy names", () => {
    expect(normalizeKind(null)).toEqual({ kind: null, timetableOnly: false });
    expect(normalizeKind("homework")).toEqual({ kind: "homework", timetableOnly: false });
    expect(normalizeKind("Event")).toEqual({ kind: "event", timetableOnly: false });
    expect(normalizeKind("bring")).toEqual({ kind: "message", timetableOnly: false });
    expect(normalizeKind("note")).toEqual({ kind: "message", timetableOnly: false });
    expect(normalizeKind("lesson")).toEqual({ kind: null, timetableOnly: true });
    expect(normalizeKind("nonsense")).toHaveProperty("error");
  });
});

describe("shapeSchoolDays", () => {
  const timetable = {
    days: [{ weekday: 1, starts_at: "08:15:00", ends_at: "14:00:00" }],
    periods: [
      { id: "b", weekday: 1, period: 2, starts_at: "09:00:00", ends_at: "09:45:00", subject: "Mat", sort: 1 },
      { id: "a", weekday: 1, period: 1, starts_at: "08:15:00", ends_at: "09:00:00", subject: "Norsk", sort: 0 },
    ],
  };

  it("gives hours and ordered periods for days that have school, skipping the others", () => {
    // 2026-10-19 is a Monday.
    const days = shapeSchoolDays("2026-10-19", "2026-10-21", timetable);
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ date: "2026-10-19", school_hours: "08:15–14:00" });
    expect(days[0].periods.map((p) => p.subject)).toEqual(["Norsk", "Mat"]);
  });

  it("lets an exact-date override replace the hours", () => {
    const days = shapeSchoolDays("2026-10-19", "2026-10-19", timetable, new Map([["2026-10-19", { starts_at: "09:00:00", ends_at: "12:00:00" }]]));
    expect(days[0].school_hours).toBe("09:00–12:00");
  });
});

describe("resolveTargets", () => {
  const family = [
    { id: "p1", name: "Kari Berg", role: "parent" },
    { id: "p2", name: "Ola Berg", role: "parent" },
    { id: "c1", name: "Mia Berg", role: "child" },
    { id: "c2", name: "Emil Berg", role: "child" },
  ];
  const me = family[2];

  it("means the person asking without a name", () => {
    expect(resolveTargets(family, me, null)).toEqual({ members: [me], group: false });
    expect(resolveTargets(family, me, "  ")).toEqual({ members: [me], group: false });
  });
  it("resolves one other member by first name, for a child asking about a sibling or a parent", () => {
    expect(resolveTargets(family, me, "emil")).toEqual({ members: [family[3]], group: false });
    expect(resolveTargets(family, family[0], "Mia")).toEqual({ members: [family[2]], group: false });
  });
  it("resolves the group words", () => {
    expect(resolveTargets(family, family[0], "kids")).toEqual({ members: [family[2], family[3]], group: true });
    expect(resolveTargets(family, family[0], "Alle barna")).toEqual({ members: [family[2], family[3]], group: true });
    expect(resolveTargets(family, family[0], "family")).toEqual({ members: family, group: true });
  });
  it("reports unknown and ambiguous names", () => {
    expect(resolveTargets(family, me, "Berg")).toHaveProperty("error");
    expect(resolveTargets(family, me, "Zed")).toHaveProperty("error");
  });
});

describe("shapeSchoolDays past flags", () => {
  const tt = {
    days: [{ weekday: 3, starts_at: "08:15", ends_at: "14:00" }],
    periods: [
      { id: "a", weekday: 3, period: 1, starts_at: "08:15", ends_at: "09:00", subject: "Kroppsøving", sort: 1 },
      { id: "b", weekday: 3, period: 2, starts_at: "12:00", ends_at: "12:45", subject: "Norsk", sort: 2 },
    ],
  };
  it("marks lessons that ended earlier today and says when the day is", () => {
    const now = new Date("2026-10-21T08:00:00Z"); // 10:00 in Copenhagen
    const [day] = shapeSchoolDays("2026-10-21", "2026-10-21", tt, undefined, now);
    expect(day.when).toBe("i dag");
    expect(day.periods.map((p) => p.past)).toEqual([true, false]);
  });
  it("marks everything on an earlier day, nothing on a later one, and adds no flags without a clock", () => {
    const now = new Date("2026-10-22T08:00:00Z");
    expect(shapeSchoolDays("2026-10-21", "2026-10-21", tt, undefined, now)[0].periods.every((p) => p.past)).toBe(true);
    expect(shapeSchoolDays("2026-10-28", "2026-10-28", tt, undefined, now)[0].periods.some((p) => p.past)).toBe(false);
    expect(shapeSchoolDays("2026-10-21", "2026-10-21", tt)[0].periods[0]).not.toHaveProperty("past");
  });
});

describe("filterSchoolDaysBySubject", () => {
  const days = [
    { date: "2026-10-22", weekday: "torsdag", school_hours: "08:15–14:00", periods: [{ period: 1, time: null, subject: "Matematikk" }, { period: 2, time: null, subject: "Norsk" }] },
    { date: "2026-10-23", weekday: "fredag", school_hours: null, periods: [{ period: 1, time: null, subject: "Gym" }] },
  ];
  it("keeps matching periods and drops days without a match", () => {
    const r = filterSchoolDaysBySubject(days, "matte");
    expect(r).toHaveLength(1);
    expect(r[0].periods.map((p) => p.subject)).toEqual(["Matematikk"]);
  });
  it("understands subject aliases and keeps mat apart from matematikk", () => {
    expect(filterSchoolDaysBySubject(days, "gymnastikk").map((d) => d.date)).toEqual(["2026-10-23"]);
    expect(filterSchoolDaysBySubject(days, "mat")).toEqual([]);
    const pe = [{ date: "2026-10-22", weekday: "torsdag", school_hours: null, periods: [{ period: 1, time: null, subject: "KRØ" }] }];
    expect(filterSchoolDaysBySubject(pe, "gym")).toHaveLength(1);
  });
  it("returns everything without a subject", () => {
    expect(filterSchoolDaysBySubject(days, null)).toEqual(days);
    expect(filterSchoolDaysBySubject(days, "")).toEqual(days);
  });
});

describe("splitSharedCalendarEvents", () => {
  const kids = [
    { id: "m", name: "Mia" },
    { id: "e", name: "Emil" },
  ];
  const ev = (memberId: string, id: string, calendarId: string, start: string): CalendarEvent => ({
    id,
    memberId,
    calendarId,
    title: id,
    start,
    end: start,
    allDay: false,
  });

  it("lists a shared event once, under the first member, naming the others", () => {
    const split = splitSharedCalendarEvents(
      [
        ev("m", "mia-own", "m@x", "2026-10-21T16:00:00.000Z"),
        ev("m", "shared", "both@x", "2026-10-21T15:00:00.000Z"),
        ev("e", "shared", "both@x", "2026-10-21T15:00:00.000Z"),
        ev("e", "emil-own", "e@x", "2026-10-21T14:00:00.000Z"),
      ],
      kids,
    );
    const mia = split.get("m")!;
    const emil = split.get("e")!;
    expect(mia.events.map((e) => [e.id, e.sharedWith])).toEqual([
      ["shared", ["Emil"]],
      ["mia-own", []],
    ]);
    expect(mia.sharedListedUnder).toEqual([]);
    expect(emil.events.map((e) => e.id)).toEqual(["emil-own"]);
    expect(emil.sharedListedUnder).toEqual(["Mia"]);
  });

  it("does not merge the same event id from different calendars", () => {
    const split = splitSharedCalendarEvents(
      [ev("m", "x", "m@x", "2026-10-21T15:00:00.000Z"), ev("e", "x", "e@x", "2026-10-21T15:00:00.000Z")],
      kids,
    );
    expect(split.get("m")!.events).toHaveLength(1);
    expect(split.get("e")!.events).toHaveLength(1);
  });
});

describe("shapeCarriedHomework", () => {
  const today = { year: 2026, month: 10, day: 21 };
  const row = (date: string, text: string, over: Partial<Parameters<typeof shapeCarriedHomework>[0][number]> = {}) => ({
    date,
    kind: "homework" as const,
    subject: "Matte",
    text,
    done: false,
    ...over,
  });

  it("lists unfinished earlier homework oldest first with a relative day and flattened text", () => {
    const result = shapeCarriedHomework([row("2026-10-20", "- side 4\n- side 5"), row("2026-10-19", "Les")], today);
    expect(result.map((r) => [r.due, r.when, r.text])).toEqual([
      ["2026-10-19", "mandag 19. oktober", "Les"],
      ["2026-10-20", "i går", expect.stringContaining("side 4")],
    ]);
    expect(result[1].text).not.toContain("\n");
  });

  it("leaves out done, future and skipped rows", () => {
    const rows = [row("2026-10-20", "a", { done: true }), row("2026-10-22", "b"), row("2026-10-20", "c"), row("2026-10-19", "d")];
    expect(shapeCarriedHomework(rows, today, (r) => r.text === "d").map((r) => r.text)).toEqual(["c"]);
  });
});
