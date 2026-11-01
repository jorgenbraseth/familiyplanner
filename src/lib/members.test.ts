import { describe, expect, it } from "vitest";
import { familyMembers, isFamilyMember, memberInputSchema, normalizeEmail, parseMemberForm } from "./members";

function form(values: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  }
  return data;
}

const valid = {
  name: " Ola ",
  email: " Ola.Nordmann@Example.com ",
  role: "child",
  colour: "#16a34a",
  locale: "nb-NO",
};

describe("parseMemberForm", () => {
  it("trims, lowercases the email and stores no calendars as an empty list", () => {
    const result = parseMemberForm(form(valid));
    expect(result.success && result.data).toEqual({
      name: "Ola",
      email: "ola.nordmann@example.com",
      role: "child",
      calendar_ids: [],
      colour: "#16a34a",
      locale: "nb-NO",
    });
  });

  it("takes several calendar ids: trims, drops blanks and repeats, keeps the order", () => {
    const result = parseMemberForm(form({ ...valid, calendar_ids: [" kid@example.com ", "", "shared@example.com", "kid@example.com", "  "] }));
    expect(result.success && result.data.calendar_ids).toEqual(["kid@example.com", "shared@example.com"]);
  });

  it("allows 10 calendars but not 11, and rejects a calendar id over 200 characters", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `cal${i}@example.com`);
    expect(parseMemberForm(form({ ...valid, calendar_ids: ids(10) })).success).toBe(true);
    expect(parseMemberForm(form({ ...valid, calendar_ids: ids(11) })).success).toBe(false);
    expect(parseMemberForm(form({ ...valid, calendar_ids: ["a".repeat(201)] })).success).toBe(false);
    expect(parseMemberForm(form({ ...valid, calendar_ids: ["a".repeat(200)] })).success).toBe(true);
  });

  it.each([
    ["name", ""],
    ["email", "not-an-email"],
    ["role", "admin"],
    ["colour", "green"],
    ["locale", "sv-SE"],
  ])("rejects a bad %s", (key, value) => {
    expect(parseMemberForm(form({ ...valid, [key]: value })).success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(parseMemberForm(new FormData()).success).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Kari@Example.COM ")).toBe("kari@example.com");
  });
});

describe("family screen role", () => {
  it("accepts screen in the members form schema", () => {
    const parsed = memberInputSchema.safeParse({
      name: "Stua",
      email: "Skjerm@Example.com",
      role: "screen",
      calendar_ids: [],
      colour: "#112233",
      locale: "nb-NO",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.role).toBe("screen");
  });

  it("leaves the screen out of the family", () => {
    const all = [
      { id: "1", role: "parent" as const },
      { id: "2", role: "child" as const },
      { id: "3", role: "screen" as const },
    ];
    expect(familyMembers(all).map((m) => m.id)).toEqual(["1", "2"]);
    expect(isFamilyMember({ role: "screen" })).toBe(false);
    expect(isFamilyMember({ role: "child" })).toBe(true);
  });
});
