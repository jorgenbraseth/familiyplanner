// Colour themes: the single source of truth. The CSS custom properties are generated from here
// (`themeCss`, rendered by the root layout) and the unit test checks the contrast of every theme.
// Light-only for now: there is no dark variant of any theme.

export const THEME_IDS = ["skog", "fjord", "godteri", "kpop", "morgengry", "orden"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = "skog";
export const THEME_COOKIE = "theme";
export const THEME_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

/** The theme for a cookie value or a stored value; anything unknown falls back to the default. */
export function parseThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME;
}

/** Every colour token, as the CSS custom property name without the leading `--`. */
export const TOKEN_NAMES = [
  "background",
  "surface",
  "line",
  "ink",
  "muted",
  "heading",
  "brand",
  "on-brand",
  "primary",
  "primary-strong",
  "on-primary",
  "accent",
  "on-accent",
  "danger",
  "danger-soft",
  "on-danger-soft",
  "warning-soft",
  "on-warning-soft",
  "chip",
  "chip-ink",
  "school-soft",
  "on-school-soft",
  "school-line",
  "pause-soft",
  "on-pause-soft",
  "pause-line",
  "event-soft",
  "on-event-soft",
  "event-line",
  "card-shadow",
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];
export type ThemeTokens = Record<TokenName, string>;

export type FontFamily = "Fraunces" | "Nunito" | "Fredoka" | "Lexend" | "Work Sans";
/** The CSS variable next/font sets for each family (root layout). */
export const FONT_VARIABLES: Record<FontFamily, string> = {
  Fraunces: "--font-fraunces",
  Nunito: "--font-nunito",
  Fredoka: "--font-fredoka",
  Lexend: "--font-lexend",
  "Work Sans": "--font-work-sans",
};

export type Theme = {
  id: ThemeId;
  name: string;
  description: string;
  headFont: FontFamily;
  bodyFont: FontFamily;
  tokens: ThemeTokens;
};

// ---- colour maths (sRGB hex only) ----

function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: readonly number[]): string {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/** `amount` (0..1) of `b` mixed into `a`. */
export function mix(a: string, b: string, amount: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * amount));
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two #rrggbb colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

// ---- palettes ----

type Palette = {
  page: string;
  surface: string;
  ink: string;
  muted: string;
  heading: string;
  brand: string;
  onBrand: string;
  primary: string;
  onPrimary: string;
  /** Star colour (the ★ glyph, progress fill, badges) and the text on it. */
  star: string;
  onStar: string;
  danger: string;
  warnSoft: string;
  onWarn: string;
  schoolSoft: string;
  onSchool: string;
  pauseSoft: string;
  onPause: string;
  eventSoft: string;
  onEvent: string;
};

function buildTokens(p: Palette): ThemeTokens {
  const [r, g, b] = parseHex(p.ink);
  return {
    background: p.page,
    surface: p.surface,
    line: mix(p.surface, p.ink, 0.14),
    ink: p.ink,
    muted: p.muted,
    heading: p.heading,
    brand: p.brand,
    "on-brand": p.onBrand,
    primary: p.primary,
    "primary-strong": mix(p.primary, "#000000", 0.22),
    "on-primary": p.onPrimary,
    accent: p.star,
    "on-accent": p.onStar,
    danger: p.danger,
    "danger-soft": mix(p.danger, "#ffffff", 0.9),
    "on-danger-soft": mix(p.danger, "#000000", 0.4),
    "warning-soft": p.warnSoft,
    "on-warning-soft": p.onWarn,
    chip: mix(p.surface, p.ink, 0.07),
    "chip-ink": p.ink,
    "school-soft": p.schoolSoft,
    "on-school-soft": p.onSchool,
    "school-line": mix(p.schoolSoft, p.onSchool, 0.45),
    "pause-soft": p.pauseSoft,
    "on-pause-soft": p.onPause,
    "pause-line": mix(p.pauseSoft, p.onPause, 0.45),
    "event-soft": p.eventSoft,
    "on-event-soft": p.onEvent,
    "event-line": mix(p.eventSoft, p.onEvent, 0.45),
    "card-shadow": `0 2px 10px rgb(${r} ${g} ${b} / 0.08)`,
  };
}

