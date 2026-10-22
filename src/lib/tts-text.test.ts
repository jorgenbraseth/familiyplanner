import { describe, expect, it } from "vitest";
import { TTS_MAX_CHARS, buildSynthesizeBody, parseSpeakingRate, prepareSpeechText, stripMarkdown, truncateAtSentence } from "./tts-text";

describe("stripMarkdown", () => {
  it("removes headings, bullets, emphasis, code and links", () => {
    const md = "# Tittel\n- **Matte** side 4\n* `kode`\n1. Norsk\n[lenke](http://x.no)";
    expect(stripMarkdown(md)).toBe("Tittel\nMatte side 4\nkode\nNorsk\nlenke");
  });
  it("drops fenced code blocks", () => {
    expect(stripMarkdown("Hei ```a\nb``` du")).toBe("Hei du");
  });
});

describe("truncateAtSentence", () => {
  it("keeps short text", () => expect(truncateAtSentence("Hei. Du.", 100)).toBe("Hei. Du."));
  it("cuts at a sentence end", () => {
    const text = "Første setning her. " + "Andre setning som er lang. ".repeat(10);
    expect(truncateAtSentence(text, 60)).toMatch(/\.$/);
    expect(truncateAtSentence(text, 60).length).toBeLessThanOrEqual(60);
  });
  it("falls back to a word boundary", () => {
    expect(truncateAtSentence("aaaa bbbb cccc dddd", 12)).toBe("aaaa bbbb");
  });
});

describe("prepareSpeechText", () => {
  it("returns null when nothing is speakable", () => expect(prepareSpeechText(" ** ")).toBeNull());
  it("caps length", () => {
    expect(prepareSpeechText("Ord. ".repeat(1000))!.length).toBeLessThanOrEqual(TTS_MAX_CHARS);
  });
});

describe("parseSpeakingRate", () => {
  it("defaults and clamps", () => {
    expect(parseSpeakingRate(undefined)).toBe(1);
    expect(parseSpeakingRate("abc")).toBe(1);
    expect(parseSpeakingRate("0.1")).toBe(0.5);
    expect(parseSpeakingRate("3")).toBe(1.5);
    expect(parseSpeakingRate("0.9")).toBe(0.9);
  });
});

describe("buildSynthesizeBody", () => {
  it("includes the voice name when given", () => {
    expect(buildSynthesizeBody("Hei", "nb-NO-Wavenet-F", 1)).toEqual({
      input: { text: "Hei" },
      voice: { languageCode: "nb-NO", name: "nb-NO-Wavenet-F" },
      audioConfig: { audioEncoding: "MP3", speakingRate: 1 },
    });
  });
  it("leaves the name out for the retry", () => {
    expect(buildSynthesizeBody("Hei", null, 1.2).voice).toEqual({ languageCode: "nb-NO" });
  });
});

describe("speech of bullet lines", () => {
  it("turns bullets and sections into sentences without symbols", async () => {
    const { stripMarkdown, linesToSentences } = await import("./tts-text");
    const say = (t: string) => linesToSentences(stripMarkdown(t));
    expect(say("Gjør oppgavene:\n- Les side 41\n- Skriv tre setninger\n- Øv på gloser")).toBe(
      "Gjør oppgavene: Les side 41. Skriv tre setninger. Øv på gloser",
    );
    expect(say("1. Les\n2) Skriv")).toBe("Les. Skriv");
  });
});
