// Settings window (gear button, top right). Viewer preferences live in localStorage via
// window.STPrefs (js/boot.js); catalog and AI settings live on the local server.

import { db, getSession, post, applyContentFilter } from './data.js';
import { state, clearViewed, clearList } from './state.js';
import { $, $$, esc, icon, toast, ago, capHTML } from './ui.js';

const P = () => window.STPrefs;
const ACCENTS = [
  ['#1a9fff', 'Steam blue'], ['#22d3ee', 'Cyan'], ['#8b5cf6', 'Violet'], ['#10b981', 'Emerald'],
  ['#f59e0b', 'Amber'], ['#f43f5e', 'Rose'], ['#84cc16', 'Lime'], ['#e5e7eb', 'Silver'],
];
const MODEL_LABELS = { 'claude-opus-5-5': 'Claude Opus 5.5 (best results)', 'claude-sonnet-5-5': 'Claude Sonnet 5.5 (balanced)', 'claude-haiku-5-5': 'Claude Haiku 5.5 (fastest, lowest cost)' };

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: 'palette', desc: 'Colours, shapes and text size', rows: [
    { key: 'theme', type: 'themes', label: 'Theme', desc: 'The base colours for every surface.' },
    { key: 'accent', type: 'accent', label: 'Accent colour', desc: 'Buttons, highlights, progress bars and glows.' },
    { key: 'sale', type: 'seg', label: 'Discount colour', options: [['lime', 'Steam lime'], ['green', 'Green'], ['gold', 'Gold'], ['pink', 'Pink'], ['cyan', 'Cyan']] },
    { key: 'radius', type: 'seg', label: 'Corners', options: [['sharp', 'Sharp'], ['default', 'Rounded'], ['round', 'Extra round']] },
    { key: 'density', type: 'seg', label: 'Spacing', desc: 'Compact fits more on screen.', options: [['comfortable', 'Comfortable'], ['compact', 'Compact']] },
    { key: 'font', type: 'seg', label: 'Typeface', options: [['default', 'Chakra Petch and Instrument Sans'], ['system', 'System (Segoe UI)']] },
    { key: 'scale', type: 'range', label: 'Interface size', min: 80, max: 130, step: 5, unit: '%' },
  ] },
  { id: 'background', label: 'Background', icon: 'image', desc: 'The living backdrop behind every page', rows: [
    { key: 'ambient', type: 'toggle', label: 'Game art backdrop', desc: 'Blurs the art of the game in focus behind the page and fades between games.' },
    { key: 'ambientStrength', type: 'range', label: 'Backdrop strength', min: 0, max: 100, step: 5, unit: '%' },
    { key: 'grid', type: 'toggle', label: 'Blueprint grid', desc: 'A faint grid at the top of the page.' },
    { key: 'grain', type: 'toggle', label: 'Film grain', desc: 'A subtle texture over the backdrop.' },
    { key: 'transparency', type: 'toggle', label: 'Glass effects', desc: 'Frosted, see-through bars and menus. Turn off for solid surfaces and better performance.' },
  ] },
  { id: 'motion', label: 'Animations', icon: 'zap', desc: 'How things move. Changes show in the preview right away', rows: [
    { key: 'motionPreview', type: 'preview', label: 'Live preview' },
    { key: 'motion', type: 'seg', label: 'Motion', desc: '"System" follows your Windows animation setting.', options: [['system', 'System'], ['full', 'Full'], ['reduced', 'Reduced'], ['off', 'Off']] },
    { key: 'speed', type: 'range', label: 'Animation speed', desc: 'Lower is faster.', min: 0.5, max: 2, step: 0.25, unit: '×', demo: true },
    { key: 'transition', type: 'seg', label: 'Page transitions', desc: 'How one page hands over to the next. Use "Preview page transition" above to see it.', options: [['morph', 'Rise'], ['fade', 'Fade'], ['slide', 'Slide'], ['zoom', 'Zoom'], ['flip', 'Flip'], ['blur', 'Blur'], ['none', 'None']] },
    { key: 'morph', type: 'toggle', label: 'Image morph', desc: 'The game art you click grows into the game page header.' },
    { key: 'hover', type: 'seg', label: 'Card hover', desc: 'Applies to every card: games, categories, lists, deals and the featured rail.', options: [['zoom', 'Zoom'], ['lift', 'Lift'], ['glow', 'Glow'], ['tilt', '3D tilt'], ['none', 'None']] },
    { key: 'stagger', type: 'toggle', label: 'Cascade reveals', desc: 'Lists and sections rise in one after another.' },
    { key: 'parallax', type: 'toggle', label: 'Featured parallax', desc: 'The featured art drifts with your pointer.' },
    { key: 'autoplay', type: 'toggle', label: 'Rotate featured games', desc: 'Advance the featured carousel automatically.' },
    { key: 'autoplaySec', type: 'range', label: 'Time per featured game', min: 3, max: 15, step: 1, unit: ' s' },
    { key: 'shimmer', type: 'toggle', label: 'Loading shimmer', desc: 'A light sweep across placeholders while content loads.' },
  ] },
  { id: 'store', label: 'Store', icon: 'cart', desc: 'What the store shows you', rows: [
    { key: 'players', type: 'toggle', label: 'Live player counts', desc: 'Show how many people are playing on cards, lists and game pages.' },
    { key: 'personalize', type: 'toggle', label: 'Personal recommendations', desc: 'Remember the games you open on this device to tailor "Recommended for you". Off stops recording history.' },
    { key: 'hideAdult', type: 'toggle', label: 'Hide adult-only content', desc: 'Leave out games with adult sexual content.', apply: 'content' },
    { key: 'hideOwned', type: 'toggle', label: 'Hide games I own', desc: 'Games you mark "I own this" stay out of lists and recommendations.' },
    { key: 'hideIgnored', type: 'toggle', label: 'Hide "Not interested" games', desc: 'Games you dismissed stay out of lists. Clear the list in Catalog & data.' },
    { key: 'saleAlerts', type: 'toggle', label: 'Wishlist sale alerts', desc: 'Tell me when a wishlisted game goes on sale.' },
    { key: 'defaultSort', type: 'select', label: 'Default sort for lists', options: [['rel', 'Relevance'], ['top', 'Top sellers'], ['players', 'Most players'], ['new', 'Release date'], ['rev', 'User reviews'], ['pa', 'Lowest price'], ['disc', 'Biggest discount']] },
  ] },
  { id: 'community', label: 'Community', icon: 'chat', desc: 'The community feed and its animations', rows: [
    { key: 'communityPreview', type: 'cpreview', label: 'Live preview' },
    { key: 'textPosts', type: 'toggle', label: 'Text posts in the feed', desc: 'Show reviews, guides and discussions alongside screenshots and art.' },
    { key: 'communityHover', type: 'seg', label: 'Card hover', desc: '"Same as store" follows Animations > Card hover.', options: [['inherit', 'Same as store'], ['zoom', 'Zoom'], ['lift', 'Lift'], ['glow', 'Glow'], ['tilt', '3D tilt'], ['none', 'None']] },
    { key: 'feedIn', type: 'seg', label: 'Feed entrance', desc: 'How new posts appear as you scroll.', options: [['cascade', 'Cascade'], ['pop', 'Pop'], ['fade', 'Fade'], ['none', 'None']] },
    { key: 'viewerAnim', type: 'seg', label: 'Viewer opening', desc: 'How screenshots and art open full screen.', options: [['zoom', 'Zoom'], ['slide', 'Slide up'], ['fade', 'Fade'], ['none', 'None']] },
    { key: 'commentsAnim', type: 'seg', label: 'Comments opening', desc: 'How a comment thread opens under a post.', options: [['expand', 'Expand'], ['slide', 'Slide'], ['fade', 'Fade'], ['none', 'Instant']] },
  ] },
  { id: 'ai', label: 'AI search', icon: 'sparkles', desc: 'Search by describing what you want', custom: 'ai' },
  { id: 'catalog', label: 'Catalog & data', icon: 'database', desc: 'Which games the store tracks', custom: 'catalog' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', desc: 'Pop-up messages', rows: [
    { key: 'toastPos', type: 'seg', label: 'Position', options: [['bottom-center', 'Bottom'], ['bottom-right', 'Bottom right'], ['top-right', 'Top right'], ['top-center', 'Top']] },
    { key: 'toastSec', type: 'range', label: 'Show for', min: 2, max: 10, step: 1, unit: ' s', test: true },
  ] },
  { id: 'accessibility', label: 'Accessibility', icon: 'eye', desc: 'Readability and focus', rows: [
    { key: 'contrast', type: 'toggle', label: 'Higher contrast text', desc: 'Brighter secondary text and borders.' },
    { key: 'underline', type: 'toggle', label: 'Underline links', desc: 'Underline text links inside pages.' },
    { key: 'focusRing', type: 'toggle', label: 'Strong focus outline', desc: 'A thicker outline around whatever the keyboard is on.' },
    { key: 'scale', type: 'range', label: 'Interface size', min: 80, max: 130, step: 5, unit: '%' },
    { key: 'motion', type: 'seg', label: 'Motion', options: [['system', 'System'], ['full', 'Full'], ['reduced', 'Reduced'], ['off', 'Off']] },
  ] },
  { id: 'app', label: 'Desktop app', icon: 'monitor', desc: 'Window and startup behaviour', custom: 'app', appOnly: true },
  { id: 'about', label: 'About & shortcuts', icon: 'info', desc: 'Version, data sources and keyboard shortcuts', custom: 'about' },
];

