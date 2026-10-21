import { describe, expect, it } from "vitest";
import { matchesSubject, normalizeSubject, subjectGroups } from "./subject-match";

describe("normalizeSubject", () => {
  it("folds case, Norwegian letters and punctuation", () => {
    expect(normalizeSubject("  Kroppsøving/GYM ")).toBe("kroppsoving gym");
    expect(normalizeSubject("K&H")).toBe("k og h");
    expect(normalizeSubject("Svømming")).toBe("svomming");
  });
});

describe("matchesSubject", () => {
  it("finds the PE lessons from any gym word", () => {
    for (const query of ["gym", "gymnastikk", "Gymnastikk", "kroppsøving", "idrett", "krø", "KRO"]) {
      for (const subject of ["Kroppsøving", "KRØ", "Kroppsøving/gym", "Gym", "Idrett", "Gymnastikk"]) {
        expect(matchesSubject(query, subject), `${query} vs ${subject}`).toBe(true);
      }
    }
  });
  it("maps the other subject groups", () => {
    expect(matchesSubject("matte", "Matematikk")).toBe(true);
    expect(matchesSubject("matematikk", "Ma")).toBe(true);
    expect(matchesSubject("norsk", "No")).toBe(true);
    expect(matchesSubject("engelsk", "Eng")).toBe(true);
    expect(matchesSubject("naturfag", "Nat")).toBe(true);
    expect(matchesSubject("samfunnsfag", "Samf.")).toBe(true);
    expect(matchesSubject("kunst og håndverk", "K&H")).toBe(true);
    expect(matchesSubject("k&h", "Kunst og håndverk")).toBe(true);
    expect(matchesSubject("musikk", "Mus")).toBe(true);
    expect(matchesSubject("krle", "RLE")).toBe(true);
    expect(matchesSubject("svømming", "Svøm")).toBe(true);
    expect(matchesSubject("mat og helse", "MH")).toBe(true);
  });
  it("does not mix unrelated subjects", () => {
    expect(matchesSubject("gym", "Matematikk")).toBe(false);
    expect(matchesSubject("norsk", "Engelsk")).toBe(false);
    expect(matchesSubject("musikk", "Matematikk")).toBe(false);
  });
  it("keeps Mat og helse apart from mathematics", () => {
    expect(matchesSubject("matte", "Mat og helse")).toBe(false);
    expect(matchesSubject("matematikk", "Mat og helse")).toBe(false);
    expect(matchesSubject("mat og helse", "Matematikk")).toBe(false);
    expect(subjectGroups("Mat og helse")).toEqual(new Set(["mat_og_helse"]));
  });
  it("treats plain mat as food, not mathematics", () => {
    expect(matchesSubject("mat", "Matematikk")).toBe(false);
    expect(matchesSubject("mat", "Mat")).toBe(true);
    expect(matchesSubject("mat", "Lunsj")).toBe(false);
  });
  it("matches plain text of four letters or more inside a subject", () => {
    expect(matchesSubject("kroppsøv", "Kroppsøving")).toBe(true);
    expect(matchesSubject("fransk", "Fransk 2")).toBe(true);
    expect(matchesSubject("fransk", "Spansk")).toBe(false);
  });
  it("matches short codes only as the whole text, never as a word inside a longer title", () => {
    expect(matchesSubject("engelsk", "Middag med en venn")).toBe(false);
    expect(matchesSubject("norsk", "Si no til godteri")).toBe(false);
    expect(matchesSubject("gym", "Lunsj på kro")).toBe(false);
    expect(matchesSubject("matematikk", "Ma på tur")).toBe(false);
    expect(matchesSubject("gym", "Gym i hallen")).toBe(true);
    expect(matchesSubject("gymnastikk", "Gym i hallen")).toBe(true);
    expect(matchesSubject("no", "Si no til godteri")).toBe(false);
    expect(matchesSubject("engelsk", "ENG")).toBe(true);
    expect(matchesSubject("gymnastikk", "KRØ")).toBe(true);
    expect(matchesSubject("norsk", "no")).toBe(true);
    expect(matchesSubject("musikk", "Mus")).toBe(true);
  });
  it("matches everything for an empty query", () => {
    expect(matchesSubject("", "Norsk")).toBe(true);
    expect(matchesSubject(null, "Norsk")).toBe(true);
  });
  it("finds the alias inside a longer text", () => {
    expect(matchesSubject("gymnastikk", "Gymnastikk i hallen")).toBe(true);
    expect(matchesSubject("gymnastikk", "Sangstund")).toBe(false);
  });
});
