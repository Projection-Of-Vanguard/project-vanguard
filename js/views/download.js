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
const ua = navigator.userAgent;
// Offer the app that runs on this device; elsewhere (iPhone, Mac, Linux) offer to send the link on
const onWindows = () => /Windows NT/i.test(ua);
const onAndroid = () => /Android/i.test(ua);
const deviceName = () => (/iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Mac OS X/i.test(ua) ? 'macOS' : /CrOS/i.test(ua) ? 'ChromeOS' : /Linux/i.test(ua) ? 'Linux' : 'this device');
async function copyLink() {
  const url = `${location.origin}/#/download`;
  try { await navigator.clipboard.writeText(url); toast('Link copied. Open it on your Windows PC or Android phone.'); }
  catch { toast(url); }
}
const markHTML = () => document.querySelector('.brand__mark')?.outerHTML || '';

function band(m) {
  const apk = m.android;
  let kicker, title, text, actions;
  if (onAndroid() && apk) {
    kicker = `${icon('android', 'os')}App for Android`;
    title = 'Get Steam Redesigned on your phone';
    text = 'The whole store and community as an app: it opens instantly, runs full screen and keeps your wishlist and settings on your phone.';
    actions = `<a class="btn btn--primary getapp__main" href="${esc(apk.url)}" download>${icon('download', 'i i--sm')}Download for Android</a>
      <p class="getapp__meta">Version ${esc(m.version)} · ${mb(apk.size)} APK · Android 7 and later</p>`;
  } else if (onWindows()) {
    kicker = `${icon('windows', 'os')}Desktop app for Windows`;
    title = 'Get Steam Redesigned on your PC';
    text = 'Everything on this site, plus AI search with your own key, a catalog that refreshes every 6 hours, live player counts and the system tray.';
    actions = `<a class="btn btn--primary getapp__main" href="${esc(m.wizard.url)}" download>${icon('download', 'i i--sm')}Download for Windows</a>
      <p class="getapp__meta">Version ${esc(m.version)} · ${mb(m.wizard.size)} download wizard · Windows 10 and 11, 64-bit${apk ? ` · <a href="#/download">Android app</a>` : ''}</p>`;
  } else {
    kicker = `${icon('windows', 'os')}${apk ? `${icon('android', 'os')}Apps for Windows and Android` : 'Desktop app for Windows'}`;
    title = 'Get the Steam Redesigned app';
    text = `There's an app for ${apk ? 'Windows PCs and Android phones' : 'Windows PCs'}. You're on ${deviceName()}, so open this page on one of those to install it. Everything else works right here in the browser.`;
    actions = `<button type="button" class="btn btn--primary getapp__main" data-copy-link>Copy download link</button>
      <p class="getapp__meta">Free · Version ${esc(m.version)}</p>`;
  }
  return `<section class="getapp reveal" style="--i:0" aria-labelledby="h-getapp">
    <div class="getapp__mark" aria-hidden="true">${markHTML()}</div>
    <div class="getapp__copy">
      <p class="getapp__kicker">${kicker}</p>
      <h2 id="h-getapp">${title}</h2>
      <p>${text}</p>
    </div>
    <div class="getapp__actions">
      ${actions}
      <a class="getapp__more" href="#/download">All downloads and checksums</a>
    </div>
  </section>`;
}

