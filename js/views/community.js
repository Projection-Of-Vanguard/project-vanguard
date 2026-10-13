import { db, api, searchGames } from '../data.js';
import { mostPlayed } from '../recs.js';
import { state, toggleFollow } from '../state.js';
import { $, $$, esc, icon, num, compactNum, skel, setAmbient, revHTML, toast, reduceMotion, ago, platformsHTML } from '../ui.js';
import { newsCard } from './detail.js';
import { commentsHTML } from '../comments.js';

const GLOBAL_TABS = [['all', 'All'], ['screenshots', 'Screenshots'], ['artwork', 'Artwork'], ['videos', 'Videos'], ['workshop', 'Workshop'], ['guides', 'Guides'], ['reviews', 'Reviews']];
const HUB_TABS = [['all', 'All'], ['discussions', 'Discussions'], ['screenshots', 'Screenshots'], ['artwork', 'Artwork'], ['videos', 'Videos'], ['workshop', 'Workshop'], ['guides', 'Guides'], ['reviews', 'Reviews'], ['news', 'News']];
const TYPE_LABEL = { screenshot: 'Screenshot', artwork: 'Artwork', video: 'Video', workshop: 'Workshop', guide: 'Guide', review: 'Review', discussion: 'Discussion' };

function tabsHTML(tabs, active, base) {
  return `<nav class="comm-tabs" aria-label="Community sections">
    ${tabs.map(([k, l]) => `<a class="tab" href="${base}${k === 'all' ? '' : `/${k}`}"${k === active ? ' aria-current="page"' : ''}>${l}</a>`).join('')}
    <span class="tabs__ink" aria-hidden="true"></span>
  </nav>`;
}

export function viewCommunity(route) {
  const hubs = mostPlayed().slice(0, 8);
  const followed = [...state.follow].map((id) => db.byId.get(id)).filter(Boolean).slice(0, 6);
  return `<div class="wrap community">
    <header class="comm-head reveal" style="--i:0">
      <div><h1>Community</h1><p>What players are sharing across Steam right now: screenshots, art, guides and reviews.</p></div>
      <form class="hub-find" role="search" data-hub-find autocomplete="off">
        <label class="sr-only" for="hubq">Find a game's community hub</label>
        ${icon('search', 'i i--sm')}<input id="hubq" type="search" placeholder="Find a game's community hub" list="hub-list">
        <datalist id="hub-list"></datalist>
      </form>
    </header>
    ${tabsHTML(GLOBAL_TABS, route.section, '#/community')}
    <div class="comm-body reveal" style="--i:1">
      <div><div class="feed" data-feed></div><p class="feed__status" data-status aria-live="polite"></p><div class="sentinel" data-sentinel></div></div>
      <aside class="comm-rail">
        ${followed.length ? `<section class="rail-card"><h2>Hubs you follow</h2><ul class="hub-list">${followed.map(hubItem).join('')}</ul></section>` : ''}
        <section class="rail-card"><h2>Popular hubs</h2><ul class="hub-list">${hubs.map(hubItem).join('')}</ul></section>
        <section class="rail-card"><h2>Latest announcements</h2><div class="news-mini" data-news>${skel.lines(6)}</div></section>
      </aside>
    </div>
  </div>`;
}

const hubItem = (g) => `<li><a href="#/community/app/${g.id}"><img src="${g.header}" alt="" loading="lazy" width="92" height="43"><span><b>${esc(g.name)}</b><small>${g.mp ? `#${g.mp} most played` : `${compactNum(g.reviews)} reviews`}</small></span></a></li>`;

