import { describe, expect, it } from "vitest";
import { ExtractionError } from "./errors";
import {
  isDailyText,
  normalizeTime,
  normalizeTimeplan,
  normalizeUkeplan,
  schoolDayKeys,
} from "./normalize";

// ISO week 43 of 2026: Monday 2026-10-19 … Sunday 2026-10-25.
const uke = (items: unknown[]) => normalizeUkeplan({ items }, 2026, 43).items;
const raw = (extra: Record<string, unknown> = {}) => ({
  date: "2026-10-20",
  kind: "message",
  subject: null,
  text: "Husk gymtøy",
  audience: "child",
  starts_at: null,
  ends_at: null,
  ...extra,
});

describe("normalizeTime", () => {
  it("accepts common formats and rejects the rest", () => {
    expect(normalizeTime("8:15")).toBe("08:15");
    expect(normalizeTime("08.15")).toBe("08:15");
    expect(normalizeTime("08:15:00")).toBe("08:15");
    expect(normalizeTime("24:00")).toBeNull();
    expect(normalizeTime("kl 8")).toBeNull();
    expect(normalizeTime(null)).toBeNull();
  });
});

describe("normalizeUkeplan", () => {
  it("keeps a valid dated item", () => {
    expect(uke([raw()])).toEqual([
      {
        date: "2026-10-20",
        whole_week: false,
        kind: "message",
        subject: null,
        text: "Husk gymtøy",
        audience: "child",
        starts_at: null,
        ends_at: null,
      },
    ]);
  });

  it("turns null dates into whole-week items on Monday", () => {
    const [item] = uke([
      raw({ date: null, kind: "homework", text: "Les side 10-20" }),
    ]);
    expect(item).toMatchObject({
      date: "2026-10-19",
      whole_week: true,
      kind: "homework",
    });
  });

  it("drops dates outside the allowed range and invalid dates", () => {
    const out = uke([
      raw({ date: "2026-10-18", text: "before" }),
      raw({ date: "2026-11-03", text: "too late" }),
      raw({ date: "2026-02-30", text: "not a date" }),
      raw({ date: "20.10.2026", text: "wrong format" }),
      raw({ date: "2026-10-26", text: "message next week" }),
      raw({ date: "2026-10-26", kind: "homework", text: "homework next week" }),
      raw({ date: "2026-10-25", text: "sunday" }),
    ]);
    expect(out.map((i) => i.text)).toEqual(["sunday", "homework next week"]);
  });

  it("defaults audience: child for homework, both otherwise", () => {
    const out = uke([
      raw({ kind: "homework", audience: null, text: "a" }),
      raw({ kind: "event", audience: null, text: "b" }),
      raw({ kind: "message", audience: "parent", text: "c" }),
    ]);
    expect(Object.fromEntries(out.map((i) => [i.text, i.audience]))).toEqual({
      a: "child",
      b: "both",
      c: "parent",
    });
  });

  it("keeps event times only on events and drops reversed ones", () => {
    const out = uke([
      raw({ kind: "event", text: "tur", starts_at: "8.30", ends_at: "13:00" }),
      raw({ kind: "event", text: "rev", starts_at: "13:00", ends_at: "08:00" }),
      raw({
        kind: "homework",
        text: "hw",
        starts_at: "08:00",
        ends_at: "09:00",
      }),
    ]);
    const by = Object.fromEntries(out.map((i) => [i.text, i]));
    expect(by.tur).toMatchObject({ starts_at: "08:30", ends_at: "13:00" });
    expect(by.rev).toMatchObject({ starts_at: null, ends_at: null });
    expect(by.hw).toMatchObject({ starts_at: null, ends_at: null });
  });

  it("trims, drops empty text and duplicates, and sorts whole-week first", () => {
    const out = uke([
      raw({ text: "  ", subject: "x" }),
      raw({ text: " Husk gymtøy ", subject: "  " }),
      raw({ text: "Husk gymtøy" }),
      raw({ date: null, text: "Hele uken" }),
      raw({ date: "2026-10-19", kind: "homework", text: "Mandag" }),
    ]);
    expect(out.map((i) => i.text)).toEqual([
      "Hele uken",
      "Mandag",
      "Husk gymtøy",
    ]);
    expect(out[2].subject).toBeNull();
  });

  it("rejects results with an unexpected shape", () => {
    expect(() =>
      normalizeUkeplan({ items: [{ kind: "lesson" }] }, 2026, 43),
    ).toThrow(ExtractionError);
    expect(() => normalizeUkeplan(null, 2026, 43)).toThrow(ExtractionError);
  });
});

