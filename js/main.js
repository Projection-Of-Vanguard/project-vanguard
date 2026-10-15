import { db, loadCatalog, searchGames, searchTags, pick, norm, post, applyContentFilter } from './data.js';
import { state, onChange, prune, toggleWish } from './state.js';
import { $, $$, esc, icon, priceHTML, toast, useVT, ago, skel, nameHTML } from './ui.js';
import { vt, clearNames, markSource } from './transition.js';
import { initPriceAlerts, checkPriceAlerts } from './alerts.js';
import { initMusic } from './music.js';
import { initMascot } from './mascot.js';
import { viewChat, mountChat } from './views/chat.js';
import { viewHome, mountHome } from './views/home.js';
import { viewDetail, mountDetail } from './views/detail.js';
import { viewBrowse, mountBrowse, browseTitle } from './views/browse.js';
import { viewCommunity, mountCommunity, viewHub, mountHub } from './views/community.js';
import { viewQueue, mountQueue } from './views/queue.js';
import { viewAI, mountAI } from './views/ai.js';
import { openSettings, initSettings } from './settings.js';
import { viewRecs, mountRecs } from './views/recs.js';
import { viewCompare, mountCompare, initCompareTray } from './views/compare.js';
import { viewCalendar, mountCalendar } from './views/calendar.js';
import { initComments } from './comments.js';
import { downloadBandHTML, mountDownloadBand, viewDownload, mountDownload } from './views/download.js';
import { getSession } from './data.js';

const view = $('#view');
let cleanups = [];
let firstRender = true;

/* ------------------------------------------------------------------ router */

function parse() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const [a, b, c, d] = parts;
  if (a === 'app' && db.byId.has(+b)) return { name: 'app', id: +b };
  if (a === 'browse') return { name: 'browse', slug: b || 'all' };
  if (a === 'tag' && +b) return { name: 'tag', id: +b };
  if (a === 'search') return { name: 'search', q: b || '' };
  if (a === 'queue') return { name: 'queue' };
  if (a === 'ai') return { name: 'ai', q: b || '' };
  if (a === 'chat') return { name: 'chat' };
  if (a === 'recommendations') return { name: 'recs' };
  if (a === 'compare') return { name: 'compare' };
  if (a === 'calendar') return { name: 'calendar' };
  if (a === 'download') return { name: 'download' };
  if (a === 'community') {
    if (b === 'app' && db.byId.has(+c)) return { name: 'hub', id: +c, section: d || 'all' };
    return { name: 'community', section: b || 'all' };
  }
  return { name: 'home' };
}

