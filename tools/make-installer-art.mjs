// Draws the setup wizard artwork (NSIS needs 24-bit BMP files):
//   assets/installer-sidebar.bmp  164x314  (welcome and finish pages)
//   assets/installer-header.bmp   150x57   (top banner on the other pages)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
// The brand mark in a 32x32 space; returns [r,g,b] or null
function mark(mx, my) {
  if (Math.abs(Math.hypot(mx - 16, my - 16) - 14.5) < 1.15) return [235, 244, 255];
  if (Math.abs(Math.hypot(mx - 20.5, my - 12) - 4.2) < 1.25) return [26, 159, 255];
  if (Math.hypot(mx - 11, my - 20.5) < 3.1) return [235, 244, 255];
  if (segDist(mx, my, 3, 18.5, 11, 20.5) < 1.2 || segDist(mx, my, 11, 20.5, 17.2, 14.6) < 1.2) return [235, 244, 255];
  return null;
}

function draw(w, h, markBox) {
  const px = Buffer.alloc(w * h * 3);
  const ss = 3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = [0, 0, 0];
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const fx = x + (sx + 0.5) / ss, fy = y + (sy + 0.5) / ss;
      const t = fy / h;
      // navy gradient with a blue glow in the top corner
      let c = [8 + 8 * t, 16 + 10 * t, 30 + 22 * t];
      const glow = Math.exp(-(((fx - w * 0.85) / w) ** 2 + ((fy - h * 0.05) / h) ** 2) / 0.12);
      c = c.map((v, i) => v + glow * [10, 70, 140][i]);
      if (markBox) {
        const [mx0, my0, size] = markBox;
        const m = mark(((fx - mx0) / size) * 32, ((fy - my0) / size) * 32);
        if (m) c = m;
      }
      acc = acc.map((v, i) => v + c[i]);
    }
    const i = ((h - 1 - y) * w + x) * 3; // BMP rows are bottom-up, BGR
    px[i] = Math.round(acc[2] / (ss * ss)); px[i + 1] = Math.round(acc[1] / (ss * ss)); px[i + 2] = Math.round(acc[0] / (ss * ss));
  }
  return px;
}

function bmp(w, h, px) {
  const rowSize = Math.ceil((w * 3) / 4) * 4;
  const data = Buffer.alloc(rowSize * h);
  for (let y = 0; y < h; y++) px.copy(data, y * rowSize, y * w * 3, (y + 1) * w * 3);
  const head = Buffer.alloc(54);
  head.write('BM', 0); head.writeUInt32LE(54 + data.length, 2); head.writeUInt32LE(54, 10);
  head.writeUInt32LE(40, 14); head.writeInt32LE(w, 18); head.writeInt32LE(h, 22);
  head.writeUInt16LE(1, 26); head.writeUInt16LE(24, 28); head.writeUInt32LE(data.length, 34);
  head.writeInt32LE(2835, 38); head.writeInt32LE(2835, 42);
  return Buffer.concat([head, data]);
}

fs.writeFileSync(path.join(ROOT, 'assets', 'installer-sidebar.bmp'), bmp(164, 314, draw(164, 314, [32, 36, 100])));
fs.writeFileSync(path.join(ROOT, 'assets', 'installer-header.bmp'), bmp(150, 57, draw(150, 57, [102, 10, 38])));
console.log('wrote installer artwork');
