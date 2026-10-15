import { db, api, gameTags, tagName } from '../data.js';
import { similar } from '../recs.js';
import { state, markViewed, toggleFollow } from '../state.js';
import {
  $, $$, esc, icon, money, priceHTML, revHTML, revClass, steamBtn, wishBtn, capHTML, platformsHTML, deckHTML,
  setAmbient, reduceMotion, releaseText, compactNum, num, skel, toast, ago,
} from '../ui.js';
import { vt } from '../transition.js';
import { commentsHTML } from '../comments.js';
import { mountPriceScan } from './prices.js';
import { mountReqs } from './reqs.js';
import { toggleOwned, toggleCompare, setTarget } from '../state.js';

const FEATURE_ICONS = [
  [/Single-player/, 'user'], [/Co-op|Multi-player|PvP|Shared|Split|MMO/, 'users'], [/Cross-Platform/, 'globe'],
  [/Achievements/, 'award'], [/Controller/, 'pad'], [/Cloud/, 'cloud'], [/Family Sharing/, 'users'],
  [/Trading Cards/, 'tag'], [/In-App Purchases/, 'cart'], [/Workshop|Level Editor/, 'sliders'], [/Remote Play/, 'monitor'], [/VR/, 'monitor'],
];
const featIcon = (c) => (FEATURE_ICONS.find(([re]) => re.test(c)) || [0, 'check'])[1];

