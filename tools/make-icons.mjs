// Generates the PWA icons into public/icons/. One-off; the PNGs are committed.
// Needs `sharp` (not a project dependency): run with
//   NODE_PATH=<dir with sharp in node_modules> node tools/make-icons.mjs
// (Next.js ships sharp, so `node tools/make-icons.mjs` from the repo root normally works.)
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(out, { recursive: true });

const GREEN = "#3fa34d";
const GREEN_DARK = "#2d7a38";
const PUMPKIN = "#f4a259";
const CREAM = "#fbf8ef";

// 5-point star centred at (cx, cy), outer radius r.
function star(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.48;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${PUMPKIN}" stroke="${CREAM}" stroke-width="${r * 0.07}" stroke-linejoin="round"/>`;
}

// Art on a 512 canvas; `scale` shrinks it around the centre for the maskable safe zone.
function art({ rounded, scale }) {
  const bg = rounded
    ? `<rect width="512" height="512" rx="112" fill="${GREEN}"/>`
    : `<rect width="512" height="512" fill="${GREEN}"/>`;
  const leaf = `<g transform="translate(366 128) rotate(35)">
      <path d="M0 -62 C 46 -30 46 30 0 62 C -46 30 -46 -30 0 -62 Z" fill="${CREAM}"/>
      <path d="M0 -50 L0 58" stroke="${GREEN_DARK}" stroke-width="7" stroke-linecap="round"/>
    </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    ${bg}
    <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
      <circle cx="256" cy="270" r="168" fill="${GREEN_DARK}" opacity="0.35"/>
      ${star(256, 280, 150)}
      ${leaf}
    </g>
  </svg>`;
}

// Monochrome badge for the status bar: white star on transparent.
function badge() {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? 44 : 21;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(48 + rad * Math.cos(a)).toFixed(1)},${(50 + rad * Math.sin(a)).toFixed(1)}`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><polygon points="${pts.join(" ")}" fill="#fff"/></svg>`;
}

const jobs = [
  ["icon-192.png", art({ rounded: true, scale: 1 }), 192],
  ["icon-512.png", art({ rounded: true, scale: 1 }), 512],
  ["maskable-512.png", art({ rounded: false, scale: 0.68 }), 512],
  ["apple-touch-icon.png", art({ rounded: false, scale: 1 }), 180], // iOS rounds the corners itself
  ["badge-72.png", badge(), 72],
];
for (const [name, svg, size] of jobs) {
  const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  writeFileSync(path.join(out, name), png);
  console.log("wrote", name);
}
