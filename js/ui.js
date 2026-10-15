// Shared UI helpers and components.

import { gameTags } from './data.js';
import { state } from './state.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const motionLevel = () => window.STPrefs?.motionLevel() || 'full';
/** True when the viewer chose reduced or no motion (Settings > Animations, or the OS setting). */
export const reduceMotion = { get matches() { return motionLevel() !== 'full'; } };
export const prefs = () => window.STPrefs?.get() || {};
export const useVT = () => typeof document.startViewTransition === 'function' && motionLevel() !== 'off' && prefs().transition !== 'none' && document.visibilityState === 'visible';
export const icon = (id, cls = 'i') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
export const money = (c) => `$${(c / 100).toFixed(2)}`;
export const num = (n) => n.toLocaleString('en-US');
export const compactNum = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(n));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
export function ago(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return fmtDate(ms);
}
export function releaseText(g) {
  if (g.coming) return g.comingText || (g.release ? `Coming ${fmtDate(g.release)}` : 'Coming soon');
  return g.release ? fmtDate(g.release) : '';
}
export function timeLeft(ms) {
  let s = Math.max(0, Math.floor((ms - Date.now()) / 1000));
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60);
  const pad = (v) => String(v).padStart(2, '0');
  return d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

/* ---------------------------------------------------------------- pieces */

export function priceHTML(g, lg = false) {
  const cls = `price${lg ? ' price--lg' : ''}`;
  if (g.free) return `<span class="${cls} price--free"><span class="price__now">Free to play</span></span>`;
  if (g.price == null) return g.coming ? `<span class="${cls} price--soon"><span class="price__now">Coming soon</span></span>` : '';
  if (g.disc > 0) {
    return `<span class="${cls}"><span class="sr-only">${g.disc}% off, was ${money(g.orig)}, now ${money(g.price)}</span>`
      + `<span class="price__pct" aria-hidden="true">-${g.disc}%</span>`
      + `<span class="price__col" aria-hidden="true"><s>${money(g.orig)}</s><span class="price__now">${money(g.price)}</span></span></span>`;
  }
  return `<span class="${cls}"><span class="price__now">${g.price === 0 ? 'Free' : money(g.price)}</span></span>`;
}

export function revClass(g) {
  if (g.reviews < 10) return 'none';
  return g.score >= 7 ? 'pos' : g.score === 6 ? 'pos2' : g.score === 5 ? 'mixed' : 'neg';
}
export const revHTML = (g) => `<span class="rev rev--${revClass(g)}">${esc(g.label)}</span>`;

const OS = [[1, 'windows', 'Windows'], [2, 'apple', 'macOS'], [4, 'linux', 'SteamOS and Linux']];
/** Official platform logos (Windows, Apple, Linux, Steam Deck verified) for a game. */
export function platformsHTML(g, { deck = true } = {}) {
  const p = OS.filter(([bit]) => g.plat & bit).map(([, id, label]) => `<svg class="os os--${id}" role="img" aria-label="${label}"><title>${label}</title><use href="#i-${id}"/></svg>`);
  if (deck && g.deck === 3) p.push('<svg class="os os--deck" role="img" aria-label="Steam Deck verified"><title>Steam Deck verified</title><use href="#i-steamdeck"/></svg>');
  return p.length ? `<span class="platforms">${p.join('')}</span>` : '';
}
/** A game name with its platform logos right next to it. */
export const nameHTML = (g, tag = 'span', cls = '') => `<${tag} class="gname ${cls}"><span class="gname__text">${esc(g.name)}</span>${platformsHTML(g)}</${tag}>`;
export const deckHTML = (g) => (g.deck === 3 ? '<span class="deck deck--ok">Deck verified</span>' : g.deck === 2 ? '<span class="deck">Deck playable</span>' : '');

