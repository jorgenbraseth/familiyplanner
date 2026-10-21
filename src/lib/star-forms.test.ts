import { describe, expect, it } from "vitest";
import { noteSchema, parsePresetReasons, parseTrackForm, reasonSchema } from "./star-forms";

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
  preset_reasons: "Ryddet rommet\nDekket bordet",
};

describe("parsePresetReasons", () => {
  it("trims, drops empty lines and duplicates, handles CRLF", () => {
    expect(parsePresetReasons("  A \r\n\r\nB\nA\n  \nC")).toEqual(["A", "B", "C"]);
  });
  it("returns an empty list for blank text", () => {
    expect(parsePresetReasons("")).toEqual([]);
    expect(parsePresetReasons(" \n \n")).toEqual([]);
  });
});

describe("parseTrackForm", () => {
  it("parses a valid form", () => {
    const parsed = parseTrackForm(form(valid));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.goal).toBe(30);
      expect(parsed.data.milestone_every).toBe(5);
      expect(parsed.data.preset_reasons).toEqual(["Ryddet rommet", "Dekket bordet"]);
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
  it("limits presets to 20 of at most 60 characters", () => {
    const twentyOne = Array.from({ length: 21 }, (_, i) => `Forslag ${i}`).join("\n");
    expect(parseTrackForm(form({ ...valid, preset_reasons: twentyOne })).success).toBe(false);
    expect(parseTrackForm(form({ ...valid, preset_reasons: "x".repeat(61) })).success).toBe(false);
    expect(parseTrackForm(form({ ...valid, preset_reasons: "x".repeat(60) })).success).toBe(true);
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
