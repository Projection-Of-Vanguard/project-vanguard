import { db, tagName, searchGames } from '../data.js';
import * as R from '../recs.js';
import { state } from '../state.js';
import { $, $$, esc, icon, capHTML, setAmbient, useVT } from '../ui.js';

const PAGE = 36;
const byRank = (a, b) => (a.ts || 9999) - (b.ts || 9999);

const LISTS = {
  all: ['All games', `The ${0} most popular games on Steam right now`, () => [...db.games].sort(byRank)],
  top: ['Top sellers', 'What players are buying right now', R.topSellers],
  new: ['New & trending', 'Recent releases that are taking off', R.newPopular],
  newest: ['New releases', 'Newest first', R.newReleases],
  trending: ['Trending', 'Climbing the charts this week', R.trending],
  specials: ['Specials', 'Every discount running right now', R.specials],
  discounts: ['Deep discounts', 'Well-reviewed games at 70% off or more', () => R.bigDiscounts(70)],
  ending: ['Deals ending soon', 'Last chance on these discounts', R.endingSoon],
  mostplayed: ['Most played', 'Ranked by live player counts from Steam', R.mostPlayed],
  upcoming: ['Popular upcoming', 'The most wishlisted games that are not out yet', R.upcoming],
  free: ['Free to play', 'Jump in without paying a cent', R.freeToPlay],
  toprated: ['Top rated', 'The highest share of positive player reviews', R.topRated],
  gems: ['Hidden gems', 'Loved by players, not yet everywhere', R.hiddenGems],
  deck: ['Steam Deck verified', 'Great on the go', R.deckVerified],
  foryou: ['Recommended for you', 'Based on what you viewed, wishlisted and added to your cart', () => R.forYou(120)],
  viewed: ['Recently viewed', 'Games you looked at on this device', () => R.recentlyViewed(40)],
  wishlist: ['Your wishlist', 'Games you saved for later', () => [...state.wish].map((id) => db.byId.get(id)).filter(Boolean)],
  added: ['Just added', 'Games that recently entered the popular catalog', R.justAdded],
  'under-5': ['Under $5', 'Great games for less than a coffee', () => R.underPrice(500)],
  'under-10': ['Under $10', 'Great games for less than lunch', () => R.underPrice(1000)],
  'under-20': ['Under $20', 'Big games, small prices', () => R.underPrice(2000)],
};

function resolve(route) {
  if (route.name === 'search') return { title: `Results for “${route.q}”`, sub: '', items: searchGames(route.q, 400), slug: 'search' };
  if (route.name === 'tag') return { title: `${tagName(route.id) || 'Tagged'} games`, sub: `${db.tagCount.get(route.id) || 0} popular games with this tag`, items: R.byTag(route.id), slug: 'tag', tag: route.id };
  const [title, sub, fn] = LISTS[route.slug] || LISTS.all;
  return { title, sub: route.slug === 'all' || !LISTS[route.slug] ? `The ${db.games.length.toLocaleString('en-US')} most popular games on Steam right now` : sub, items: fn(), slug: route.slug };
}

export function browseTitle(route) { return resolve(route).title; }

