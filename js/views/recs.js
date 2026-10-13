// "Your recommendations": an interactive page. Feedback (More like this / Not interested),
// favourite tags and hidden tags all change the picks immediately.

import { db, tagName, tagId, applyContentFilter } from '../data.js';
import * as R from '../recs.js';
import { state, toggleLiked, ignore, setSeeds, toggleHiddenTag } from '../state.js';
import { $, $$, esc, icon, capHTML, setAmbient, toast, useVT, mountScrollers, scrollBtns, sectionHead } from '../ui.js';

const STARTER = ['Action', 'Adventure', 'RPG', 'Strategy', 'Simulation', 'Casual', 'Indie', 'Co-op', 'Open World', 'Survival', 'Horror',
  'Roguelike', 'Souls-like', 'FPS', 'Racing', 'Sports', 'Puzzle', 'Story Rich', 'Cozy', 'City Builder', 'Sandbox', 'Anime', 'Pixel Graphics',
  'Fantasy', 'Sci-fi', 'Multiplayer', 'Turn-Based Strategy', 'Farming Sim', 'Fighting', 'Platformer'];

function recCard(g, i) {
  const why = R.explain(g);
  return `<div class="rec" data-rec="${g.id}" style="--i:${Math.min(i, 8)};view-transition-name:rec-${g.id};view-transition-class:card">
    ${capHTML(g, { sub: false, why })}
    <div class="rec__actions">
      <button type="button" class="rec__btn" data-rec-like="${g.id}" aria-pressed="${state.liked.has(g.id)}" title="More like this">${icon('thumb-up', 'i i--sm')}<span>More like this</span></button>
      <button type="button" class="rec__btn" data-rec-skip="${g.id}" title="Not interested">${icon('x', 'i i--sm')}<span>Not interested</span></button>
    </div>
  </div>`;
}

function shelfRow(id, title, games, sub = '') {
  if (!games.length) return '';
  return `<section class="section caps" aria-labelledby="h-${id}" data-scroller>
    ${sectionHead(id, title, sub, scrollBtns(title.replace(/<[^>]+>/g, '')))}
    <div class="scroller"><div class="scroller__track">${games.map((g) => capHTML(g, { why: R.explain(g) })).join('')}</div><div class="dots" aria-hidden="true"></div></div>
  </section>`;
}

function onboarding() {
  const tags = STARTER.map((n) => tagId(n)).filter((id) => id && db.tagCount.get(id));
  return `<section class="rec-onboard reveal" style="--i:1" aria-labelledby="h-onboard">
    <h2 id="h-onboard">What do you like to play?</h2>
    <p>Pick three or more. Your picks start your recommendations, and everything you open, wishlist or rate afterwards sharpens them.</p>
    <div class="tag-picker" role="group" aria-label="Favourite tags">${tags.map((id) => `<button type="button" class="tag-pick" aria-pressed="${state.seeds.includes(id)}" data-seed="${id}">${esc(tagName(id))}</button>`).join('')}</div>
    <button type="button" class="btn btn--primary" data-seed-save disabled>Show my recommendations</button>
  </section>`;
}

function body() {
  if (!R.hasHistory()) return onboarding();
  const taste = R.tasteProfile(14);
  const top = R.forYou(24);
  const anchors = R.anchors(3);
  const now = Date.now();
  return `<section class="taste reveal" style="--i:1" aria-labelledby="h-taste">
      <div class="taste__head"><div><h2 id="h-taste">Your taste</h2><p>Built from what you liked, wishlisted, own and opened. Tap a tag to boost it, or hide it from the whole store.</p></div>
        <button type="button" class="btn btn--ghost btn--sm" data-edit-seeds>${icon('sliders', 'i i--sm')}Pick favourite tags</button></div>
      <ul class="taste__tags">${taste.map((t, i) => `<li class="taste-tag" style="--w:${Math.round(t.weight * 100)}%;--i:${i}">
        <button type="button" class="taste-tag__boost" data-boost="${t.id}" aria-pressed="${state.seeds.includes(t.id)}" title="Boost ${esc(tagName(t.id))}">${esc(tagName(t.id))}</button>
        <button type="button" class="taste-tag__hide" data-hide-tag="${t.id}" aria-label="Hide ${esc(tagName(t.id))} games from the store" title="Hide ${esc(tagName(t.id))} games">${icon('eye-off', 'i i--sm')}</button>
        <span class="taste-tag__bar" aria-hidden="true"></span></li>`).join('')}</ul>
      ${state.hiddenTags.size ? `<p class="taste__hidden">Hidden from the store: ${[...state.hiddenTags].map((t) => `<button type="button" class="chip" data-unhide="${t}">${esc(tagName(t))} ${icon('x', 'i i--sm')}</button>`).join(' ')}</p>` : ''}
    </section>
    <section class="section reveal" style="--i:2" aria-labelledby="h-top">
      ${sectionHead('top', 'Top picks for you', 'Each pick says why it is here. Rate a few to tune the list instantly.')}
      <div class="rec-grid" data-rec-grid>${top.map(recCard).join('')}</div>
    </section>
    ${anchors.map((a, k) => shelfRow(`because-${k}`, `Because you looked at <a class="inline-link" href="#/app/${a.id}">${esc(a.name)}</a>`, R.similar(a, 14, { exclude: new Set([...state.viewed.map((v) => v.id), ...state.owned]) }))).join('')}
    ${shelfRow('sale', 'On sale and up your alley', R.forYouWhere((g) => g.disc > 0, 18), 'Discounts on games that match your taste')}
    ${shelfRow('new', 'New releases for you', R.forYouWhere((g) => !g.coming && g.release && now - g.release < 120 * 864e5, 18))}
    ${shelfRow('gems', 'Hidden gems for you', R.forYouWhere((g) => g.pct >= 90 && g.reviews >= 200 && g.reviews <= 15000, 18), 'Very well reviewed, not yet everywhere')}
    ${shelfRow('soon', 'Coming soon that you might want', R.forYouWhere((g) => g.coming, 12))}`;
}

