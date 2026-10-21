import { describe, expect, it } from "vitest";
import { amountSchema, noteSchema, parseTrackForm, reasonSchema, tasksFieldSchema } from "./star-forms";

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
  tasks: JSON.stringify([
    { name: "Ryddet rommet", stars: 2 },
    { name: "Dekket bordet", stars: 1 },
  ]),
};

describe("tasksFieldSchema", () => {
  const parse = (value: unknown) => tasksFieldSchema.safeParse(typeof value === "string" ? value : JSON.stringify(value));
  it("accepts tasks, keeps order and ids, trims names", () => {
    const id = "3f0c9a52-0f4e-4d0e-9a5b-2f1f6d1c7a11";
    const parsed = parse([{ id, name: "  A ", stars: 3 }, { name: "B", stars: 10 }]);
    expect(parsed.success && parsed.data).toEqual([{ id, name: "A", stars: 3 }, { name: "B", stars: 10 }]);
  });
  it("treats empty text and an empty list as no tasks", () => {
    expect(parse("")).toMatchObject({ success: true, data: [] });
    expect(parse([])).toMatchObject({ success: true, data: [] });
  });
  it("drops rows with a blank name", () => {
    expect(parse([{ name: "  ", stars: 1 }, { name: "A", stars: 1 }])).toMatchObject({ success: true, data: [{ name: "A", stars: 1 }] });
  });
  it("rejects bad stars, long names, duplicates, more than 20 and broken JSON", () => {
    expect(parse([{ name: "A", stars: 0 }]).success).toBe(false);
    expect(parse([{ name: "A", stars: 11 }]).success).toBe(false);
    expect(parse([{ name: "A", stars: 1.5 }]).success).toBe(false);
    expect(parse([{ name: "A", stars: "2" }]).success).toBe(false);
    expect(parse([{ name: "x".repeat(61), stars: 1 }]).success).toBe(false);
    expect(parse([{ name: "x".repeat(60), stars: 1 }]).success).toBe(true);
    expect(parse([{ name: "A", stars: 1 }, { name: " a ", stars: 2 }]).success).toBe(false);
    expect(parse(Array.from({ length: 21 }, (_, i) => ({ name: `T${i}`, stars: 1 }))).success).toBe(false);
    expect(parse(Array.from({ length: 20 }, (_, i) => ({ name: `T${i}`, stars: 1 }))).success).toBe(true);
    expect(parse("{oops").success).toBe(false);
    expect(parse({ name: "A" }).success).toBe(false);
    expect(parse([{ id: "nope", name: "A", stars: 1 }]).success).toBe(false);
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
      expect(parsed.data.tasks).toEqual([
        { name: "Ryddet rommet", stars: 2 },
        { name: "Dekket bordet", stars: 1 },
      ]);
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
  it("rejects an invalid task list", () => {
    const tasks = JSON.stringify([{ name: "A", stars: 11 }]);
    expect(parseTrackForm(form({ ...valid, tasks })).success).toBe(false);
  });
  it("allows a track without tasks", () => {
    expect(parseTrackForm(form({ ...valid, tasks: "[]" })).success).toBe(true);
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