function render() {
  cleanups.forEach((f) => f());
  cleanups = [];
  closeMenus(); closeSearch(); closeSheet();
  const r = parse();
  let title = '';
  if (r.name === 'app') {
    const g = db.byId.get(r.id);
    view.innerHTML = viewDetail(g); mountDetail(view, g, cleanups);
    title = g.name;
  } else if (r.name === 'browse' || r.name === 'tag' || r.name === 'search') {
    view.innerHTML = viewBrowse(r); mountBrowse(view, r, cleanups);
    title = browseTitle(r);
  } else if (r.name === 'recs') {
    view.innerHTML = viewRecs(); mountRecs(view, cleanups);
    title = 'Your recommendations';
  } else if (r.name === 'compare') {
    view.innerHTML = viewCompare(); mountCompare(view, cleanups, () => render());
    title = 'Compare games';
  } else if (r.name === 'download') {
    view.innerHTML = viewDownload(); mountDownload(view);
    title = 'Download';
  } else if (r.name === 'calendar') {
    view.innerHTML = viewCalendar(); mountCalendar(view);
    title = 'Release calendar';
  } else if (r.name === 'chat') {
    view.innerHTML = viewChat(); mountChat(view, cleanups);
    title = 'AI chat with Vanguard';
  } else if (r.name === 'ai') {
    view.innerHTML = viewAI(r); mountAI(view, r, cleanups);
    title = r.q ? `${r.q} · AI search` : 'AI search';
  } else if (r.name === 'queue') {
    view.innerHTML = viewQueue(); mountQueue(view, cleanups);
    title = 'Discovery queue';
  } else if (r.name === 'community') {
    view.innerHTML = viewCommunity(r); mountCommunity(view, r, cleanups);
    title = 'Community';
  } else if (r.name === 'hub') {
    const g = db.byId.get(r.id);
    view.innerHTML = viewHub(r, g); mountHub(view, r, g, cleanups);
    title = `${g.name} community hub`;
  } else {
    view.innerHTML = downloadBandHTML() + viewHome(); mountHome(view, cleanups); mountDownloadBand(view);
  }
  document.title = title ? `${title} · Steam Redesigned` : 'Steam Redesigned — Project Vanguard';
  const area = r.name === 'community' || r.name === 'hub' ? 'community' : r.name === 'queue' || r.name === 'recs' ? 'queue' : r.name === 'download' ? 'download' : 'store';
  $$('[data-area]').forEach((a) => (a.dataset.area === area ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  // Keep scroll when only switching community tabs; otherwise start at the top
  if (!(r.name === 'hub' || r.name === 'community') || !sameArea(r)) window.scrollTo(0, 0);
  lastRoute = r;
  if (!firstRender) view.focus({ preventScroll: true });
  firstRender = false;
}

let lastRoute = null;
const sameArea = (r) => lastRoute && lastRoute.name === r.name && lastRoute.id === r.id;

function navigate() {
  if (location.hash && !location.hash.startsWith('#/')) return; // in-page anchors such as the skip link
  if (useVT()) {
    // The browser only starts the transition on its next painted frame; a window that isn't
    // painting (throttled, covered) would leave the old page up, so render anyway after a moment
    let done = false;
    const run = () => { if (!done) { done = true; render(); } };
    const t = document.startViewTransition(run);
    const late = setTimeout(() => { if (!done) { t.skipTransition(); run(); } }, 800);
    t.ready.catch(() => {}); // a skipped transition rejects these; the page is already rendered
    t.updateCallbackDone.catch(() => {});
    t.finished.catch(() => {}).finally(() => { clearTimeout(late); clearNames(); vt.pending = false; });
  } else { render(); clearNames(); vt.pending = false; }
}
window.addEventListener('hashchange', navigate);
// Phone app: the home server answered after a slow start; new pages now load from it
window.addEventListener('homeserver', () => toast('Connected to your home server. Pages now load from it'));

/* ---------------------------------------------------- wishlist and Steam */

function updateCounts(bump) {
  [['wish', state.wish.size, 'Wishlist']].forEach(([k, n, label]) => {
    $$(`[data-count="${k}"]`).forEach((c) => {
      c.textContent = n; c.classList.toggle('is-on', n > 0);
      c.closest('button, a')?.setAttribute('aria-label', `${label}, ${n} ${n === 1 ? 'item' : 'items'}`);
      if (bump === k) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
    });
  });
}

onChange((what, id) => {
  if (what === 'wish') {
    const on = state.wish.has(id);
    const g = db.byId.get(id);
    $$(`[data-wish="${id}"]`).forEach((b) => {
      b.setAttribute('aria-pressed', String(on));
      if (b.hasAttribute('data-wish-text')) $('span', b).textContent = on ? 'On your wishlist' : (g?.coming ? 'Wishlist it' : 'Add to wishlist');
      else b.setAttribute('aria-label', `${on ? 'Remove from' : 'Add to'} wishlist: ${g?.name || ''}`);
    });
    updateCounts(on ? 'wish' : null);
  }
});

document.addEventListener('click', (e) => {
  const t = e.target;
  // Open in Steam: the desktop app opens the Steam app itself (or the store website without it);
  // the website and the phone app follow the link to the Steam store page
  const st = t.closest('[data-steam]');
  if (st) {
    if (window.desktop?.openSteam) { e.preventDefault(); window.desktop.openSteam(+st.dataset.steam); }
    toast(`Opening ${db.byId.get(+st.dataset.steam)?.name || 'the game'} on Steam`);
    return;
  }
  const w = t.closest('[data-wish]');
  if (w) {
    e.preventDefault();
    const id = +w.dataset.wish;
    const on = toggleWish(id);
    const g = db.byId.get(id);
    toast(on ? `Added ${g.name} to your wishlist` : `Removed ${g.name} from your wishlist`, on ? { label: 'View wishlist', fn: () => { location.hash = '#/browse/wishlist'; } } : null);
    return;
  }
  const act = t.closest('[data-action]');
  if (act) {
    const a = act.dataset.action;
    if (a === 'wishlist') location.hash = '#/browse/wishlist';
    if (a === 'menu') openSheet();
    if (a === 'close-sheet') closeSheet();
    if (a === 'settings') { closeSheet(); openSettings(); }
    if (a === 'update') { closeSheet(); updateNow(); }
  }
});

/* ------------------------------------------------------------------- menus */

const menus = $$('.menu');
function closeMenus(except) {
  menus.forEach((m) => {
    if (m === except) return;
    $('.menu__btn', m).setAttribute('aria-expanded', 'false');
    $('.menu__panel', m).classList.remove('is-open');
  });
}
const hoverable = matchMedia('(hover: hover)').matches;
menus.forEach((m) => {
  const btn = $('.menu__btn', m);
  const panel = $('.menu__panel', m);
  const set = (on) => { closeMenus(m); btn.setAttribute('aria-expanded', String(on)); panel.classList.toggle('is-open', on); };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  if (hoverable) {
    let tm;
    m.addEventListener('pointerenter', () => { clearTimeout(tm); tm = setTimeout(() => set(true), 90); });
    m.addEventListener('pointerleave', () => { clearTimeout(tm); tm = setTimeout(() => set(false), 180); });
  }
  m.addEventListener('keydown', (e) => {
    const links = $$('a', panel);
    const k = links.indexOf(document.activeElement);
    if (e.key === 'Escape') { set(false); btn.focus(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (btn.getAttribute('aria-expanded') !== 'true') set(true); links[Math.min(k + 1, links.length - 1)]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (k > 0 ? links[k - 1] : btn).focus(); }
  });
  m.addEventListener('focusout', (e) => { if (!m.contains(e.relatedTarget)) set(false); });
});
document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) closeMenus(); });

