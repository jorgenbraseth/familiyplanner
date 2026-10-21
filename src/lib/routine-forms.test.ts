import { describe, expect, it } from "vitest";
import {
  itemsFieldSchema,
  missingStarters,
  parseRoutineForm,
} from "./routine-forms";

const childId = "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}

describe("itemsFieldSchema", () => {
  it("trims names and drops blank rows", () => {
    const r = itemsFieldSchema.parse(
      JSON.stringify([{ name: "  Pusse tenner " }, { name: "  " }]),
    );
    expect(r).toEqual([{ name: "Pusse tenner" }]);
  });
  it("accepts an empty field", () => {
    expect(itemsFieldSchema.parse("")).toEqual([]);
  });
  it("rejects bad JSON, duplicates (case-insensitive), long names and more than 15", () => {
    expect(itemsFieldSchema.safeParse("nope").success).toBe(false);
    expect(
      itemsFieldSchema.safeParse(JSON.stringify([{ name: "A" }, { name: "a" }]))
        .success,
    ).toBe(false);
    expect(
      itemsFieldSchema.safeParse(JSON.stringify([{ name: "x".repeat(61) }]))
        .success,
    ).toBe(false);
    const many = Array.from({ length: 16 }, (_, i) => ({ name: `p${i}` }));
    expect(itemsFieldSchema.safeParse(JSON.stringify(many)).success).toBe(
      false,
    );
    expect(
      itemsFieldSchema.safeParse(JSON.stringify(many.slice(0, 15))).success,
    ).toBe(true);
  });
  it("rejects a bad id", () => {
    expect(
      itemsFieldSchema.safeParse(JSON.stringify([{ id: "x", name: "A" }]))
        .success,
    ).toBe(false);
  });
});

describe("parseRoutineForm", () => {
  it("parses a valid form, with and without a star task", () => {
    const base = {
      childId,
      slot: "morning",
      items: JSON.stringify([{ name: "Stå opp" }]),
    };
    expect(parseRoutineForm(form({ ...base, starTaskId: "" })).success).toBe(
      true,
    );
    expect(
      parseRoutineForm(form({ ...base, starTaskId: childId })).success,
    ).toBe(true);
  });
  it("rejects a bad slot, child id or star id", () => {
    const base = { childId, slot: "morning", items: "[]", starTaskId: "" };
    expect(parseRoutineForm(form({ ...base, slot: "noon" })).success).toBe(
      false,
    );
    expect(parseRoutineForm(form({ ...base, childId: "x" })).success).toBe(
      false,
    );
    expect(parseRoutineForm(form({ ...base, starTaskId: "x" })).success).toBe(
      false,
    );
  });
});

describe("missingStarters", () => {
  it("leaves out those already in the list", () => {
    expect(missingStarters(["A", "B", "C"], [" b "])).toEqual(["A", "C"]);
  });
});
