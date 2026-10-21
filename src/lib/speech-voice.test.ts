import { describe, expect, it } from "vitest";
import { pickVoice, type VoiceLike } from "./speech-voice";

function v(lang: string, name: string, localService = true, isDefault = false): VoiceLike {
  return { lang, name, localService, default: isDefault };
}

describe("pickVoice", () => {
  it("returns null for an empty list", () => {
    expect(pickVoice([], "nb-NO")).toBeNull();
  });

  it("never returns an English voice when no Norwegian voice exists (Firefox Linux)", () => {
    const voices = [v("en-US", "English", true, true), v("de-DE", "German")];
    expect(pickVoice(voices, "nb-NO")).toBeNull();
    expect(pickVoice(voices, "da-DK")).toBeNull();
  });

  it("finds Norwegian voices labelled with underscores and odd case (Chrome on Android)", () => {
    const voices = [v("en_US", "English", true, true), v("nb_NO", "Norwegian Bokmål")];
    expect(pickVoice(voices, "nb-NO")?.name).toBe("Norwegian Bokmål");
    expect(pickVoice([v("NO-no", "x")], "nb-NO")?.name).toBe("x");
  });

  it("accepts bare nb, no and nn labels", () => {
    expect(pickVoice([v("nb", "a")], "nb-NO")?.name).toBe("a");
    expect(pickVoice([v("no", "b")], "nb-NO")?.name).toBe("b");
    expect(pickVoice([v("nn", "c")], "nb-NO")?.name).toBe("c");
  });

  it("prefers exact locale, then nb, then no, then nn", () => {
    const voices = [v("nn-NO", "nn"), v("no-NO", "no"), v("nb", "nb"), v("nb-NO", "exact")];
    expect(pickVoice(voices, "nb-NO")?.name).toBe("exact");
    expect(pickVoice(voices.slice(0, 3), "nb-NO")?.name).toBe("nb");
    expect(pickVoice(voices.slice(0, 2), "nb-NO")?.name).toBe("no");
    expect(pickVoice(voices.slice(0, 1), "nb-NO")?.name).toBe("nn");
  });

  it("treats no and nn locales as the same family", () => {
    expect(pickVoice([v("nb-NO", "a")], "no")?.name).toBe("a");
    expect(pickVoice([v("nb-NO", "a")], "nn-NO")?.name).toBe("a");
  });

  it("prefers local voices, then Natural/Neural/Premium/Enhanced names", () => {
    const remote = v("nb-NO", "Remote", false);
    const local = v("nb-NO", "Local", true);
    const neural = v("nb-NO", "Microsoft Pernille Online (Natural)", false);
    expect(pickVoice([remote, local], "nb-NO")?.name).toBe("Local");
    expect(pickVoice([remote, neural], "nb-NO")?.name).toBe(neural.name);
    expect(pickVoice([v("nb-NO", "Plain"), v("nb-NO", "Nora (Enhanced)")], "nb-NO")?.name).toBe("Nora (Enhanced)");
    expect(pickVoice([v("nb-NO", "Premium A", false), v("nb-NO", "Plain", true)], "nb-NO")?.name).toBe("Plain");
  });

  it("language match beats quality: exact locale wins over a better-named nn voice", () => {
    const voices = [v("nn-NO", "Neural nn"), v("nb-NO", "Plain nb", false)];
    expect(pickVoice(voices, "nb-NO")?.name).toBe("Plain nb");
  });

  it("Safari iOS: Nora and Henrik", () => {
    const voices = [v("en-US", "Samantha", true, true), v("nb-NO", "Nora"), v("nb-NO", "Henrik"), v("da-DK", "Sara")];
    expect(["Nora", "Henrik"]).toContain(pickVoice(voices, "nb-NO")?.name);
    expect(pickVoice(voices, "da-DK")?.name).toBe("Sara");
  });

  it("Windows: Microsoft Jon", () => {
    const voices = [
      v("en-US", "Microsoft David - English (United States)", true, true),
      v("nb-NO", "Microsoft Jon - Norwegian (Bokmål, Norway)"),
    ];
    expect(pickVoice(voices, "nb-NO")?.name).toContain("Jon");
  });

  it("Danish only matches da", () => {
    const voices = [v("nb-NO", "Nora"), v("da_DK", "Danish")];
    expect(pickVoice(voices, "da-DK")?.name).toBe("Danish");
    expect(pickVoice([v("nb-NO", "Nora")], "da-DK")).toBeNull();
  });

  it("does not match languages that merely share a prefix", () => {
    expect(pickVoice([v("nl-NL", "Dutch"), v("nso-ZA", "x")], "nb-NO")).toBeNull();
  });
});
