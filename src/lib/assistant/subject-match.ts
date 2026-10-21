// Subject matching for the assistant's tools. Pure: no server access.
// People say "gymnastikk" where the timetable says "Kroppsøving" or "KRØ", and "matte" for "Matematikk".
// A query matches a subject when both belong to the same alias group, or when the query is plain text
// contained in the subject. "mat" alone is food (lunch, "Mat og helse"), never mathematics.

/** Lowercase, diacritics and Norwegian letters folded (ø to o, å to a, æ to ae), punctuation turned into spaces, "&" into "og". */
export function normalizeSubject(text: string): string {
  return text
    .toLocaleLowerCase("nb-NO")
    .replace(/&/g, " og ")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Alias groups, written in plain spelling (they are normalized when loaded). Whole words or word sequences only; the exact-only codes (EXACT_ONLY_CODES) only when they are the whole text. */
export const SUBJECT_ALIAS_GROUPS: Record<string, readonly string[]> = {
  gym: ["gym", "gymnastikk", "kroppsøving", "kroppsøvning", "krø", "kro", "idrett"],
  matematikk: ["matte", "matematikk", "ma"],
  norsk: ["norsk", "nor", "no"],
  engelsk: ["engelsk", "eng", "en"],
  naturfag: ["naturfag", "nat"],
  samfunnsfag: ["samfunnsfag", "samf"],
  kunst_og_handverk: ["kunst og håndverk", "k&h", "kh", "k h"],
  musikk: ["musikk", "mus"],
  krle: ["krle", "rle"],
  svomming: ["svømming", "svøm"],
  mat_og_helse: ["mat og helse", "mh"],
};

/**
 * Codes that are also ordinary Norwegian words or too ambiguous inside a longer text ("en venn", "si no",
 * "lunsj på kro"): they only match when they are the whole text, like a timetable code. (Normalized spelling, so
 * "krø" is "kro".)
 */
const EXACT_ONLY_CODES: ReadonlySet<string> = new Set(
  ["en", "no", "ma", "kro", "mus", "nat", "kh", "k h", "mh", "rle", "eng", "nor", "samf", "krø"].map(normalizeSubject),
);

const GROUP_PHRASES: { group: string; phrases: string[][] }[] = Object.entries(SUBJECT_ALIAS_GROUPS).map(([group, aliases]) => ({
  group,
  phrases: aliases.map((a) => normalizeSubject(a).split(" ")),
}));

function containsSequence(words: readonly string[], phrase: readonly string[]): boolean {
  for (let i = 0; i + phrase.length <= words.length; i++) {
    if (phrase.every((w, j) => words[i + j] === w)) return true;
  }
  return false;
}

/** The alias groups a text belongs to (any alias present as whole words). */
export function subjectGroups(text: string): Set<string> {
  const words = normalizeSubject(text).split(" ").filter(Boolean);
  const found = new Set<string>();
  for (const { group, phrases } of GROUP_PHRASES) {
    const hit = phrases.some((p) =>
      EXACT_ONLY_CODES.has(p.join(" ")) ? words.join(" ") === p.join(" ") : containsSequence(words, p),
    );
    if (hit) found.add(group);
  }
  return found;
}

/**
 * True when `query` (what the person said) names `subject` (what the timetable or plan says).
 * An empty query matches everything. Texts of four or more letters also match as plain text inside the subject
 * ("kroppsøv" finds "Kroppsøving"); shorter ones only as whole words, so "mat" does not find "Matematikk".
 */
export function matchesSubject(query: string | null | undefined, subject: string | null | undefined): boolean {
  const q = normalizeSubject(query ?? "");
  if (!q) return true;
  const s = normalizeSubject(subject ?? "");
  if (!s) return false;
  const qGroups = subjectGroups(q);
  if (qGroups.size > 0) {
    for (const g of subjectGroups(s)) if (qGroups.has(g)) return true;
  }
  if (EXACT_ONLY_CODES.has(q)) return s === q;
  if (containsSequence(s.split(" "), q.split(" "))) return true;
  return q.length >= 4 && s.includes(q);
}
