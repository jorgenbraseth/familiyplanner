/** Picks a speech synthesis voice for a locale without ever falling back to a different language. */

export type VoiceLike = { lang: string; name: string; localService: boolean; default: boolean };

/** Language codes that count as the same language, best first. */
const FAMILIES: Record<string, string[]> = {
  nb: ["nb", "no", "nn"],
  no: ["nb", "no", "nn"],
  nn: ["nb", "no", "nn"],
  da: ["da"],
};

function normalise(lang: string): string {
  return lang.trim().replace(/_/g, "-").toLowerCase();
}

const QUALITY = /natural|neural|premium|enhanced/i;

export function pickVoice<T extends VoiceLike>(voices: readonly T[], locale: string): T | null {
  const wanted = normalise(locale);
  const language = wanted.split("-")[0];
  const family = FAMILIES[language] ?? [language];

  let best: T | null = null;
  let bestScore = -1;
  for (const voice of voices) {
    const lang = normalise(voice.lang);
    const code = lang.split("-")[0];
    const rank = family.indexOf(code);
    if (rank === -1) continue;
    // Exact locale first, then the family in order; then local, quality-named, default voices.
    const languageScore = lang === wanted ? 100 : 90 - rank * 10 - (lang === code ? 0 : 1);
    const score = languageScore * 10 + (voice.localService ? 4 : 0) + (QUALITY.test(voice.name) ? 2 : 0) + (voice.default ? 1 : 0);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}