let dialog;
let current = 'appearance';
let query = '';

/* ------------------------------------------------------------- controls */

function control(row) {
  const v = P().get()[row.key];
  const id = `set-${row.key}`;
  switch (row.type) {
    case 'toggle':
      return `<button type="button" class="switch" role="switch" id="${id}" aria-checked="${!!v}" data-key="${row.key}" data-kind="toggle" aria-label="${esc(row.label)}"></button>`;
    case 'seg':
      return `<div class="segmented" role="radiogroup" aria-label="${esc(row.label)}">${row.options.map(([val, l]) => `<button type="button" role="radio" aria-checked="${v === val}" data-key="${row.key}" data-kind="seg" data-value="${val}">${esc(l)}</button>`).join('')}</div>`;
    case 'select':
      return `<select id="${id}" data-key="${row.key}" data-kind="select" aria-label="${esc(row.label)}">${row.options.map(([val, l]) => `<option value="${val}"${v === val ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    case 'range':
      return `<div class="set-range"><input type="range" id="${id}" min="${row.min}" max="${row.max}" step="${row.step}" value="${v}" data-key="${row.key}" data-kind="range" aria-label="${esc(row.label)}"><output for="${id}">${fmt(row, v)}</output></div>`;
    case 'accent':
      return `<div class="swatches" role="radiogroup" aria-label="Accent colour">${ACCENTS.map(([c, l]) => `<button type="button" class="swatch-btn" role="radio" style="--c:${c}" aria-checked="${v.toLowerCase() === c}" data-key="accent" data-kind="seg" data-value="${c}" aria-label="${l}" title="${l}"></button>`).join('')}
        <label class="swatch-custom" title="Pick any colour"><span class="sr-only">Custom accent colour</span><input type="color" value="${esc(v)}" data-key="accent" data-kind="color"></label></div>`;
    case 'themes':
      return `<div class="theme-cards" role="radiogroup" aria-label="Theme">${Object.entries(P().THEMES).map(([k, t]) => `<button type="button" class="theme-card" role="radio" aria-checked="${v === k}" data-key="theme" data-kind="seg" data-value="${k}">
        <span class="theme-card__preview" style="--p1:rgb(${t.ink[1]});--p2:rgb(${t.ink[2]});--p3:rgb(${t.ink[3]})"><i></i><i></i></span>${esc(t.label)}</button>`).join('')}</div>`;
    case 'preview': return motionPreviewHTML();
    case 'cpreview': return communityPreviewHTML();
    default: return '';
  }
}

function motionPreviewHTML() {
  const sample = db.games.filter((g) => g.capsule && !g.coming).slice(0, 3);
  const osReduced = P().get().motion === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return `<div class="anim-preview">
    ${osReduced ? '<p class="set-note">Windows is asking apps to reduce motion, so animations are toned down. Set Motion to <strong>Full</strong> below to use every animation.</p>' : ''}
    <div class="anim-preview__cards">${sample.map((g) => capHTML(g, { sub: false })).join('')}</div>
    <p class="set-row__desc">Hover the cards to try the card hover style.</p>
    <div class="anim-preview__stage" data-pt-stage><div class="pt-page pt-page--a"><b>Store</b><i></i><i></i><i></i></div></div>
    <div class="anim-preview__cascade" data-cascade>${'<i></i>'.repeat(8)}</div>
    <div class="anim-preview__btns"><button type="button" class="btn btn--ghost btn--sm" data-pt-play>${icon('play', 'i i--sm i--fill')}Preview page transition</button><button type="button" class="btn btn--ghost btn--sm" data-cascade-play>${icon('refresh', 'i i--sm')}Replay cascade</button></div>
  </div>`;
}

function communityPreviewHTML() {
  return `<div class="anim-preview anim-preview--community">
    <div class="ugc ugc--review is-up cprev-card">
      <header>${icon('thumb-up')}<div><b>Recommended</b><small>42.0 hrs on record</small></div></header>
      <p class="ugc__text">Hover this card, then open the comments to see the opening animation.</p>
      <div class="cmt"><button type="button" class="cmt-toggle" data-demo-comments aria-expanded="false">${icon('comment', 'i i--sm')}<span>3 comments</span>${icon('down', 'i i--sm cmt-toggle__chev')}</button>
      <div class="cmt-panel"><div class="cmt-panel__inner"><ul class="cmt-list">${['Totally agree, the soundtrack is unreal.', 'Took me 40 hours too!', 'Adding this to my wishlist.'].map((t, i) => `<li class="cmt-item" style="--i:${i}"><span class="cmt-item__avatar"></span><div><p class="cmt-item__head">Player ${i + 1}<span>just now</span></p><p class="cmt-item__text">${t}</p></div></li>`).join('')}</ul></div></div></div>
    </div>
    <div class="anim-preview__btns"><button type="button" class="btn btn--ghost btn--sm" data-feed-play>${icon('refresh', 'i i--sm')}Replay feed entrance</button><button type="button" class="btn btn--ghost btn--sm" data-viewer-play>${icon('expand', 'i i--sm')}Preview viewer opening</button></div>
    <div class="anim-preview__feed" data-feed-demo>${'<i></i>'.repeat(6)}</div>
  </div>`;
}

const PT = {
  morph: [[{ opacity: 1 }, { opacity: 0, transform: 'translateY(-6px)' }], [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], 160, 420],
  fade: [[{ opacity: 1 }, { opacity: 0 }], [{ opacity: 0 }, { opacity: 1 }], 200, 320],
  slide: [[{ opacity: 1 }, { opacity: 0, transform: 'translateX(-120px)' }], [{ opacity: 0, transform: 'translateX(160px)' }, { opacity: 1, transform: 'none' }], 320, 420],
  zoom: [[{ opacity: 1 }, { opacity: 0, transform: 'scale(.9)' }], [{ opacity: 0, transform: 'scale(1.1)' }, { opacity: 1, transform: 'none' }], 260, 460],
  flip: [[{ opacity: 1 }, { opacity: 0, transform: 'perspective(900px) rotateY(-70deg)' }], [{ opacity: 0, transform: 'perspective(900px) rotateY(70deg)' }, { opacity: 1, transform: 'none' }], 300, 460],
  blur: [[{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(14px)' }], [{ opacity: 0, filter: 'blur(14px)' }, { opacity: 1, filter: 'blur(0)' }], 260, 420],
};
const motionFactor = () => +getComputedStyle(document.documentElement).getPropertyValue('--motion') || 0;
function playPageDemo(stage) {
  const style = document.documentElement.dataset.transition;
  const old = stage.firstElementChild;
  const next = document.createElement('div');
  const toB = old.classList.contains('pt-page--a');
  next.className = `pt-page ${toB ? 'pt-page--b' : 'pt-page--a'}`;
  next.innerHTML = `<b>${toB ? 'Game page' : 'Store'}</b><i></i><i></i><i></i>`;
  const spec = PT[style];
  const k = motionFactor();
  if (!spec || !k) { old.replaceWith(next); return; }
  stage.append(next);
  old.animate(spec[0], { duration: spec[2] * k, easing: 'ease-in', fill: 'forwards' }).finished.then(() => old.remove());
  next.animate(spec[1], { duration: spec[3] * k, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
}
function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
const fmt = (row, v) => (row.unit === '×' ? `${(+v).toFixed(2).replace(/0$/, '')}×` : `${v}${row.unit || ''}`);

function rowHTML(row, sectionLabel) {
  const block = ['themes', 'accent', 'preview', 'cpreview'].includes(row.type);
  return `<div class="set-row${block ? ' set-row--block' : ''}" data-row="${row.key}">
    <div>${sectionLabel ? `<p class="set-row__found">${esc(sectionLabel)}</p>` : ''}<p class="set-row__label">${esc(row.label)}</p>${row.desc ? `<p class="set-row__desc">${esc(row.desc)}</p>` : ''}</div>
    ${control(row)}
    ${row.demo ? '<div class="motion-demo" aria-hidden="true" style="grid-column:1/-1"><i></i></div>' : ''}
    ${row.test ? '<div style="grid-column:1/-1"><button type="button" class="btn btn--ghost btn--sm" data-test-toast>Show a test message</button></div>' : ''}
  </div>`;
}

/* --------------------------------------------------------- custom panes */

async function aiPane() {
  const s = await getSession(true);
  const c = s.config;
  if (c.publicSite) {
    return `<div class="set-group"><p class="set-note">${window.mobileApp ? 'In the Android app' : 'On the website'}, Ask AI uses the built-in offline smart search, so no account or key is needed. The desktop app can also use Claude with your own Anthropic API key, stored encrypted on your PC.</p>
      <div class="set-row"><div><p class="set-row__label">Get the desktop app</p><p class="set-row__desc">Free download for Windows 10 and 11.</p></div><a class="btn btn--primary btn--sm" href="#/download" data-close-settings>Download</a></div></div>`;
  }
  const status = c.aiConfigured
    ? `<span class="set-status set-status--ok">${icon('check', 'i i--sm')}Connected${c.aiKeySource === 'environment' ? ' (key from ANTHROPIC_API_KEY)' : ''}</span>`
    : '<span class="set-status set-status--warn">No API key yet. Offline smart search is used instead.</span>';
  return `<div class="set-group">
    <div class="set-row set-row--block"><div><p class="set-row__label">Status</p><p class="set-row__desc">AI search sends only the words you type to Anthropic's API to turn them into search filters. Results come from this store's catalog.</p></div>${status}</div>
    <div class="set-row"><div><p class="set-row__label">Use AI search</p><p class="set-row__desc">When off, the search bar's AI button uses the offline parser.</p></div>
      <button type="button" class="switch" role="switch" aria-checked="${c.aiEnabled}" data-server="aiEnabled" aria-label="Use AI search"></button></div>
    <div class="set-row"><div><p class="set-row__label">Model</p><p class="set-row__desc">Billed to your Anthropic account. A search uses about 5,000 input tokens (mostly cached) and a few hundred output tokens.</p></div>
      <select data-server="aiModel" aria-label="AI model">${c.aiModels.map((m) => `<option value="${m}"${m === c.aiModel ? ' selected' : ''}>${esc(MODEL_LABELS[m] || m)}</option>`).join('')}</select></div>
    ${c.aiKeySource === 'environment' ? '' : `<div class="set-row set-row--block"><div><p class="set-row__label">Anthropic API key</p><p class="set-row__desc">Stored on this computer${window.desktop ? ', encrypted with your Windows account' : ' in data/secrets.json'}, and never sent back to the page. Create one at console.anthropic.com.</p></div>
      <form class="set-input" data-key-form autocomplete="off">
        <label class="sr-only" for="ai-key">API key</label>
        <input id="ai-key" type="password" placeholder="${c.aiConfigured ? 'Saved. Paste a new key to replace it' : 'sk-ant-...'}" spellcheck="false" autocomplete="off">
        <button type="submit" class="btn btn--primary btn--sm">Save key</button>
        ${c.aiConfigured ? '<button type="button" class="btn btn--ghost btn--sm" data-key-remove>Remove key</button>' : ''}
      </form></div>`}
    <div class="set-row"><div><p class="set-row__label">Try it</p><p class="set-row__desc">Opens AI search with an example request.</p></div><a class="btn btn--ghost btn--sm" href="#/ai/${encodeURIComponent('cozy co-op games under $20')}" data-close-settings>Try an example</a></div>
  </div>`;
}

async function catalogPane() {
  const s = await getSession(true);
  const c = s.config;
  let status = {};
  try { status = await fetch('/api/status', { cache: 'no-store' }).then((r) => r.json()); } catch { /* offline */ }
  const removed = status.changes?.removed || [];
  if (c.publicSite) {
    return `<div class="set-group"><h4>Status</h4><div class="set-row"><div><p class="set-row__label">${(status.count || db.all.length).toLocaleString('en-US')} games tracked</p><p class="set-row__desc">${window.mobileApp ? 'The catalog' : "The website's catalog"} updates once a day${status.updated ? `, last ${ago(status.updated * 1000)}` : ''}. The desktop app updates every 6 hours and on demand.</p></div></div></div>` + deviceData();
  }
  return `<div class="set-group"><h4>Status</h4>
    <div class="set-row"><div><p class="set-row__label">${(status.count || db.all.length).toLocaleString('en-US')} games tracked</p>
      <p class="set-row__desc">${status.building ? `Updating now: ${esc(status.progress || 'working')}…` : `Updated ${status.updated ? ago(status.updated * 1000) : 'never'}. Next update ${status.nextRefresh ? `around ${new Date(status.nextRefresh).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'soon'}.`}</p></div>
      <button type="button" class="btn btn--ghost btn--sm" data-refresh${status.building ? ' disabled' : ''}>${icon('refresh', 'i i--sm')}Update now</button></div>
    ${removed.length ? `<div class="set-row set-row--block"><div><p class="set-row__label">Recently removed</p><p class="set-row__desc">${removed.slice(0, 12).map((r) => esc(r.n)).join(', ')}${removed.length > 12 ? ` and ${removed.length - 12} more` : ''}</p></div></div>` : ''}
  </div>
  <div class="set-group"><h4>What gets tracked</h4>
    <div class="set-row"><div><p class="set-row__label">Minimum players</p><p class="set-row__desc">A game is listed when its live player count reached this number at least once in the last 24 hours.</p></div>
      <div class="segmented" role="radiogroup" aria-label="Minimum players">${[25, 50, 100, 250, 500, 1000].map((n) => `<button type="button" role="radio" aria-checked="${c.minPlayers === n}" data-server="minPlayers" data-value="${n}">${n}+</button>`).join('')}</div></div>
    <div class="set-row"><div><p class="set-row__label">Maximum games</p><p class="set-row__desc">The catalog keeps the most played games up to this size.</p></div>
      <div class="segmented" role="radiogroup" aria-label="Maximum games">${[1000, 2500, 5000, 7500, 10000].map((n) => `<button type="button" role="radio" aria-checked="${c.catalogMax === n}" data-server="catalogMax" data-value="${n}">${n.toLocaleString('en-US')}</button>`).join('')}</div></div>
    <div class="set-row"><div><p class="set-row__label">Update every</p><p class="set-row__desc">Each update checks about ${Math.round(c.catalogMax * 1.3 / 1000)}K games' player counts.</p></div>
      <div class="segmented" role="radiogroup" aria-label="Update interval">${[3, 6, 12, 24].map((n) => `<button type="button" role="radio" aria-checked="${c.refreshHours === n}" data-server="refreshHours" data-value="${n}">${n} h</button>`).join('')}</div></div>
    <p class="set-note">Data comes from Steam's public store and community APIs: the same player counts and rankings SteamDB charts. Changing the minimum or maximum starts an update.</p>
  </div>
  ` + deviceData();
}

function deviceData() {
  return `<div class="set-group set-danger"><h4>Your data on this device</h4>
    <div class="set-row"><div><p class="set-row__label">Recently viewed</p><p class="set-row__desc">${state.viewed.length} games</p></div><button type="button" class="btn btn--ghost btn--sm" data-clear="viewed">Clear</button></div>
    <div class="set-row"><div><p class="set-row__label">Wishlist</p><p class="set-row__desc">${state.wish.size} games</p></div><button type="button" class="btn btn--ghost btn--sm" data-clear="wish">Clear</button></div>
    <div class="set-row"><div><p class="set-row__label">Cart</p><p class="set-row__desc">${state.cart.length} games</p></div><button type="button" class="btn btn--ghost btn--sm" data-clear="cart">Clear</button></div>
    <div class="set-row"><div><p class="set-row__label">Owned games</p><p class="set-row__desc">${state.owned.size} games marked "I own this"</p></div><button type="button" class="btn btn--ghost btn--sm" data-clear="owned">Clear</button></div>
    <div class="set-row"><div><p class="set-row__label">Recommendation feedback</p><p class="set-row__desc">${state.liked.size} "More like this", ${state.hiddenTags.size} hidden tags, ${Object.keys(state.targets).length} price alerts</p></div><button type="button" class="btn btn--ghost btn--sm" data-clear="liked">Clear likes</button><button type="button" class="btn btn--ghost btn--sm" data-clear="hiddenTags">Show hidden tags</button><button type="button" class="btn btn--ghost btn--sm" data-clear="targets">Remove alerts</button></div>
    <div class="set-row"><div><p class="set-row__label">"Not interested" games</p><p class="set-row__desc">${state.ignored.size} games hidden from your discovery queue</p></div><button type="button" class="btn btn--ghost btn--sm" data-clear="ignored">Clear</button></div>
  </div>`;
}

async function appPane() {
  const a = await window.desktop.getSettings();
  const row = (key, label, desc) => `<div class="set-row"><div><p class="set-row__label">${label}</p><p class="set-row__desc">${desc}</p></div><button type="button" class="switch" role="switch" aria-checked="${!!a[key]}" data-app="${key}" aria-label="${esc(label)}"></button></div>`;
  return `<div class="set-group">
    ${row('closeToTray', 'Close to the system tray', 'The close button hides the window and keeps the catalog updating. Quit from the tray icon.')}
    ${row('startWithWindows', 'Start with Windows', 'Open the app when you sign in.')}
    ${row('startMinimized', 'Start in the tray', 'When starting with Windows, stay in the tray until you open it.')}
    ${row('hardwareAcceleration', 'Hardware acceleration', 'Use the graphics card for smoother animation. Takes effect after a restart.')}
    ${row('autoUpdate', 'Update the catalog on start', 'Refresh games, prices and player counts every time the app opens.')}
  </div>
  <div class="set-group"><div class="set-row"><div><p class="set-row__label">Data folder</p><p class="set-row__desc">${esc(a.dataDir || '')}</p></div><button type="button" class="btn btn--ghost btn--sm" data-app-open="data">Open folder</button></div></div>`;
}

function aboutPane() {
  return `<div class="about-mark">${document.querySelector('.brand__mark')?.outerHTML || ''}<div><h4>Steam Redesigned</h4><p class="muted">Project Vanguard</p><p class="muted">Version ${esc(window.desktop?.version || window.mobileApp?.version || '3.0.0')}${window.desktop ? ' · Desktop app' : window.mobileApp ? ' · Android app' : ' · Browser'}</p></div></div>
  <p class="set-note">An unofficial concept. Game names, art, prices and community posts come from the public Steam store and Steam Community and belong to their owners. Catalog of ${db.all.length.toLocaleString('en-US')} games, updated ${ago(db.updated)}.</p>
  <div class="set-group"><h4>Keyboard shortcuts</h4><div class="kbd-list">
    <kbd>/</kbd><span>Search the store</span>
    <kbd>Ctrl + K</kbd><span>Search the store</span>
    <kbd>Ctrl + ,</kbd><span>Open settings</span>
    <kbd>Alt + ←</kbd><span>Back</span>
    <kbd>← →</kbd><span>Featured games, screenshots and discovery queue</span>
    <kbd>W</kbd><span>Wishlist the current game in the discovery queue</span>
    <kbd>Esc</kbd><span>Close menus, the cart and this window</span>
  </div></div>`;
}

/* --------------------------------------------------------------- render */

const visibleSections = () => SECTIONS.filter((s) => !s.appOnly || window.desktop);

function navHTML() {
  return visibleSections().map((s) => `<button type="button" class="settings__tab" role="tab" aria-selected="${s.id === current && !query}" data-section="${s.id}">${icon(s.icon)}${esc(s.label)}</button>`).join('');
}

async function bodyHTML() {
  if (query) {
    const q = query.toLowerCase();
    const hits = [];
    for (const s of visibleSections()) for (const r of s.rows || []) if (!r.type.includes('preview') && `${r.label} ${r.desc || ''} ${s.label}`.toLowerCase().includes(q)) hits.push(rowHTML(r, s.label));
    return hits.length ? `<div class="set-group">${hits.join('')}</div>` : `<p class="set-note">No settings match “${esc(query)}”.</p>`;
  }
  const s = SECTIONS.find((x) => x.id === current);
  if (s.custom === 'ai') return aiPane();
  if (s.custom === 'catalog') return catalogPane();
  if (s.custom === 'app') return appPane();
  if (s.custom === 'about') return aboutPane();
  return `<div class="set-group">${s.rows.map((r) => rowHTML(r)).join('')}</div>`;
}

async function render(animate = true) {
  const s = SECTIONS.find((x) => x.id === current);
  $('.settings__nav nav', dialog).innerHTML = navHTML();
  $('.settings__head h3', dialog).textContent = query ? 'Search results' : s.label;
  $('.settings__head p', dialog).textContent = query ? '' : s.desc;
  const body = $('.settings__body', dialog);
  body.innerHTML = await bodyHTML();
  if (animate) { body.classList.remove('is-swapping'); void body.offsetWidth; body.classList.add('is-swapping'); }
}

function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'settings';
  dialog.setAttribute('aria-labelledby', 'settings-title');
  dialog.innerHTML = `<div class="settings__shell">
    <aside class="settings__nav">
      <h2 id="settings-title">Settings</h2>
      <label class="settings__find">${icon('search', 'i i--sm')}<span class="sr-only">Find a setting</span><input type="search" placeholder="Find a setting" data-find></label>
      <nav role="tablist" aria-label="Settings sections"></nav>
      <div class="settings__navfoot">
        <button type="button" class="btn btn--ghost btn--sm" data-export>${icon('download', 'i i--sm')}Export settings</button>
        <button type="button" class="btn btn--ghost btn--sm" data-import>${icon('upload', 'i i--sm')}Import settings</button>
        <button type="button" class="btn btn--ghost btn--sm" data-reset>${icon('refresh', 'i i--sm')}Reset to defaults</button>
        <input type="file" accept="application/json,.json" hidden data-import-file>
      </div>
    </aside>
    <section class="settings__main">
      <header class="settings__head"><div><h3></h3><p></p></div><button type="button" class="iconbtn" data-close aria-label="Close settings">${icon('x')}</button></header>
      <div class="settings__body"></div>
    </section>
  </div>`;
  document.body.append(dialog);

  dialog.addEventListener('click', async (e) => {
    const t = e.target;
    if (t === dialog || t.closest('[data-close]')) return close();
    const tab = t.closest('[data-section]');
    if (tab) { current = tab.dataset.section; query = ''; $('[data-find]', dialog).value = ''; return render(); }
    const pref = t.closest('[data-kind="toggle"], [data-kind="seg"]');
    if (pref) return setPref(pref.dataset.key, pref.dataset.kind === 'toggle' ? pref.getAttribute('aria-checked') !== 'true' : pref.dataset.value);
    if (t.closest('[data-test-toast]')) return toast('This is how messages look');
    if (t.closest('[data-pt-play]')) return playPageDemo($('[data-pt-stage]', dialog));
    if (t.closest('[data-cascade-play]')) return replay($('[data-cascade]', dialog), 'is-playing');
    if (t.closest('[data-feed-play]')) return replay($('[data-feed-demo]', dialog), 'is-playing');
    if (t.closest('[data-viewer-play]')) { const d = $('[data-feed-demo]', dialog); replay(d, 'is-viewer'); return; }
    const demo = t.closest('[data-demo-comments]');
    if (demo) { const open = demo.getAttribute('aria-expanded') !== 'true'; demo.setAttribute('aria-expanded', String(open)); demo.nextElementSibling.classList.toggle('is-open', open); return; }
    if (t.closest('[data-close-settings]')) return close();
    const srv = t.closest('[data-server]');
    if (srv && srv.tagName === 'BUTTON') {
      const key = srv.dataset.server;
      const value = srv.getAttribute('role') === 'switch' ? srv.getAttribute('aria-checked') !== 'true' : +srv.dataset.value;
      try { await post('/api/config', { [key]: value }); toast(key === 'minPlayers' || key === 'catalogMax' ? 'Saved. The catalog is updating in the background' : 'Saved'); } catch (err) { toast(err.message); }
      return render(false);
    }
    if (t.closest('[data-key-remove]')) { try { await post('/api/ai-key', { key: null }); toast('API key removed'); } catch (err) { toast(err.message); } return render(false); }
    if (t.closest('[data-refresh]')) { try { await post('/api/refresh', {}); toast('Updating the catalog in the background'); } catch (err) { toast(err.message); } return render(false); }
    const clr = t.closest('[data-clear]');
    if (clr) {
      const kind = clr.dataset.clear;
      if (!confirm('Clear this list? This cannot be undone.')) return;
      if (kind === 'viewed') clearViewed(); else clearList(kind);
      applyContentFilter();
      toast('Cleared');
      return render(false);
    }
    const app = t.closest('[data-app]');
    if (app) { const on = app.getAttribute('aria-checked') !== 'true'; await window.desktop.setSetting(app.dataset.app, on); app.setAttribute('aria-checked', String(on)); return; }
    if (t.closest('[data-app-open]')) return window.desktop.openDataFolder();
    if (t.closest('[data-export]')) return exportPrefs();
    if (t.closest('[data-import]')) return $('[data-import-file]', dialog).click();
    if (t.closest('[data-reset]')) { if (confirm('Reset every appearance, animation and store setting?')) { P().reset(); afterPrefChange({}); render(false); toast('Settings reset'); } }
  });

  dialog.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-find]')) { query = t.value.trim(); render(false); return; }
    if (t.dataset.kind === 'range') { const row = SECTIONS.flatMap((s) => s.rows || []).find((r) => r.key === t.dataset.key); t.nextElementSibling.textContent = fmt(row, t.value); setPref(t.dataset.key, +t.value, false); }
    if (t.dataset.kind === 'color') setPref('accent', t.value, false);
  });
  dialog.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.dataset.kind === 'select') setPref(t.dataset.key, t.value);
    if (t.dataset.kind === 'color') render(false);
    if (t.matches('select[data-server]')) { try { await post('/api/config', { [t.dataset.server]: t.value }); toast('Saved'); } catch (err) { toast(err.message); } }
    if (t.matches('[data-import-file]') && t.files[0]) {
      try { const data = JSON.parse(await t.files[0].text()); P().replace(data.prefs || data); afterPrefChange({}); render(false); toast('Settings imported'); } catch { toast('That file is not a settings export'); }
      t.value = '';
    }
  });
  dialog.addEventListener('submit', async (e) => {
    if (!e.target.matches('[data-key-form]')) return;
    e.preventDefault();
    const input = $('#ai-key', dialog);
    const key = input.value.trim();
    if (!key) return;
    try { await post('/api/ai-key', { key }); input.value = ''; toast('API key saved'); } catch (err) { toast(err.message); }
    render(false);
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
}

function setPref(key, value, rerender = true) {
  P().set({ [key]: value });
  afterPrefChange({ [key]: value });
  if (key === 'motion') render(false);
  if (['speed', 'stagger', 'feedIn'].includes(key)) { const c = $('[data-cascade]', dialog) || $('[data-feed-demo]', dialog); if (c) replay(c, 'is-playing'); }
  if (rerender) {
    $$(`[data-key="${key}"]`, dialog).forEach((el) => {
      if (el.dataset.kind === 'toggle') el.setAttribute('aria-checked', String(!!value));
      if (el.dataset.kind === 'seg') el.setAttribute('aria-checked', String(el.dataset.value === String(value)));
    });
  }
}

let onContentChange = () => {};
function afterPrefChange(patch) {
  if (Object.keys(patch).length === 0) { applyContentFilter(); onContentChange(); }
}

function exportPrefs() {
  const blob = new Blob([JSON.stringify({ app: 'steam-redesign', version: 3, prefs: P().get() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'steam-redesigned-settings.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

let lastFocus = null;
export function openSettings(section) {
  if (!dialog) build();
  if (section && SECTIONS.some((s) => s.id === section)) current = section;
  query = '';
  $('[data-find]', dialog).value = '';
  lastFocus = document.activeElement;
  render(false);
  dialog.showModal();
  $$('[data-action="settings"]').forEach((b) => b.setAttribute('aria-expanded', 'true'));
}

function close() {
  if (!dialog?.open || dialog.classList.contains('is-closing')) return;
  const done = () => { dialog.classList.remove('is-closing'); dialog.close(); lastFocus?.focus?.({ preventScroll: true }); document.dispatchEvent(new Event('settings-closed')); };
  $$('[data-action="settings"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  if (P().motionLevel() === 'off') return done();
  dialog.classList.add('is-closing');
  dialog.addEventListener('animationend', done, { once: true });
  setTimeout(() => { if (dialog.open) done(); }, 400);
}

export function initSettings({ onContent }) { onContentChange = onContent; }