/** Buying happens on Steam: this opens the game's Steam store page (in the Steam app when it's installed). */
export const steamUrl = (id) => `https://store.steampowered.com/app/${id}/`;
export function steamBtn(g, cls = 'btn btn--primary') {
  if (g.price == null && !g.free) return `<button type="button" class="${cls.replace('btn--primary', 'btn--ghost')}" data-wish="${g.id}" data-wish-text aria-pressed="${state.wish.has(g.id)}">${icon('heart', 'i i--sm')}<span>${state.wish.has(g.id) ? 'On your wishlist' : 'Wishlist it'}</span></button>`;
  return `<a class="${cls} btn--steam" href="${steamUrl(g.id)}" target="_blank" rel="noopener" data-steam="${g.id}" aria-label="${g.free ? 'Play' : 'Buy'} ${esc(g.name)} on Steam">Open in Steam${icon('external', 'i i--sm')}</a>`;
}

export function wishBtn(g) {
  const on = state.wish.has(g.id);
  return `<button type="button" class="wish" data-wish="${g.id}" aria-pressed="${on}" aria-label="${on ? 'Remove from' : 'Add to'} wishlist: ${esc(g.name)}">${icon('heart')}</button>`;
}

export const playersHTML = (g, cls = '') => (prefs().players !== false && g.players ? `<span class="live ${cls}" title="Playing now">${compactNum(g.players)}<span class="sr-only"> playing now</span></span>` : '');

const imgAttrs = (g, src, w, h) => `src="${src}" data-fb="${g.header}" alt="" loading="lazy" decoding="async" width="${w}" height="${h}"`;

export function capHTML(g, { variant = 'capsule', sub, vt = false, badge = '', why = '' } = {}) {
  const src = variant === 'header' ? g.header : g.capsule;
  const style = vt ? ` style="view-transition-name:c-${g.id};view-transition-class:card"` : '';
  const subText = sub === false ? '' : sub ?? gameTags(g, 2).join(', ');
  return `<article class="cap${variant === 'header' ? ' cap--header' : ''}"${style}>
    <a class="cap__link" href="#/app/${g.id}">
      <div class="cap__media"><img ${imgAttrs(g, src, variant === 'header' ? 460 : 616, variant === 'header' ? 215 : 353)}>${badge}${playersHTML(g, 'cap__players')}${priceHTML(g)}</div>
      <div class="cap__info">${nameHTML(g, 'div', 'cap__name')}${subText ? `<div class="cap__sub">${esc(subText)}</div>` : ''}${why ? `<div class="cap__why">${esc(why)}</div>` : ''}</div>
    </a>
    ${wishBtn(g)}
  </article>`;
}

export function rowHTML(g, rank) {
  return `<a class="row" href="#/app/${g.id}" data-id="${g.id}">
    ${rank ? `<span class="row__rank" aria-label="Rank ${rank}">${rank}</span>` : ''}
    <img ${imgAttrs(g, g.header, 460, 215)}>
    <div class="row__body">${nameHTML(g, 'div', 'row__name')}<div class="row__tags">${esc(gameTags(g, 4).join(', '))}</div>
    <div class="row__meta">${playersHTML(g, 'row__players')}<span>${esc(releaseText(g))}</span></div></div>
    ${priceHTML(g)}
  </a>`;
}

export function sectionHead(id, title, sub = '', tools = '') {
  return `<div class="section-head"><div><h2 id="h-${id}">${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><div class="section-head__tools">${tools}</div></div>`;
}
export const scrollBtns = (label) => `<button class="scroller__btn" type="button" data-scroll="-1" aria-label="Scroll ${label} back">${icon('left')}</button><button class="scroller__btn" type="button" data-scroll="1" aria-label="Scroll ${label} forward">${icon('right')}</button>`;