/* Mobile navigation sheet */
const sheet = $('#sheet');
function openSheet() { sheet.classList.add('is-open'); sheet.inert = false; sheet.setAttribute('aria-hidden', 'false'); $('[data-action="close-sheet"]', sheet).focus({ preventScroll: true }); }
function closeSheet() { if (!sheet.classList.contains('is-open')) return; sheet.classList.remove('is-open'); sheet.inert = true; sheet.setAttribute('aria-hidden', 'true'); }
sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

/* ------------------------------------------------------------------ search */

const sForm = $('.search');
const sInput = $('#q');
const sList = $('#search-results');
let sItems = [];
let sSel = -1;

function closeSearch() { sList.hidden = true; sInput.setAttribute('aria-expanded', 'false'); sInput.removeAttribute('aria-activedescendant'); sSel = -1; }
function runSearch() {
  const raw = sInput.value.trim();
  if (!raw) { closeSearch(); return; }
  const games = searchGames(raw, 6);
  const tags = searchTags(raw, 2);
  const words = raw.split(/\s+/).length;
  // Offer AI search first for descriptive requests, last for plain names
  const aiItem = { href: `#/ai/${encodeURIComponent(raw)}`, ai: true };
  const list = [...games.map((g) => ({ href: `#/app/${g.id}`, g })), ...tags.map(([id, n]) => ({ href: `#/tag/${id}`, tag: n, count: db.tagCount.get(id) }))];
  const strong = games[0] && games[0].s_c.includes(norm(raw).replace(/ /g, ''));
  sItems = (words >= 3 && !strong) || !games.length ? [aiItem, ...list] : [...list, aiItem];
  sSel = -1;
  sList.innerHTML = sItems.map((it, k) => {
    if (it.ai) return `<div class="sr-item sr-item--tag sr-item--ai" role="option" id="sr-${k}" aria-selected="false" data-k="${k}"><span class="sr-item__icon">${icon('sparkles')}</span><div><div class="sr-item__name">Ask AI: “${esc(raw)}”</div><div class="sr-item__meta">Describe it in your own words and get matching games</div></div></div>`;
    if (it.g) return `<div class="sr-item" role="option" id="sr-${k}" aria-selected="false" data-k="${k}"><img src="${it.g.header}" alt="" width="96" height="45"><div>${nameHTML(it.g, 'div', 'sr-item__name')}<div class="sr-item__meta">${esc(it.g.coming ? 'Coming soon' : it.g.label)}</div></div>${priceHTML(it.g)}</div>`;
    return `<div class="sr-item sr-item--tag" role="option" id="sr-${k}" aria-selected="false" data-k="${k}"><span class="sr-item__icon">${icon('tag')}</span><div><div class="sr-item__name">${esc(it.tag)} games</div><div class="sr-item__meta">Browse ${it.count} games with this tag</div></div></div>`;
  }).join('')
    + (games.length ? `<a class="sr-all" href="#/search/${encodeURIComponent(raw)}">See all results for “${esc(raw)}”</a>` : `<p class="sr-hint">No game names match “${esc(raw)}”. Ask AI to search by description instead.</p>`);
  sList.hidden = false;
  sInput.setAttribute('aria-expanded', 'true');
}
function mark(k) {
  sSel = k;
  $$('.sr-item', sList).forEach((el, n) => el.setAttribute('aria-selected', String(n === k)));
  if (k >= 0) { sInput.setAttribute('aria-activedescendant', `sr-${k}`); $(`#sr-${k}`)?.scrollIntoView({ block: 'nearest' }); } else sInput.removeAttribute('aria-activedescendant');
}
function go(k) {
  const it = sItems[k];
  if (!it) return;
  if (it.g) markSource($(`#sr-${k}`));
  location.hash = it.href;
  sInput.blur(); closeSearch();
}
let st = 0;
sInput.addEventListener('input', () => { clearTimeout(st); st = setTimeout(runSearch, 60); });
sInput.addEventListener('focus', () => { if (sInput.value.trim()) runSearch(); });
sInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' && sItems.length) { e.preventDefault(); mark((sSel + 1) % sItems.length); }
  else if (e.key === 'ArrowUp' && sItems.length) { e.preventDefault(); mark(sSel <= 0 ? sItems.length - 1 : sSel - 1); }
  else if (e.key === 'Escape') { closeSearch(); }
});
sForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = sInput.value.trim();
  if (sSel >= 0) go(sSel);
  else if (q) { location.hash = searchGames(q, 1).length ? `#/search/${encodeURIComponent(q)}` : `#/ai/${encodeURIComponent(q)}`; sInput.blur(); closeSearch(); }
});
$('[data-ai-search]').addEventListener('click', () => {
  const q = sInput.value.trim();
  location.hash = q ? `#/ai/${encodeURIComponent(q)}` : '#/ai';
  sInput.blur(); closeSearch();
});
sList.addEventListener('pointerdown', (e) => {
  const it = e.target.closest('[data-k]');
  if (it) { e.preventDefault(); go(+it.dataset.k); }
});
sForm.addEventListener('focusout', (e) => { if (!sForm.contains(e.relatedTarget)) setTimeout(closeSearch, 100); });

