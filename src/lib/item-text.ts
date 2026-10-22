/**
 * Structured text of plan items (homework, messages, events). The text keeps the school's structure as plain
 * lines: one point per line, `- ` bullets, `1. ` / `a) ` numbered points and a short line ending with ":" as a
 * sub-heading. These pure helpers normalize that text for storage, parse it into blocks for rendering and flatten
 * it again for one-line titles and speech. Older items were stored flat; `structureFlatText` recovers lists
 * from them conservatively.
 */

export type ListStyle = "decimal" | "alpha";

export type TextBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "numbered"; style: ListStyle; items: string[] };

/**
 * Tidies text but keeps its line breaks: unifies newlines, trims every line, collapses runs of spaces inside a
 * line, collapses 3+ line breaks to one blank line and trims the ends.
 */
export function normalizeItemText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const BULLET = /^[-*•–—·▪]\s+(\S.*)$/;
const NUMBERED = /^(\d{1,2})[.)]\s+(\S.*)$/;
const LETTERED = /^([a-z])\)\s+(\S.*)$/i;
const MAX_HEADING = 80;

/** Parses the text into headings, paragraphs and lists. Text stored without line breaks is split first. */
export function parseItemText(text: string): TextBlock[] {
  const source = normalizeItemText(text);
  const lines = (source.includes("\n") ? source : structureFlatText(source)).split("\n");
  const blocks: TextBlock[] = [];

  for (const line of lines) {
    if (line === "") {
      // A blank line ends a list so that the next bullet starts a new one.
      blocks.push({ type: "paragraph", text: "" });
      continue;
    }
    const tail = blocks[blocks.length - 1];
    const bullet = BULLET.exec(line);
    if (bullet) {
      if (tail && tail.type === "bullets") tail.items.push(bullet[1]);
      else blocks.push({ type: "bullets", items: [bullet[1]] });
      continue;
    }
    const numbered = NUMBERED.exec(line);
    const lettered = numbered ? null : LETTERED.exec(line);
    const match = numbered ?? lettered;
    if (match) {
      const style: ListStyle = numbered ? "decimal" : "alpha";
      if (tail && tail.type === "numbered" && tail.style === style) tail.items.push(match[2]);
      else blocks.push({ type: "numbered", style, items: [match[2]] });
      continue;
    }
    if (line.endsWith(":") && line.length > 1 && line.length <= MAX_HEADING) {
      blocks.push({ type: "heading", text: line });
      continue;
    }
    blocks.push({ type: "paragraph", text: line });
  }
  // Blank paragraphs were only separators.
  return blocks.filter((b) => !(b.type === "paragraph" && b.text === ""));
}

const NUMBER_MARK = /(?<![^\s])(\d{1,2})[.)]\s+(?=\S)/g;
const LETTER_MARK = /(?<![^\s(])([a-z])\)\s+(?=\S)/gi;
const DOT_MARK = /\s[•·▪]\s+/g;
const DASH_MARK = /\s[-–—]\s+/g;

type Mark = { index: number; end: number };

/** The marks forming the run 1, 2, 3... (or a, b, c...) in order, or [] when there are fewer than two. */
function run(text: string, pattern: RegExp, valueOf: (m: string) => number): Mark[] {
  const marks: Mark[] = [];
  let expected = 1;
  for (const m of text.matchAll(pattern)) {
    if (valueOf(m[1]) !== expected) continue;
    marks.push({ index: m.index, end: m.index + m[0].length });
    expected++;
  }
  return marks.length >= 2 ? marks : [];
}

/** Marks of dashes with spaces on both sides (at least two), but not ranges like "41 - 42" or "10 – 12". */
function dashMarks(text: string): Mark[] {
  const marks: Mark[] = [];
  for (const m of text.matchAll(DASH_MARK)) {
    const before = text[m.index - 1] ?? "";
    const after = text[m.index + m[0].length] ?? "";
    if (/\d/.test(before) && /\d/.test(after)) continue;
    marks.push({ index: m.index, end: m.index + m[0].length });
  }
  return marks.length >= 2 ? marks : [];
}

function cut(text: string, marks: Mark[], prefix: (n: number) => string): string {
  const lead = text.slice(0, marks[0].index).trim();
  const lines = lead ? [lead] : [];
  marks.forEach((mark, i) => {
    const next = marks[i + 1]?.index ?? text.length;
    const body = text.slice(mark.end, next).trim();
    if (body) lines.push(`${prefix(i)}${body}`);
  });
  return lines.join("\n");
}

/**
 * Recovers a list from text stored without line breaks. Conservative: it only splits on clear inline markers
 * (" • ", two or more " - " / " – " dashes that are not number ranges, a numbered "1) … 2) …" or lettered
 * "a) … b) …" run), never on hyphenated words, "s. 41-42" or "10-12". Text with a line break is left alone.
 */
export function structureFlatText(text: string): string {
  if (text.includes("\n")) return text;
  const spaced = ` ${text}`;
  const dots = [...spaced.matchAll(DOT_MARK)].map((m) => ({ index: m.index, end: m.index + m[0].length }));
  if (dots.length > 0) return cut(spaced, dots, () => "- ");
  const numbers = run(text, NUMBER_MARK, Number);
  if (numbers.length) return cut(text, numbers, (i) => `${i + 1}. `);
  const letters = run(text, LETTER_MARK, (c) => c.toLowerCase().charCodeAt(0) - 96);
  if (letters.length) return cut(text, letters, (i) => `${String.fromCharCode(97 + i)}) `);
  const dashes = dashMarks(text);
  if (dashes.length) return cut(text, dashes, () => "- ");
  return text;
}

/** One-line version for titles and speech: markers dropped, lines joined as sentences. */
export function flattenItemText(text: string): string {
  const pieces = parseItemText(text).flatMap((block) =>
    block.type === "bullets" || block.type === "numbered" ? block.items : [block.text],
  );
  return pieces.reduce((out, piece) => {
    if (out === "") return piece;
    return /[.!?:;,]$/.test(out) ? `${out} ${piece}` : `${out}. ${piece}`;
  }, "");
}
