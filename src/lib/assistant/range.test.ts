import { describe, expect, it } from "vitest";
import { parseStrictDay, validateRange, weekdayName } from "./range";

describe("validateRange", () => {
  it("accepts a normal range", () => {
    const r = validateRange("2026-10-21", "2026-10-25");
    expect(r).toMatchObject({ ok: true, fromKey: "2026-10-21", toKey: "2026-10-25", clamped: false });
  });
  it("accepts a single day", () => {
    expect(validateRange("2026-10-21", "2026-10-21")).toMatchObject({ ok: true, clamped: false });
  });
  it("clamps ranges longer than 31 days", () => {
    expect(validateRange("2026-10-01", "2027-03-01")).toMatchObject({ ok: true, toKey: "2026-10-31", clamped: true });
  });
  it("keeps exactly 31 days unclamped", () => {
    expect(validateRange("2026-10-01", "2026-10-31")).toMatchObject({ ok: true, clamped: false });
  });
  it("rejects bad or reversed input", () => {
    expect(validateRange("2026-13-01", "2026-13-02").ok).toBe(false);
    expect(validateRange("2026-02-30", "2026-03-01").ok).toBe(false);
    expect(validateRange("tomorrow", "2026-03-01").ok).toBe(false);
    expect(validateRange("2026-10-22", "2026-10-21").ok).toBe(false);
  });
});

describe("parseStrictDay / weekdayName", () => {
  it("parses real dates only", () => {
    expect(parseStrictDay("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
    expect(parseStrictDay("2027-02-29")).toBeNull();
  });
  it("names Norwegian weekdays", () => {
    expect(weekdayName("2026-10-21")).toBe("onsdag");
    expect(weekdayName("2026-10-25")).toBe("søndag");
    expect(weekdayName("junk")).toBe("");
  });
});