/* ------------------------------------------------------------- shortcuts */

document.addEventListener('keydown', (e) => {
  const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
  const k = e.key.toLowerCase();
  if ((e.key === '/' && !typing) || (k === 'k' && (e.ctrlKey || e.metaKey))) {
    e.preventDefault();
    sInput.focus({ preventScroll: true });
    sInput.select();
  }
  if (e.key === ',' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openSettings(); }
  if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); history.back(); }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); history.forward(); }
});

/* ------------------------------------------------------------------ global */

// Swap to a fallback when a CDN image is missing
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t.tagName !== 'IMG') return;
  if (t.hasAttribute('data-logo-hide')) { t.remove(); return; }
  if (t.dataset.logo) { const h = document.createElement('h3'); h.className = 'slide__title'; h.textContent = t.dataset.logo; t.replaceWith(h); return; }
  if (t.dataset.fb && t.src !== t.dataset.fb) { t.src = t.dataset.fb; t.removeAttribute('data-fb'); return; }
  t.classList.add('is-broken');
}, true);
document.addEventListener('load', (e) => {
  if (e.target.classList?.contains('dhero__logo')) e.target.parentElement.classList.add('has-logo');
}, true);

const topbar = $('.topbar');
const onScroll = () => { topbar.dataset.scrolled = String(window.scrollY > 8); };
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// 3D tilt hover (Settings > Animations > Card hover, Settings > Community > Card hover)
const TILT_STORE = '.cap__media, .catcard, .event, .rail-item, .comm-strip__item';
function tiltTarget(t) {
  const root = document.documentElement.dataset;
  if (root.hover === 'tilt') { const el = t.closest?.(TILT_STORE); if (el) return el; }
  if (root.chover === 'tilt') { const el = t.closest?.('.ugc'); if (el) return el; }
  return null;
}
document.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  const el = tiltTarget(e.target);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  const k = el.classList.contains('ugc') ? 0.5 : 1;
  el.style.transform = `perspective(800px) rotateX(${(0.5 - y) * 9 * k}deg) rotateY(${(x - 0.5) * 11 * k}deg) scale(1.02)`;
  el.style.setProperty('--gx', `${x * 100}%`);
  el.style.setProperty('--gy', `${y * 100}%`);
}, { passive: true });
document.addEventListener('pointerout', (e) => {
  const el = e.target.closest?.(`${TILT_STORE}, .ugc`);
  if (el && !el.contains(e.relatedTarget) && el.style.transform) el.style.transform = '';
}, { passive: true });

