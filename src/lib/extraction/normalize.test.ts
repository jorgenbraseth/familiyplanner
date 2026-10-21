import { describe, expect, it } from "vitest";
import { ExtractionError } from "./errors";
import { normalizeExtraction } from "./normalize";

// ISO week 43 of 2026: Monday 2026-10-19 … Sunday 2026-10-25.
const norm = (raw: unknown) => normalizeExtraction(raw, 2026, 43);
const item = (kind: string, text: string, subject: string | null = null) => ({ kind, subject, text });

describe("normalizeExtraction", () => {
  it("flattens valid days into items", () => {
    const out = norm({
      days: [{ date: "2026-10-20", items: [item("lesson", "Reading", "Norwegian"), item("bring", "Gym clothes")] }],
      notes: null,
    });
    expect(out).toEqual([
      { date: "2026-10-20", kind: "lesson", subject: "Norwegian", text: "Reading" },
      { date: "2026-10-20", kind: "bring", subject: null, text: "Gym clothes" },
    ]);
  });

  it("drops dates outside the week and invalid dates", () => {
    const out = norm({
      days: [
        { date: "2026-10-18", items: [item("note", "before")] },
        { date: "2026-11-03", items: [item("note", "too late")] },
        { date: "2026-02-30", items: [item("note", "not a date")] },
        { date: "20.10.2026", items: [item("note", "wrong format")] },
        { date: "2026-10-21", items: [item("note", "ok")] },
      ],
      notes: null,
    });
    expect(out.map((i) => i.text)).toEqual(["ok"]);
  });

  it("keeps homework due the following week", () => {
    const out = norm({ days: [{ date: "2026-11-01", items: [item("homework", "Math sheet")] }, { date: "2026-10-27", items: [item("homework", "Read")] }], notes: null });
    expect(out.map((i) => i.date)).toEqual(["2026-10-27", "2026-11-01"]);
    // Sunday + 7 days (2026-11-01) is the last accepted day.
    expect(norm({ days: [{ date: "2026-11-01", items: [item("note", "x")] }, { date: "2026-11-02", items: [item("note", "y")] }], notes: null })).toHaveLength(1);
  });

  it("trims, drops empty text, caps lengths and nulls empty subjects", () => {
    const out = norm({
      days: [
        {
          date: "2026-10-19",
          items: [item("note", "  hello  ", "   "), item("note", "   "), item("lesson", "x".repeat(2000), "s".repeat(300))],
        },
      ],
      notes: null,
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: "lesson", subject: "s".repeat(100) });
    expect(out[0].text).toHaveLength(1000);
    expect(out[1]).toEqual({ date: "2026-10-19", kind: "note", subject: null, text: "hello" });
  });

  it("dedupes identical items", () => {
    const out = norm({
      days: [
        { date: "2026-10-19", items: [item("homework", "Read", "Eng"), item("homework", " Read ", "Eng")] },
        { date: "2026-10-19", items: [item("homework", "Read", "Eng"), item("homework", "Read", "Math")] },
      ],
      notes: null,
    });
    expect(out).toHaveLength(2);
  });

  it("turns top-level notes into a Monday note", () => {
    const out = norm({ days: [], notes: "  Parent meeting soon  " });
    expect(out).toEqual([{ date: "2026-10-19", kind: "note", subject: null, text: "Parent meeting soon" }]);
    expect(norm({ days: [], notes: "  " })).toEqual([]);
  });

  it("throws ExtractionError on an invalid shape", () => {
    expect(() => norm({ days: "nope" })).toThrow(ExtractionError);
    expect(() => norm(null)).toThrow(ExtractionError);
    expect(() => norm({ days: [{ date: "2026-10-19", items: [item("party", "x")] }], notes: null })).toThrow(ExtractionError);
  });

  it("sorts by date, then kind order, stably", () => {
    const out = norm({
      days: [
        { date: "2026-10-21", items: [item("note", "n")] },
        { date: "2026-10-20", items: [item("note", "n1"), item("bring", "b"), item("homework", "h1"), item("lesson", "l"), item("homework", "h2")] },
      ],
      notes: null,
    });
    expect(out.map((i) => `${i.date}:${i.text}`)).toEqual([
      "2026-10-20:l",
      "2026-10-20:h1",
      "2026-10-20:h2",
      "2026-10-20:b",
      "2026-10-20:n1",
      "2026-10-21:n",
    ]);
  });

  it("caps the total at 300 items", () => {
    const items = Array.from({ length: 350 }, (_, i) => item("note", `n${i}`));
    expect(norm({ days: [{ date: "2026-10-19", items }], notes: null })).toHaveLength(300);
  });
});