/** Placeholder for the home page; filled once /downloads.json loads. */
export function downloadBandHTML() {
  return window.desktop || window.mobileApp ? '' : '<div class="wrap" data-getapp></div>';
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
      <p>Free apps for Windows and Android. They work like this site, with extras that need an app.</p></header>
    <div data-dl-body>${window.desktop ? '<p class="set-note">You are already using the desktop app.</p>' : '<p class="muted">Loading download details…</p>'}</div>
  </div>`;
}

const fileCard = (f, title, desc, primary) => `<article class="dl-card${primary ? ' dl-card--main' : ''}">
    <h3>${title}</h3><p>${desc}</p>
    <a class="btn ${primary ? 'btn--primary' : 'btn--ghost'}" href="${esc(f.url)}" download>${icon('download', 'i i--sm')}${esc(f.name)}</a>
    <p class="dl-card__meta">${mb(f.size)}</p>
    <details class="dl-card__hash"><summary>SHA-256 checksum</summary><code>${esc(f.sha256)}</code></details>
  </article>`;

function windowsSection(m) {
  return `<section class="dl-platform reveal" style="--i:1" aria-labelledby="h-dl-win">
    <h2 id="h-dl-win" class="dl-platform__title">${icon('windows', 'os')}Windows</h2>
    <div class="dl-grid">
      ${fileCard(m.wizard, 'Download wizard', 'Recommended. A small setup program that downloads the app, checks it hasn\'t been tampered with, and installs it.', onWindows())}
      ${fileCard(m.msi, 'Windows Installer (.msi)', 'The full app in one Windows Installer package. Good for offline installs and IT deployment.')}
      ${fileCard(m.offline, 'Offline installer (.exe)', 'The full app in one setup file, for PCs without a fast connection.')}
    </div>
    <div class="dl-info">
      <div><h3>Installing</h3><ol>
        <li>Run the file you downloaded. It installs for your Windows account only and doesn't need administrator rights.</li>
        <li>Windows may show "Windows protected your PC" because the app isn't code-signed yet. Choose <b>More info</b>, then <b>Run anyway</b>.</li>
        <li>Open <b>Steam Redesigned</b> from the Start menu or the Desktop. It lives in the system tray; quit it from the tray icon.</li>
        <li>To remove it, use Windows Settings › Apps › Installed apps.</li>
      </ol></div>
      <div><h3>Is it safe?</h3><ul>
        <li>Each install is independent: no remote control, no connection to anyone else's PC, and no hidden updates.</li>
        <li>Its local data server only answers your own PC. Other devices on your network can't connect to it.</li>
        <li>The app refuses debugging switches, can't be turned into a script runner, and won't start if its files were modified.</li>
        <li>Your Anthropic API key, if you add one, is encrypted with your Windows account and never leaves your PC except to call Anthropic.</li>
        <li>Check a download with <code>certutil -hashfile &lt;file&gt; SHA256</code> and compare it with the checksum above.</li>
      </ul></div>
    </div>
  </section>`;
}

function androidSection(m) {
  const apk = m.android;
  return `<section class="dl-platform reveal" style="--i:1" aria-labelledby="h-dl-android">
    <h2 id="h-dl-android" class="dl-platform__title">${icon('android', 'os')}Android</h2>
    <div class="dl-grid dl-grid--one">
      ${fileCard(apk, 'Android app (.apk)', 'The store and community as a full-screen app for Android 7 and later. Your wishlist, cart and settings stay on your phone.', onAndroid())}
    </div>
    <div class="dl-info">
      <div><h3>Installing</h3><ol>
        <li>Download the APK on your phone and open it from the notification or your Downloads.</li>
        <li>The app isn't from the Play Store, so Android asks before installing it. Tap <b>Settings</b>, turn on <b>Allow from this source</b> for your browser, then go back.</li>
        <li>Tap <b>Install</b>. If Google Play Protect asks about an unknown app, choose <b>More details</b>, then <b>Install anyway</b>.</li>
        <li>Open <b>Steam Redesigned</b> from your home screen or app drawer. To remove it, press and hold the icon and choose <b>Uninstall</b>.</li>
      </ol></div>
      <div><h3>Is it safe?</h3><ul>
        <li>The only permission it asks for is internet access. No camera, contacts, location or storage.</li>
        <li>It talks only to this site's read-only service and Steam's image servers, always over HTTPS.</li>
        <li>No account and no tracking. Your wishlist, cart and settings never leave your phone.</li>
        <li>Every version is signed with the same Project Vanguard key, so Android only installs updates that really come from us.</li>
        <li>You can compare the SHA-256 checksum above with the one on the GitHub release page.</li>
      </ul></div>
    </div>
  </section>`;
}

export async function mountDownload(root) {
  const g = db.games.find((x) => x.hero) || db.games[0];
  if (g) setAmbient(g.header);
  if (window.desktop) return;
  const body = $('[data-dl-body]', root);
  const m = await loadManifest();
  if (!m) { body.innerHTML = '<div class="empty"><h2>Downloads aren\'t published here</h2><p>This copy of the site runs locally. The installers are in the project\'s dist folder.</p></div>'; return; }
  const note = window.mobileApp
    ? '<div class="dl-device reveal" style="--i:1"><p>You\'re using the Android app. The Windows app is below if you want it on your PC too.</p></div>'
    : !onWindows() && !onAndroid()
      ? `<div class="dl-device reveal" style="--i:1"><p>You're on ${deviceName()}. The apps run on Windows PCs and Android phones, so send this page to one of those and install it there. Everything else works right here in the browser.</p><button type="button" class="btn btn--primary btn--sm" data-copy-link>Copy download link</button></div>`
      : '';
  const sections = [windowsSection(m), m.android && !window.mobileApp ? androidSection(m) : ''];
  if (onAndroid() && !window.mobileApp) sections.reverse();
  body.innerHTML = `${note}${sections.join('')}
    <p class="muted dl-foot">Version ${esc(m.version)}, published ${esc(new Date(m.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}.${m.release ? ` Release notes are on <a href="${esc(m.release)}">GitHub</a>.` : ''} Steam Redesigned is an unofficial project and is not affiliated with Valve.</p>`;
  $('[data-copy-link]', body)?.addEventListener('click', copyLink);
}