// Settings changes that affect page content re-render the current page
const RERENDER = new Set(['players', 'textPosts', 'personalize', 'defaultSort', 'autoplay', 'autoplaySec', 'parallax', 'hideOwned', 'hideIgnored', 'hideAdult']);
window.addEventListener('prefs', (e) => {
  const keys = Object.keys(e.detail || {});
  if (!db.all.length) return;
  if (keys.some((k) => k.startsWith('hide'))) applyContentFilter();
  if (keys.some((k) => RERENDER.has(k)) && !document.querySelector('.settings[open]')) render();
  else if (keys.some((k) => RERENDER.has(k))) needsRender = true;
});
// Content changes made while Settings is open apply when it closes, so the page doesn't jump behind the dialog
let needsRender = false;
document.addEventListener('settings-closed', () => { if (needsRender) { needsRender = false; render(); } });
initSettings({ onContent: () => { if (db.all.length) render(); } });

/* ------------------------------------------------------------ desktop app */

if (window.desktop) {
  document.documentElement.classList.add('is-app');
  const bar = $('.appbar');
  bar.hidden = false;
  const back = $('[data-nav="back"]', bar);
  const fwd = $('[data-nav="forward"]', bar);
  back.addEventListener('click', () => history.back());
  fwd.addEventListener('click', () => history.forward());
  // Match the native caption buttons to the chosen theme
  const syncTitleBar = () => {
    const rgb = getComputedStyle(document.documentElement).getPropertyValue('--ink0-rgb').split(',').map((n) => Math.max(0, Math.min(255, +n || 0)));
    window.desktop.setTitleBar?.('#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join(''), '#a7bbd0');
  };
  syncTitleBar();
  window.addEventListener('prefs', syncTitleBar);
  window.desktop.onCommand?.((cmd) => {
    if (cmd === 'settings') openSettings();
    else if (cmd === 'update') updateNow();
    else if (cmd.startsWith('#/')) location.hash = cmd;
  });
}

/* ------------------------------------------------------------ Android app */

if (window.mobileApp) {
  // Pages on other sites (Steam, YouTube, news) open in the phone's browser; leaving the
  // app's own origin hands the address to Android, which opens the default browser
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || a.hasAttribute('download') && a.origin === location.origin) return;
    if (!/^https?:$/.test(a.protocol) || a.origin === location.origin) return;
    e.preventDefault();
    location.href = a.href;
  });

  // Android's Back button closes whatever is open first (dialogs, menu, search),
  // then goes back through the app's pages, and only leaves the app from the first page
  const closeTopOverlay = () => {
    const dialog = [...document.querySelectorAll('dialog[open]')].pop();
    if (dialog) { if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close(); return true; }
    if (sheet.classList.contains('is-open')) { closeSheet(); return true; }
    if (!sList.hidden) { closeSearch(); sInput.blur(); return true; }
    if ($('.menu__panel.is-open')) { closeMenus(); return true; }
    return false;
  };
  window.Capacitor?.Plugins?.App?.addListener('backButton', ({ canGoBack }) => {
    if (closeTopOverlay()) return;
    if (canGoBack) history.back();
    else window.Capacitor.Plugins.App.exitApp();
  });
}

