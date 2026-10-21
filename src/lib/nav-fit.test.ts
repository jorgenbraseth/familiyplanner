import { describe, expect, it } from "vitest";
import { isNavActive, navFits, navTitle } from "./nav-fit";

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

describe("navTitle", () => {
  const items = [
    { href: "/", label: "Meg" },
    { href: "/stars", label: "Stjerner" },
    { href: "/stars/tasks", label: "Oppgaver" },
    { href: "/documents", label: "Dokumenter" },
  ];
  it("uses the label of the active item", () => {
    expect(navTitle("/", items, "App")).toBe("Meg");
    expect(navTitle("/documents", items, "App")).toBe("Dokumenter");
  });
  it("falls back to the closest parent item (longest prefix)", () => {
    expect(navTitle("/documents/abc", items, "App")).toBe("Dokumenter");
    expect(navTitle("/stars/routines/1", items, "App")).toBe("Stjerner");
    expect(navTitle("/stars/tasks/new", items, "App")).toBe("Oppgaver");
  });
  it("uses the fallback when nothing matches", () => {
    expect(navTitle("/assistant-log", items, "App")).toBe("App");
  });
});
