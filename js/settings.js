// Settings window (gear button, top right). Viewer preferences live in localStorage via
// window.STPrefs (js/boot.js); catalog and AI settings live on the local server.

import { db, getSession, post, applyContentFilter } from './data.js';
import { state, clearViewed, clearList } from './state.js';
import { $, $$, esc, icon, toast, ago, capHTML } from './ui.js';
import { deviceAI, aiWhere } from './ai.js';
import { PROVIDERS, cleanConfig, listModels } from './llm.js';
import { musicPaneHTML } from './music.js';

const P = () => window.STPrefs;
const ACCENTS = [
  ['#1a9fff', 'Steam blue'], ['#22d3ee', 'Cyan'], ['#8b5cf6', 'Violet'], ['#10b981', 'Emerald'],
  ['#f59e0b', 'Amber'], ['#f43f5e', 'Rose'], ['#84cc16', 'Lime'], ['#e5e7eb', 'Silver'],
];

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: 'palette', desc: 'Colours, shapes and text size', rows: [
    { key: 'theme', type: 'themes', label: 'Theme', desc: 'The base colours for every surface.' },
    { key: 'accent', type: 'accent', label: 'Accent colour', desc: 'Buttons, highlights, progress bars and glows.' },
    { key: 'sale', type: 'seg', label: 'Discount colour', options: [['lime', 'Steam lime'], ['green', 'Green'], ['gold', 'Gold'], ['pink', 'Pink'], ['cyan', 'Cyan']] },
    { key: 'radius', type: 'seg', label: 'Corners', options: [['sharp', 'Sharp'], ['default', 'Rounded'], ['round', 'Extra round']] },
    { key: 'density', type: 'seg', label: 'Spacing', desc: 'Compact fits more on screen.', options: [['comfortable', 'Comfortable'], ['compact', 'Compact']] },
    { key: 'font', type: 'seg', label: 'Typeface', options: [['default', 'Chakra Petch and Instrument Sans'], ['system', 'System (Segoe UI)']] },
    { key: 'scale', type: 'range', label: 'Interface size', min: 80, max: 130, step: 5, unit: '%' },
    { key: 'mascot', type: 'toggle', label: 'Vanguard, the AI helper', desc: 'The little cloud robot in the corner. Click it to ask about games; it answers in AI chat with the free AI you connect in Settings > AI.' },
  ] },
  { id: 'background', label: 'Background', icon: 'image', desc: 'The living backdrop behind every page', rows: [
    { key: 'bgSource', type: 'seg', label: 'Backdrop', desc: 'Game art blurs the art of the game in focus and fades between games. Photo shows a picture you choose.', options: [['game', 'Game art'], ['photo', 'Photo'], ['plain', 'Plain']] },
    { key: 'bgPhoto', type: 'bgphoto', label: 'Background photo', desc: 'A picture from this device, or any game\'s art: open a game and choose "Set as background". It stays on this device.' },
    { key: 'bgBlur', type: 'range', label: 'Photo blur', min: 0, max: 30, step: 2, unit: ' px' },
    { key: 'bgDim', type: 'range', label: 'Photo dimming', desc: 'Darkens the photo so text stays easy to read.', min: 0, max: 85, step: 5, unit: '%' },
    { key: 'bgDrift', type: 'toggle', label: 'Slow drift', desc: 'The photo moves very slowly, like a living wallpaper. Off when motion is reduced.' },
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
    { key: 'startPage', type: 'select', label: 'Start page', desc: 'What opens when the app starts.', options: [['home', 'Home'], ['specials', 'Specials'], ['mostplayed', 'Most played'], ['foryou', 'Recommended for you'], ['wishlist', 'Your wishlist'], ['indie', 'Popular indie games'], ['community', 'Community']] },
    { key: 'cards', type: 'seg', label: 'Card size', desc: 'How big game cards are in the rows that scroll sideways.', options: [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']] },
    { key: 'homeHide', type: 'homesections', label: 'Home page sections', desc: 'Untick a section to hide it from the home page.' },
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
  { id: 'ai', label: 'AI', icon: 'sparkles', desc: 'AI search and price advice, with a free AI key', custom: 'ai' },
  { id: 'catalog', label: 'Catalog & data', icon: 'database', desc: 'Which games the store tracks', custom: 'catalog' },
  { id: 'music', label: 'Music', icon: 'play', desc: 'Game soundtracks while you browse', custom: 'music' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', desc: 'Pop-up messages', rows: [
    { key: 'toastPos', type: 'seg', label: 'Position', options: [['bottom-center', 'Bottom'], ['bottom-right', 'Bottom right'], ['top-right', 'Top right'], ['top-center', 'Top']] },
    { key: 'toastSec', type: 'range', label: 'Show for', min: 2, max: 10, step: 1, unit: ' s', test: true },
    { key: 'notifyFree', type: 'toggle', label: 'New free games', desc: 'A notification when a game becomes free to keep. The Android app checks about every hour, even when closed; the desktop app while it runs; the website while it is open.' },
    { key: 'notifyDeals', type: 'toggle', label: 'Big deals', desc: 'A notification when a popular game, or one on your wishlist, drops 50% or more.' },
    { key: 'freeTest', type: 'freetest', label: 'Free game notification test', desc: "Sends a notification the way a free game alert arrives, and checks every setting that could stop one, so you don't miss a free game." },
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
    case 'bgphoto': {
      let src = null;
      try { src = localStorage.getItem('st-bg-photo'); } catch { /* storage off */ }
      return `<div class="bgpick">${src ? `<span class="bgpick__thumb" style="background-image:url('${esc(src)}')"></span>` : '<span class="bgpick__thumb bgpick__thumb--empty">No photo</span>'}
        <label class="btn btn--ghost btn--sm">${icon('upload', 'i i--sm')}Choose a photo<input type="file" accept="image/*" data-bg-file hidden></label>
        ${src ? '<button type="button" class="btn btn--ghost btn--sm" data-bg-clear>Remove</button>' : ''}</div>`;
    }
    case 'homesections': {
      const hidden = new Set(Array.isArray(v) ? v : []);
      return `<div class="chipset" role="group" aria-label="Home page sections">${[['spot', 'Featured'], ['deals', 'Deals & events'], ['demos', 'Popular demos'], ['disc', 'Big discounts'], ['indie', 'Indie games'], ['cats', 'Categories'], ['mp', 'Most played'], ['panels', 'Hidden gems'], ['queue', 'Discovery queue'], ['budget', 'On a budget'], ['tabs', 'Store lists']].map(([k, l]) => `<button type="button" class="chipset__chip" aria-pressed="${!hidden.has(k)}" data-home-sec="${k}">${icon('check', 'i i--sm')}${esc(l)}</button>`).join('')}</div>`;
    }
    case 'freetest': return `<button type="button" class="btn btn--primary btn--sm" data-free-test>${icon('bell', 'i i--sm')}Send a test</button>`;
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
  const block = ['themes', 'accent', 'preview', 'cpreview', 'homesections'].includes(row.type);
  return `<div class="set-row${block ? ' set-row--block' : ''}" data-row="${row.key}">
    <div>${sectionLabel ? `<p class="set-row__found">${esc(sectionLabel)}</p>` : ''}<p class="set-row__label">${esc(row.label)}</p>${row.desc ? `<p class="set-row__desc">${esc(row.desc)}</p>` : ''}</div>
    ${control(row)}
    ${row.demo ? '<div class="motion-demo" aria-hidden="true" style="grid-column:1/-1"><i></i></div>' : ''}
    ${row.test ? '<div style="grid-column:1/-1"><button type="button" class="btn btn--ghost btn--sm" data-test-toast>Show a test message</button></div>' : ''}
    ${row.type === 'freetest' ? '<ul class="free-test" data-free-result hidden></ul>' : ''}
  </div>`;
}

/* --------------------------------------------------------- custom panes */

let aiDraft = null; // provider picked in the form before it's saved
async function aiPane() {
  const where = await aiWhere();
  const sess = await getSession(true);
  const dev = deviceAI.get();
  const saved = where === 'server' ? sess.config.ai : dev && { provider: dev.provider, model: dev.model, base: dev.base };
  const provider = aiDraft || saved?.provider || 'gemini';
  const p = PROVIDERS[provider];
  const name = (id) => PROVIDERS[id].label.replace(/ \(.*\)$/, '');
  const same = saved?.provider === provider;
  const status = saved
    ? `<span class="set-status set-status--ok">${icon('check', 'i i--sm')}Connected: ${esc(name(saved.provider))} · ${esc(saved.model)}${saved.source === 'environment' ? ' (key from ANTHROPIC_API_KEY)' : ''}</span>`
    : '<span class="set-status set-status--warn">Not connected. AI search uses the offline smart search, and price advice is off.</span>';
  const options = Object.entries(PROVIDERS).filter(([id, x]) => (where === 'server' || !x.desktopOnly) && (!x.paid || id === saved?.provider))
    .map(([id, x]) => `<option value="${id}"${id === provider ? ' selected' : ''}>${esc(x.label)}${x.note ? ` (${esc(x.note)})` : ''}</option>`).join('');
  return `<div class="set-group">
    <div class="set-row set-row--block"><div><p class="set-row__label">Status</p><p class="set-row__desc">AI search and price advice send only your request and public game facts (name and prices) to the AI you connect. Only free AI is offered: a free key from Google Gemini, Groq or OpenRouter, or your own AI server in the desktop app.</p></div>${status}</div>
    ${where === 'server' ? `<div class="set-row"><div><p class="set-row__label">Use AI</p><p class="set-row__desc">When off, AI search uses the offline parser and price advice is hidden.</p></div>
      <button type="button" class="switch" role="switch" aria-checked="${sess.config.aiEnabled}" data-server="aiEnabled" aria-label="Use AI"></button></div>` : ''}
  </div>
  <div class="set-group"><h4>Connect an AI</h4>
    <form class="ai-setup" data-ai-setup autocomplete="off">
      <label class="set-field"><span>Provider</span><select data-ai-provider>${options}</select></label>
      ${p.keys ? `<p class="set-row__desc ai-setup__hint">Don't have a key? <a href="${p.keys}" target="_blank" rel="noopener">Get a ${esc(name(provider))} API key</a>${p.note ? `. ${esc(p.note)}.` : '.'}</p>` : `<p class="set-row__desc ai-setup__hint">${esc(p.note || '')}. Point it at the server's OpenAI-style address.</p>`}
      ${provider === 'custom' ? `<label class="set-field"><span>Server address</span><input data-ai-base value="${esc((same && saved.base) || '')}" placeholder="http://localhost:11434/v1" spellcheck="false"></label>` : ''}
      <label class="set-field"><span>API key</span><input type="password" data-ai-key placeholder="${same ? 'Saved. Paste a new key to replace it' : esc(p.hint || 'Paste your key')}" spellcheck="false" autocomplete="off"></label>
      <label class="set-field"><span>Model</span><input data-ai-model list="ai-models" value="${esc(same ? saved.model : p.models[0] || '')}" spellcheck="false" placeholder="Model name"><datalist id="ai-models">${p.models.map((m) => `<option value="${esc(m)}">`).join('')}</datalist></label>
      <div class="ai-setup__btns"><button type="button" class="btn btn--ghost btn--sm" data-ai-load>${icon('refresh', 'i i--sm')}Load my models</button><button type="submit" class="btn btn--primary btn--sm">Save and test</button>${saved ? '<button type="button" class="btn btn--ghost btn--sm" data-ai-remove>Disconnect</button>' : ''}</div>
      <p class="set-note">${where === 'server' ? 'The key is stored on this computer, encrypted with your Windows account, and never sent back to the page.' : `The key is stored only ${window.mobileApp ? 'in this app on this phone' : 'in this browser'} and goes straight to ${esc(name(provider))}, never to Project Vanguard's servers.`}</p>
    </form>
  </div>
  <div class="set-group"><div class="set-row"><div><p class="set-row__label">Try it</p><p class="set-row__desc">Opens AI search with an example request. Price advice is on every game page, under "Prices at other stores".</p></div><a class="btn btn--ghost btn--sm" href="#/ai/${encodeURIComponent('cozy co-op games under $20')}" data-close-settings>Try an example</a></div></div>`;
}

/**
 * A chosen photo, shrunk to at most 2560 px wide and stored as a JPEG (it has to fit in local storage).
 * The file is decoded directly (createImageBitmap) or read as a data: address: the app's security
 * policy doesn't let images load from blob: addresses.
 */
async function shrinkPhoto(file) {
  if (file.size > 40 * 1048576) throw new Error('That photo is over 40 MB. Pick a smaller one.');
  let src;
  try { src = await createImageBitmap(file); } catch {
    src = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("That file couldn't be read."));
      reader.onload = () => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("That file isn't a picture this app can read. Try a JPEG, PNG or WebP photo.")); img.src = reader.result; };
      reader.readAsDataURL(file);
    });
  }
  const w = src.width || src.naturalWidth;
  const h = src.height || src.naturalHeight;
  if (!w || !h) throw new Error("That file isn't a picture this app can read. Try a JPEG, PNG or WebP photo.");
  const scale = Math.min(1, 2560 / w, 1600 / h);
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  src.close?.();
  let q = 0.86;
  let out = c.toDataURL('image/jpeg', q);
  while (out.length > 2.6e6 && q > 0.45) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
  return out;
}

/** Use a photo (data URL or the address of a game's art) as the backdrop. */
export function setBackgroundPhoto(src) {
  try { localStorage.setItem('st-bg-photo', src); } catch { throw new Error('There is no room to store that photo on this device.'); }
  P().set({ bgSource: 'photo' });
}

/** The form's provider setup. */
function aiForm() {
  const v = (sel) => $(sel, dialog)?.value.trim() || '';
  return { provider: v('[data-ai-provider]'), key: v('[data-ai-key]'), model: v('[data-ai-model]'), base: v('[data-ai-base]') };
}
/** The models this key can use (checks the key too). */
async function aiModels(form) {
  if (await aiWhere() === 'server') return (await post('/api/ai-models', form)).models;
  const saved = deviceAI.get();
  const key = form.key || (saved?.provider === form.provider ? saved.key : '');
  return listModels(cleanConfig({ ...form, key, model: form.model || 'any' }));
}

/** Android app: a PC running ProjectServer on the same Wi-Fi serves data, photos and deal notifications. */
function homeServerBlock() {
  const a = window.mobileApp;
  if (!a) return '';
  const status = a.usingHome ? `<span class="set-status set-status--ok">${icon('check', 'i i--sm')}Connected to ${esc(a.homeServer)}</span>`
    : a.homeServer ? `<span class="set-status set-status--warn">Not in use: ${esc(a.homeError || 'it could not be reached')}. The online service is used meanwhile, and the app keeps checking.</span>` : '';
  return `<div class="set-group"><h4>Home server</h4>
    <div class="set-row set-row--block"><div><p class="set-row__label">Home server address</p><p class="set-row__desc">A PC on your Wi-Fi running the Project Vanguard home server keeps games, details and photos ready for this phone, refreshes them every hour and sends free game and deal notifications. Enter the address its window shows. Away from home, the app uses the online service.</p></div>${status}
      <form class="set-input" data-home-form autocomplete="off">
        <label class="sr-only" for="home-url">Home server address</label>
        <input id="home-url" type="text" inputmode="url" placeholder="http://192.168.1.50:8787" value="${esc(a.homeServer || '')}" spellcheck="false" autocapitalize="off">
        <button type="submit" class="btn btn--primary btn--sm">Connect</button>
        ${a.homeServer ? '<button type="button" class="btn btn--ghost btn--sm" data-home-clear>Use online service</button>' : ''}
      </form></div></div>`;
}

async function catalogPane() {
  const s = await getSession(true);
  const c = s.config;
  let status = {};
  try { status = await fetch('/api/status', { cache: 'no-store' }).then((r) => r.json()); } catch { /* offline */ }
  const removed = status.changes?.removed || [];
  if (c.publicSite) {
    return `<div class="set-group"><h4>Status</h4><div class="set-row"><div><p class="set-row__label">${(status.count || db.all.length).toLocaleString('en-US')} games tracked</p><p class="set-row__desc">${c.homeServer ? `The catalog comes from your home server, which updates it every ${c.refreshHours === 1 ? 'hour' : `${c.refreshHours} hours`}` : `${window.mobileApp ? 'The catalog' : "The website's catalog"} updates once a day`}${status.updated ? `, last ${ago(status.updated * 1000)}` : ''}.${c.homeServer ? '' : ' The desktop app updates every 6 hours and on demand.'}</p></div></div></div>` + homeServerBlock() + deviceData();
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
  <div class="set-group"><h4>Updates</h4>
    <div class="set-row set-row--block"><div><p class="set-row__label">Get the newest version</p><p class="set-row__desc" data-latest>Checking for a newer version…</p></div>
      <div class="ai-setup__btns"><a class="btn btn--primary btn--sm" href="${PAGES_URL}" target="_blank" rel="noopener">${icon('download', 'i i--sm')}Open the download page</a><a class="btn btn--ghost btn--sm" href="${RELEASES_URL}" target="_blank" rel="noopener">${icon('external', 'i i--sm')}What's new (GitHub)</a></div></div>
    <p class="set-note">Downloads for Windows and Android are on the project's GitHub page: ${PAGES_URL.replace('https://', '')}. Install the new version over this one; your settings, wishlist and alerts stay.</p>
  </div>
  <div class="set-group"><h4>Keyboard shortcuts</h4><div class="kbd-list">
    <kbd>/</kbd><span>Search the store</span>
    <kbd>Ctrl + K</kbd><span>Search the store</span>
    <kbd>Ctrl + ,</kbd><span>Open settings</span>
    <kbd>Alt + ←</kbd><span>Back</span>
    <kbd>← →</kbd><span>Featured games, screenshots and discovery queue</span>
    <kbd>W</kbd><span>Wishlist the current game in the discovery queue</span>
    <kbd>Esc</kbd><span>Close menus and this window</span>
  </div></div>`;
}

const PAGES_URL = 'https://projection-of-vanguard.github.io';
const RELEASES_URL = 'https://github.com/Projection-Of-Vanguard/project-vanguard/releases/latest';
const appVersion = () => window.desktop?.version || window.mobileApp?.version || null;
/** "3.10.0" > "3.9.2" */
const newer = (a, b) => { const x = String(a).split('.').map(Number); const y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
/** About: fill in whether a newer version is out. */
async function checkLatest() {
  const out = $('[data-latest]', dialog);
  if (!out) return;
  try {
    const latest = await fetch('/api/latest', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null));
    const mine = appVersion();
    if (!latest?.version) throw new Error('no version');
    out.innerHTML = !mine ? `The website is always up to date. The newest apps are version ${esc(latest.version)}.`
      : newer(latest.version, mine) ? `<strong class="update-note">Version ${esc(latest.version)} is out.</strong> You have ${esc(mine)}. Download it from the GitHub page.`
      : `You have the newest version (${esc(mine)}).`;
  } catch { out.textContent = "Couldn't check for a newer version right now. The GitHub page always has the newest one."; }
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
  if (s.custom === 'music') return musicPaneHTML();
  return `<div class="set-group">${s.rows.map((r) => rowHTML(r)).join('')}</div>`;
}

async function render(animate = true) {
  const s = SECTIONS.find((x) => x.id === current);
  $('.settings__nav nav', dialog).innerHTML = navHTML();
  $('.settings__head h3', dialog).textContent = query ? 'Search results' : s.label;
  $('.settings__head p', dialog).textContent = query ? '' : s.desc;
  const body = $('.settings__body', dialog);
  body.innerHTML = await bodyHTML();
  if (current === 'about' && !query) checkLatest();
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
    if (t.closest('[data-home-clear]')) {
      try { localStorage.removeItem('st-home-server'); } catch { /* storage off */ }
      toast('Using the online service. Restarting the app');
      setTimeout(() => location.reload(), 900);
      return;
    }
    const sec = t.closest('[data-home-sec]');
    if (sec) {
      const hidden = new Set(P().get().homeHide || []);
      const k = sec.dataset.homeSec;
      if (hidden.has(k)) hidden.delete(k); else hidden.add(k);
      setPref('homeHide', [...hidden], false);
      sec.setAttribute('aria-pressed', String(!hidden.has(k)));
      return;
    }
    const ost = t.closest('[data-ost]');
    if (ost) {
      if (!ost.dataset.ost) { P().set({ music: '' }); return render(false); }
      // Close Settings so the player in the corner can be reached, and point at its play button
      close();
      P().set({ music: ost.dataset.ost });
      window.dispatchEvent(new CustomEvent('music-picked'));
      return;
    }
    if (t.closest('[data-bg-clear]')) {
      try { localStorage.removeItem('st-bg-photo'); } catch { /* storage off */ }
      document.documentElement.style.removeProperty('--bg-photo');
      setPref('bgSource', 'game');
      toast('Background photo removed');
      return render(false);
    }
    if (t.closest('[data-free-test]')) {
      const btn = t.closest('[data-free-test]');
      const out = $('[data-free-result]', dialog);
      btn.disabled = true;
      try {
        const { testFreeGame } = await import('./alerts.js');
        const report = await testFreeGame();
        out.innerHTML = report.map((r) => `<li class="${r.ok ? 'is-ok' : 'is-warn'}">${icon(r.ok ? 'check' : 'info', 'i i--sm')}<span>${esc(r.text)}</span></li>`).join('');
        out.hidden = false;
      } catch (err) { toast(err.message || 'The test could not run'); }
      btn.disabled = false;
      return;
    }
    if (t.closest('[data-ai-remove]')) {
      try { if (await aiWhere() === 'server') await post('/api/ai-key', { provider: null }); else deviceAI.clear(); aiDraft = null; toast('AI disconnected'); } catch (err) { toast(err.message); }
      return render(false);
    }
    if (t.closest('[data-ai-load]')) {
      const btn = t.closest('[data-ai-load]');
      btn.disabled = true;
      try {
        const models = await aiModels(aiForm());
        $('#ai-models', dialog).innerHTML = models.map((m) => `<option value="${esc(m)}">`).join('');
        const input = $('[data-ai-model]', dialog);
        if (!models.includes(input.value) && models[0]) input.value = models[0];
        toast(models.length ? `Found ${models.length} models for this key. Pick one in the Model box` : 'The key works, but the provider listed no chat models');
      } catch (err) { toast(err.message); }
      btn.disabled = false;
      return;
    }
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
    if (t.dataset.kind === 'range') {
      const row = SECTIONS.flatMap((s) => s.rows || []).find((r) => r.key === t.dataset.key);
      t.nextElementSibling.textContent = fmt(row, t.value);
      // Resizing the page under the finger moves the slider while it's dragged, so interface size applies on release
      if (t.dataset.key !== 'scale') setPref(t.dataset.key, +t.value, false);
    }
    if (t.dataset.kind === 'color') setPref('accent', t.value, false);
  });
  dialog.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.dataset.kind === 'select') setPref(t.dataset.key, t.value);
    if (t.dataset.kind === 'range' && t.dataset.key === 'scale') setPref('scale', +t.value, false);
    if (t.dataset.kind === 'color') render(false);
    if (t.matches('[data-ai-provider]')) { aiDraft = t.value; render(false); return; }
    if (t.matches('[data-bg-file]')) {
      const file = t.files?.[0];
      if (!file) return;
      try { await setBackgroundPhoto(await shrinkPhoto(file)); toast('Background photo set'); } catch (err) { toast(err.message); }
      return render(false);
    }
    if (t.matches('select[data-server]')) { try { await post('/api/config', { [t.dataset.server]: t.value }); toast('Saved'); } catch (err) { toast(err.message); } }
    if (t.matches('[data-import-file]') && t.files[0]) {
      try { const data = JSON.parse(await t.files[0].text()); P().replace(data.prefs || data); afterPrefChange({}); render(false); toast('Settings imported'); } catch { toast('That file is not a settings export'); }
      t.value = '';
    }
  });
  dialog.addEventListener('submit', async (e) => {
    if (e.target.matches('[data-home-form]')) {
      e.preventDefault();
      const input = $('#home-url', dialog);
      let url = input.value.trim().replace(/\/+$/, '');
      if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
      if (!/^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(url)) { toast('Enter the address the server shows, like http://192.168.1.50:8787'); return; }
      const btn = $('button[type="submit"]', e.target);
      btn.disabled = true; btn.textContent = 'Checking…';
      try {
        const st = await fetch(`${window.mobileApp.homePath(url)}/api/session`,{ cache: 'no-store', signal: AbortSignal.timeout(5000) }).then((r) => r.json());
        if (!st?.config?.homeServer) throw new Error('not a home server');
        try { localStorage.setItem('st-home-server', url); } catch { /* storage off */ }
        toast('Connected. Restarting the app to use your home server');
        setTimeout(() => location.reload(), 900);
      } catch {
        btn.disabled = false; btn.textContent = 'Connect';
        toast("Couldn't reach a home server at that address. Check the phone is on the same Wi-Fi and the server window is open.");
      }
      return;
    }
    if (!e.target.matches('[data-ai-setup]')) return;
    e.preventDefault();
    const form = aiForm();
    const btn = $('button[type="submit"]', e.target);
    btn.disabled = true; btn.textContent = 'Testing…';
    try {
      const models = await aiModels(form); // fails when the provider rejects the key
      if (form.model && models.length && !models.includes(form.model) && form.provider !== 'openrouter') throw new Error(`This key can't use "${form.model}". Pick a model from "Load my models".`);
      if (await aiWhere() === 'server') await post('/api/ai-key', form);
      else {
        const saved = deviceAI.get();
        deviceAI.set(cleanConfig({ ...form, key: form.key || (saved?.provider === form.provider ? saved.key : '') }));
      }
      aiDraft = null;
      toast('AI connected. AI search and price advice are ready');
      render(false);
    } catch (err) { toast(err.message); btn.disabled = false; btn.textContent = 'Save and test'; }
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