export function viewDetail(g) {
  const genre = g.tags[0];
  const name = esc(g.name);
  const morph = vt.pending ? ' style="view-transition-name:game-hero" data-vt' : '';
  return `
  <section class="dhero" aria-labelledby="game-title">
    <div class="wrap">
      <div class="dhero__frame">
        <img class="dhero__art" src="${g.hero || g.capsule}" data-fb="${g.capsule}" alt=""${morph} width="1920" height="620">
        <div class="dhero__shade"></div>
        <div class="dhero__body">
          <nav class="crumbs" aria-label="Breadcrumb">
            <a href="#/browse/all">All games</a><span aria-hidden="true">/</span>
            ${genre ? `<a href="#/tag/${genre}">${esc(tagName(genre))}</a><span aria-hidden="true">/</span>` : ''}
            <span aria-current="page">${name}</span>
          </nav>
          <div class="dhero__titlerow"><h1 id="game-title" class="dhero__title">${name}</h1>${platformsHTML(g)}</div>
          <div class="dhero__meta">${revHTML(g)}${g.reviews >= 10 ? `<span>${compactNum(g.reviews)} reviews</span>` : ''}<span>${esc(releaseText(g))}</span>${g.players != null && window.STPrefs?.get().players !== false ? `<span class="live" data-live>${num(g.players)} playing now</span>${g.peak ? `<span>24h peak ${num(g.peak)}</span>` : ''}` : ''}${g.mp ? `<span class="badge-live">#${g.mp} most played</span>` : ''}</div>
        </div>
        <div class="dhero__buy">${priceHTML(g, true)}${steamBtn(g)}${wishBtn(g)}</div>
      </div>
    </div>
  </section>

  <div class="wrap detail">
    <div class="detail__grid reveal" style="--i:0">
      <div class="media" data-media>
        <div class="media__main"><div class="skel skel--fill"></div></div>
        <div class="media__strip" role="tablist" aria-label="Screenshots"></div>
      </div>
      <aside class="side">
        <img class="side__cap" src="${g.header}" alt="" width="460" height="215">
        <p class="side__desc">${esc(g.short)}</p>
        <dl class="facts">
          <dt>All reviews</dt>
          <dd>${revHTML(g)}${g.reviews >= 10 ? ` <span class="muted">(${num(g.reviews)})</span><div class="meter" role="img" aria-label="${g.pct}% of reviews are positive"><i style="width:${g.pct}%"></i></div>` : ''}</dd>
          <dt>Release date</dt><dd>${esc(releaseText(g) || 'To be announced')}</dd>
          <dt>Developer</dt><dd>${g.dev.map((d) => `<a href="#/search/${encodeURIComponent(d)}">${esc(d)}</a>`).join(', ') || '—'}</dd>
          <dt>Publisher</dt><dd>${g.pub.map((d) => `<a href="#/search/${encodeURIComponent(d)}">${esc(d)}</a>`).join(', ') || '—'}</dd>
        </dl>
        <div class="chips">${g.tags.slice(0, 10).map((t) => tagName(t) && `<a class="chip" href="#/tag/${t}">${esc(tagName(t))}</a>`).join('')}</div>
      </aside>
    </div>

    <div class="detail__actions reveal" style="--i:1">
      <p>Save it for later, follow it for news, or see what players are sharing.</p>
      <button type="button" class="btn btn--ghost btn--sm" data-wish="${g.id}" data-wish-text aria-pressed="${state.wish.has(g.id)}">${icon('heart', 'i i--sm')}<span>${state.wish.has(g.id) ? 'On your wishlist' : 'Add to wishlist'}</span></button>
      <button type="button" class="btn btn--ghost btn--sm" data-follow aria-pressed="${state.follow.has(g.id)}">${icon('bell', 'i i--sm')}<span>${state.follow.has(g.id) ? 'Following' : 'Follow'}</span></button>
      <a class="btn btn--ghost btn--sm" href="#/community/app/${g.id}">${icon('chat', 'i i--sm')}Community hub</a>
      <button type="button" class="btn btn--ghost btn--sm" data-share>${icon('share', 'i i--sm')}Share</button>
      <button type="button" class="btn btn--ghost btn--sm" data-set-bg title="Use this game's art as the backdrop on every page">${icon('image', 'i i--sm')}Set as background</button>
      <button type="button" class="btn btn--ghost btn--sm" data-compare aria-pressed="${state.compare.includes(g.id)}">${icon('scale', 'i i--sm')}<span>${state.compare.includes(g.id) ? 'In comparison' : 'Compare'}</span></button>
      <button type="button" class="btn btn--ghost btn--sm" data-owned aria-pressed="${state.owned.has(g.id)}" title="Owned games are hidden from store lists and recommendations">${icon('package', 'i i--sm')}<span>${state.owned.has(g.id) ? 'You own this' : 'I own this'}</span></button>
    </div>

    <div class="detail__cols reveal" style="--i:2">
      <div>
        <section class="buybox" aria-labelledby="h-buy">
          <h2 id="h-buy">${g.free ? 'Play' : g.coming ? 'Wishlist' : 'Buy'} ${name}</h2>
          ${g.disc ? `<p class="buybox__note">Special promotion: you save ${money(g.orig - g.price)}${g.discEnd ? `. Offer ends ${new Date(g.discEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}` : ''}.</p>` : g.free ? '<p class="buybox__note">Free to play. Optional purchases are available in game.</p>' : g.coming ? `<p class="buybox__note">${esc(releaseText(g))}. Wishlist it to hear when it launches.</p>` : ''}
          <div class="buybox__row">${platformsHTML(g)}${deckHTML(g)}${priceHTML(g, true)}${steamBtn(g)}</div>
        </section>
        <section class="history" data-history aria-labelledby="h-history"></section>
        <section class="pricescan" data-pricescan aria-labelledby="h-prices"></section>
        <div class="prose" data-about><h2>About this game</h2>${skel.lines(5)}</div>
        <section class="reqs" data-reqs aria-labelledby="h-reqs"></section>
        <section data-comm-preview></section>
        <section data-reviews></section>
        <section data-news></section>
      </div>
      <aside class="detail__aside" data-aside>${skel.lines(6)}</aside>
    </div>

    <section class="reveal" style="--i:3" data-similar></section>
  </div>`;
}

export function mountDetail(root, g, cleanups) {
  markViewed(g.id);
  setAmbient(g.header);
  const alive = { v: true };
  cleanups.push(() => { alive.v = false; });

  // Refresh the live player count every minute while the page is open
  const live = $('[data-live]', root);
  if (live) {
    const tick = () => api(`/api/players/${g.id}`, { ttl: 55e3 }).then((d) => { if (alive.v && d.players) live.textContent = `${num(d.players)} playing now`; }).catch(() => {});
    tick();
    const t = setInterval(tick, 60e3);
    cleanups.push(() => clearInterval(t));
  }

  const sim = similar(g, 8);
  if (sim.length) $('[data-similar]', root).innerHTML = `<h2 class="block-title">More like this</h2><div class="grid-caps">${sim.map((x) => capHTML(x)).join('')}</div>`;

  api(`/api/app/${g.id}`).then((d) => { if (alive.v) fillDetails(root, g, d, cleanups); })
    .catch(() => { if (!alive.v) return; $('.media__main', root).innerHTML = `<img src="${g.capsule}" alt="${esc(g.name)}">`; $('[data-about]', root).innerHTML = `<h2>About this game</h2><p>${esc(g.short)}</p>`; $('[data-aside]', root).innerHTML = ''; });

  loadReviews(root, g, alive);
  mountPriceScan($('[data-pricescan]', root), g, alive);
  api(`/api/history/${g.id}`, { ttl: 60e3 }).then((h) => { if (alive.v) fillHistory(root, g, h); }).catch(() => {});
  api(`/api/community/app/${g.id}?section=screenshots`).then((cards) => {
    if (!alive.v || !cards.length) return;
    $('[data-comm-preview]', root).innerHTML = `<div class="block-head"><h2 class="block-title">From the community</h2><a class="link-more" href="#/community/app/${g.id}">Open community hub</a></div>
      <div class="comm-strip">${cards.slice(0, 6).map((c) => `<a href="#/community/app/${g.id}/screenshots" class="comm-strip__item"><img src="${c.img}" alt="Screenshot by ${esc(c.author)}" loading="lazy"></a>`).join('')}</div>`;
  }).catch(() => {});
  api(`/api/community/app/${g.id}?section=news`).then((news) => {
    if (!alive.v || !news.length) return;
    $('[data-news]', root).innerHTML = `<div class="block-head"><h2 class="block-title">Recent news</h2><a class="link-more" href="#/community/app/${g.id}/news">All news</a></div>
      <div class="news-list">${news.slice(0, 3).map(newsCard).join('')}</div>`;
  }).catch(() => {});

  const cmp = $('[data-compare]', root);
  cmp.addEventListener('click', () => {
    const on = toggleCompare(g.id);
    cmp.setAttribute('aria-pressed', String(on));
    $('span', cmp).textContent = on ? 'In comparison' : 'Compare';
    toast(on ? `Added ${g.name} to the comparison` : `Removed ${g.name} from the comparison`, on ? { label: 'Compare now', fn: () => { location.hash = '#/compare'; } } : null);
  });
  const own = $('[data-owned]', root);
  own.addEventListener('click', () => {
    const on = toggleOwned(g.id);
    own.setAttribute('aria-pressed', String(on));
    $('span', own).textContent = on ? 'You own this' : 'I own this';
    toast(on ? `Marked ${g.name} as owned. It won't appear in store lists or recommendations` : `${g.name} is no longer marked as owned`);
  });
  const follow = $('[data-follow]', root);
  follow.addEventListener('click', () => {
    const on = toggleFollow(g.id);
    follow.setAttribute('aria-pressed', String(on));
    $('span', follow).textContent = on ? 'Following' : 'Follow';
    toast(on ? `Following ${g.name}` : `Stopped following ${g.name}`);
  });
  $('[data-set-bg]', root).addEventListener('click', async () => {
    const { setBackgroundPhoto } = await import('../settings.js');
    try { setBackgroundPhoto(g.hero || g.capsule); toast(`${g.name} is now your background. Change it in Settings > Background`); } catch (err) { toast(err.message); }
  });
  $('[data-share]', root).addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); toast('Link copied to clipboard'); } catch { toast('Copy the address bar link to share this game'); }
  });
}

