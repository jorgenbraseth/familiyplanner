import { describe, expect, it } from "vitest";
import { pickAsPerson } from "./as-person";

const family = [
  { id: "11111111-1111-4111-8111-111111111111", role: "parent" },
  { id: "22222222-2222-4222-8222-222222222222", role: "child" },
  { id: "33333333-3333-4333-8333-333333333333", role: "screen" },
];

describe("pickAsPerson", () => {
  it("accepts a parent or child in the family", () => {
    expect(pickAsPerson(family, family[0].id)).toBe(family[0]);
    expect(pickAsPerson(family, family[1].id)).toBe(family[1]);
  });
  it("refuses missing, malformed, unknown and non-person values", () => {
    expect(pickAsPerson(family, undefined)).toBeNull();
    expect(pickAsPerson(family, null)).toBeNull();
    expect(pickAsPerson(family, 42)).toBeNull();
    expect(pickAsPerson(family, "not-a-uuid")).toBeNull();
    expect(pickAsPerson(family, "44444444-4444-4444-8444-444444444444")).toBeNull();
    expect(pickAsPerson(family, family[2].id)).toBeNull();
  });
});
