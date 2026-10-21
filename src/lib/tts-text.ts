/** Pure helpers for text-to-speech: no secrets, no network, safe to unit test. */

export const TTS_MAX_CHARS = 2000;
/** Requests larger than this are refused (413) instead of truncated. */
export const TTS_MAX_INPUT_CHARS = 5000;
export const TTS_DEFAULT_VOICE = "nb-NO-Wavenet-F";
export const TTS_LANGUAGE = "nb-NO";

/** Removes the simple markdown the assistant may produce so it isn't read out as symbols. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*(?:[-*+•]|\d+[.)])[ \t]+/gm, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#]+/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Cuts at the last sentence end before `max`; falls back to a word boundary, then a hard cut. */
export function truncateAtSentence(text: string, max: number = TTS_MAX_CHARS): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const sentence = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "), head.lastIndexOf("\n"));
  if (sentence > max / 2) return head.slice(0, sentence + 1).trim();
  const space = head.lastIndexOf(" ");
  return (space > max / 2 ? head.slice(0, space) : head).trim();
}

/** Text to speak, or null when nothing speakable is left. */
export function prepareSpeechText(raw: string): string | null {
  const cleaned = truncateAtSentence(stripMarkdown(raw.trim()));
  return cleaned === "" ? null : cleaned;
}

/** Speaking rate from env: default 1.0, clamped to 0.5–1.5. */
export function parseSpeakingRate(value: string | undefined): number {
  const n = value === undefined || value.trim() === "" ? NaN : Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1.5, Math.max(0.5, n));
}

/** Request body for text:synthesize. `voiceName` null means "any voice for the language". */
export function buildSynthesizeBody(text: string, voiceName: string | null, speakingRate: number) {
  return {
    input: { text },
    voice: voiceName ? { languageCode: TTS_LANGUAGE, name: voiceName } : { languageCode: TTS_LANGUAGE },
    audioConfig: { audioEncoding: "MP3", speakingRate },
  };
}