export function viewBrowse(route) {
  const L = resolve(route);
  const counts = new Map();
  L.items.forEach((g) => g.tags.slice(0, 6).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  const tags = [...counts].filter(([t]) => t !== L.tag && tagName(t)).sort((a, b) => b[1] - a[1]).slice(0, 14);
  return `<div class="wrap browse">
    <div class="browse__head reveal" style="--i:0">
      <div><h1>${esc(L.title)}</h1>${L.sub ? `<p>${esc(L.sub)}</p>` : ''}</div>
      <button type="button" class="btn btn--ghost btn--sm filters-toggle" data-filters-toggle aria-expanded="false" aria-controls="filters">${icon('sliders', 'i i--sm')}Filters</button>
    </div>
    <div class="browse__body reveal" style="--i:1">
      <form class="filters" id="filters" aria-label="Filter results">
        ${tags.length ? `<fieldset><legend>Tags</legend>${tags.map(([t, n]) => `<label class="check"><input type="checkbox" name="tag" value="${t}">${esc(tagName(t))}<small>${n}</small></label>`).join('')}</fieldset>` : ''}
        <fieldset><legend><label for="maxp">Maximum price</label></legend><input class="range" id="maxp" name="max" type="range" min="5" max="70" step="5" value="70"><div class="range-out"><span>$5</span><output for="maxp" data-maxout>Any price</output></div></fieldset>
        <fieldset><legend><label for="minr">Player reviews</label></legend><select class="select" id="minr" name="minr"><option value="0">Any rating</option><option value="70">70% positive or more</option><option value="80">80% positive or more</option><option value="90">90% positive or more</option></select></fieldset>
        <fieldset><legend>Show only</legend>
          <label class="check"><input type="checkbox" name="sale">On sale</label>
          <label class="check"><input type="checkbox" name="free">Free to play</label>
          <label class="check"><input type="checkbox" name="deck">Steam Deck verified</label>
          <label class="check"><input type="checkbox" name="mac">Runs on macOS</label>
          <label class="check"><input type="checkbox" name="linux">Runs on SteamOS and Linux</label>
          <label class="check"><input type="checkbox" name="released">Hide upcoming games</label>
        </fieldset>
        <button type="reset" class="btn btn--ghost btn--sm">Clear filters</button>
      </form>
      <div>
        <div class="toolbar">
          <span data-count aria-live="polite"></span>
          <div class="toolbar__right">
            <label class="mini-search">${icon('search', 'i i--sm')}<span class="sr-only">Filter by name</span><input type="search" data-q placeholder="Filter by name"></label>
            <label>Sort by <select class="select" data-sort>
              <option value="rel">Relevance</option><option value="top">Top sellers</option><option value="players">Most players</option><option value="new">Release date</option><option value="rev">User reviews</option>
              <option value="pa">Lowest price</option><option value="pd">Highest price</option><option value="disc">Biggest discount</option>
            </select></label>
          </div>
        </div>
        <div class="results" data-results></div>
        <div class="sentinel" data-sentinel aria-hidden="true"></div>
      </div>
    </div>
  </div>`;
}

export function mountBrowse(root, route, cleanups) {
  const L = resolve(route);
  const form = $('#filters', root);
  const out = $('[data-results]', root);
  const count = $('[data-count]', root);
  const sortSel = $('[data-sort]', root);
  const qInput = $('[data-q]', root);
  const maxOut = $('[data-maxout]', root);
  const sentinel = $('[data-sentinel]', root);
  setAmbient((L.items[0] || db.games[0])?.header);
  const def = window.STPrefs?.get().defaultSort;
  if (def && def !== 'rel' && [...sortSel.options].some((o) => o.value === def)) sortSel.value = def;
  let list = [];
  let shown = 0;

  function filtered() {
    const fd = new FormData(form);
    const tags = fd.getAll('tag').map(Number);
    const max = +fd.get('max');
    const minr = +fd.get('minr');
    const q = qInput.value.trim().toLowerCase();
    maxOut.textContent = max >= 70 ? 'Any price' : `$${max}`;
    let items = L.items.filter((g) => (!tags.length || tags.every((t) => g.tags.includes(t)))
      && (max >= 70 || g.effPrice <= max * 100)
      && (!minr || (g.pct >= minr && g.reviews >= 10))
      && (!fd.get('sale') || g.disc > 0)
      && (!fd.get('free') || g.free)
      && (!fd.get('deck') || g.deck === 3)
      && (!fd.get('mac') || g.plat & 2)
      && (!fd.get('linux') || g.plat & 4)
      && (!fd.get('released') || !g.coming)
      && (!q || g.lname.includes(q)));
    const p = (g) => (g.effPrice === Infinity ? 1e9 : g.effPrice);
    const sorts = {
      top: byRank, players: (a, b) => (b.players || 0) - (a.players || 0), new: (a, b) => b.release - a.release, rev: (a, b) => b.quality - a.quality,
      pa: (a, b) => p(a) - p(b), pd: (a, b) => p(b) - p(a), disc: (a, b) => b.disc - a.disc,
    };
    if (sorts[sortSel.value]) items = [...items].sort(sorts[sortSel.value]);
    return items;
  }

  const empty = () => (L.slug === 'wishlist' && !L.items.length
    ? '<div class="empty"><h2>Your wishlist is empty</h2><p>Tap the heart on any game to save it here and get a nudge when it goes on sale.</p><a class="btn btn--primary" href="#/browse/specials">Browse specials</a></div>'
    : L.slug === 'viewed' && !L.items.length
      ? '<div class="empty"><h2>Nothing viewed yet</h2><p>Games you open show up here, and they shape your recommendations.</p><a class="btn btn--primary" href="#/browse/top">Browse top sellers</a></div>'
      : '<div class="empty"><h2>No games match these filters</h2><p>Try removing a tag, raising the maximum price or clearing the name filter.</p><button type="button" class="btn btn--primary" data-clear>Clear filters</button></div>');

  function apply() {
    list = filtered();
    shown = Math.min(PAGE, list.length);
    count.textContent = `${list.length.toLocaleString('en-US')} ${list.length === 1 ? 'game' : 'games'}`;
    out.innerHTML = list.length ? list.slice(0, shown).map((g) => capHTML(g, { vt: true })).join('') : empty();
  }
  function more() {
    if (shown >= list.length) return;
    const next = list.slice(shown, shown + PAGE);
    shown += next.length;
    out.insertAdjacentHTML('beforeend', next.map((g, k) => capHTML(g).replace('<article class="cap', `<article style="--i:${Math.min(k, 6)}" class="is-new cap`)).join(''));
  }
  const update = () => (useVT() ? document.startViewTransition(apply) : apply());
  form.addEventListener('change', update);
  form.addEventListener('input', (e) => { if (e.target.type === 'range') maxOut.textContent = +e.target.value >= 70 ? 'Any price' : `$${e.target.value}`; });
  form.addEventListener('reset', () => setTimeout(update));
  form.addEventListener('submit', (e) => e.preventDefault());
  sortSel.addEventListener('change', update);
  let qt = 0;
  qInput.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(apply, 120); });
  out.addEventListener('click', (e) => { if (e.target.closest('[data-clear]')) { form.reset(); qInput.value = ''; } });
  const tog = $('[data-filters-toggle]', root);
  tog.addEventListener('click', () => { const on = form.classList.toggle('is-open'); tog.setAttribute('aria-expanded', String(on)); });

  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) more(); }, { rootMargin: '900px 0px' });
  io.observe(sentinel);
  cleanups.push(() => io.disconnect());
  apply();
}

