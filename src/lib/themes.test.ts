import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  THEMES,
  THEME_IDS,
  TOKEN_NAMES,
  contrastRatio,
  fallbackCss,
  getTheme,
  parseThemeId,
  themeCss,
  type TokenName,
} from "./themes";

const PAIRS: [TokenName, TokenName][] = [
  ["ink", "background"],
  ["ink", "surface"],
  ["muted", "surface"],
  ["muted", "background"],
  ["on-brand", "brand"],
  ["on-primary", "primary"],
  ["primary", "surface"],
  ["primary", "warning-soft"],
  ["heading", "background"],
  ["heading", "surface"],
  ["on-warning-soft", "warning-soft"],
  ["on-school-soft", "school-soft"],
  ["on-pause-soft", "pause-soft"],
  ["on-event-soft", "event-soft"],
  ["on-danger-soft", "danger-soft"],
  ["danger", "surface"],
  ["chip-ink", "chip"],
  ["on-accent", "accent"],
];

describe("themes", () => {
  it("lists the six themes, default first", () => {
    expect(THEMES.map((t) => t.id)).toEqual([...THEME_IDS]);
    expect(THEME_IDS).toEqual(["skog", "fjord", "godteri", "kpop", "morgengry", "orden"]);
    expect(DEFAULT_THEME).toBe("skog");
  });

  it.each(THEMES.map((t) => [t.id, t] as const))("%s has every token as a usable value", (_id, theme) => {
    for (const name of TOKEN_NAMES) {
      const value = theme.tokens[name];
      expect(value, name).toBeTruthy();
      if (name !== "card-shadow") expect(value, name).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(Object.keys(theme.tokens).sort()).toEqual([...TOKEN_NAMES].sort());
  });

  describe.each(THEMES.map((t) => [t.id, t] as const))("%s contrast", (_id, theme) => {
    it.each(PAIRS)("%s on %s reaches 4.5:1", (fg, bg) => {
      expect(contrastRatio(theme.tokens[fg], theme.tokens[bg]), `${fg}/${bg}`).toBeGreaterThanOrEqual(4.5);
    });
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("falls back to the default for unknown theme values", () => {
    expect(parseThemeId("fjord")).toBe("fjord");
    for (const bad of [undefined, null, "", "nope", "SKOG", 3]) expect(parseThemeId(bad)).toBe(DEFAULT_THEME);
    expect(getTheme("orden").id).toBe("orden");
  });

  it("emits one rule per theme plus the fallback, with fonts", () => {
    const css = themeCss();
    for (const id of THEME_IDS) expect(css).toContain(`:root[data-theme-name="${id}"]{`);
    expect(css).toContain("--theme-font-display:var(--font-fraunces)");
    expect(css).toContain("--theme-font-sans:var(--font-work-sans)");
    expect(fallbackCss().startsWith(":root{")).toBe(true);
    expect(fallbackCss()).toContain(`--brand:${getTheme(DEFAULT_THEME).tokens.brand}`);
  });
});