export function viewRecs() {
  return `<div class="wrap recs">
    <header class="recs__head reveal" style="--i:0"><h1>Your recommendations</h1>
      <p>Personal picks from ${db.games.length.toLocaleString('en-US')} games. Nothing leaves this device.</p></header>
    <div data-recs-body>${body()}</div>
  </div>`;
}

export function mountRecs(root, cleanups) {
  const box = $('[data-recs-body]', root);
  const refresh = (animate = true) => {
    const apply = () => { box.innerHTML = body(); mountScrollers(box, cleanups); };
    if (animate && useVT()) document.startViewTransition(apply); else apply();
  };
  const first = R.forYou(1)[0];
  if (first) setAmbient(first.header);
  mountScrollers(box, cleanups);

  box.addEventListener('click', (e) => {
    const t = e.target;
    const like = t.closest('[data-rec-like]');
    if (like) {
      const id = +like.dataset.recLike;
      const on = toggleLiked(id);
      toast(on ? `Got it. More like ${db.byId.get(id)?.name}` : 'Removed that signal');
      return refresh();
    }
    const skip = t.closest('[data-rec-skip]');
    if (skip) {
      const id = +skip.dataset.recSkip;
      ignore(id);
      applyContentFilter();
      const card = skip.closest('.rec');
      card?.classList.add('is-leaving');
      toast(`You won't see ${db.byId.get(id)?.name} again`, { label: 'Undo', fn: async () => { const { unignore } = await import('../state.js'); unignore(id); applyContentFilter(); refresh(); } });
      return setTimeout(() => refresh(), 260);
    }
    const boost = t.closest('[data-boost]');
    if (boost) {
      const id = +boost.dataset.boost;
      setSeeds(state.seeds.includes(id) ? state.seeds.filter((x) => x !== id) : [...state.seeds, id]);
      return refresh();
    }
    const hide = t.closest('[data-hide-tag]');
    if (hide) {
      const id = +hide.dataset.hideTag;
      toggleHiddenTag(id);
      applyContentFilter();
      toast(`${tagName(id)} games are now hidden from the store`, { label: 'Undo', fn: () => { toggleHiddenTag(id); applyContentFilter(); refresh(); } });
      return refresh();
    }
    const unhide = t.closest('[data-unhide]');
    if (unhide) { toggleHiddenTag(+unhide.dataset.unhide); applyContentFilter(); return refresh(); }
    if (t.closest('[data-edit-seeds]')) { box.innerHTML = onboarding(); syncSave(); return; }
    const seed = t.closest('[data-seed]');
    if (seed) { seed.setAttribute('aria-pressed', String(seed.getAttribute('aria-pressed') !== 'true')); return syncSave(); }
    if (t.closest('[data-seed-save]')) {
      setSeeds($$('[data-seed][aria-pressed="true"]', box).map((b) => +b.dataset.seed));
      toast('Recommendations updated');
      return refresh();
    }
  });
  function syncSave() {
    const n = $$('[data-seed][aria-pressed="true"]', box).length;
    const btn = $('[data-seed-save]', box);
    if (btn) { btn.disabled = n < 3; btn.textContent = n < 3 ? `Pick ${3 - n} more` : 'Show my recommendations'; }
  }
  syncSave();
}
