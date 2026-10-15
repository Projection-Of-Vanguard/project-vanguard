import { db, tagId, tagName, gameTags, api } from '../data.js';
import * as R from '../recs.js';
import { state, clearViewed } from '../state.js';
import {
  $, $$, esc, icon, priceHTML, revHTML, steamBtn, wishBtn, capHTML, rowHTML, sectionHead, scrollBtns, shelf, platformsHTML, nameHTML,
  mountScrollers, setAmbient, reduceMotion, timeLeft, compactNum, skel, steamUrl,
} from '../ui.js';

/** A demo card: demos are their own Steam apps, so the card opens the full game here when it's in the catalog. */
function demoCard(d) {
  const parent = d.parent && db.byId.get(d.parent);
  const name = d.name.replace(/\s*[-–—:(]?\s*(free )?(demo|free sample|prologue)\)?\s*$/i, '') || d.name;
  const live = window.STPrefs?.get().players !== false && d.players ? `<span class="live cap__players" title="Playing the demo now">${compactNum(d.players)}<span class="sr-only"> playing now</span></span>` : '';
  return `<article class="cap demo">
    <a class="cap__link" href="${parent ? `#/app/${parent.id}` : steamUrl(d.id)}"${parent ? '' : ' target="_blank" rel="noopener"'}>
      <div class="cap__media"><img src="${d.capsule}" data-fb="${d.header}" alt="" loading="lazy" decoding="async" width="616" height="353"><span class="demo__badge">Free demo</span>${live}</div>
      <div class="cap__info"><div class="gname cap__name"><span class="gname__text">${esc(name)}</span></div><div class="cap__sub">${parent ? 'See the full game' : 'Full game not in this catalog yet'}</div></div>
    </a>
    <a class="demo__get" href="${steamUrl(d.id)}" target="_blank" rel="noopener" data-steam="${d.id}" aria-label="Get the ${esc(name)} demo on Steam">${icon('download', 'i i--sm')}Get demo</a>
  </article>`;
}

const FEST_END = Date.parse('2026-10-19T17:00:00Z');
const CATEGORY_TAGS = [
  ['Casual', 330], ['Co-op', 200], ['Fighting', 8], ['City Builder', 165], ['Sports', 262], ['Racing', 32],
  ['Roguelike', 290], ['Open World', 24], ['Simulation', 145], ['Survival', 95], ['RPG', 45], ['FPS', 212],
  ['Horror', 350], ['Strategy', 60], ['Souls-like', 0], ['Puzzle', 185], ['Sandbox', 120], ['Story Rich', 280],
];

let spot = [];

function slideHTML(g, i, n) {
  const src = i < 2 ? `src="${g.hero}"` : `data-src="${g.hero}"`;
  const live = g.mp && g.mp <= 40;
  return `<article class="slide${i === 0 ? ' is-active' : ''}" data-morph-scope role="group" aria-roledescription="slide" aria-label="${i + 1} of ${n}: ${esc(g.name)}"${i ? ' aria-hidden="true" inert' : ''}>
    <img class="slide__art" ${src} data-fb="${g.header}" data-morph alt="" width="1920" height="620">
    <img class="slide__alt" alt="">
    <div class="slide__shade"></div>
    <a class="slide__hit" href="#/app/${g.id}" tabindex="-1" aria-hidden="true"></a>
    <div class="slide__body">
      ${live ? `<span class="badge-live">#${g.mp} most played now</span>` : g.nw && g.nw <= 60 ? '<span class="badge-new">New and popular</span>' : ''}
      <div class="slide__titlerow"><h3 class="slide__title">${esc(g.name)}</h3>${platformsHTML(g)}</div>
      <p class="slide__desc">${esc(g.short)}</p>
      <div class="slide__meta">${revHTML(g)}${gameTags(g, 3).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>
      <div class="slide__buy">${priceHTML(g, true)}${steamBtn(g)}${wishBtn(g)}<a class="btn btn--ghost" href="#/app/${g.id}">View game</a></div>
    </div>
    <div class="slide__shots" data-shots="${g.id}"></div>
  </article>`;
}

function eventArt(list) {
  return list.map((g) => `<img src="${g.tall || g.capsule}" data-fb="${g.capsule}" alt="" loading="lazy" decoding="async"${list[0] === g ? ' data-morph' : ''}>`).join('');
}

export function viewHome() {
  spot = R.topSellers().concat(R.newPopular()).filter((g, i, a) => g.hero && a.indexOf(g) === i)
    .sort((a, b) => Math.min(a.ts || 1e4, (a.nw || 1e4) * 2) - Math.min(b.ts || 1e4, (b.nw || 1e4) * 2)).slice(0, 8);

  const personal = R.hasHistory();
  const because = R.becauseYouViewed(16);
  const cookId = tagId('Cooking');
  const fest = Date.now() < FEST_END && cookId ? R.byTag(cookId).filter((g) => g.header && !g.coming) : [];
  const deep = R.bigDiscounts(70);
  const ending = R.endingSoon();
  const daily = ending.filter((g) => g.quality > 0.5).filter((g) => !ending.slice(0, 3).includes(g)).slice(0, 2);
  const maxDisc = Math.max(0, ...R.bigDiscounts(50).map((g) => g.disc));
  const cats = CATEGORY_TAGS.map(([name, h]) => ({ id: tagId(name), name, h })).filter((c) => c.id && (db.tagCount.get(c.id) || 0) >= 8);
  const mp = R.mostPlayed().slice(0, 10);
  const recent = R.recentlyViewed();
  const added = R.justAdded();

  return `
  <section class="wrap" aria-labelledby="h-spot" style="padding-top:14px">
    ${sectionHead('spot', 'Featured & recommended', '', `<a class="btn btn--ghost btn--sm" href="#/queue">${icon('layers', 'i i--sm')}Discovery queue</a>`)}
    <div class="spot" data-spot>
      <div class="spot__stage" aria-roledescription="carousel" aria-label="Featured games">
        ${spot.map((g, i) => slideHTML(g, i, spot.length)).join('')}
      </div>
      <div class="spot__rail">
        ${spot.map((g, i) => `<button type="button" class="rail-item" aria-current="${i === 0}" aria-label="Show ${esc(g.name)}"><img src="${g.header}" alt="" loading="lazy" width="96" height="45"><span class="rail-item__name">${esc(g.name)}</span><span class="rail-item__bar"></span></button>`).join('')}
        <div class="spot__ctrl">
          <button class="iconbtn" type="button" data-spot-prev aria-label="Previous game">${icon('left')}</button>
          <button class="iconbtn" type="button" data-spot-play aria-label="Pause rotation">${icon('pause')}</button>
          <button class="iconbtn" type="button" data-spot-next aria-label="Next game">${icon('right')}</button>
          <span data-spot-count aria-live="polite">1 of ${spot.length}</span>
        </div>
      </div>
    </div>
  </section>

  ${personal
    ? shelf('foryou', 'Recommended for you', R.forYou(18), { sub: 'Picked from the games you viewed and wishlisted', more: '#/browse/foryou' })
      + (because?.items.length ? shelf('because', `Because you looked at <a class="inline-link" href="#/app/${because.anchor.id}">${esc(because.anchor.name)}</a>`, because.items, { sub: 'Similar tags, similar feel' }) : '')
    : shelf('trending', 'Trending this week', R.trending().slice(0, 18), { sub: 'Games climbing the charts right now. Open a few and this space learns your taste.', more: '#/browse/trending' })}

  ${fest.length >= 3 ? `<section class="section wrap" aria-labelledby="h-fest">
    <div class="fest">
      <div>
        <h2 class="fest__title" id="h-fest">Steam Cooking Festival</h2>
        <p class="fest__sub">Discounts, demos and more on ${fest.length} games where food is on the menu.</p>
        <div class="fest__row">
          <a class="btn" href="#/tag/${cookId}">Browse festival games</a>
          <div class="countdown" data-fest aria-label="Time left in the festival"></div>
        </div>
      </div>
      <div class="fest__fan" aria-hidden="true">${fest.slice(0, 3).map((g) => `<img src="${g.header}" alt="" loading="lazy">`).join('')}</div>
    </div>
  </section>` : ''}

  <section class="section wrap" aria-labelledby="h-deals">
    ${sectionHead('deals', 'Deals & events', `${R.specials().length} games on sale right now`, '<a class="link-more" href="#/browse/specials">See all specials</a>')}
    <div class="deals">
      ${deep.length >= 2 ? `<article class="event" data-morph-scope>
        <span class="event__label event__label--pub">Deep discounts</span>
        <div class="event__art">${eventArt(deep.slice(0, 2))}</div>
        <div class="event__foot"><h3>${esc(deep[0].name)} and more</h3><p>${deep.length} well-reviewed games at 70% off or more</p><div class="event__big">Up to ${maxDisc}% off</div></div>
        <a class="event__link" href="#/browse/discounts" aria-label="Browse deep discounts"></a>
      </article>` : ''}
      ${ending.length >= 3 ? `<article class="event event--fan">
        <span class="event__label">Last chance</span>
        <div class="event__art"><div class="fan">${eventArt(ending.slice(0, 3))}</div></div>
        <div class="event__foot"><h3>Ending soon</h3><p>${ending.slice(0, 3).map((g) => esc(g.name)).join(', ')}</p><div class="event__big" data-ends="${ending[0].discEnd}" data-prefix="Ends in ">Ends in ${timeLeft(ending[0].discEnd)}</div></div>
        <a class="event__link" href="#/browse/ending" aria-label="Browse deals ending soon"></a>
      </article>` : ''}
      <div class="daily">
        ${daily.map((g) => `<article class="event" data-morph-scope>
          <span class="event__label">Daily deal</span>
          <div class="event__art"><img src="${g.header}" alt="" loading="lazy" data-morph width="460" height="215"></div>
          <div class="event__foot"><div><h3>${esc(g.name)}</h3><span class="timer">${icon('clock')}<span data-ends="${g.discEnd}" data-prefix="Ends in ">Ends in ${timeLeft(g.discEnd)}</span></span></div>${priceHTML(g)}</div>
          <a class="event__link" href="#/app/${g.id}" aria-label="${esc(g.name)}, daily deal"></a>
        </article>`).join('')}
      </div>
    </div>
  </section>

  ${db.demos.length ? `<section class="section wrap caps" aria-labelledby="h-demos" data-scroller>
    ${sectionHead('demos', 'Popular demos', 'Free to try, ranked by how many people are playing each demo right now', `<a class="link-more" href="https://store.steampowered.com/demos/" target="_blank" rel="noopener">More on Steam</a>${scrollBtns('popular demos')}`)}
    <div class="scroller"><div class="scroller__track">${db.demos.slice(0, 20).map(demoCard).join('')}</div><div class="dots" aria-hidden="true"></div></div>
  </section>` : ''}

  <section class="section wrap caps" aria-labelledby="h-disc" data-scroller data-seg-shelf="disc">
    ${sectionHead('disc', 'Big discounts', 'Ranked by discount and player reviews', `<div class="seg" role="group" aria-label="Minimum discount"><span class="seg__pill"></span>${[50, 75, 90].map((v, k) => `<button type="button" data-v="${v}" aria-pressed="${k === 0}">${v}%+</button>`).join('')}</div>${scrollBtns('big discounts')}`)}
    <div class="scroller"><div class="scroller__track" data-seg-track></div><div class="dots" aria-hidden="true"></div></div>
  </section>

  ${shelf('indie', 'Popular indie games', R.indiePopular().slice(0, 18), { sub: 'Independent games with the most players right now', more: '#/browse/indie' })}
  ${shelf('indie-rising', 'Rising indie games', R.indieRising().slice(0, 18), { sub: 'Indie games gaining players day by day, and new ones taking off', more: '#/browse/indie-rising' })}

  <section class="section wrap cats" aria-labelledby="h-cats" data-scroller>
    ${sectionHead('cats', 'Browse by category', '', scrollBtns('categories'))}
    <div class="scroller"><div class="scroller__track">
      ${cats.map((c) => { const [a, b] = R.byTag(c.id).filter((g) => g.capsule); return `<a class="catcard" href="#/tag/${c.id}" style="--h:${c.h}"><div class="catcard__art">${a ? `<img src="${a.capsule}" data-fb="${a.header}" alt="" loading="lazy">` : ''}${b ? `<img src="${b.capsule}" data-fb="${b.header}" alt="" loading="lazy">` : ''}</div><div><span class="catcard__name">${esc(tagName(c.id))}</span><span class="catcard__count">${db.tagCount.get(c.id)} games</span></div></a>`; }).join('')}
    </div><div class="dots" aria-hidden="true"></div></div>
  </section>

  <section class="section wrap" aria-labelledby="h-mp">
    ${sectionHead('mp', 'Most played right now', 'Live player counts from Steam', '<a class="link-more" href="#/browse/mostplayed">See the full chart</a>')}
    <ol class="ranklist">${mp.map((g) => `<li>${rowHTML(g, g.mp)}</li>`).join('')}</ol>
  </section>

  <section class="section wrap" aria-labelledby="h-panels">
    <h2 class="sr-only" id="h-panels">Hidden gems and top rated</h2>
    <div class="tagpanels">
      ${[['Hidden gems', 'Loved by players, not yet everywhere', R.hiddenGems().slice(0, 4), 'gems'], ['Top rated of all time', 'The highest share of positive reviews', R.topRated().slice(0, 4), 'toprated']].map(([t, s, list, slug]) => `
      <div class="tagpanel">
        <div class="tagpanel__head"><div><h3>${t}</h3><p>${s}</p></div><a class="btn btn--ghost btn--sm" href="#/browse/${slug}">See more</a></div>
        <div class="tagpanel__grid">${list.map((g) => capHTML(g, { variant: 'header', sub: false })).join('')}</div>
      </div>`).join('')}
    </div>
  </section>

  <section class="section wrap" aria-labelledby="h-queue">
    <div class="queue-cta">
      <div class="queue-cta__stack" aria-hidden="true">${R.discoveryQueue(3).map((g) => `<img src="${g.capsule}" alt="" loading="lazy">`).join('')}</div>
      <div>
        <h2 id="h-queue">Your discovery queue</h2>
        <p>A dozen games picked for you, one at a time. Wishlist what you like, skip what you don't, and the picks get sharper.</p>
        <a class="btn btn--primary" href="#/queue">${icon('layers', 'i i--sm')}Start your queue</a>
      </div>
    </div>
  </section>

  <section class="section wrap caps" aria-labelledby="h-budget" data-scroller data-seg-shelf="budget">
    ${sectionHead('budget', 'Great games on a budget', '', `<div class="seg" role="group" aria-label="Price limit"><span class="seg__pill"></span>${[500, 1000, 2000].map((v, k) => `<button type="button" data-v="${v}" aria-pressed="${k === 1}">Under $${v / 100}</button>`).join('')}</div>${scrollBtns('budget games')}`)}
    <div class="scroller"><div class="scroller__track" data-seg-track></div><div class="dots" aria-hidden="true"></div></div>
  </section>

  ${recent.length ? shelf('recent', 'Recently viewed', recent, { variant: 'header', tools: '<button type="button" class="link-more" data-clear-viewed>Clear history</button>' }) : ''}

  <section class="section wrap" aria-labelledby="h-tabs" data-tabs>
    <h2 class="sr-only" id="h-tabs">Store lists</h2>
    <div class="tabs__bar" role="tablist" aria-label="Store lists">
      ${[['new', 'New & trending'], ['top', 'Top sellers'], ['specials', 'Specials'], ['upcoming', 'Popular upcoming'], ['free', 'Free to play'], ...(added.length ? [['added', 'Just added']] : [])]
        .map(([k, l], i) => `<button class="tab" role="tab" id="tab-${k}" aria-controls="tabpanel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-tab="${k}">${l}</button>`).join('')}
      <span class="tabs__ink" aria-hidden="true"></span>
    </div>
    <div class="tabs__body">
      <div class="rows" id="tabpanel" role="tabpanel" aria-labelledby="tab-new"></div>
      <aside class="preview" aria-live="polite"></aside>
    </div>
  </section>`;
}

const TAB_LISTS = { new: R.newPopular, top: R.topSellers, specials: R.specials, upcoming: R.upcoming, free: R.freeToPlay, added: R.justAdded };

export function mountHome(root, cleanups) {
  if (spot[0]) setAmbient(spot[0].header);
  mountSpot(root, cleanups);
  mountSegShelf(root, 'disc', (v) => R.bigDiscounts(v).slice(0, 24));
  mountSegShelf(root, 'budget', (v) => R.underPrice(v).slice(0, 24));
  mountScrollers(root, cleanups);
  mountTabs(root, cleanups);
  mountTimers(root, cleanups);
  $('[data-clear-viewed]', root)?.addEventListener('click', (e) => {
    clearViewed();
    e.target.closest('section').remove();
  });
}

function mountSpot(root, cleanups) {
  const el = $('[data-spot]', root);
  if (!el) return;
  const stage = $('.spot__stage', el);
  const slides = $$('.slide', el);
  const rail = $$('.rail-item', el);
  const playBtn = $('[data-spot-play]', el);
  const count = $('[data-spot-count]', el);
  const n = slides.length;
  let i = 0;
  const p = window.STPrefs?.get() || {};
  let userPaused = p.autoplay === false || window.STPrefs?.motionLevel() === 'off';
  el.style.setProperty('--dur', `${Math.max(3, Math.min(20, +p.autoplaySec || 7))}s`);
  let hoverPaused = false;

  const load = (k) => {
    const im = $('.slide__art', slides[k]);
    if (im.dataset.src) { im.src = im.dataset.src; im.removeAttribute('data-src'); }
    const shots = $('.slide__shots', slides[k]);
    if (!shots.dataset.loaded) {
      shots.dataset.loaded = '1';
      api(`/api/app/${shots.dataset.shots}`).then((d) => {
        shots.innerHTML = d.screens.slice(0, 4).map((s, j) => `<button type="button" data-shot="${s.f}" aria-label="Preview screenshot ${j + 1}"><img src="${s.t}" alt="" loading="lazy"></button>`).join('');
      }).catch(() => {});
    }
  };
  const sync = () => {
    el.classList.toggle('is-paused', userPaused || hoverPaused || document.hidden);
    playBtn.innerHTML = icon(userPaused ? 'play' : 'pause');
    playBtn.setAttribute('aria-label', userPaused ? 'Resume rotation' : 'Pause rotation');
  };
  function go(k) {
    k = (k + n) % n;
    if (k === i) return;
    slides[i].classList.remove('is-active'); slides[i].setAttribute('aria-hidden', 'true'); slides[i].inert = true;
    rail[i].setAttribute('aria-current', 'false');
    i = k;
    load(i); load((i + 1) % n);
    slides[i].classList.add('is-active'); slides[i].removeAttribute('aria-hidden'); slides[i].inert = false;
    rail[i].setAttribute('aria-current', 'true');
    count.textContent = `${i + 1} of ${n}`;
    setAmbient(spot[i].header);
  }
  load(0); load(1);
  rail.forEach((b, k) => {
    b.addEventListener('click', () => go(k));
    $('.rail-item__bar', b).addEventListener('animationend', () => { if (!userPaused) go(i + 1); });
  });
  $('[data-spot-prev]', el).addEventListener('click', () => go(i - 1));
  $('[data-spot-next]', el).addEventListener('click', () => go(i + 1));
  playBtn.addEventListener('click', () => { userPaused = !userPaused; sync(); });
  stage.addEventListener('pointerenter', () => { hoverPaused = true; sync(); });
  stage.addEventListener('pointerleave', () => { hoverPaused = false; sync(); });
  el.addEventListener('focusin', () => { hoverPaused = true; sync(); });
  el.addEventListener('focusout', (e) => { if (!el.contains(e.relatedTarget)) { hoverPaused = false; sync(); } });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { go(i + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { go(i - 1); e.preventDefault(); }
  });
  const onVis = () => sync();
  document.addEventListener('visibilitychange', onVis);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVis));

  let x0 = null;
  stage.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') x0 = e.clientX; });
  stage.addEventListener('pointerup', (e) => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 50) { e.preventDefault(); go(i + (dx < 0 ? 1 : -1)); } });

  // Hovering a screenshot previews it in the stage
  stage.addEventListener('pointerover', (e) => {
    const b = e.target.closest('[data-shot]');
    if (!b) return;
    const alt = $('.slide__alt', b.closest('.slide'));
    alt.src = b.dataset.shot; alt.classList.add('is-on');
  });
  // Gentle parallax on the featured art (Settings > Animations)
  if (p.parallax !== false && !reduceMotion.matches && matchMedia('(hover: hover)').matches) {
    stage.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      stage.style.setProperty('--px', `${x * -14}px`);
      stage.style.setProperty('--py', `${y * -10}px`);
    });
    stage.addEventListener('pointerleave', () => { stage.style.setProperty('--px', '0px'); stage.style.setProperty('--py', '0px'); });
  }
  stage.addEventListener('pointerout', (e) => { const b = e.target.closest('[data-shot]'); if (b) $('.slide__alt', b.closest('.slide')).classList.remove('is-on'); });
  stage.addEventListener('click', (e) => {
    const b = e.target.closest('[data-shot]');
    if (b) $('.slide__hit', b.closest('.slide')).click();
  });
  sync();
}

function mountSegShelf(root, key, fn) {
  const sec = $(`[data-seg-shelf="${key}"]`, root);
  if (!sec) return;
  const track = $('[data-seg-track]', sec);
  const seg = $('.seg', sec);
  const pill = $('.seg__pill', seg);
  const btns = $$('button', seg);
  const movePill = (b) => { pill.style.width = `${b.offsetWidth}px`; pill.style.transform = `translateX(${b.offsetLeft - 3}px)`; };
  const show = (v, animate) => {
    const items = fn(v);
    track.innerHTML = items.length ? items.map((g) => capHTML(g)).join('') : '<p class="muted">Nothing matches right now. Try a lower setting.</p>';
    track.scrollLeft = 0;
    if (animate) { track.classList.remove('is-swapping'); void track.offsetWidth; track.classList.add('is-swapping'); }
    sec._updateScroller?.();
  };
  btns.forEach((b) => b.addEventListener('click', () => {
    btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    movePill(b); show(+b.dataset.v, true);
  }));
  const on = btns.find((b) => b.getAttribute('aria-pressed') === 'true');
  show(+on.dataset.v, false);
  requestAnimationFrame(() => movePill(on));
  new ResizeObserver(() => movePill(btns.find((b) => b.getAttribute('aria-pressed') === 'true'))).observe(seg);
}

function previewHTML(g, d) {
  return `<div class="preview__inner"><img class="preview__cap" src="${g.header}" alt="" width="460" height="215">
    ${nameHTML(g, 'h3')}
    <p class="preview__rev">${revHTML(g)}${g.reviews >= 10 ? ` from ${compactNum(g.reviews)} reviews` : ''}</p>
    <div class="chips">${gameTags(g, 5).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>
    <div class="preview__shots">${d ? d.screens.slice(0, 3).map((s) => `<img src="${s.t}" alt="" loading="lazy" width="600" height="338">`).join('') : skel.lines(3).replace(/skel--line/g, 'skel--shot')}</div></div>`;
}

function mountTabs(root, cleanups) {
  const sec = $('[data-tabs]', root);
  const tabs = $$('.tab', sec);
  const ink = $('.tabs__ink', sec);
  const rows = $('.rows', sec);
  const preview = $('.preview', sec);
  let current = null;
  let timer = 0;

  const setPreview = (id) => {
    if (current === id) return;
    current = id;
    $$('.row', rows).forEach((r) => r.classList.toggle('is-on', +r.dataset.id === id));
    const g = db.byId.get(id);
    preview.innerHTML = previewHTML(g);
    clearTimeout(timer);
    timer = setTimeout(() => api(`/api/app/${id}`).then((d) => { if (current === id) preview.innerHTML = previewHTML(g, d); }).catch(() => {}), 140);
  };
  const moveInk = (t) => { ink.style.width = `${t.offsetWidth - 8}px`; ink.style.transform = `translateX(${t.offsetLeft + 4}px)`; };
  function select(t, focus) {
    tabs.forEach((x) => { const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; });
    rows.setAttribute('aria-labelledby', t.id);
    moveInk(t);
    if (focus) t.focus();
    const items = TAB_LISTS[t.dataset.tab]().slice(0, 10);
    rows.innerHTML = items.map((g) => rowHTML(g)).join('') + `<a class="rows__more" href="#/browse/${{ new: 'new', top: 'top', specials: 'specials', upcoming: 'upcoming', free: 'free', added: 'added' }[t.dataset.tab]}">See more ${esc(t.textContent.toLowerCase())}</a>`;
    rows.classList.remove('is-swapping'); void rows.offsetWidth; rows.classList.add('is-swapping');
    current = null;
    if (items[0]) setPreview(items[0].id);
  }
  tabs.forEach((t, k) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); select(tabs[(k + d + tabs.length) % tabs.length], true); }
    });
  });
  rows.addEventListener('pointerover', (e) => { const r = e.target.closest('.row'); if (r) setPreview(+r.dataset.id); });
  rows.addEventListener('focusin', (e) => { const r = e.target.closest('.row'); if (r) setPreview(+r.dataset.id); });
  select(tabs[0]);
  const ro = new ResizeObserver(() => moveInk(tabs.find((t) => t.getAttribute('aria-selected') === 'true')));
  ro.observe(sec);
  cleanups.push(() => { ro.disconnect(); clearTimeout(timer); });
}

export function mountTimers(root, cleanups) {
  const fest = $('[data-fest]', root);
  const ends = $$('[data-ends]', root);
  if (!fest && !ends.length) return;
  const pad = (v) => String(v).padStart(2, '0');
  const tick = () => {
    if (fest) {
      let s = Math.max(0, Math.floor((FEST_END - Date.now()) / 1000));
      const d = Math.floor(s / 86400); s %= 86400;
      const h = Math.floor(s / 3600); s %= 3600;
      const m = Math.floor(s / 60);
      fest.innerHTML = [[d, 'days'], [h, 'hrs'], [m, 'min']].map(([v, l]) => `<div><b>${pad(v)}</b><small>${l}</small></div>`).join('');
      fest.setAttribute('aria-label', `Festival ends in ${d} days, ${h} hours and ${m} minutes`);
    }
    ends.forEach((el) => { el.textContent = `${el.dataset.prefix || ''}${timeLeft(+el.dataset.ends)}`; });
  };
  tick();
  const t = setInterval(tick, 1000);
  cleanups.push(() => clearInterval(t));
}

