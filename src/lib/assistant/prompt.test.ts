import { describe, expect, it } from "vitest";
import { buildSystemPrompt, firstNameOf } from "./prompt";

const now = new Date("2026-10-21T10:00:00Z"); // Wednesday, ISO week 43

describe("buildSystemPrompt", () => {
  it("includes dates, name, role and Norwegian for nb-NO", () => {
    const p = buildSystemPrompt({ now, firstName: "Mia", role: "child", locale: "nb-NO" });
    expect(p).toContain("onsdag 2026-10-21");
    expect(p).toContain("ISO week 43 of 2026");
    expect(p).toContain("torsdag 2026-10-22");
    expect(p).toContain("Mia (child)");
    expect(p).toContain("Svar på norsk bokmål.");
    expect(p).toContain("never do the homework");
  });

  it("uses Danish for da-DK and parent rules for parents", () => {
    const p = buildSystemPrompt({ now, firstName: "Jon", role: "parent", locale: "da-DK" });
    expect(p).toContain("Svar på dansk.");
    expect(p).toContain("The person asking is a parent");
    expect(p).not.toContain("never do the homework");
  });

  it("uses the Copenhagen date near midnight", () => {
    const late = new Date("2026-10-21T23:30:00Z"); // already Thursday in Copenhagen
    expect(buildSystemPrompt({ now: late, firstName: "A", role: "child", locale: "nb-NO" })).toContain("Today is torsdag 2026-10-22");
  });

  it("starts with the stable rules", () => {
    const a = buildSystemPrompt({ now, firstName: "A", role: "child", locale: "nb-NO" });
    const b = buildSystemPrompt({ now: new Date("2027-01-05T10:00:00Z"), firstName: "B", role: "child", locale: "da-DK" });
    expect(a.slice(0, 300)).toBe(b.slice(0, 300));
  });
});

describe("firstNameOf", () => {
  it("takes the first word", () => expect(firstNameOf("  Mia Berg ")).toBe("Mia"));
});