/* ------------------------------------------------------- wishlist alerts */

function saleAlerts() {
  if (window.STPrefs?.get().saleAlerts === false) return;
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem('st-sale-seen') || '{}'); } catch { /* ignore */ }
  const onSale = [...state.wish].map((id) => db.byId.get(id)).filter((g) => g && g.disc > 0 && seen[g.id] !== `${g.disc}-${g.discEnd}`);
  if (!onSale.length) return;
  onSale.forEach((g) => { seen[g.id] = `${g.disc}-${g.discEnd}`; });
  try { localStorage.setItem('st-sale-seen', JSON.stringify(seen)); } catch { /* ignore */ }
  const g = onSale[0];
  setTimeout(() => toast(onSale.length === 1 ? `${g.name} from your wishlist is ${g.disc}% off` : `${onSale.length} games on your wishlist are on sale`, { label: 'View', fn: () => { location.hash = onSale.length === 1 ? `#/app/${g.id}` : '#/browse/wishlist'; } }), 1500);
}

/* ------------------------------------------------------------ update now */

function updateFooter() {
  const upd = $('[data-updated]');
  if (upd) upd.textContent = `Steam Redesigned (Project Vanguard). Catalog of ${db.all.length.toLocaleString('en-US')} games with ${db.minPlayers}+ players, refreshed ${ago(db.updated)}.`;
}

