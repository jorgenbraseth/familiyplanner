import { describe, expect, it } from "vitest";
import { MAX_PLAN_ITEMS, NO_ACCESS_NOTE, resolveMember, shapePlanItems } from "./shape";

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
      { date: "2026-10-21", kind: "bring", subject: null, text: "Gymtøy", done: true, sort: 2 },
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
      kind: "note" as const,
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
