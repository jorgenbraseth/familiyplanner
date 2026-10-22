import { describe, expect, it } from "vitest";
import { flattenItemText, normalizeItemText, parseItemText, structureFlatText } from "./item-text";

describe("normalizeItemText", () => {
  it("keeps lines, trims them and collapses spaces and blank runs", () => {
    expect(normalizeItemText("  a  b \r\n\r\n\r\n\r\n c\t d  ")).toBe("a b\n\nc d");
  });
});

describe("parseItemText", () => {
  it("parses bullets with every marker into one list", () => {
    expect(parseItemText("- Les side 41\n* Skriv tre setninger\n• Øv på gloser\n– Ta med bok")).toEqual([
      { type: "bullets", items: ["Les side 41", "Skriv tre setninger", "Øv på gloser", "Ta med bok"] },
    ]);
  });
  it("parses a heading followed by bullets and a closing paragraph", () => {
    expect(parseItemText("Til fredag:\n- Les kapittel 3\n- Lær glosene\nHusk å skrive i skriveboka.")).toEqual([
      { type: "heading", text: "Til fredag:" },
      { type: "bullets", items: ["Les kapittel 3", "Lær glosene"] },
      { type: "paragraph", text: "Husk å skrive i skriveboka." },
    ]);
  });
  it("parses numbered and lettered lists", () => {
    expect(parseItemText("1. Les\n2) Skriv")).toEqual([{ type: "numbered", style: "decimal", items: ["Les", "Skriv"] }]);
    expect(parseItemText("a) Les\nb) Skriv")).toEqual([{ type: "numbered", style: "alpha", items: ["Les", "Skriv"] }]);
  });
  it("a blank line starts a new list", () => {
    expect(parseItemText("- a\n\n- b")).toEqual([
      { type: "bullets", items: ["a"] },
      { type: "bullets", items: ["b"] },
    ]);
  });
  it("leaves a plain sentence alone", () => {
    expect(parseItemText("Les side 41 i tekstboka")).toEqual([{ type: "paragraph", text: "Les side 41 i tekstboka" }]);
  });
  it("does not treat hyphenated words or a lone colon as structure", () => {
    expect(parseItemText("-bokstaven er viktig")).toEqual([{ type: "paragraph", text: "-bokstaven er viktig" }]);
    expect(parseItemText(":")).toEqual([{ type: "paragraph", text: ":" }]);
  });
  it("is safe with markup in the text (kept as text)", () => {
    expect(parseItemText("<b>hei</b>")).toEqual([{ type: "paragraph", text: "<b>hei</b>" }]);
  });
  it("returns no blocks for empty text", () => {
    expect(parseItemText("  \n ")).toEqual([]);
  });
});

describe("structureFlatText (existing flat items)", () => {
  it("splits inline bullets", () => {
    expect(structureFlatText("Gjør disse: • Les side 41 • Skriv tre setninger • Øv på gloser")).toBe(
      "Gjør disse:\n- Les side 41\n- Skriv tre setninger\n- Øv på gloser",
    );
    expect(structureFlatText("• Les • Skriv")).toBe("- Les\n- Skriv");
  });
  it("splits numbered runs", () => {
    expect(structureFlatText("Til onsdag: 1) Les side 41 2) Skriv tre setninger 3) Øv på gloser")).toBe(
      "Til onsdag:\n1. Les side 41\n2. Skriv tre setninger\n3. Øv på gloser",
    );
    expect(structureFlatText("1. Les kapittel 2 2. Regn oppgave 4")).toBe("1. Les kapittel 2\n2. Regn oppgave 4");
  });
  it("splits lettered runs", () => {
    expect(structureFlatText("Oppgaver: a) Les b) Skriv")).toBe("Oppgaver:\na) Les\nb) Skriv");
  });
  it("splits two or more spaced dashes", () => {
    expect(structureFlatText("Husk: - gymtøy - drikkeflaske - matpakke")).toBe("Husk:\n- gymtøy\n- drikkeflaske\n- matpakke");
    expect(structureFlatText("Les – skriv – øv")).toBe("Les\n- skriv\n- øv");
  });
  it("is conservative", () => {
    // one dash, hyphenated words, ranges, page ranges, times, lone numbers
    expect(structureFlatText("Les side 5 - husk boka")).toBe("Les side 5 - husk boka");
    expect(structureFlatText("Les e-boka og svar på blå-grønn oppgave")).toBe("Les e-boka og svar på blå-grønn oppgave");
    expect(structureFlatText("Les s. 41-42 og s. 43 - 44 og kl. 10-12")).toBe("Les s. 41-42 og s. 43 - 44 og kl. 10-12");
    expect(structureFlatText("Les 10 – 12 sider og 14 - 16 sider")).toBe("Les 10 – 12 sider og 14 - 16 sider");
    expect(structureFlatText("Les kapittel 1. Det er viktig")).toBe("Les kapittel 1. Det er viktig");
    expect(structureFlatText("Les 2. kapittel og 3) del")).toBe("Les 2. kapittel og 3) del");
    expect(structureFlatText("Svar på a) spørsmålet")).toBe("Svar på a) spørsmålet");
  });
  it("leaves text with line breaks unchanged", () => {
    expect(structureFlatText("a - b - c\nd")).toBe("a - b - c\nd");
  });
  it("parseItemText uses it for flat text", () => {
    expect(parseItemText("Til fredag: • Les • Skriv")).toEqual([
      { type: "heading", text: "Til fredag:" },
      { type: "bullets", items: ["Les", "Skriv"] },
    ]);
  });
});

describe("flattenItemText", () => {
  it("joins lines as sentences without markers", () => {
    expect(flattenItemText("Gjør oppgavene:\n- Les side 41\n- Skriv tre setninger\n- Øv på gloser")).toBe(
      "Gjør oppgavene: Les side 41. Skriv tre setninger. Øv på gloser",
    );
  });
  it("leaves one-line text unchanged", () => {
    expect(flattenItemText("Les side 41 i tekstboka")).toBe("Les side 41 i tekstboka");
    expect(flattenItemText("Les side 41. Skriv.")).toBe("Les side 41. Skriv.");
  });
});
