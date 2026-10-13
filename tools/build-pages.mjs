// Builds the GitHub Pages site (https://projection-of-vanguard.github.io) into pages/.
//   node tools/build-pages.mjs        (after tools/publish-web.mjs wrote pages/downloads.json)
// Plain static HTML: every download link, size and checksum is written into the page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'pages');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const dl = JSON.parse(fs.readFileSync(path.join(OUT, 'downloads.json'), 'utf8'));
const WEB = 'https://projectvanguard.vercel.app';
const REPO = pkg.repository.url.replace(/\.git$/, '');

// Assets: the app icon and the two typefaces the app uses
fs.mkdirSync(path.join(OUT, 'assets', 'fonts'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'assets', 'icon.png'), path.join(OUT, 'assets', 'icon.png'));
const fonts = ['ChakraPetch-600-latin', 'ChakraPetch-700-latin', 'InstrumentSans-400-latin', 'InstrumentSans-500-latin', 'InstrumentSans-600-latin'];
for (const f of fonts) fs.copyFileSync(path.join(ROOT, 'assets', 'fonts', `${f}.woff2`), path.join(OUT, 'assets', 'fonts', `${f}.woff2`));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const mb = (b) => `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0)} MB`;
const date = new Date(dl.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const mark = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14.5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="20.5" cy="12" r="4.2" fill="none" stroke="var(--blue)" stroke-width="2.4"/><circle cx="11" cy="20.5" r="3.1" fill="currentColor"/><path d="M3 18.5 11 20.5 17.2 14.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const dlIcon = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 19h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const winIcon = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 5.1 10.4 4v7.2H3zm0 13.8 7.4 1.1v-7.1H3zm8.3 1.2L21 21.5v-8.6h-9.7zm0-16.2v7.3H21V2.5z"/></svg>';

const shots = [
  ['app-window', 'The Windows app, with its own title bar menu'],
  ['game', 'Game page with live player count, OS logos, media and reviews'],
  ['community', 'Community feed with comments that open in place'],
  ['ai-search', 'AI search turns a plain request into filters'],
  ['calendar', 'Release calendar of popular upcoming games'],
  ['download', 'Download page on the website'],
];

const file = (f, title, desc, main) => `
        <article class="file${main ? ' file--main' : ''}">
          <h3>${title}</h3>
          <p>${desc}</p>
          <a class="btn ${main ? 'btn--primary' : 'btn--ghost'}" href="${esc(f.url)}">${dlIcon}${esc(f.name)}</a>
          <p class="file__meta">${mb(f.size)}</p>
          <details><summary>SHA-256 checksum</summary><code>${esc(f.sha256)}</code></details>
        </article>`;

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Steam Redesigned — Project Vanguard</title>
  <meta name="description" content="An unofficial redesign of the Steam store and community, as a Windows desktop app and a website. Live Steam data, AI search, recommendations and more.">
  <meta name="color-scheme" content="dark">
  <meta name="theme-color" content="#0b1828">
  <meta property="og:title" content="Steam Redesigned — Project Vanguard">
  <meta property="og:description" content="An unofficial redesign of the Steam store and community for Windows and the web.">
  <meta property="og:image" content="https://projection-of-vanguard.github.io/screenshots/home.jpg">
  <link rel="icon" href="assets/icon.png">
  <link rel="preload" href="assets/fonts/ChakraPetch-700-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <header class="top">
    <div class="wrap top__in">
      <a class="brand" href="#top" aria-label="Project Vanguard home">${mark}<span>Project <b>Vanguard</b></span></a>
      <nav aria-label="Sections">
        <a href="#screens">Screens</a>
        <a href="#features">Features</a>
        <a href="#download">Download</a>
        <a href="#security">Security</a>
        <a href="${REPO}">GitHub</a>
      </nav>
    </div>
  </header>

  <main id="main">
    <section class="hero" id="top">
      <div class="wrap hero__in">
        <div class="hero__copy">
          <h1>Steam Redesigned</h1>
          <p class="lede">An unofficial redesign of the Steam store and community, running on live Steam data. Use it as a Windows app or right in your browser.</p>
          <div class="hero__actions">
            <a class="btn btn--primary btn--lg" href="${esc(dl.wizard.url)}">${winIcon}Download for Windows</a>
            <a class="btn btn--ghost btn--lg" href="${WEB}">Open the web version</a>
          </div>
          <p class="hero__meta">Version ${esc(dl.version)} · ${mb(dl.wizard.size)} setup wizard · Windows 10 and 11, 64-bit · Free</p>
        </div>
        <figure class="hero__shot">
          <div class="window"><div class="window__bar"><span></span><span></span><span></span></div><img src="screenshots/home.jpg" width="1440" height="900" alt="The Steam Redesigned store home page, with the featured carousel and the download band"></div>
        </figure>
      </div>
    </section>

    <section class="band" id="screens" aria-labelledby="h-screens">
      <div class="wrap">
        <h2 id="h-screens">A closer look</h2>
        <p class="section-lede">Every screen is rebuilt from scratch with new layouts, motion and colour, while keeping Steam's blue.</p>
        <div class="gallery">
${shots.map(([n, alt], i) => `          <figure class="shot${i === 0 ? ' shot--wide' : ''}"><a href="screenshots/${n}.jpg"><img src="screenshots/${n}.jpg" width="1440" height="900" loading="lazy" alt="${esc(alt)}"></a><figcaption>${esc(alt)}</figcaption></figure>`).join('\n')}
        </div>
      </div>
    </section>

    <section class="band" id="features" aria-labelledby="h-features">
      <div class="wrap">
        <h2 id="h-features">What it does</h2>
        <div class="features">
          <div>
            <h3>Store</h3>
            <ul>
              <li>Every Steam game with 100+ players at its daily peak, up to 10,000, refreshed automatically.</li>
              <li>Official Windows, macOS, Linux and Steam Deck logos next to every game name.</li>
              <li>Live player counts, price and player history charts, and the lowest recorded price.</li>
              <li>Price alerts on your wishlist, side-by-side compare and a release calendar.</li>
              <li>Search that forgives typos, plus AI search powered by Claude in the app.</li>
            </ul>
          </div>
          <div>
            <h3>Recommendations</h3>
            <ul>
              <li>A taste profile built from what you like, wishlist, own and open.</li>
              <li>Every pick explains why it's there.</li>
              <li>"More like this" and "Not interested" re-rank the list instantly.</li>
              <li>Hide tags or owned games from the whole store.</li>
            </ul>
          </div>
          <div>
            <h3>Community</h3>
            <ul>
              <li>Screenshots, art, videos, workshop items, guides, reviews, discussions and news.</li>
              <li>Comment threads open in place with an animation.</li>
            </ul>
          </div>
          <div>
            <h3>Make it yours</h3>
            <ul>
              <li>Themes, colours, backgrounds, notifications and accessibility options.</li>
              <li>Animation settings with a live preview: card hovers, page transitions, speed and more.</li>
              <li>The app lives in the system tray, with an Update now button for instant refreshes.</li>
            </ul>
          </div>
        </div>
        <div class="compare">
          <div class="compare__table">
          <h3>App or website?</h3>
          <table>
            <thead><tr><th scope="col">Feature</th><th scope="col">Windows app</th><th scope="col">Website</th></tr></thead>
            <tbody>
              <tr><th scope="row">Store, game pages, community, recommendations</th><td>Yes</td><td>Yes</td></tr>
              <tr><th scope="row">Catalog refresh</th><td>Every 6 hours, or on demand</td><td>Daily</td></tr>
              <tr><th scope="row">AI search with Claude</th><td>Yes, with your own API key</td><td>Built-in search only</td></tr>
              <tr><th scope="row">Catalog size and player limit settings</th><td>Yes</td><td>No</td></tr>
              <tr><th scope="row">System tray, notifications</th><td>Yes</td><td>No</td></tr>
              <tr><th scope="row">Works on phones, Macs and Linux</th><td>No</td><td>Yes</td></tr>
            </tbody>
          </table>
          </div>
          <figure class="compare__phone"><img src="screenshots/mobile.jpg" width="780" height="1688" loading="lazy" alt="The website on a phone, offering to send the download link to a PC"><figcaption>On a phone, the website offers to send the download to your PC.</figcaption></figure>
        </div>
      </div>
    </section>

    <section class="band band--dl" id="download" aria-labelledby="h-download">
      <div class="wrap">
        <h2 id="h-download">Download</h2>
        <p class="section-lede">Version ${esc(dl.version)}, released ${esc(date)}. For Windows 10 and 11, 64-bit. Everything installs for your Windows account only and doesn't need administrator rights.</p>
        <div class="files">${file(dl.wizard, 'Setup wizard', 'Recommended. A small program that downloads the app, checks it hasn\'t been tampered with, and installs it.', true)}${file(dl.msi, 'Windows Installer (.msi)', 'The whole app in one Windows Installer package. Good for offline installs and IT deployment.')}${file(dl.offline, 'Offline installer (.exe)', 'The whole app in one setup file, for PCs without a fast connection.')}
        </div>
        <p class="files__all">All files and release notes are on the <a href="${esc(dl.release)}">GitHub release page</a>.</p>
        <div class="install">
          <div>
            <h3>Installing</h3>
            <ol>
              <li>Run the file you downloaded.</li>
              <li>Windows may show "Windows protected your PC" because the app isn't code-signed yet. Choose <b>More info</b>, then <b>Run anyway</b>.</li>
              <li>Open <b>Steam Redesigned</b> from the Start menu or the Desktop. It lives in the system tray; quit it from the tray icon.</li>
              <li>To remove it, go to Windows Settings › Apps › Installed apps.</li>
            </ol>
          </div>
          <div>
            <h3>Check your download</h3>
            <p>Open Command Prompt in your Downloads folder and run:</p>
            <pre><code>certutil -hashfile ${esc(dl.wizard.name)} SHA256</code></pre>
            <p>The result should match the checksum under the file above.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="band" id="security" aria-labelledby="h-security">
      <div class="wrap">
        <h2 id="h-security">Built to be safe to share</h2>
        <p class="section-lede">Installing the app on another PC creates a fully independent copy. Nothing links it back to anyone else's computer.</p>
        <div class="features">
          <div>
            <h3>The app</h3>
            <ul>
              <li>No remote control, no connection between copies and no hidden updates.</li>
              <li>Its local data server only answers the PC it runs on. Other devices on the network can't reach it.</li>
              <li>Refuses debugging switches, can't be turned into a script runner, and won't start if its files were modified.</li>
              <li>Your Anthropic API key, if you add one, is encrypted with your Windows account.</li>
            </ul>
          </div>
          <div>
            <h3>The website</h3>
            <ul>
              <li>Read-only: settings and keys only exist in the desktop app.</li>
              <li>Strict content security policy, HTTPS only, no framing and no tracking.</li>
              <li>Requests from other websites are refused, and every endpoint is rate-limited.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer class="foot">
    <div class="wrap foot__in">
      <p><b>Steam Redesigned</b> is an unofficial fan project and is not affiliated with Valve. Game names, art, prices and posts belong to their owners. Data comes from the Steam store, Steam Web APIs, Steam Community and SteamSpy.</p>
      <p><a href="${WEB}">Web version</a> · <a href="${REPO}">Source code</a> · <a href="${REPO}/releases">All releases</a></p>
    </div>
  </footer>
</body>
</html>
`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log(`pages/ built for ${dl.version}`);