export const THEMES: readonly Theme[] = [
  {
    id: "skog",
    name: "Skog",
    description: "Rolig og naturlig, med grønt og overskrifter med serif.",
    headFont: "Fraunces",
    bodyFont: "Nunito",
    tokens: buildTokens({
      page: "#f7f8f3",
      surface: "#ffffff",
      ink: "#22301f",
      muted: "#56634f",
      heading: "#3d6a33",
      brand: "#476f3b",
      onBrand: "#ffffff",
      primary: "#2b6886",
      onPrimary: "#ffffff",
      star: "#e3a03a",
      onStar: "#5c3a06",
      danger: "#b3321f",
      warnSoft: "#fbe9cf",
      onWarn: "#6e4100",
      schoolSoft: "#e3efd6",
      onSchool: "#2f5a1f",
      pauseSoft: "#e0edf3",
      onPause: "#23506a",
      eventSoft: "#f6e4d5",
      onEvent: "#87431a",
    }),
  },
  {
    id: "fjord",
    name: "Fjord",
    description: "Kjølig og rolig, med blått og grønnblått.",
    headFont: "Nunito",
    bodyFont: "Nunito",
    tokens: buildTokens({
      page: "#f5f8fa",
      surface: "#ffffff",
      ink: "#1f2d3a",
      muted: "#56677a",
      heading: "#2e5d7a",
      brand: "#3a6a8a",
      onBrand: "#ffffff",
      primary: "#22706d",
      onPrimary: "#ffffff",
      star: "#dcae3f",
      onStar: "#594100",
      danger: "#b4233c",
      warnSoft: "#f8ecd0",
      onWarn: "#664a00",
      schoolSoft: "#e1efee",
      onSchool: "#1d5754",
      pauseSoft: "#ebe8f5",
      onPause: "#4b417e",
      eventSoft: "#f6e8df",
      onEvent: "#82432a",
    }),
  },
  {
    id: "godteri",
    name: "Godteri",
    description: "Lekent og fargerikt, med rosa, lilla og rund skrift.",
    headFont: "Fredoka",
    bodyFont: "Nunito",
    tokens: buildTokens({
      page: "#fff8fb",
      surface: "#ffffff",
      ink: "#3a2440",
      muted: "#735a79",
      heading: "#b8337f",
      brand: "#7c4fc4",
      onBrand: "#ffffff",
      // Contrast fix: #e2572f -> #cb4e2a was still only 3.9:1 as text on the warning block (#ffeec2),
      // and primary doubles as text-button colour, so the whole token is #b74626 (4.7:1 there, 5.4:1 on white).
      primary: "#b74626",
      onPrimary: "#ffffff",
      star: "#ffc21a",
      onStar: "#664700",
      danger: "#c0262d",
      warnSoft: "#ffeec2",
      onWarn: "#664700",
      schoolSoft: "#daf5e9",
      onSchool: "#14664a",
      pauseSoft: "#e9e2ff",
      onPause: "#5132a3",
      eventSoft: "#ffe1eb",
      onEvent: "#9c1f4d",
    }),
  },
  {
    id: "kpop",
    name: "K-pop",
    description: "Mørk topplinje, knallrosa og ren, moderne skrift.",
    headFont: "Lexend",
    bodyFont: "Lexend",
    tokens: buildTokens({
      page: "#fcf6ff",
      surface: "#ffffff",
      ink: "#1a1033",
      muted: "#625680",
      heading: "#c4006c",
      brand: "#1a1033",
      onBrand: "#ffffff",
      // Contrast fix: #d6006b -> #d20069.
      primary: "#d20069",
      onPrimary: "#ffffff",
      star: "#ffd400",
      onStar: "#5a4800",
      danger: "#c4122f",
      warnSoft: "#ffe9f4",
      onWarn: "#9e0050",
      schoolSoft: "#dcf9ff",
      onSchool: "#005766",
      pauseSoft: "#f0e2ff",
      onPause: "#661db0",
      eventSoft: "#ffe0ef",
      onEvent: "#a0004e",
    }),
  },
  {
    id: "morgengry",
    name: "Morgengry",
    description: "Dempet og stille, med grågrønne toner.",
    headFont: "Nunito",
    bodyFont: "Nunito",
    tokens: buildTokens({
      page: "#f4f5f1",
      surface: "#ffffff",
      ink: "#2b2e29",
      muted: "#5f655b",
      heading: "#4b5f51",
      brand: "#5c7263",
      onBrand: "#ffffff",
      primary: "#4b5f51",
      onPrimary: "#ffffff",
      star: "#d4a140",
      onStar: "#543907",
      danger: "#a8322d",
      warnSoft: "#f3e8d3",
      onWarn: "#664609",
      schoolSoft: "#e5ece3",
      onSchool: "#3b503e",
      pauseSoft: "#e8e6ef",
      onPause: "#4b4764",
      eventSoft: "#f2e5db",
      onEvent: "#77472b",
    }),
  },
  {
    id: "orden",
    name: "Orden",
    description: "Ryddig og tydelig, med blått og kraftig kontrast.",
    headFont: "Work Sans",
    bodyFont: "Work Sans",
    tokens: buildTokens({
      page: "#f6f6f4",
      surface: "#ffffff",
      ink: "#191c20",
      muted: "#575d67",
      heading: "#191c20",
      brand: "#0058a3",
      onBrand: "#ffffff",
      primary: "#0058a3",
      onPrimary: "#ffffff",
      star: "#ffcc00",
      onStar: "#5a4600",
      danger: "#c8281e",
      warnSoft: "#fff3bf",
      onWarn: "#5a4600",
      schoolSoft: "#e2f0e6",
      onSchool: "#1b5b34",
      pauseSoft: "#eceef1",
      onPause: "#3a4352",
      eventSoft: "#fde6e2",
      onEvent: "#a0261a",
    }),
  },
];

export function getTheme(id: ThemeId): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

// ---- CSS ----

const FALLBACK_STACK = "ui-sans-serif, system-ui, sans-serif";

function fontStack(family: FontFamily): string {
  return `var(${FONT_VARIABLES[family]}), ${FALLBACK_STACK}`;
}

function declarations(theme: Theme): string {
  const colours = TOKEN_NAMES.map((name) => `--${name}:${theme.tokens[name]}`);
  return [
    ...colours,
    `--theme-font-sans:${fontStack(theme.bodyFont)}`,
    `--theme-font-display:${fontStack(theme.headFont)}`,
  ].join(";");
}

/** One rule per theme, selected by `data-theme-name` on `<html>`. Values come only from the constants above. */
export function themeCss(): string {
  return THEMES.map((theme) => `:root[data-theme-name="${theme.id}"]{${declarations(theme)}}`).join("\n");
}

/** The default theme as a bare `:root` rule, for pages rendered without the attribute. */
export function fallbackCss(): string {
  return `:root{${declarations(getTheme(DEFAULT_THEME))}}`;
}
