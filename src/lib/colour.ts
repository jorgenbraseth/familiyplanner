/** `#rrggbb` as `rgba(r, g, b, alpha)`: a member's colour as a soft tint (e.g. alpha 0.12 for a flat block). */
export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(0, 0, 0, 0)`;
  const n = parseInt(m[1], 16);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Inline style for a flat block tinted with a member's colour. */
export function tintStyle(hex: string, alpha = 0.12): { backgroundColor: string } {
  return { backgroundColor: hexToRgba(hex, alpha) };
}

/** WCAG relative luminance (0–1) of `#rrggbb`; 0 for anything else. */
export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** The text colour class that reads best on a filled member colour: white, or black when white would be weaker. */
export function textOnColour(hex: string): "text-white" | "text-black" {
  const l = relativeLuminance(hex);
  // White contrast: 1.05 / (l + 0.05); black contrast: (l + 0.05) / 0.05. They are equal at l ≈ 0.179.
  return l > 0.179 ? "text-black" : "text-white";
}
