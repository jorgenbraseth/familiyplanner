import { describe, expect, it } from "vitest";
import { ExtractionError } from "./errors";
import { normalizeExtraction } from "./normalize";

// ISO week 43 of 2026: Monday 2026-10-19 … Sunday 2026-10-25.
const full = (raw: unknown) => normalizeExtraction(raw, 2026, 43);
const norm = (raw: unknown) => full(raw).items;
const item = (
  kind: string,
  text: string,
  subject: string | null = null,
  extra: Record<string, unknown> = {},
) => ({
  kind,
  subject,
  text,
  period: null,
  start: null,
  end: null,
  ...extra,
});
const day = (
  date: string,
  items: unknown[],
  school_start: string | null = null,
  school_end: string | null = null,
) => ({
  date,
  school_start,
  school_end,
  items,
});

describe("normalizeExtraction", () => {
  it("flattens valid days into items", () => {
    const out = full({
      days: [
        day("2026-10-20", [
          item("lesson", "Reading", "Norwegian"),
          item("bring", "Gym clothes"),
        ]),
      ],
      notes: null,
    });
    expect(out.items).toEqual([
      {
        date: "2026-10-20",
        kind: "lesson",
        subject: "Norwegian",
        text: "Reading",
        period: null,
        starts_at: null,
        ends_at: null,
        audience: "both",
        whole_week: false,
      },
      {
        date: "2026-10-20",
        kind: "message",
        subject: null,
        text: "Gym clothes",
        period: null,
        starts_at: null,
        ends_at: null,
        audience: "child",
        whole_week: false,
      },
    ]);
    expect(out.days).toEqual([]);
  });

  it("drops dates outside the week and invalid dates", () => {
    const out = norm({
      days: [
        day("2026-10-18", [item("note", "before")]),
        day("2026-11-03", [item("note", "too late")]),
        day("2026-02-30", [item("note", "not a date")]),
        day("20.10.2026", [item("note", "wrong format")]),
        day("2026-10-21", [item("note", "ok")]),
      ],
      notes: null,
    });
    expect(out.map((i) => i.text)).toEqual(["ok"]);
  });

  it("keeps homework due the following week", () => {
    const out = norm({
      days: [
        day("2026-11-01", [item("homework", "Math sheet")]),
        day("2026-10-27", [item("homework", "Read")]),
      ],
      notes: null,
    });
    expect(out.map((i) => i.date)).toEqual(["2026-10-27", "2026-11-01"]);
    // Sunday + 7 days (2026-11-01) is the last accepted day.
    expect(
      norm({
        days: [
          day("2026-11-01", [item("note", "x")]),
          day("2026-11-02", [item("note", "y")]),
        ],
        notes: null,
      }),
    ).toHaveLength(1);
  });

  it("trims, drops empty text, caps lengths and nulls empty subjects", () => {
    const out = norm({
      days: [
        day("2026-10-19", [
          item("note", "  hello  ", "   "),
          item("note", "   "),
          item("lesson", "x".repeat(2000), "s".repeat(300)),
        ]),
      ],
      notes: null,
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: "lesson", subject: "s".repeat(100) });
    expect(out[0].text).toHaveLength(1000);
    expect(out[1]).toEqual({
      date: "2026-10-19",
      kind: "message",
      subject: null,
      text: "hello",
      period: null,
      starts_at: null,
      ends_at: null,
      audience: "both",
      whole_week: false,
    });
  });

  it("dedupes identical items", () => {
    const out = norm({
      days: [
        day("2026-10-19", [
          item("homework", "Read", "Eng"),
          item("homework", " Read ", "Eng"),
        ]),
        day("2026-10-19", [
          item("homework", "Read", "Eng"),
          item("homework", "Read", "Math"),
        ]),
      ],
      notes: null,
    });
    expect(out).toHaveLength(2);
  });

  it("turns top-level notes into a Monday note", () => {
    const out = norm({ days: [], notes: "  Parent meeting soon  " });
    expect(out).toEqual([
      {
        date: "2026-10-19",
        kind: "message",
        subject: null,
        text: "Parent meeting soon",
        period: null,
        starts_at: null,
        ends_at: null,
        audience: "both",
        whole_week: false,
      },
    ]);
    expect(norm({ days: [], notes: "  " })).toEqual([]);
  });

  it("throws ExtractionError on an invalid shape", () => {
    expect(() => norm({ days: "nope" })).toThrow(ExtractionError);
    expect(() => norm(null)).toThrow(ExtractionError);
    expect(() =>
      norm({ days: [day("2026-10-19", [item("party", "x")])], notes: null }),
    ).toThrow(ExtractionError);
  });

  it("sorts by date, then kind order, stably", () => {
    const out = norm({
      days: [
        day("2026-10-21", [item("note", "n")]),
        day("2026-10-20", [
          item("note", "n1"),
          item("bring", "b"),
          item("homework", "h1"),
          item("lesson", "l"),
          item("homework", "h2"),
        ]),
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
    expect(
      norm({ days: [day("2026-10-19", items)], notes: null }),
    ).toHaveLength(300);
  });

  it("normalises school start/end and drops bad or reversed times", () => {
    const out = full({
      days: [
        day("2026-10-19", [], "8.15", "14:30"),
        day("2026-10-20", [], "25:00", "13.05"),
        day("2026-10-21", [], "15:00", "09:00"),
        day("2026-10-22", [], null, null),
        day("2026-11-30", [], "08:00", "14:00"),
      ],
      notes: null,
    });
    expect(out.days).toEqual([
      { date: "2026-10-19", starts_at: "08:15", ends_at: "14:30" },
      { date: "2026-10-20", starts_at: null, ends_at: "13:05" },
    ]);
  });

  it("validates lesson periods and times and orders lessons by period then start", () => {
    const lesson = (subject: string, extra: Record<string, unknown>) =>
      item("lesson", subject, subject, extra);
    const out = norm({
      days: [
        day("2026-10-19", [
          lesson("Late", { period: 3, start: "10:00", end: "10:45" }),
          lesson("None", {}),
          lesson("Second", { period: 2, start: "9.10", end: "09:55" }),
          lesson("First", { period: 1, start: "8:15", end: "9:00" }),
          lesson("BadPeriod", { period: 16, start: "11:00", end: "10:00" }),
          lesson("NoPeriodEarly", { start: "07:00", end: "07:30" }),
          item("homework", "Read", null, {
            period: 4,
            start: "08:00",
            end: "09:00",
          }),
        ]),
      ],
      notes: null,
    });
    expect(out.map((i) => i.text)).toEqual([
      "First",
      "Second",
      "Late",
      "NoPeriodEarly",
      "None",
      "BadPeriod",
      "Read",
    ]);
    expect(out[0]).toMatchObject({
      period: 1,
      starts_at: "08:15",
      ends_at: "09:00",
    });
    expect(out[1]).toMatchObject({
      period: 2,
      starts_at: "09:10",
      ends_at: "09:55",
    });
    // Reversed times drop both; period out of range becomes null.
    expect(out[5]).toMatchObject({
      period: null,
      starts_at: null,
      ends_at: null,
    });
    // Only lessons carry period and times.
    expect(out[6]).toMatchObject({
      period: null,
      starts_at: null,
      ends_at: null,
    });
  });
});