describe("daily homework", () => {
  const week = [
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
    "2026-10-23",
  ];
  const hw = (extra: Record<string, unknown> = {}) =>
    raw({
      date: null,
      kind: "homework",
      subject: "Norsk",
      text: "Les 10 minutter hver dag",
      ...extra,
    });

  it("schoolDayKeys gives Monday to Friday", () => {
    expect(schoolDayKeys(2026, 43)).toEqual(week);
  });

  it("matches daily phrases and not look-alikes", () => {
    for (const t of [
      "hver dag",
      "Daglig lesing",
      "alle dager",
      "hver skoledag",
      "Hjemme hver dag",
      "kvar dag",
      "alle skoledagar",
      "Every day",
      "dei daglege rutinane",
    ])
      expect(isDailyText(t), t).toBe(true);
    for (const t of [
      "hverdagen er fin",
      "dagligvare",
      "les en bok denne uka",
      "innen fredag",
    ])
      expect(isDailyText(t), t).toBe(false);
  });

  it("expands whole-week daily homework into five dated items", () => {
    const out = uke([hw()]);
    expect(out.map((i) => i.date)).toEqual(week);
    expect(
      out.every(
        (i) =>
          !i.whole_week &&
          i.kind === "homework" &&
          i.subject === "Norsk" &&
          i.audience === "child",
      ),
    ).toBe(true);
  });

  it("expands variants, also when only the subject says daily", () => {
    expect(uke([hw({ text: "Øv på gloser kvar dag" })])).toHaveLength(5);
    expect(
      uke([hw({ text: "Lesing", subject: "Daglig lesing" })]),
    ).toHaveLength(5);
  });

  it("keeps non-daily week homework whole-week", () => {
    const out = uke([hw({ text: "Les en bok denne uka" })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ whole_week: true, date: "2026-10-19" });
  });

  it("does not expand daily messages or already dated homework", () => {
    expect(
      uke([raw({ date: null, text: "Husk drikkeflaske hver dag" })]),
    ).toHaveLength(1);
    expect(uke([hw({ date: "2026-10-21" })])).toHaveLength(1);
  });

  it("dedupes against an identical explicitly dated item", () => {
    const out = uke([hw({ date: "2026-10-21" }), hw()]);
    expect(out).toHaveLength(5);
    expect(out.filter((i) => i.date === "2026-10-21")).toHaveLength(1);
  });
});

describe("normalizeTimeplan", () => {
  const period = (extra: Record<string, unknown> = {}) => ({
    weekday: 1,
    period: 1,
    starts_at: "08:15",
    ends_at: "09:00",
    subject: "Norsk",
    ...extra,
  });

  it("normalizes days and periods and sorts them", () => {
    const out = normalizeTimeplan({
      days: [
        { weekday: 2, starts_at: "8.15", ends_at: "14:00" },
        { weekday: 1, starts_at: "08:15", ends_at: "13:30" },
      ],
      periods: [
        period({ weekday: 2, period: 2, subject: "Matte" }),
        period({
          period: 2,
          starts_at: "9:10",
          ends_at: "9:55",
          subject: "Engelsk",
        }),
        period(),
      ],
    });
    expect(out.days.map((d) => d.weekday)).toEqual([1, 2]);
    expect(out.days[1]).toEqual({
      weekday: 2,
      starts_at: "08:15",
      ends_at: "14:00",
    });
    expect(out.periods.map((p) => [p.weekday, p.period, p.subject])).toEqual([
      [1, 1, "Norsk"],
      [1, 2, "Engelsk"],
      [2, 2, "Matte"],
    ]);
  });

  it("drops invalid weekdays, empty subjects and duplicates; nulls bad periods and times", () => {
    const out = normalizeTimeplan({
      days: [
        { weekday: 0, starts_at: "08:00", ends_at: "14:00" },
        { weekday: 8, starts_at: "08:00", ends_at: "14:00" },
        { weekday: 3, starts_at: "14:00", ends_at: "08:00" },
        { weekday: 4, starts_at: null, ends_at: null },
      ],
      periods: [
        period({ weekday: 9 }),
        period({ subject: "  " }),
        period({
          period: 16,
          starts_at: "xx",
          ends_at: "10:00",
          subject: "Kunst",
        }),
        period({
          period: null,
          starts_at: null,
          ends_at: null,
          subject: "Lunsj",
        }),
        period({
          period: null,
          starts_at: null,
          ends_at: null,
          subject: "Lunsj",
        }),
      ],
    });
    expect(out.days).toEqual([]);
    expect(out.periods).toEqual([
      {
        weekday: 1,
        period: null,
        starts_at: null,
        ends_at: "10:00",
        subject: "Kunst",
      },
      {
        weekday: 1,
        period: null,
        starts_at: null,
        ends_at: null,
        subject: "Lunsj",
      },
    ]);
  });

  it("rejects results with an unexpected shape", () => {
    expect(() => normalizeTimeplan({ days: "x" })).toThrow(ExtractionError);
  });
});
