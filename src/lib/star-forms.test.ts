import { describe, expect, it } from "vitest";
import { amountSchema, noteSchema, parseTaskForm, parseTrackForm, reasonSchema, taskMemberOf } from "./star-forms";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const valid = {
  name: "Rydde rommet",
  goal: "30",
  milestone_every: "5",
  small_reward: "Is",
  big_reward: "Kinotur",
};

describe("parseTaskForm", () => {
  const child = "3f0c9a52-0f4e-4d0e-9a5b-2f1f6d1c7a11";
  const parse = (values: Record<string, string>) => parseTaskForm(form(values));
  it("accepts a task for all children or for one child, trimming the name", () => {
    const all = parse({ name: "  Ryddet rommet ", stars: "3", who: "all" });
    expect(all.success && all.data).toMatchObject({ name: "Ryddet rommet", stars: 3, who: "all" });
    expect(all.success && taskMemberOf(all.data)).toBeNull();
    const own = parse({ id: child, name: "A", stars: "10", who: child });
    expect(own.success && own.data).toMatchObject({ id: child, who: child });
    expect(own.success && taskMemberOf(own.data)).toBe(child);
  });
  it("treats a missing id as a new task", () => {
    const parsed = parse({ name: "A", stars: "1", who: "all" });
    expect(parsed.success && parsed.data.id).toBeUndefined();
  });
  it("rejects bad stars, names, who and ids", () => {
    expect(parse({ name: "A", stars: "0", who: "all" }).success).toBe(false);
    expect(parse({ name: "A", stars: "11", who: "all" }).success).toBe(false);
    expect(parse({ name: "A", stars: "1.5", who: "all" }).success).toBe(false);
    expect(parse({ name: "A", stars: "x", who: "all" }).success).toBe(false);
    expect(parse({ name: "  ", stars: "1", who: "all" }).success).toBe(false);
    expect(parse({ name: "x".repeat(61), stars: "1", who: "all" }).success).toBe(false);
    expect(parse({ name: "x".repeat(60), stars: "1", who: "all" }).success).toBe(true);
    expect(parse({ name: "A", stars: "1", who: "" }).success).toBe(false);
    expect(parse({ name: "A", stars: "1", who: "everyone" }).success).toBe(false);
    expect(parse({ id: "nope", name: "A", stars: "1", who: "all" }).success).toBe(false);
  });
});

describe("amountSchema", () => {
  it("accepts 1..10 only", () => {
    expect(amountSchema.parse("3")).toBe(3);
    expect(amountSchema.safeParse("0").success).toBe(false);
    expect(amountSchema.safeParse("11").success).toBe(false);
    expect(amountSchema.safeParse("1.5").success).toBe(false);
    expect(amountSchema.safeParse("x").success).toBe(false);
  });
});

describe("parseTrackForm", () => {
  it("parses a valid form", () => {
    const parsed = parseTrackForm(form(valid));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.goal).toBe(30);
      expect(parsed.data.milestone_every).toBe(5);
    }
  });
  it("requires the interval to divide the goal", () => {
    expect(parseTrackForm(form({ ...valid, milestone_every: "7" })).success).toBe(false);
  });
  it.each([
    ["name", ""],
    ["name", "x".repeat(61)],
    ["goal", "4"],
    ["goal", "201"],
    ["goal", "abc"],
    ["goal", "10.5"],
    ["milestone_every", "0"],
    ["milestone_every", "51"],
    ["small_reward", "x".repeat(201)],
  ])("rejects %s = %s", (key, value) => {
    expect(parseTrackForm(form({ ...valid, [key]: value })).success).toBe(false);
  });
});

describe("reason and note", () => {
  it("trims and bounds the reason", () => {
    expect(reasonSchema.parse("  Ryddet  ")).toBe("Ryddet");
    expect(reasonSchema.safeParse("   ").success).toBe(false);
    expect(reasonSchema.safeParse("x".repeat(121)).success).toBe(false);
  });
  it("turns an empty note into null", () => {
    expect(noteSchema.parse("  ")).toBeNull();
    expect(noteSchema.parse(" Bra! ")).toBe("Bra!");
    expect(noteSchema.safeParse("x".repeat(201)).success).toBe(false);
  });
});
