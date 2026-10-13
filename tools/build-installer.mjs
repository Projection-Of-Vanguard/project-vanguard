// Builds the Windows installers: node tools/build-installer.mjs  (or npm run dist)
//   dist/nsis-web/Steam-Redesigned-Setup-<v>.exe download wizard (fetches the app package)
//   dist/nsis-web/*.nsis.7z                       the package the wizard downloads
//   dist/Steam-Redesigned-Offline-Setup-<v>.exe  full offline installer
//   dist/Steam-Redesigned-<v>.msi                Windows Installer package
// 1. Prepares a starter catalog (public Steam data only: no settings, keys, history or cache).
// 2. Runs electron-builder (all installer formats; fuses flipped in tools/after-pack.cjs).
// 3. Writes SHA-256 checksums so people can confirm the file they got is the one you built.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED_DIR = path.join(ROOT, 'dist-seed');
const OUT = path.join(ROOT, 'dist');

// 1. Starter catalog
fs.mkdirSync(SEED_DIR, { recursive: true });
const source = path.join(ROOT, 'data', 'catalog.json');
if (!fs.existsSync(source)) throw new Error('No data/catalog.json yet. Run the app once so it builds a catalog, then build the installer.');
const catalog = JSON.parse(fs.readFileSync(source, 'utf8'));
const clean = { v: catalog.v, updated: catalog.updated, count: catalog.games.length, minPlayers: catalog.minPlayers, tags: catalog.tags, games: catalog.games, changes: { added: [], removed: [] } };
fs.writeFileSync(path.join(SEED_DIR, 'catalog.json'), JSON.stringify(clean));
console.log(`seed catalog: ${clean.games.length} games`);

// 2. Build
fs.rmSync(OUT, { recursive: true, force: true });
const cli = path.join(ROOT, 'node_modules', 'electron-builder', 'cli.js');
execFileSync(process.execPath, [cli, '--win', '--publish', 'never'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } });

// 3. Checksums
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const pick = (dir, re) => { const f = fs.readdirSync(dir).find((x) => re.test(x)); if (!f) throw new Error(`missing ${re} in ${dir}`); return path.join(dir, f); };
const files = {
  wizard: pick(path.join(OUT, 'nsis-web'), /^Steam-Redesigned-Setup-.*\.exe$/),
  offline: pick(OUT, /^Steam-Redesigned-Offline-Setup-.*\.exe$/),
  msi: pick(OUT, /^Steam-Redesigned-.*\.msi$/),
  package: pick(path.join(OUT, 'nsis-web'), /\.7z$/),
};
const lines = Object.values(files).map((f) => `${sha(f)}  ${path.basename(f)}`);
fs.writeFileSync(path.join(OUT, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
for (const [k, f] of Object.entries(files)) console.log(`${k.padEnd(8)} ${path.basename(f)}  ${(fs.statSync(f).size / 1048576).toFixed(1)} MB`);
