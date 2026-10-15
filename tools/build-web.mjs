// Assembles the hosted website in web/ (deployed to Vercel from there):
//   web/public/   static site (CDN)       web/api/index.mjs   API function (public mode)
//   web/server.mjs                        web/vercel.json     routes, security headers, daily cron
// Only these files are deployed: no data/, no keys, no tools, no installers.
import fs from 'node:fs';
import { AI_HOSTS } from '../js/llm.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');
const PUB = path.join(WEB, 'public');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
const ver = (name) => lock.packages[`node_modules/${name}`].version;

// Fresh public/ (keep downloads.json written by tools/publish-web.mjs)
const keep = fs.existsSync(path.join(PUB, 'downloads.json')) ? fs.readFileSync(path.join(PUB, 'downloads.json')) : null;
fs.rmSync(PUB, { recursive: true, force: true });
fs.mkdirSync(PUB, { recursive: true });
for (const f of ['index.html', 'styles.css', 'manifest.webmanifest']) fs.copyFileSync(path.join(ROOT, f), path.join(PUB, f));
fs.cpSync(path.join(ROOT, 'js'), path.join(PUB, 'js'), { recursive: true });
fs.mkdirSync(path.join(PUB, 'assets'), { recursive: true });
fs.cpSync(path.join(ROOT, 'assets', 'fonts'), path.join(PUB, 'assets', 'fonts'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'assets', 'icon.png'), path.join(PUB, 'assets', 'icon.png'));
if (keep) fs.writeFileSync(path.join(PUB, 'downloads.json'), keep);

// API function
fs.copyFileSync(path.join(ROOT, 'server.mjs'), path.join(WEB, 'server.mjs'));
fs.mkdirSync(path.join(WEB, 'api'), { recursive: true });
fs.writeFileSync(path.join(WEB, 'api', 'index.mjs'), `// Every /api/* request is rewritten here (see vercel.json). PUBLIC_MODE=1 is set as a project variable.
import { createPublicHandler } from '../server.mjs';

const handler = createPublicHandler();
export default function api(req, res) {
  return handler(req, res);
}
`);
fs.writeFileSync(path.join(WEB, 'package.json'), JSON.stringify({
  name: 'project-vanguard-web',
  private: true,
  type: 'module',
  engines: { node: '24.x' },
  dependencies: { '@vercel/blob': ver('@vercel/blob') },
}, null, 2) + '\n');

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: https:", "font-src 'self'",
  `connect-src 'self' ${AI_HOSTS.join(' ')}`, "media-src 'self' https:", 'frame-src https://www.youtube-nocookie.com https://bandcamp.com', "object-src 'none'", "base-uri 'none'",
  "form-action 'self'", "frame-ancestors 'none'", 'upgrade-insecure-requests',
].join('; ');
fs.writeFileSync(path.join(WEB, 'vercel.json'), JSON.stringify({
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: null,
  buildCommand: '',
  outputDirectory: 'public',
  functions: { 'api/index.mjs': { maxDuration: 300 } },
  rewrites: [{ source: '/api/:path*', destination: '/api/index?__path=:path*' }],
  crons: [{ path: '/api/cron/refresh', schedule: '0 5 * * *' }],
  headers: [
    { source: '/(.*)', headers: [
      { key: 'Content-Security-Policy', value: CSP },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    ] },
    { source: '/assets/fonts/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '/downloads.json', headers: [{ key: 'Cache-Control', value: 'public, max-age=300' }] },
  ],
}, null, 2) + '\n');
fs.writeFileSync(path.join(WEB, '.vercelignore'), '.env*\n*.log\nnode_modules\n');
console.log(`web/ assembled for ${pkg.productName} ${pkg.version}`);
