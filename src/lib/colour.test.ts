import { describe, expect, it } from "vitest";
import { hexToRgba, tintStyle } from "./colour";

describe("hexToRgba", () => {
  it("converts #rrggbb with the given alpha", () => {
    expect(hexToRgba("#9d6bf0", 0.12)).toBe("rgba(157, 107, 240, 0.12)");
    expect(hexToRgba("#FFFFFF", 1)).toBe("rgba(255, 255, 255, 1)");
  });
  it("clamps alpha", () => {
    expect(hexToRgba("#000000", 3)).toBe("rgba(0, 0, 0, 1)");
    expect(hexToRgba("#000000", -1)).toBe("rgba(0, 0, 0, 0)");
  });
  it("is transparent for anything that is not #rrggbb", () => {
    expect(hexToRgba("red", 0.5)).toBe("rgba(0, 0, 0, 0)");
  });
  it("tintStyle defaults to 12%", () => {
    expect(tintStyle("#f7801f")).toEqual({ backgroundColor: "rgba(247, 128, 31, 0.12)" });
  });
});
