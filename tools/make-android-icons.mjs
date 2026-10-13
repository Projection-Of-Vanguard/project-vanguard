// Draws the Android launcher icons and launch screen from the same brand mark as assets/icon.png:
//   mipmap-*/ic_launcher.png, ic_launcher_round.png         legacy icons (Android 7)
//   mipmap-*/ic_launcher_foreground.png, _background.png    adaptive icon layers (Android 8+)
//   drawable/splash_mark.png                                 mark shown on the launch screen
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(ROOT, 'mobile', 'android', 'app', 'src', 'main', 'res');

const clamp = (v) => Math.max(0, Math.min(1, v));
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const roundRect = (x, y, r) => {
  const qx = Math.abs(x - 0.5) - (0.5 - r), qy = Math.abs(y - 0.5) - (0.5 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
// Navy gradient with the accent glow, as on the desktop icon
const tile = (x, y) => {
  const t = clamp((x + y) / 2);
  const c = [0.04 + 0.03 * t, 0.08 + 0.05 * t, 0.15 + 0.1 * t];
  const glow = Math.exp(-((x - 0.75) ** 2 + (y - 0.2) ** 2) / 0.08);
  return c.map((v, i) => v + glow * [0.04, 0.25, 0.5][i]);
};
// The brand mark at scale s (fraction of the canvas), centred; null outside the strokes
const mark = (x, y, s) => {
  const o = (1 - s) / 2;
  const mx = ((x - o) / s) * 32, my = ((y - o) / s) * 32;
  const white = [0.92, 0.96, 1], accent = [0.1, 0.62, 1];
  if (Math.abs(Math.hypot(mx - 16, my - 16) - 14.5) < 1.15) return white;
  if (Math.abs(Math.hypot(mx - 20.5, my - 12) - 4.2) < 1.25) return accent;
  if (Math.hypot(mx - 11, my - 20.5) < 3.1) return white;
  if (segDist(mx, my, 3, 18.5, 11, 20.5) < 1.2 || segDist(mx, my, 11, 20.5, 17.2, 14.6) < 1.2) return white;
  return null;
};

const variants = {
  legacy: (x, y) => (roundRect(x, y, 0.22) > 0 ? null : [...(mark(x, y, 0.72) || tile(x, y)), 1]),
  round: (x, y) => (Math.hypot(x - 0.5, y - 0.5) > 0.5 ? null : [...(mark(x, y, 0.66) || tile(x, y)), 1]),
  // Adaptive icons: 108dp canvas, launchers show the middle 66dp, so the mark stays within 0.5 of it
  foreground: (x, y) => { const m = mark(x, y, 0.5); return m ? [...m, 1] : null; },
  background: (x, y) => [...tile(x, y), 1],
  splash: (x, y) => { const m = mark(x, y, 0.62); return m ? [...m, 1] : null; },
};

function render(size, fn) {
  const ss = 4, px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const c = fn((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
      if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
    }
    const i = (y * size + x) * 4;
    px[i] = a ? Math.round((r / a) * 255) : 0;
    px[i + 1] = a ? Math.round((g / a) * 255) : 0;
    px[i + 2] = a ? Math.round((b / a) * 255) : 0;
    px[i + 3] = Math.round((a / (ss * ss)) * 255);
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
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(densities)) {
  const dir = path.join(RES, `mipmap-${d}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), png(48 * k, render(48 * k, variants.legacy)));
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), png(48 * k, render(48 * k, variants.round)));
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), png(108 * k, render(108 * k, variants.foreground)));
  fs.writeFileSync(path.join(dir, 'ic_launcher_background.png'), png(108 * k, render(108 * k, variants.background)));
}
fs.writeFileSync(path.join(RES, 'drawable', 'splash_mark.png'), png(288, render(288, variants.splash)));
const adaptive = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@mipmap/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n';
for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) fs.writeFileSync(path.join(RES, 'mipmap-anydpi-v26', f), adaptive);
console.log('wrote Android icons and launch screen mark');
