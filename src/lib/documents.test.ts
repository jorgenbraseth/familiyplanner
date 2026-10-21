import { describe, expect, it } from "vitest";
import { allowedItemDays } from "./documents";

describe("allowedItemDays", () => {
  it("covers 14 days from Monday of the ISO week", () => {
    const days = allowedItemDays(2026, 43);
    expect(days).toHaveLength(14);
    expect(days[0]).toBe("2026-10-19");
    expect(days[13]).toBe("2026-11-01");
  });

  it("crosses the year boundary", () => {
    const days = allowedItemDays(2026, 53);
    expect(days[0]).toBe("2026-12-28");
    expect(days[13]).toBe("2027-01-10");
  });
});
