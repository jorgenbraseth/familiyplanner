import { describe, expect, it } from "vitest";
import { isNavActive, navFits } from "./nav-fit";

describe("navFits", () => {
  it("fits when the items are narrower than or exactly as wide as the space", () => {
    expect(navFits(300, 400)).toBe(true);
    expect(navFits(400, 400)).toBe(true);
  });
  it("does not fit when the items are wider", () => {
    expect(navFits(401, 400)).toBe(false);
  });
  it("counts unmeasurable widths as fitting", () => {
    expect(navFits(0, 400)).toBe(true);
    expect(navFits(300, 0)).toBe(true);
    expect(navFits(Number.NaN, 400)).toBe(true);
  });
});

describe("isNavActive", () => {
  it("matches the start page only exactly", () => {
    expect(isNavActive("/", "/")).toBe(true);
    expect(isNavActive("/stars", "/")).toBe(false);
  });
  it("matches a section and its sub pages", () => {
    expect(isNavActive("/stars", "/stars")).toBe(true);
    expect(isNavActive("/stars/tasks", "/stars")).toBe(true);
    expect(isNavActive("/starship", "/stars")).toBe(false);
  });
});
