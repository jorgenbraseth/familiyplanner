// Pure helpers for shot.mjs (unit tested).
export const VIEWPORTS = {
  phone: { width: 390, height: 844, mobile: true },
  tablet: { width: 1180, height: 820, mobile: false },
  "tablet-portrait": { width: 820, height: 1180, mobile: false },
  desktop: { width: 1440, height: 900, mobile: false },
};

/** A preset name or "WxH". */
export function resolveViewport(value) {
  const v = String(value ?? "phone");
  if (VIEWPORTS[v]) return VIEWPORTS[v];
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(v);
  if (!m) throw new Error(`unknown viewport "${v}" (use ${Object.keys(VIEWPORTS).join(", ")} or WxH)`);
  const [width, height] = [Number(m[1]), Number(m[2])];
  return { width, height, mobile: width <= 500 };
}

/** ".mock/shots" file name from the shot: emma-_stars-phone.png */
export function shotFileName({ as, path, viewport, fullPage }) {
  const slug = String(path ?? "/").replace(/^\/+/, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "home";
  const who = String(as ?? "anon").split("@")[0].toLowerCase();
  return `${who}-${slug}-${String(viewport ?? "phone")}${fullPage ? "-full" : ""}.png`;
}

/** `--click` value: one selector, an array of them, or "a;;b" (clicked in order before the screenshot). */
export function clickList(value) {
  if (value === undefined || value === null || value === false || value === true) return [];
  const list = Array.isArray(value) ? value : String(value).split(";;");
  return list.map((v) => String(v).trim()).filter(Boolean);
}
