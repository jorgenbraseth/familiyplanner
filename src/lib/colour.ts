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
