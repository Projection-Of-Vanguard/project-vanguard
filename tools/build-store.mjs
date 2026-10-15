// Builds the Microsoft Store package: node tools/build-store.mjs  (or npm run dist:store)
//   dist-store/Steam-Redesigned-<v>.appx   upload this in Partner Center (the Store signs it)
// 1. Reads the app's identity from tools/store-identity.json (Partner Center > Product identity).
// 2. Prepares the starter catalog, like the installers (public Steam data only).
// 3. Runs electron-builder's AppX target (fuses flipped in tools/after-pack.cjs, a startup task
//    from tools/appx-extensions.xml that people switch on in Windows Settings > Apps > Startup).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist-store');
const id = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'store-identity.json'), 'utf8'));
const placeholder = /0000-0000/.test(id.publisher);
if (!/^[A-Za-z0-9.-]{3,50}$/.test(id.identityName) || !/^CN=/.test(id.publisher)) throw new Error('tools/store-identity.json: copy Package/Identity/Name and Publisher from Partner Center.');
if (placeholder) console.log('note: tools/store-identity.json still has the placeholder publisher. This package can be inspected, but Partner Center will refuse it until the real values are filled in.');

// Starter catalog
const SEED_DIR = path.join(ROOT, 'dist-seed');
fs.mkdirSync(SEED_DIR, { recursive: true });
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'catalog.json'), 'utf8'));
const clean = { v: catalog.v, updated: catalog.updated, count: catalog.games.length, minPlayers: catalog.minPlayers, tags: catalog.tags, games: catalog.games, changes: { added: [], removed: [] } };
fs.writeFileSync(path.join(SEED_DIR, 'catalog.json'), JSON.stringify(clean));

const cli = path.join(ROOT, 'node_modules', 'electron-builder', 'cli.js');
const args = ['--win', 'appx', '--x64', '--publish', 'never',
  `-c.directories.output=dist-store`,
  '-c.toolsets.winCodeSign=1.1.0', // the newer Windows kit (makeappx, makepri), checksum-checked by electron-builder
  `-c.appx.identityName=${id.identityName}`,
  `-c.appx.publisher=${id.publisher}`,
  `-c.appx.publisherDisplayName=${id.publisherDisplayName}`,
];
const run = (env = {}) => execFileSync(process.execPath, [cli, ...args], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false', ...env } });

// makeappx.exe won't start from electron-builder's cache folder on current Windows 11 ("side-by-side
// configuration is incorrect"), but works from a plain folder: copy the kit there and point electron-builder at it.
const CACHE = path.join(process.env.LOCALAPPDATA || os.homedir(), 'electron-builder', 'Cache', 'win-codesign@1.1.0');
const KIT = path.join(os.tmpdir(), 'vanguard-windows-kit');
const copyKit = () => {
  const bundle = fs.existsSync(CACHE) && fs.readdirSync(CACHE).map((d) => path.join(CACHE, d)).find((d) => fs.existsSync(path.join(d, 'x64', 'makeappx.exe')));
  if (!bundle) return false;
  fs.rmSync(KIT, { recursive: true, force: true });
  fs.cpSync(path.join(bundle, 'x64'), KIT, { recursive: true });
  if (fs.existsSync(path.join(bundle, 'appxAssets'))) fs.cpSync(path.join(bundle, 'appxAssets'), path.join(KIT, 'appxAssets'), { recursive: true });
  return true;
};
if (!copyKit()) { try { run(); } catch { /* the first run downloads the kit, then stops at makeappx */ } }
if (!copyKit()) throw new Error('Could not get the Windows packaging kit (makeappx). Check the internet connection and try again.');
fs.rmSync(OUT, { recursive: true, force: true });
run({ ELECTRON_BUILDER_WINDOWS_KITS_PATH: KIT });
for (const f of fs.readdirSync(OUT).filter((x) => /\.appx$/i.test(x))) console.log(`store package: dist-store/${f}  ${(fs.statSync(path.join(OUT, f)).size / 1048576).toFixed(1)} MB`);
