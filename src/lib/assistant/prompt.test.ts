import { describe, expect, it } from "vitest";
import { buildSystemPrompt, firstNameOf, type PromptContext } from "./prompt";

const now = new Date("2026-10-21T10:00:00Z"); // Wednesday, ISO week 43

const family = [
  { id: "p1", name: "Kari Berg", role: "parent" as const },
  { id: "c1", name: "Mia", role: "child" as const },
  { id: "c2", name: "Emil", role: "child" as const },
];

function ctx(overrides: Partial<PromptContext> = {}): PromptContext {
  return { now, meId: "c1", firstName: "Mia", role: "child", family, ...overrides };
}

describe("buildSystemPrompt", () => {
  it("includes dates, name, role and the family", () => {
    const p = buildSystemPrompt(ctx());
    expect(p).toContain("onsdag 2026-10-21");
    expect(p).toContain("ISO week 43 of 2026");
    expect(p).toContain("torsdag 2026-10-22");
    expect(p).toContain("Mia (child)");
    expect(p).toContain("- Kari (full name Kari Berg), parent");
    expect(p).toContain("- Mia, child (the person asking)");
    expect(p).toContain("- Emil, child");
    expect(p).toContain("never do the homework");
  });

  it("states the bokmål rule early and firmly, with an example, and never mentions Danish", () => {
    for (const role of ["child", "parent"] as const) {
      const p = buildSystemPrompt(ctx({ role }));
      expect(p).toContain("ALWAYS answer in Norwegian bokmål");
      expect(p.indexOf("Norwegian bokmål")).toBeLessThan(300);
      expect(p).toContain("Svar alltid på norsk bokmål.");
      expect(p).toContain("I morgen har Mia matte og norsk");
      expect(p).not.toMatch(/dansk|danish/i);
    }
  });

  it("gives the current time and the rules for 'next' questions", () => {
    const p = buildSystemPrompt(ctx());
    expect(p).toContain("The time now is 12:00 (Europe/Copenhagen)");
    expect(p).toContain("find_next");
    expect(p).toContain("Never report something that has already happened today");
    expect(p).toContain("Never say vague things like");
    expect(p).toContain("de neste tre ukene");
    expect(p).toContain("answer for each child by name");
  });

  it("uses parent rules for parents", () => {
    const p = buildSystemPrompt(ctx({ meId: "p1", firstName: "Kari", role: "parent" }));
    expect(p).toContain("The person asking is a parent");
    expect(p).not.toContain("never do the homework");
  });

  it("uses the Copenhagen date near midnight", () => {
    const late = new Date("2026-10-21T23:30:00Z"); // already Thursday in Copenhagen
    expect(buildSystemPrompt(ctx({ now: late }))).toContain("Today is torsdag 2026-10-22");
  });

  it("starts with the same stable rules for everyone", () => {
    const a = buildSystemPrompt(ctx());
    const b = buildSystemPrompt(ctx({ now: new Date("2027-01-05T10:00:00Z"), meId: "p1", firstName: "Kari", role: "parent" }));
    expect(a.slice(0, 300)).toBe(b.slice(0, 300));
  });
});

describe("firstNameOf", () => {
  it("takes the first word", () => expect(firstNameOf("  Mia Berg ")).toBe("Mia"));
});
