import { describe, expect, it } from "vitest";
import { normalizeEmail, parseMemberForm } from "./members";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const valid = {
  name: " Ola ",
  email: " Ola.Nordmann@Example.com ",
  role: "child",
  calendar_id: "",
  colour: "#16a34a",
  locale: "nb-NO",
};

describe("parseMemberForm", () => {
  it("trims, lowercases the email and stores an empty calendar id as null", () => {
    const result = parseMemberForm(form(valid));
    expect(result.success && result.data).toEqual({
      name: "Ola",
      email: "ola.nordmann@example.com",
      role: "child",
      calendar_id: null,
      colour: "#16a34a",
      locale: "nb-NO",
    });
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