/** A titled horizontal scroller of capsules. */
export function shelf(id, title, games, { sub = '', more = '', variant, cls = 'caps', tools = '' } = {}) {
  if (!games?.length) return '';
  return `<section class="section wrap ${cls}" aria-labelledby="h-${id}" data-scroller>
    ${sectionHead(id, title, sub, `${tools}${more ? `<a class="link-more" href="${more}">See all</a>` : ''}${scrollBtns(title.replace(/<[^>]+>/g, ''))}`)}
    <div class="scroller"><div class="scroller__track">${games.map((g) => capHTML(g, { variant })).join('')}</div><div class="dots" aria-hidden="true"></div></div>
  </section>`;
}

export function mountScrollers(root, cleanups) {
  $$('[data-scroller]', root).forEach((sec) => {
    const track = $('.scroller__track', sec);
    const dots = $('.dots', sec);
    const [prev, next] = $$('[data-scroll]', sec);
    if (!track || !prev) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (!track.clientWidth) return;
      const pages = Math.max(1, Math.min(12, Math.ceil((track.scrollWidth - 4) / track.clientWidth)));
      const at = Math.min(pages - 1, Math.round(track.scrollLeft / track.clientWidth));
      prev.disabled = track.scrollLeft < 4;
      next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      if (dots) {
        if (dots.childElementCount !== pages) dots.innerHTML = pages > 1 ? '<span></span>'.repeat(pages) : '';
        [...dots.children].forEach((d, k) => d.classList.toggle('is-on', k === at));
      }
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(update); };
    track.addEventListener('scroll', queue, { passive: true });
    [prev, next].forEach((b) => b.addEventListener('click', () => track.scrollBy({ left: +b.dataset.scroll * track.clientWidth, behavior: reduceMotion.matches ? 'auto' : 'smooth' })));
    const ro = new ResizeObserver(queue);
    ro.observe(track);
    cleanups.push(() => ro.disconnect());
    sec._updateScroller = update;
    update();
  });
}

/* -------------------------------------------------------------- skeletons */

export const skel = {
  caps: (n = 5) => `<div class="skel-row">${'<div class="skel skel--cap"></div>'.repeat(n)}</div>`,
  grid: (n = 12) => Array.from({ length: n }, () => '<div class="skel skel--cap"></div>').join(''),
  feed: (n = 9) => Array.from({ length: n }, (_, i) => `<div class="skel skel--feed" style="height:${[220, 300, 180, 260, 340, 200][i % 6]}px"></div>`).join(''),
  lines: (n = 4) => Array.from({ length: n }, (_, i) => `<div class="skel skel--line" style="width:${[96, 88, 92, 60][i % 4]}%"></div>`).join(''),
};

/** Show a skeleton only if loading takes longer than 120 ms. */
export function withSkeleton(el, html, promise) {
  const t = setTimeout(() => { el.innerHTML = html; el.setAttribute('aria-busy', 'true'); }, 120);
  return promise.finally(() => { clearTimeout(t); el.removeAttribute('aria-busy'); });
}

/* ------------------------------------------------------------------ toast */

export function toast(msg, action) {
  const host = $('.toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${icon('check')}<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  let gone = false;
  const dismiss = () => { if (gone) return; gone = true; el.classList.add('is-leaving'); el.addEventListener('animationend', () => el.remove(), { once: true }); };
  if (action) $('button', el).addEventListener('click', () => { action.fn(); dismiss(); });
  host.append(el);
  while (host.children.length > 3) host.firstElementChild.remove();
  setTimeout(dismiss, Math.max(2, Math.min(10, +prefs().toastSec || 4)) * 1000);
}

/* ---------------------------------------------------------------- ambient */

const ambLayers = $$('.ambient__layer');
let ambIdx = 0;
let ambSrc = '';
export function setAmbient(src) {
  if (!src || src === ambSrc) return;
  ambSrc = src;
  const pre = new Image();
  pre.onload = () => {
    if (ambSrc !== src) return;
    const next = ambLayers[ambIdx ^ 1];
    next.style.backgroundImage = `url("${src}")`;
    next.classList.add('is-on');
    ambLayers[ambIdx].classList.remove('is-on');
    ambIdx ^= 1;
  };
  pre.src = src;
}
