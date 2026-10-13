// Builds the Android app:  node tools/build-android.mjs
//   dist/android/Steam-Redesigned-<version>.apk   signed release APK
// 1. Copies the interface into mobile/www with the API address of the hosted site, so the app
//    opens instantly from its own files and gets its data from https://projectvanguard.vercel.app.
// 2. Syncs it into the Capacitor Android project and builds a signed release with Gradle.
// Needs JDK 21 and the Android SDK (paths below, or JAVA_HOME / ANDROID_HOME) and
// mobile/signing/keystore.properties (created on first setup, never committed).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOBILE = path.join(ROOT, 'mobile');
const WWW = path.join(MOBILE, 'www');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const API = 'https://projectvanguard.vercel.app';
const env = {
  ...process.env,
  JAVA_HOME: process.env.JAVA_HOME_21 || 'C:\\Users\\alime\\AndroidDev\\jdk-21.0.12.1+1',
  ANDROID_HOME: process.env.ANDROID_HOME || 'C:\\Users\\alime\\AndroidDev\\sdk',
};
if (!fs.existsSync(path.join(MOBILE, 'signing', 'keystore.properties'))) throw new Error('mobile/signing/keystore.properties is missing, so the APK cannot be signed');

// 1. The interface, pointed at the hosted API
fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(path.join(WWW, 'assets'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'styles.css'), path.join(WWW, 'styles.css'));
fs.cpSync(path.join(ROOT, 'js'), path.join(WWW, 'js'), { recursive: true });
fs.cpSync(path.join(ROOT, 'assets', 'fonts'), path.join(WWW, 'assets', 'fonts'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'assets', 'icon.png'), path.join(WWW, 'assets', 'icon.png'));
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: https:", "font-src 'self'",
  `connect-src 'self' ${API}`, "media-src 'self' https:", 'frame-src https://www.youtube-nocookie.com', "object-src 'none'", "base-uri 'none'", "form-action 'self'",
].join('; ');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const head = `<meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="api-base" content="${API}" data-version="${pkg.version}">`;
if (!html.includes('<meta charset="utf-8">')) throw new Error('index.html has no charset meta to anchor on');
html = html.replace('<meta charset="utf-8">', head).replace(/\s*<link rel="manifest"[^>]*>/, '');
fs.writeFileSync(path.join(WWW, 'index.html'), html);

// 2. Capacitor sync and Gradle release build
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
execFileSync(npx, ['cap', 'sync', 'android'], { cwd: MOBILE, stdio: ['ignore', 'ignore', 'inherit'], env, shell: process.platform === 'win32' });
const [maj, min, pat] = pkg.version.split('.').map(Number);
const versionCode = maj * 10000 + min * 100 + pat;
const gradlew = path.join(MOBILE, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
execFileSync(gradlew, ['assembleRelease', '--no-daemon', '-q', `-PvanguardVersionName=${pkg.version}`, `-PvanguardVersionCode=${versionCode}`], { cwd: path.join(MOBILE, 'android'), stdio: 'inherit', env, shell: process.platform === 'win32' });

const built = path.join(MOBILE, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const outDir = path.join(ROOT, 'dist', 'android');
fs.mkdirSync(outDir, { recursive: true });
const apk = path.join(outDir, `Steam-Redesigned-${pkg.version}.apk`);
fs.copyFileSync(built, apk);
const sha = crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
fs.writeFileSync(path.join(outDir, 'SHA256SUMS.txt'), `${sha}  ${path.basename(apk)}\n`);

// Verify the signature and record the signing certificate's fingerprint for the download pages
const buildTools = path.join(env.ANDROID_HOME, 'build-tools');
const apksigner = path.join(buildTools, fs.readdirSync(buildTools).sort().pop(), process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
const certs = execFileSync(apksigner, ['verify', '--print-certs', apk], { env, shell: process.platform === 'win32', encoding: 'utf8' });
const cert = /certificate SHA-256 digest: ([0-9a-f]{64})/.exec(certs)?.[1];
if (!cert) throw new Error('apksigner could not verify the APK signature');
fs.writeFileSync(path.join(outDir, 'certificate-sha256.txt'), cert.toUpperCase().match(/../g).join(':') + '\n');
console.log(`apk      ${path.basename(apk)}  ${(fs.statSync(apk).size / 1048576).toFixed(1)} MB  versionCode ${versionCode}`);
console.log(`sha256   ${sha}`);
