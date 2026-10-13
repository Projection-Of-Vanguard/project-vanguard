// Side-by-side comparison of up to four games, plus the floating compare tray.

import { db, gameTags, searchGames } from '../data.js';
import { state, toggleCompare, onChange } from '../state.js';
import { $, esc, icon, num, priceHTML, revHTML, platformsHTML, deckHTML, releaseText, cartBtn, setAmbient } from '../ui.js';

const ROWS = [
  ['Price', (g) => priceHTML(g)],
  ['Lowest recorded', (g) => (g.lowest != null ? `$${(g.lowest / 100).toFixed(2)}` : g.free ? 'Free' : '—')],
  ['Player reviews', (g) => `${revHTML(g)}<br><span class="muted">${g.reviews >= 10 ? `${g.pct}% of ${num(g.reviews)}` : ''}</span>`],
  ['Playing now', (g) => (g.players != null ? `<span class="live">${num(g.players)}</span>` : '—')],
  ['24-hour peak', (g) => (g.peak != null ? num(g.peak) : '—')],
  ['Released', (g) => esc(releaseText(g) || '—')],
  ['Platforms', (g) => platformsHTML(g, { deck: false }) || '—'],
  ['Steam Deck', (g) => deckHTML(g) || '<span class="muted">Unknown</span>'],
  ['Developer', (g) => esc(g.dev.join(', ') || '—')],
  ['Tags', (g) => gameTags(g, 6).map((t) => `<span class="chip">${esc(t)}</span>`).join(' ')],
];

export function viewCompare() {
  const games = state.compare.map((id) => db.byId.get(id)).filter(Boolean);
  return `<div class="wrap compare">
    <header class="recs__head reveal" style="--i:0"><h1>Compare games</h1><p>Up to four games side by side. Add games from their pages or with the search below.</p></header>
    <form class="compare__add reveal" style="--i:1" data-compare-add role="search">
      <label class="sr-only" for="cmp-q">Add a game to compare</label>
      ${icon('plus', 'i i--sm')}<input id="cmp-q" list="cmp-list" placeholder="Add a game" autocomplete="off"${games.length >= 4 ? ' disabled' : ''}>
      <datalist id="cmp-list"></datalist>
    </form>
    ${games.length ? `<div class="compare__scroll reveal" style="--i:2"><table class="compare__table">
      <thead><tr><th scope="col"><span class="sr-only">Detail</span></th>${games.map((g) => `<th scope="col"><a href="#/app/${g.id}" class="compare__game"><img src="${g.header}" alt="" width="460" height="215"><span>${esc(g.name)}</span></a>
        <button type="button" class="iconbtn" data-cmp-remove="${g.id}" aria-label="Remove ${esc(g.name)} from the comparison">${icon('x')}</button></th>`).join('')}</tr></thead>
      <tbody>${ROWS.map(([label, fn]) => `<tr><th scope="row">${label}</th>${games.map((g) => `<td>${fn(g)}</td>`).join('')}</tr>`).join('')}
        <tr><th scope="row"><span class="sr-only">Buy</span></th>${games.map((g) => `<td>${cartBtn(g, 'btn btn--primary btn--sm')}</td>`).join('')}</tr></tbody>
    </table></div>` : '<div class="empty reveal" style="--i:2"><h2>Nothing to compare yet</h2><p>Open any game and press Compare, or add one with the search above.</p><a class="btn btn--primary" href="#/browse/top">Browse top sellers</a></div>'}
  </div>`;
}

export function mountCompare(root, cleanups, rerender) {
  const games = state.compare.map((id) => db.byId.get(id)).filter(Boolean);
  if (games[0]) setAmbient(games[0].header);
  const form = $('[data-compare-add]', root);
  const input = $('input', form);
  const dl = $('datalist', form);
  input.addEventListener('input', () => { dl.innerHTML = searchGames(input.value, 8).map((g) => `<option value="${esc(g.name)}">`).join(''); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const g = searchGames(input.value, 1)[0];
    if (g && !state.compare.includes(g.id)) { toggleCompare(g.id); rerender(); }
  });
  input.addEventListener('change', () => form.requestSubmit());
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmp-remove]');
    if (b) { toggleCompare(+b.dataset.cmpRemove); rerender(); }
  });
}

/** The floating tray that shows what is queued for comparison. */
export function initCompareTray() {
  const tray = $('.compare-tray');
  const draw = () => {
    const games = state.compare.map((id) => db.byId.get(id)).filter(Boolean);
    const onPage = location.hash.startsWith('#/compare');
    tray.hidden = !games.length || onPage;
    tray.innerHTML = `${games.map((g) => `<img src="${g.header}" alt="${esc(g.name)}" title="${esc(g.name)}" width="92" height="43">`).join('')}
      <a class="btn btn--primary btn--sm" href="#/compare">${icon('scale', 'i i--sm')}Compare ${games.length}</a>
      <button type="button" class="iconbtn" data-cmp-clear aria-label="Clear the comparison">${icon('x')}</button>`;
  };
  tray.addEventListener('click', (e) => { if (e.target.closest('[data-cmp-clear]')) { [...state.compare].forEach((id) => toggleCompare(id)); } });
  onChange((what) => { if (what === 'compare') draw(); });
  window.addEventListener('hashchange', draw);
  draw();
}
