// Publishes a release:  node tools/publish-web.mjs        (after tools/build-installer.mjs)
//   1. Uploads the installers to a GitHub Release (free, no bandwidth cap) with the GitHub CLI.
//   2. Uploads the starter data for the website's API to Vercel Blob.
//   3. Writes downloads.json for the website (web/public) and the GitHub Pages site (pages/).
// The Blob token is read from web/.env.local (pulled with `vercel env pull`) and never printed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { put } from '@vercel/blob';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
const tag = `v${version}`;
const GH = process.env.GH_PATH || 'gh';

// The download wizard fetches exactly nsisWeb.appPackageUrl, so the package must be that release asset
const m = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\/([^/]+)\/([^/]+)$/.exec(pkg.build.nsisWeb.appPackageUrl);
if (!m) throw new Error('nsisWeb.appPackageUrl must be a GitHub release asset URL');
const [, repo, urlTag, packageName] = m;
if (urlTag !== tag) throw new Error(`nsisWeb.appPackageUrl points at ${urlTag}, but package.json is ${tag}`);

const pick = (dir, re) => { const f = fs.readdirSync(dir).find((x) => re.test(x)); if (!f) throw new Error(`missing ${re} in ${dir}`); return path.join(dir, f); };
const files = {
  wizard: pick(path.join(DIST, 'nsis-web'), /^Steam-Redesigned-Setup-.*\.exe$/),
  msi: pick(DIST, /^Steam-Redesigned-.*\.msi$/),
  offline: pick(DIST, /^Steam-Redesigned-Offline-Setup-.*\.exe$/),
  package: pick(path.join(DIST, 'nsis-web'), /\.7z$/),
};
if (path.basename(files.package) !== packageName) throw new Error(`built package ${path.basename(files.package)} does not match nsisWeb.appPackageUrl`);
const sums = path.join(DIST, 'SHA256SUMS.txt');

// 1. GitHub Release
const manifest = { version, date: new Date().toISOString(), release: `https://github.com/${repo}/releases/tag/${tag}` };
for (const [key, file] of Object.entries(files)) {
  const name = path.basename(file);
  const size = fs.statSync(file).size;
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (key !== 'package') manifest[key] = { name, url: `https://github.com/${repo}/releases/download/${tag}/${name}`, size, sha256 };
}
const notes = path.join(DIST, 'release-notes.md');
fs.writeFileSync(notes, `Steam Redesigned ${version} for Windows 10 and 11 (64-bit).

| File | What it is |
|---|---|
| \`${manifest.wizard.name}\` | **Recommended.** Download wizard: downloads the app package below, checks its SHA-512, then installs. |
| \`${manifest.msi.name}\` | Windows Installer package of the full app. |
| \`${manifest.offline.name}\` | Full app in one setup file, no download needed. |
| \`${packageName}\` | The app package the wizard downloads. You don't need to download it yourself. |

All installers are per-user and need no administrator rights. They aren't code-signed yet, so Windows SmartScreen shows "Windows protected your PC": choose **More info**, then **Run anyway**.

**SHA-256 checksums** (check with \`certutil -hashfile <file> SHA256\`):
\`\`\`
${fs.readFileSync(sums, 'utf8').trim()}
\`\`\`
`);
const assets = [...Object.values(files), sums];
const exists = (() => { try { execFileSync(GH, ['release', 'view', tag, '--repo', repo], { stdio: 'ignore' }); return true; } catch { return false; } })();
if (exists) {
  execFileSync(GH, ['release', 'edit', tag, '--repo', repo, '--notes-file', notes], { stdio: 'inherit' });
  execFileSync(GH, ['release', 'upload', tag, ...assets, '--repo', repo, '--clobber'], { stdio: 'inherit' });
} else {
  execFileSync(GH, ['release', 'create', tag, ...assets, '--repo', repo, '--title', `Steam Redesigned ${version}`, '--notes-file', notes, '--latest'], { stdio: 'inherit' });
}
console.log(`release  ${manifest.release}`);

// 2. Starter data for the website's API (the daily cron keeps it fresh afterwards)
const env = fs.readFileSync(path.join(ROOT, 'web', '.env.local'), 'utf8');
const token = /^BLOB_READ_WRITE_TOKEN="?([^"\r\n]+)"?/m.exec(env)?.[1];
if (!token) throw new Error('BLOB_READ_WRITE_TOKEN missing from web/.env.local');
for (const name of ['catalog.json', 'history.json', 'steamspy.json']) {
  const src = path.join(ROOT, 'data', name);
  if (!fs.existsSync(src)) continue;
  await put(`data/${name}`, fs.readFileSync(src), { access: 'public', addRandomSuffix: false, allowOverwrite: true, token, contentType: 'application/json', cacheControlMaxAge: 60 });
  console.log(`data     ${name}`);
}

// 3. Download details for both sites
const json = JSON.stringify(manifest, null, 2) + '\n';
for (const dir of [path.join(ROOT, 'web', 'public'), path.join(ROOT, 'pages')]) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'downloads.json'), json);
}
console.log('wrote web/public/downloads.json and pages/downloads.json');