let updating = false;
function setUpdating(on, pct = 0, text = '') {
  $$('[data-action="update"]').forEach((b) => {
    b.classList.toggle('is-updating', on);
    b.style.setProperty('--pct', `${Math.max(4, pct)}%`);
    b.title = on ? `Updating: ${text || 'working'} (${pct}%)` : 'Update now: refresh games, prices and player counts';
    b.setAttribute('aria-busy', String(on));
  });
}
async function waitForBuild(beforeIds) {
  const s = await fetch('/api/status', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
  if (s?.building) { setUpdating(true, s.pct || 0, s.progress); setTimeout(() => waitForBuild(beforeIds), 1500); return; }
  try { await loadCatalog(); } catch { /* keep the current catalog */ }
  prune((id) => db.byId.has(id));
  const added = db.all.filter((g) => !beforeIds.has(g.id)).length;
  const removed = [...beforeIds].filter((id) => !db.byId.has(id)).length;
  setUpdating(false);
  updating = false;
  updateFooter();
  render();
  if (s?.error) toast(`The update could not finish: ${s.error}`);
  else toast(`Catalog updated: ${db.all.length.toLocaleString('en-US')} games${added || removed ? ` (${added} new, ${removed} removed)` : ''}`);
  checkPriceAlerts();
}
async function updateNow() {
  if (updating) return;
  updating = true;
  setUpdating(true, 0, 'Starting');
  try { await post('/api/refresh', {}); } catch (e) { if (e.status !== 429) { toast(e.message); setUpdating(false); updating = false; return; } }
  toast('Updating games, prices and player counts. You can keep browsing');
  const before = new Set(db.all.map((g) => g.id));
  setTimeout(() => waitForBuild(before), 1200);
}

/* Wishlist price alerts live in alerts.js (system notifications on every platform) */

/* ------------------------------------------------------------------- boot */

async function boot() {
  let progress = '';
  const skeleton = () => `<div class="wrap boot">${progress ? `<p class="boot__progress" role="status">${esc(progress)}… The first start builds a catalog of every game with 100+ players, which takes about two minutes.</p>` : ''}${skel.caps(1).replace('skel--cap', 'skel--hero')}${skel.caps(5)}${skel.caps(5)}</div>`;
  const slow = setTimeout(() => { view.innerHTML = skeleton(); }, 120);
  try {
    await loadCatalog((p) => { progress = p; view.innerHTML = skeleton(); });
  } catch {
    clearTimeout(slow);
    view.innerHTML = `<div class="wrap"><div class="empty boot-error"><h2>The store could not load</h2><p>Start the data server with <code>node server.mjs</code> in the project folder, or open the desktop app, then reload.</p><button type="button" class="btn btn--primary" data-reload>Reload</button></div></div>`;
    $('[data-reload]', view).addEventListener('click', () => location.reload());
    return;
  }
  clearTimeout(slow);
  prune((id) => db.byId.has(id));
  $('[data-slot="cat-menu"]').innerHTML = ['Action', 'Adventure', 'RPG', 'Strategy', 'Simulation', 'Casual', 'Sports', 'Racing', 'Horror', 'Roguelike', 'Open World', 'Survival', 'FPS', 'Puzzle']
    .map((n) => [...db.tags].find(([, t]) => t === n)).filter(Boolean)
    .map(([id, n], i) => `<a href="#/tag/${id}"><span class="swatch" style="--h:${(i * 47) % 360}"></span>${esc(n)}</a>`).join('');
  updateFooter();
  updateCounts();
  sheet.inert = true;
  // Website vs desktop app: show only the controls that work here
  if (window.desktop || window.mobileApp) $$('[data-web-only]').forEach((el) => el.remove());
  getSession().then((sess) => {
    if (!sess?.config?.publicSite) return;
    document.documentElement.dataset.site = 'public';
    $$('[data-action="update"]').forEach((el) => el.remove());
  }).catch(() => {});
  // Settings > Store > Start page (only when the app opens on the home page)
  const start = { specials: '#/browse/specials', mostplayed: '#/browse/mostplayed', foryou: '#/browse/foryou', wishlist: '#/browse/wishlist', indie: '#/browse/indie', community: '#/community' }[window.STPrefs?.get().startPage];
  if (start && (!location.hash || location.hash === '#/')) history.replaceState(null, '', start);
  render();
  saleAlerts();
  initPriceAlerts();
  initMusic();
  initMascot();
  initComments();
  initCompareTray();
  fetch('/api/status', { cache: 'no-store' }).then((r) => r.json()).then((st) => { if (st.building && !updating) { updating = true; waitForBuild(new Set(db.all.map((g) => g.id))); } }).catch(() => {});
}
boot();
