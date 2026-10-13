// Downloads the two UI typefaces from Google Fonts into assets/fonts so the app works offline
// and the Content-Security-Policy can stay locked to 'self'. Run once: node tools/fetch-fonts.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'fonts');
const CSS_URL = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Instrument+Sans:wght@400;500;600;700&display=swap';
const KEEP = /\/\* (latin|latin-ext) \*\//;

await fs.mkdir(OUT, { recursive: true });
const css = await (await fetch(CSS_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' } })).text();
const blocks = css.split('/*').slice(1).map((b) => '/*' + b).filter((b) => KEEP.test(b));
let out = '/* Self-hosted: Chakra Petch and Instrument Sans (SIL Open Font License) */\n';
let n = 0;
for (const block of blocks) {
  const url = block.match(/url\((https:[^)]+\.woff2)\)/)[1];
  const family = block.match(/font-family: '([^']+)'/)[1].replace(/\s+/g, '');
  const weight = block.match(/font-weight: (\d+)/)[1];
  const subset = block.match(/\/\* ([a-z-]+) \*\//)[1];
  const file = `${family}-${weight}-${subset}.woff2`;
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  if (buf.subarray(0, 4).toString() !== 'wOF2') throw new Error(`not a woff2 file: ${url}`);
  await fs.writeFile(path.join(OUT, file), buf);
  out += block.replace(url, `/assets/fonts/${file}`).trim() + '\n';
  n++;
}
await fs.writeFile(path.join(OUT, 'fonts.css'), out);
console.log(`saved ${n} font files`);
