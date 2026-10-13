// Draws the app icon (the brand mark on a rounded navy tile) and writes
// assets/icon.png (512px) and assets/icon.ico (16-256px) without any image library.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets');
fs.mkdirSync(OUT, { recursive: true });

const clamp = (v) => Math.max(0, Math.min(1, v));
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const roundRect = (x, y, r) => { // signed distance to a centred square of half-size .5 with radius r (unit space)
  const qx = Math.abs(x - 0.5) - (0.5 - r), qy = Math.abs(y - 0.5) - (0.5 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

function sample(x, y) {
  // returns [r, g, b, a] in 0..1 for one sub-pixel
  if (roundRect(x, y, 0.22) > 0) return [0, 0, 0, 0];
  // background: diagonal navy gradient with an accent glow
  const t = clamp((x + y) / 2);
  let c = [0.04 + 0.03 * t, 0.08 + 0.05 * t, 0.15 + 0.1 * t];
  const glow = Math.exp(-((x - 0.75) ** 2 + (y - 0.2) ** 2) / 0.08);
  c = c.map((v, i) => v + glow * [0.04, 0.25, 0.5][i]);
  // mark (scaled from the 32px SVG brand mark, centred)
  const s = 0.72, o = (1 - s) / 2;
  const mx = (x - o) / s * 32, my = (y - o) / s * 32;
  const ink = (d, w) => Math.abs(d) < w;
  const white = [0.92, 0.96, 1];
  const accent = [0.1, 0.62, 1];
  if (ink(Math.hypot(mx - 16, my - 16) - 14.5, 1.15)) return [...white, 1];
  if (ink(Math.hypot(mx - 20.5, my - 12) - 4.2, 1.25)) return [...accent, 1];
  if (Math.hypot(mx - 11, my - 20.5) < 3.1) return [...white, 1];
  if (segDist(mx, my, 3, 18.5, 11, 20.5) < 1.2 || segDist(mx, my, 11, 20.5, 17.2, 14.6) < 1.2) return [...white, 1];
  return [...c, 1];
}

function render(size) {
  const ss = 4;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const [cr, cg, cb, ca] = sample((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
      r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
    }
    const i = (y * size + x) * 4;
    const n = ss * ss;
    px[i] = a ? Math.round((r / a) * 255) : 0;
    px[i + 1] = a ? Math.round((g / a) * 255) : 0;
    px[i + 2] = a ? Math.round((b / a) * 255) : 0;
    px[i + 3] = Math.round((a / n) * 255);
  }
  return px;
}

function png(size, px) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const big = png(512, render(512));
fs.writeFileSync(path.join(OUT, 'icon.png'), big);

const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = sizes.map((s) => png(s, render(s)));
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e[0] = s >= 256 ? 0 : s; e[1] = s >= 256 ? 0 : s; e[2] = 0; e[3] = 0;
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(images[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += images[i].length;
  return e;
});
fs.writeFileSync(path.join(OUT, 'icon.ico'), Buffer.concat([header, ...entries, ...images]));
console.log('wrote assets/icon.png and assets/icon.ico');
