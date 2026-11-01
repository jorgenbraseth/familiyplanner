import { describe, expect, it } from "vitest";
import { genitive, t } from "./i18n";

describe("genitive", () => {
  it("adds s, or just an apostrophe after s, x and z", () => {
    expect(genitive("Emma")).toBe("Emmas");
    expect(genitive("Jonas")).toBe("Jonas'");
    expect(genitive("Max")).toBe("Max'");
  });
});

describe("screen assistant labels", () => {
  it("names the person", () => {
    expect(t.screen.thisIs("Emma")).toBe("Dette er Emmas side");
    expect(t.screen.askContext("Emma")).toBe("Spør om Emmas dag");
    expect(t.screen.askContext("Jonas")).toBe("Spør om Jonas' dag");
    expect(t.screen.askLabel("Emma")).toContain("Emma");
    expect(t.assistant.titleFor("Emma")).toBe("Hei Emma! Hva lurer du på?");
    expect(t.assistant.askingAs("Emma")).toBe("Du spør som Emma");
  });
});