export function newsCard(n) {
  return `<a class="news" href="${esc(n.url)}" target="_blank" rel="noopener">
    ${n.img ? `<img src="${esc(n.img)}" alt="" loading="lazy">` : ''}
    <div><p class="news__meta">${esc(ago(n.date * 1000))}${n.author ? ` · ${esc(n.author)}` : ''}</p><h3>${esc(n.title)}</h3><p>${esc(n.text)}</p></div>
  </a>`;
}

function fillDetails(root, g, d, cleanups) {
  const shots = d.screens.length ? d.screens : [{ t: g.header, f: g.capsule }];
  const main = $('.media__main', root);
  const strip = $('.media__strip', root);
  main.innerHTML = `<img src="${shots[0].f}" alt="${esc(g.name)} screenshot 1" data-main>
    <button class="media__nav media__nav--prev" type="button" data-step="-1" aria-label="Previous screenshot">${icon('left')}</button>
    <button class="media__nav media__nav--next" type="button" data-step="1" aria-label="Next screenshot">${icon('right')}</button>
    <button class="media__expand" type="button" data-expand aria-label="View screenshot full screen">${icon('expand')}</button>`;
  strip.innerHTML = shots.map((s, k) => `<button type="button" role="tab" aria-selected="${k === 0}" aria-label="Screenshot ${k + 1}" data-shot="${k}"><img src="${s.t}" alt="" loading="lazy"></button>`).join('');
  let i = 0;
  const btns = $$('button', strip);

  function show(k, fromLightbox) {
    k = (k + shots.length) % shots.length;
    if (k === i && !fromLightbox) return;
    i = k;
    const old = $('img[data-main]', main);
    const im = document.createElement('img');
    im.src = shots[i].f; im.alt = `${g.name} screenshot ${i + 1}`; im.dataset.main = '';
    // Anything still fading out from fast clicking goes now, so it can never cover the new shot
    $$('img:not([data-main])', main).forEach((x) => x.remove());
    if (!reduceMotion.matches) {
      im.className = 'is-entering';
      im.addEventListener('animationend', () => im.classList.remove('is-entering'), { once: true });
      old.removeAttribute('data-main'); old.classList.remove('is-entering'); old.classList.add('is-leaving');
      const drop = () => old.remove();
      old.addEventListener('animationend', drop, { once: true });
      setTimeout(drop, 1500); // in case the animation never runs (hidden window, motion changed mid-way)
      main.prepend(im);
    } else old.replaceWith(im);
    btns.forEach((b, n) => b.setAttribute('aria-selected', String(n === i)));
    const b = btns[i];
    strip.scrollTo({ left: b.offsetLeft - strip.clientWidth / 2 + b.offsetWidth / 2, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    if (lb.open) renderLightbox();
  }
  btns.forEach((b) => b.addEventListener('click', () => show(+b.dataset.shot)));
  $$('[data-step]', main).forEach((b) => b.addEventListener('click', () => show(i + +b.dataset.step)));
  $('[data-media]', root).addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { show(i + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { show(i - 1); e.preventDefault(); }
  });

  const lb = $('.lightbox');
  function renderLightbox() {
    lb.innerHTML = `<img src="${shots[i].f}" alt="${esc(g.name)} screenshot ${i + 1}">
      <button class="media__nav media__nav--prev" type="button" data-lb="-1" aria-label="Previous screenshot">${icon('left')}</button>
      <button class="media__nav media__nav--next" type="button" data-lb="1" aria-label="Next screenshot">${icon('right')}</button>
      <div class="lightbox__bar"><button class="iconbtn" type="button" data-lb-close aria-label="Close viewer">${icon('x')}</button></div>
      <p class="lightbox__count">${i + 1} of ${shots.length}</p>`;
    $$('[data-lb]', lb).forEach((b) => b.addEventListener('click', () => show(i + +b.dataset.lb, true)));
    $('[data-lb-close]', lb).addEventListener('click', () => lb.close());
  }
  const openLb = () => { renderLightbox(); lb.showModal(); $('[data-lb-close]', lb).focus(); };
  $('[data-expand]', main).addEventListener('click', openLb);
  main.addEventListener('click', (e) => { if (e.target.matches('img')) openLb(); });
  const onKey = (e) => {
    if (!lb.open) return;
    if (e.key === 'ArrowRight') { show(i + 1, true); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { show(i - 1, true); e.preventDefault(); }
  };
  const onBackdrop = (e) => { if (e.target === lb) lb.close(); };
  lb.addEventListener('keydown', onKey);
  lb.addEventListener('click', onBackdrop);
  cleanups.push(() => { lb.removeEventListener('keydown', onKey); lb.removeEventListener('click', onBackdrop); if (lb.open) lb.close(); });

  // The catalog keeps a shortened description; the game's own details have it in full
  if (d.short) $('.side__desc', root).textContent = d.short;

  // About
  const about = $('[data-about]', root);
  const paras = d.about.length ? d.about : [d.short || g.short];
  about.innerHTML = `<h2>About this game</h2><div class="prose__body${paras.length > 5 ? ' is-clamped' : ''}">${paras.map((p) => (p.startsWith('• ') ? `<p class="bullet">${esc(p.slice(2))}</p>` : `<p>${esc(p)}</p>`)).join('')}
    ${d.aboutImgs?.[0] ? `<img class="prose__img" src="${esc(d.aboutImgs[0])}" alt="" loading="lazy">` : ''}</div>
    ${paras.length > 5 ? '<button type="button" class="btn btn--ghost btn--sm" data-more aria-expanded="false">Read more</button>' : ''}`;
  $('[data-more]', about)?.addEventListener('click', (e) => {
    const body = $('.prose__body', about);
    const open = body.classList.toggle('is-clamped') === false;
    e.currentTarget.textContent = open ? 'Show less' : 'Read more';
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });

  mountReqs($('[data-reqs]', root), d);

  // Aside
  $('[data-aside]', root).innerHTML = `
    <ul class="features" aria-label="Features">${d.categories.slice(0, 12).map((c) => `<li>${icon(featIcon(c))}${esc(c)}</li>`).join('')}</ul>
    ${d.metacritic ? `<div class="meta-card"><span class="metascore">${d.metacritic}</span><span>Metascore from critic reviews</span></div>` : ''}
    ${d.languages.length ? `<div class="meta-card meta-card--col"><h3>Languages</h3><p>${d.languages.map(esc).join(', ')}</p></div>` : ''}
    ${d.dlc ? `<div class="meta-card"><span class="metascore metascore--dlc">${d.dlc}</span><span>Downloadable content available</span></div>` : ''}`;
}

function loadReviews(root, g, alive) {
  const box = $('[data-reviews]', root);
  let order = 'all';
  let type = 'all';
  const seg = (name, value, opts) => `<div class="segmented segmented--sm" role="radiogroup" aria-label="${name}">${opts.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === value}" data-rf="${name}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const draw = (d) => {
    if (!alive.v) return;
    const pos = g.pct;
    box.innerHTML = `
      <div class="block-head"><h2 class="block-title">Player reviews</h2><a class="link-more" href="#/community/app/${g.id}/reviews">More reviews</a></div>
      <div class="rev-summary"><span class="rev-summary__pct rev--${revClass(g)}">${pos}%</span><div><p>${revHTML(g)}</p><p class="muted">${num(g.reviews)} reviews in total</p></div></div>
      <div class="rev-filters">${seg('order', order, [['all', 'Most helpful'], ['recent', 'Most recent']])}${seg('type', type, [['all', 'All'], ['positive', 'Positive'], ['negative', 'Negative']])}</div>
      <div class="reviews">${d.reviews.length ? d.reviews.slice(0, 5).map(reviewCard).join('') : '<p class="muted">No reviews match these filters.</p>'}</div>`;
  };
  const load = () => api(`/api/reviews/${g.id}?order=${order}&type=${type}`).then(draw).catch(() => { if (alive.v) box.innerHTML = ''; });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rf]');
    if (!b) return;
    if (b.dataset.rf === 'order') order = b.dataset.v; else type = b.dataset.v;
    $$('[data-rf="' + b.dataset.rf + '"]', box).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    $('.reviews', box)?.classList.add('is-loading');
    load();
  });
  load();
}

/** Small SVG line/area chart. points: [[x, y], ...] */
function chartHTML(points, { step = false, money: isMoney = false, label = '' } = {}) {
  if (points.length < 2) return '';
  const W = 560, H = 120, P = 6;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(0, ...ys), y1 = Math.max(...ys) || 1;
  const X = (x) => P + ((x - x0) / (x1 - x0 || 1)) * (W - P * 2);
  const Y = (y) => H - P - ((y - y0) / (y1 - y0 || 1)) * (H - P * 2);
  let d = '';
  points.forEach(([x, y], i) => {
    if (!i) d += `M${X(x).toFixed(1)},${Y(y).toFixed(1)}`;
    else if (step) d += `H${X(x).toFixed(1)}V${Y(y).toFixed(1)}`;
    else d += `L${X(x).toFixed(1)},${Y(y).toFixed(1)}`;
  });
  const area = `${d}V${H - P}H${P}Z`;
  const fmt = (v) => (isMoney ? money(v) : num(Math.round(v)));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}: from ${fmt(ys[0])} to ${fmt(ys[ys.length - 1])}, high ${fmt(y1)}" preserveAspectRatio="none">
    <path class="chart__area" d="${area}"/><path class="chart__line" d="${d}" pathLength="1"/></svg>`;
}

function fillHistory(root, g, h) {
  const box = $('[data-history]', root);
  if (!box) return;
  const prices = (h.prices || []).filter((p) => p[1] != null);
  const now = Math.floor(Date.now() / 1000);
  const pricePts = prices.map((p) => [p[0], p[1]]);
  if (pricePts.length && g.price != null) pricePts.push([now, g.price]);
  const lowest = prices.length ? Math.min(...prices.map((p) => p[1])) : g.price;
  const players = (h.daily || []).map(([day, v]) => [day * 86400, v]);
  const samples = (h.samples || []).map(([t, v]) => [t, v]);
  const playerPts = players.length >= 2 ? players : samples;
  const target = state.targets[g.id];
  const canAlert = !g.free && g.price != null;
  box.innerHTML = `<div class="block-head"><h2 class="block-title" id="h-history">Price and players</h2></div>
    <div class="history__grid">
      <div class="history__card">
        <p class="history__label">${icon('tag', 'i i--sm')}Price</p>
        <p class="history__value">${g.free ? 'Free to play' : g.price != null ? money(g.price) : 'Not on sale yet'}</p>
        ${lowest != null && !g.free ? `<p class="muted">Lowest recorded ${money(lowest)}${lowest >= (g.price ?? 0) ? ' (that is today)' : ''}</p>` : ''}
        ${chartHTML(pricePts, { step: true, money: true, label: 'Price history' }) || '<p class="history__note">Price history builds up with each catalog update.</p>'}
        ${canAlert ? `<form class="alert-form" data-alert><label for="alert-${g.id}">${icon('target', 'i i--sm')}Tell me when it drops to</label>
          <span class="alert-form__field">$<input id="alert-${g.id}" type="number" min="0.5" step="0.5" inputmode="decimal" value="${target != null ? (target / 100).toFixed(2) : ''}" placeholder="${((g.price * 0.6) / 100).toFixed(2)}"></span>
          <button type="submit" class="btn btn--ghost btn--sm">${target != null ? 'Update alert' : 'Set alert'}</button>${target != null ? '<button type="button" class="btn btn--ghost btn--sm" data-alert-clear>Remove</button>' : ''}</form>` : ''}
      </div>
      <div class="history__card">
        <p class="history__label">${icon('users', 'i i--sm')}Players</p>
        <p class="history__value">${g.players != null ? `${num(g.players)} now` : 'No live count'}</p>
        ${g.peak ? `<p class="muted">24-hour peak ${num(g.peak)}</p>` : ''}
        ${chartHTML(playerPts, { label: 'Players over time' }) || '<p class="history__note">Player history builds up with each catalog update.</p>'}
      </div>
    </div>`;
  const form = $('[data-alert]', box);
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = parseFloat($('input', form).value);
    if (!(v > 0)) return toast('Enter a price in dollars');
    setTarget(g.id, Math.round(v * 100));
    if (!state.wish.has(g.id)) $('[data-wish-text][data-wish]', root)?.click();
    toast(`You'll be told when ${g.name} costs $${v.toFixed(2)} or less`);
    fillHistory(root, g, h);
  });
  $('[data-alert-clear]', box)?.addEventListener('click', () => { setTarget(g.id, null); toast('Price alert removed'); fillHistory(root, g, h); });
}

export function reviewCard(r) {
  return `<article class="review ${r.up ? 'is-up' : 'is-down'}">
    <header>
      ${r.avatar ? `<img class="avatar" src="${esc(r.avatar)}" alt="" loading="lazy">` : '<span class="avatar"></span>'}
      <div><a href="${esc(r.profile || '#')}" target="_blank" rel="noopener" class="review__author">${esc(r.author)}</a>
      <p class="muted">${r.hours} hrs on record${r.games ? ` · ${r.games} games owned` : ''}</p></div>
      <span class="review__verdict">${icon(r.up ? 'thumb-up' : 'thumb-down', 'i i--sm')}${r.up ? 'Recommended' : 'Not recommended'}</span>
    </header>
    <p class="review__text">${esc(r.text)}</p>
    <footer class="muted">${r.helpful ? `${num(r.helpful)} found this helpful · ` : ''}${new Date(r.date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</footer>
    ${r.comments ? commentsHTML(r.url, r.comments) : ''}
  </article>`;
}

