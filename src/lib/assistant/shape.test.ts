import { describe, expect, it } from "vitest";
import { MAX_PLAN_ITEMS, NO_ACCESS_NOTE, normalizeKind, resolveMember, shapePlanItems, shapeSchoolDays } from "./shape";

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
    expect("error" in resolveMember(members, "emil")).toBe(true);
    expect("error" in resolveMember(members, "zed")).toBe(true);
    expect("error" in resolveMember(members, "  ")).toBe(true);
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
