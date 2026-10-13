// "Get the app": the download band at the top of the website and the full #/download page.
// Hidden inside the desktop app. File details come from /downloads.json (written when publishing).

import { $, esc, icon, setAmbient, toast } from '../ui.js';
import { db } from '../data.js';

let manifest = null;
async function loadManifest() {
  if (manifest) return manifest;
  try {
    const r = await fetch('/downloads.json', { cache: 'no-cache' });
    if (r.ok) manifest = await r.json();
  } catch { /* not published (local browser mode) */ }
  return manifest;
}
const mb = (bytes) => `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`;
// The app is Windows-only; on phones, tablets and Macs offer to send the link to a PC instead
const onWindows = () => /Windows NT/i.test(navigator.userAgent);
const deviceName = () => (/Android/i.test(navigator.userAgent) ? 'Android' : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'iOS' : /Mac OS X/i.test(navigator.userAgent) ? 'macOS' : /CrOS/i.test(navigator.userAgent) ? 'ChromeOS' : /Linux/i.test(navigator.userAgent) ? 'Linux' : 'this device');
async function copyLink() {
  const url = `${location.origin}/#/download`;
  try { await navigator.clipboard.writeText(url); toast('Link copied. Open it on your Windows PC.'); }
  catch { toast(url); }
}
const markHTML = () => document.querySelector('.brand__mark')?.outerHTML || '';

function band(m) {
  return `<section class="getapp reveal" style="--i:0" aria-labelledby="h-getapp">
    <div class="getapp__mark" aria-hidden="true">${markHTML()}</div>
    <div class="getapp__copy">
      <p class="getapp__kicker">${icon('windows', 'os')}Desktop app for Windows</p>
      <h2 id="h-getapp">Get Steam Redesigned on your PC</h2>
      <p>Everything on this site, plus AI search with your own key, a catalog that refreshes every 6 hours, live player counts and the system tray.</p>
    </div>
    <div class="getapp__actions">
      ${onWindows()
        ? `<a class="btn btn--primary getapp__main" href="${esc(m.wizard.url)}" download>${icon('download', 'i i--sm')}Download for Windows</a>
      <p class="getapp__meta">Version ${esc(m.version)} · ${mb(m.wizard.size)} download wizard · Windows 10 and 11, 64-bit</p>`
        : `<button type="button" class="btn btn--primary getapp__main" data-copy-link>Copy link for your PC</button>
      <p class="getapp__meta">The app runs on Windows 10 and 11. You're on ${deviceName()}, so open this page on your PC to install it. <a href="${esc(m.wizard.url)}" download>Download anyway</a></p>`}
      <a class="getapp__more" href="#/download">Other installers and checksums</a>
    </div>
  </section>`;
}

/** Placeholder for the home page; filled once /downloads.json loads. */
export function downloadBandHTML() {
  return window.desktop ? '' : '<div class="wrap" data-getapp></div>';
}
export async function mountDownloadBand(root) {
  const slot = $('[data-getapp]', root);
  if (!slot) return;
  const m = await loadManifest();
  if (m && slot.isConnected) { slot.innerHTML = band(m); $('[data-copy-link]', slot)?.addEventListener('click', copyLink); }
}

export function viewDownload() {
  return `<div class="wrap dl">
    <header class="recs__head reveal" style="--i:0"><h1>Download Steam Redesigned</h1>
      <p>Project Vanguard's desktop app for Windows. It works exactly like the site, with extra features that need a PC.</p></header>
    <div data-dl-body>${window.desktop ? '<p class="set-note">You are already using the desktop app.</p>' : '<p class="muted">Loading download details…</p>'}</div>
  </div>`;
}

export async function mountDownload(root) {
  const g = db.games.find((x) => x.hero) || db.games[0];
  if (g) setAmbient(g.header);
  if (window.desktop) return;
  const body = $('[data-dl-body]', root);
  const m = await loadManifest();
  if (!m) { body.innerHTML = '<div class="empty"><h2>Downloads aren\'t published here</h2><p>This copy of the site runs locally. The installers are in the project\'s dist folder.</p></div>'; return; }
  const file = (f, title, desc, primary) => `<article class="dl-card${primary ? ' dl-card--main' : ''}">
    <h2>${title}</h2><p>${desc}</p>
    <a class="btn ${primary ? 'btn--primary' : 'btn--ghost'}" href="${esc(f.url)}" download>${icon('download', 'i i--sm')}${esc(f.name)}</a>
    <p class="dl-card__meta">${mb(f.size)}</p>
    <details class="dl-card__hash"><summary>SHA-256 checksum</summary><code>${esc(f.sha256)}</code></details>
  </article>`;
  body.innerHTML = `${onWindows() ? '' : `<div class="dl-device reveal" style="--i:1"><p>You're on ${deviceName()}. Steam Redesigned is a Windows app, so send this page to your PC and install it there. Everything else works right here in the browser.</p><button type="button" class="btn btn--primary btn--sm" data-copy-link>Copy link for your PC</button></div>`}
    <div class="dl-grid reveal" style="--i:1">
      ${file(m.wizard, 'Download wizard', 'Recommended. A small setup program that downloads the latest app and installs it. It checks the download\'s integrity before installing.', true)}
      ${file(m.msi, 'Windows Installer (.msi)', 'The full app in one Windows Installer package. Good for offline installs and IT deployment.')}
      ${file(m.offline, 'Offline installer (.exe)', 'The full app in one setup file, for PCs without a fast connection.')}
    </div>
    <section class="dl-info reveal" style="--i:2">
      <div><h2>Installing</h2><ol>
        <li>Run the file you downloaded. It installs for your Windows account only and doesn't need administrator rights.</li>
        <li>Windows may show "Windows protected your PC" because the app isn't code-signed yet. Choose <b>More info</b>, then <b>Run anyway</b>.</li>
        <li>Open <b>Steam Redesigned</b> from the Start menu or the Desktop. It lives in the system tray; quit it from the tray icon.</li>
        <li>To remove it, use Windows Settings › Apps › Installed apps.</li>
      </ol></div>
      <div><h2>Is it safe?</h2><ul>
        <li>Each install is independent: no remote control, no connection to anyone else's PC, and no hidden updates.</li>
        <li>Its local data server only answers your own PC. Other devices on your network can't connect to it.</li>
        <li>The app refuses debugging switches, can't be turned into a script runner, and won't start if its files were modified.</li>
        <li>Your Anthropic API key, if you add one, is encrypted with your Windows account and never leaves your PC except to call Anthropic.</li>
        <li>Compare the SHA-256 checksum with <code>certutil -hashfile &lt;file&gt; SHA256</code> to confirm your download is untouched.</li>
      </ul></div>
    </section>
    <p class="muted dl-foot">Version ${esc(m.version)}, published ${esc(new Date(m.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}. Steam Redesigned is an unofficial project and is not affiliated with Valve.</p>`;
  $('[data-copy-link]', body)?.addEventListener('click', copyLink);
}