export function viewHub(route, g) {
  const following = state.follow.has(g.id);
  return `<section class="hubhero" aria-labelledby="hub-title">
    <div class="wrap">
      <div class="hubhero__frame">
        <img class="hubhero__art" src="${g.hero || g.capsule}" data-fb="${g.capsule}" alt="">
        <div class="hubhero__shade"></div>
        <div class="hubhero__body">
          <img class="hubhero__cap" src="${g.header}" alt="" width="230" height="107">
          <div>
            <p class="hubhero__kicker"><a href="#/community">Community</a> / Hub</p>
            <div class="slide__titlerow"><h1 id="hub-title">${esc(g.name)}</h1>${platformsHTML(g)}</div>
            <p class="hubhero__stats">${revHTML(g)}<span>${num(g.reviews)} reviews</span>${g.mp ? `<span>#${g.mp} most played</span>` : ''}</p>
          </div>
          <div class="hubhero__actions">
            <a class="btn btn--primary" href="#/app/${g.id}">Store page</a>
            <button type="button" class="btn btn--ghost" data-follow aria-pressed="${following}">${icon('bell', 'i i--sm')}<span>${following ? 'Following' : 'Follow hub'}</span></button>
          </div>
        </div>
      </div>
    </div>
  </section>
  <div class="wrap community community--hub">
    ${tabsHTML(HUB_TABS, route.section, `#/community/app/${g.id}`)}
    <div class="reveal" style="--i:1"><div class="feed" data-feed></div><p class="feed__status" data-status aria-live="polite"></p><div class="sentinel" data-sentinel></div></div>
  </div>`;
}

/* ------------------------------------------------------------------ cards */

function author(c) {
  if (!c.author) return '';
  return `<span class="ugc__author">${c.avatar ? `<img src="${esc(c.avatar)}" alt="" loading="lazy" width="24" height="24">` : ''}${esc(c.author)}</span>`;
}
function gameChip(c, showGame) {
  if (!showGame || !c.appid) return '';
  const g = db.byId.get(c.appid);
  const name = c.appName || g?.name;
  return name ? `<a class="ugc__game" href="#/community/app/${c.appid}">${esc(name)}</a>` : '';
}

function cardHTML(c, idx, showGame) {
  if (c.type === 'review') {
    return `<article class="ugc ugc--review ${c.up ? 'is-up' : 'is-down'}">
      <header>${icon(c.up ? 'thumb-up' : 'thumb-down')}<div><b>${esc(c.title || (c.up ? 'Recommended' : 'Not recommended'))}</b><small>${esc(c.hours || '')}</small></div></header>
      <p class="ugc__text">${esc(c.text)}</p>
      <footer>${author(c)}${gameChip(c, showGame)}</footer>
      ${c.helpful ? `<p class="ugc__help">${esc(c.helpful)}</p>` : ''}
      <div class="ugc__actions"><a class="ugc__out" href="${esc(c.url)}" target="_blank" rel="noopener">Read full review</a></div>
      ${commentsHTML(c.url, c.comments)}
    </article>`;
  }
  if (c.type === 'discussion') {
    return `<article class="ugc ugc--disc">
      <p class="ugc__kicker">${esc(c.forum || 'Discussion')}</p>
      <h3><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a></h3>
      <p class="ugc__text">${esc(c.text)}</p>
      <footer>${author(c)}${c.date ? `<span class="ugc__help">${esc(c.date)}</span>` : ''}</footer>
      ${commentsHTML(c.url, c.comments, { label: `${num(c.comments)} ${c.comments === 1 ? 'reply' : 'replies'}` })}
    </article>`;
  }
  if (c.type === 'guide') {
    return `<article class="ugc ugc--guide">
      <header>${c.icon ? `<img src="${esc(c.icon)}" alt="" loading="lazy" width="56" height="56">` : ''}<div><p class="ugc__kicker">Guide</p><h3><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a></h3></div></header>
      ${c.text ? `<p class="ugc__text">${esc(c.text)}</p>` : ''}
      <footer>${author(c)}${c.ratings ? `<span class="ugc__stat">${icon('star', 'i i--sm')}${esc(c.ratings)}</span>` : ''}</footer>
      ${commentsHTML(c.url, c.comments)}
    </article>`;
  }
  const ratio = c.w && c.h ? `${c.w} / ${c.h}` : '16 / 9';
  return `<article class="ugc ugc--media">
    <button type="button" class="ugc__open" data-ugc="${idx}" aria-label="Open ${esc(TYPE_LABEL[c.type] || 'item')}${c.title ? `: ${esc(c.title)}` : ''}${c.author ? ` by ${esc(c.author)}` : c.appName ? ` from ${esc(c.appName)}` : ''}">
      <img src="${esc(c.img)}" alt="" loading="lazy" decoding="async" style="aspect-ratio:${ratio}">
      ${c.type === 'video' ? `<span class="ugc__play">${icon('play', 'i i--fill')}</span>` : ''}
      <span class="ugc__type">${TYPE_LABEL[c.type] || 'Item'}</span>
    </button>
    <div class="ugc__foot">
      ${c.title ? `<p class="ugc__title">${esc(c.title)}</p>` : ''}
      <div class="ugc__row">${author(c)}<span class="ugc__stats">${c.likes ? `<span class="ugc__stat">${icon('thumb-up', 'i i--sm')}${compactNum(c.likes)}</span>` : ''}</span></div>
      ${gameChip(c, showGame)}
      ${commentsHTML(c.url, c.comments)}
    </div>
  </article>`;
}

/* ------------------------------------------------------------------ feed */

function mountFeed(root, { url, showGame, cleanups, news = false }) {
  const feed = $('[data-feed]', root);
  const status = $('[data-status]', root);
  const sentinel = $('[data-sentinel]', root);
  const items = [];
  const seen = new Set();
  let page = 0;
  let done = false;
  let loading = false;
  let cols = [];
  const alive = { v: true };
  cleanups.push(() => { alive.v = false; });

  function layout() {
    if (news) return;
    const n = Math.max(1, Math.min(4, Math.floor(feed.clientWidth / 280)));
    if (cols.length === n) return;
    const cards = cols.flatMap((c) => [...c.children]).sort((a, b) => a.dataset.k - b.dataset.k);
    feed.innerHTML = '';
    cols = Array.from({ length: n }, () => { const d = document.createElement('div'); d.className = 'feed__col'; feed.append(d); return d; });
    cards.forEach(place);
  }
  function place(el) {
    let best = cols[0];
    for (const c of cols) if (c.offsetHeight < best.offsetHeight) best = c;
    best.append(el);
  }

  async function load() {
    if (loading || done) return;
    loading = true;
    page++;
    status.textContent = 'Loading more…';
    if (page === 1) feed.innerHTML = news ? skel.lines(6) : `<div class="feed__skel">${skel.feed(9)}</div>`;
    let batch = [];
    try { batch = await api(url(page)); } catch { status.textContent = 'Steam Community did not respond. Scroll to try again.'; page--; loading = false; return; }
    if (!alive.v) return;
    if (page === 1) { feed.innerHTML = ''; cols = []; if (news) feed.classList.add('feed--news'); else layout(); }
    const textOk = window.STPrefs?.get().textPosts !== false || /section=(reviews|guides|discussions|news)/.test(url(page));
    const fresh = batch.filter((c) => { const k = c.url || c.id; if (seen.has(k)) return false; seen.add(k); return textOk || !['review', 'guide', 'discussion'].includes(c.type); });
    if (news) {
      feed.insertAdjacentHTML('beforeend', fresh.map(newsCard).join(''));
      done = true;
    } else {
      fresh.forEach((c, j) => {
        const wrap = document.createElement('div');
        wrap.className = 'feed__item';
        wrap.dataset.k = items.length;
        wrap.style.setProperty('--i', Math.min(j, 7));
        wrap.innerHTML = cardHTML(c, items.length, showGame);
        items.push(c);
        place(wrap);
      });
    }
    if (!fresh.length || page >= 12) done = true;
    status.textContent = done ? (items.length || news ? 'You are all caught up.' : 'Nothing has been shared here yet.') : '';
    loading = false;
  }

  feed.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ugc]');
    if (b) openViewer(items, +b.dataset.ugc, cleanups);
  });
  const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) load(); }, { rootMargin: '1200px 0px' });
  io.observe(sentinel);
  const ro = new ResizeObserver(() => layout());
  ro.observe(feed);
  cleanups.push(() => { io.disconnect(); ro.disconnect(); });
  load();
}

function openViewer(items, start, cleanups) {
  const media = items.map((c, k) => [c, k]).filter(([c]) => c.img && !['review', 'discussion', 'guide'].includes(c.type));
  let pos = Math.max(0, media.findIndex(([, k]) => k === start));
  const lb = $('.lightbox');
  const render = () => {
    const [c] = media[pos];
    const g = db.byId.get(c.appid);
    lb.innerHTML = `<figure class="ugc-view">
      ${c.youtube ? `<iframe src="https://www.youtube-nocookie.com/embed/${esc(c.youtube)}?autoplay=1" title="${esc(c.title || 'Video')}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>` : `<img src="${esc(c.big || c.img)}" alt="${esc(c.title || TYPE_LABEL[c.type] || '')}">`}
      <figcaption>
        <div>${c.title ? `<p class="ugc-view__title">${esc(c.title)}</p>` : ''}<p class="ugc-view__by">${author(c)}${g || c.appName ? ` in <a href="#/community/app/${c.appid}">${esc(c.appName || g.name)}</a>` : ''}</p></div>
        <div class="ugc-view__actions">${c.likes ? `<span class="ugc__stat">${icon('thumb-up', 'i i--sm')}${num(c.likes)}</span>` : ''}<a class="btn btn--ghost btn--sm" href="${esc(c.url)}" target="_blank" rel="noopener">View on Steam Community</a></div>
      </figcaption>
      <div class="ugc-view__comments">${commentsHTML(c.url, c.comments)}</div>
    </figure>
    <button class="media__nav media__nav--prev" type="button" data-lb="-1" aria-label="Previous item">${icon('left')}</button>
    <button class="media__nav media__nav--next" type="button" data-lb="1" aria-label="Next item">${icon('right')}</button>
    <div class="lightbox__bar"><button class="iconbtn" type="button" data-lb-close aria-label="Close viewer">${icon('x')}</button></div>
    <p class="lightbox__count">${pos + 1} of ${media.length}</p>`;
    $$('[data-lb]', lb).forEach((b) => b.addEventListener('click', () => step(+b.dataset.lb)));
    $('[data-lb-close]', lb).addEventListener('click', () => lb.close());
    $$('a[href^="#/"]', lb).forEach((a) => a.addEventListener('click', () => lb.close()));
  };
  const step = (d) => { pos = (pos + d + media.length) % media.length; render(); };
  const onKey = (e) => { if (e.key === 'ArrowRight') { step(1); e.preventDefault(); } if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); } };
  const onClick = (e) => { if (e.target === lb) lb.close(); };
  const onClose = () => { lb.removeEventListener('keydown', onKey); lb.removeEventListener('click', onClick); lb.innerHTML = ''; };
  lb.addEventListener('keydown', onKey);
  lb.addEventListener('click', onClick);
  lb.addEventListener('close', onClose, { once: true });
  render();
  lb.showModal();
  $('[data-lb-close]', lb).focus();
  cleanups.push(() => { if (lb.open) lb.close(); });
}

function mountTabsInk(root, cleanups) {
  const nav = $('.comm-tabs', root);
  const ink = $('.tabs__ink', nav);
  const move = () => { const a = $('[aria-current="page"]', nav); if (a) { ink.style.width = `${a.offsetWidth - 8}px`; ink.style.transform = `translateX(${a.offsetLeft + 4}px)`; } };
  move();
  const ro = new ResizeObserver(move);
  ro.observe(nav);
  cleanups.push(() => ro.disconnect());
}

export function mountCommunity(root, route, cleanups) {
  setAmbient(mostPlayed()[0]?.header);
  mountTabsInk(root, cleanups);
  mountFeed(root, { url: (p) => `/api/community?section=${route.section}&p=${p}`, showGame: true, cleanups });
  api('/api/community/news').then((list) => {
    const el = $('[data-news]', root);
    if (!el) return;
    el.innerHTML = list.slice(0, 6).map((n) => {
      const g = db.byId.get(n.appid);
      return `<a class="news-mini__item" href="${esc(n.url)}" target="_blank" rel="noopener">${g ? `<img src="${g.header}" alt="" loading="lazy" width="80" height="37">` : ''}<span><b>${esc(n.title)}</b><small>${esc(g?.name || '')} · ${esc(ago(n.date * 1000))}</small></span></a>`;
    }).join('') || '<p class="muted">No announcements right now.</p>';
  }).catch(() => { const el = $('[data-news]', root); if (el) el.innerHTML = '<p class="muted">Announcements are unavailable right now.</p>'; });

  const form = $('[data-hub-find]', root);
  const input = $('input', form);
  const dl = $('datalist', form);
  input.addEventListener('input', () => { dl.innerHTML = searchGames(input.value, 8).map((g) => `<option value="${esc(g.name)}">`).join(''); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const g = searchGames(input.value, 1)[0];
    if (g) location.hash = `#/community/app/${g.id}`;
    else toast('No game matches that name');
  });
}

export function mountHub(root, route, g, cleanups) {
  setAmbient(g.header);
  mountTabsInk(root, cleanups);
  mountFeed(root, { url: (p) => `/api/community/app/${g.id}?section=${route.section}&p=${p}`, showGame: false, cleanups, news: route.section === 'news' });
  const f = $('[data-follow]', root);
  f.addEventListener('click', () => {
    const on = toggleFollow(g.id);
    f.setAttribute('aria-pressed', String(on));
    $('span', f).textContent = on ? 'Following' : 'Follow hub';
    toast(on ? `Following the ${g.name} hub` : `Stopped following ${g.name}`);
  });
}

