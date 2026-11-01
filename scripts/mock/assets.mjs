// Generated placeholder files for the mock storage: avatar SVGs, a small PDF and a PNG.
import zlib from "node:zlib";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function avatarSvg({ name, colour }) {
  const initial = esc((name ?? "?").slice(0, 1).toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="${esc(colour)}"/><circle cx="128" cy="104" r="48" fill="rgba(255,255,255,.55)"/><path d="M40 256c0-56 40-92 88-92s88 36 88 92z" fill="rgba(255,255,255,.55)"/><text x="128" y="148" text-anchor="middle" font-family="sans-serif" font-size="110" font-weight="700" fill="#fff">${initial}</text></svg>`;
}

/** A one-page PDF with a few lines of text (Helvetica, no fonts embedded). */
export function simplePdf(lines) {
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 22 : 14} Tf 56 ${780 - i * 26} Td (${l.replace(/([()\\])/g, "\\$1").replace(/[^\x20-\x7e]/g, "?")}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A flat-gradient PNG (stand-in for an uploaded photo of a school paper). */
export function placeholderPng(width = 320, height = 440) {
  const row = width * 3 + 1;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < width; x++) {
      const stripe = y % 44 < 4 && x > 24 && x < width - 24;
      const i = y * row + 1 + x * 3;
      raw[i] = stripe ? 120 : 250;
      raw[i + 1] = stripe ? 130 : 248;
      raw[i + 2] = stripe ? 150 : 240;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
