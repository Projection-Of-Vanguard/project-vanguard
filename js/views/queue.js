import { gameTags } from '../data.js';
import { discoveryQueue, hasHistory } from '../recs.js';
import { state, toggleWish, ignore, markViewed } from '../state.js';
import { $, $$, esc, icon, priceHTML, revHTML, setAmbient, reduceMotion, releaseText, toast, platformsHTML } from '../ui.js';
import { markSource } from '../transition.js';

let queue = [];

export function viewQueue() {
  queue = discoveryQueue(12);
  return `<div class="wrap queue">
    <header class="queue__head reveal" style="--i:0">
      <div><h1>Your discovery queue</h1><p>${hasHistory() ? 'Picked from the games you viewed and saved.' : 'A mix of trending games and hidden gems. Your choices here shape what comes next.'}</p></div>
      <p class="queue__count" data-qcount aria-live="polite"></p>
    </header>
    <div class="queue__bar" aria-hidden="true"><i data-qbar></i></div>
    <div class="queue__stage reveal" style="--i:1" data-qstage></div>
    <div class="queue__controls reveal" style="--i:2" data-qcontrols>
      <button type="button" class="qbtn" data-q="skip">${icon('x')}<span>Not interested</span><kbd>←</kbd></button>
      <button type="button" class="qbtn qbtn--wish" data-q="wish">${icon('heart')}<span>Wishlist</span><kbd>W</kbd></button>
      <button type="button" class="qbtn qbtn--primary" data-q="open">${icon('expand')}<span>View game</span><kbd>Enter</kbd></button>
      <button type="button" class="qbtn" data-q="next">${icon('right')}<span>Next</span><kbd>→</kbd></button>
    </div>
    <div class="queue__done" data-qdone hidden></div>
  </div>`;
}

const cardHTML = (g, depth) => `<article class="qcard" data-depth="${depth}" data-id="${g.id}" data-morph-scope aria-hidden="${depth > 0}">
  <img class="qcard__art" src="${g.hero}" data-fb="${g.capsule}" alt="" data-morph draggable="false">
  <div class="qcard__shade"></div>
  <div class="qcard__body">
    <div class="slide__titlerow"><h2>${esc(g.name)}</h2>${platformsHTML(g)}</div>
    <p class="qcard__desc">${esc(g.short)}</p>
    <div class="slide__meta">${revHTML(g)}<span>${esc(releaseText(g))}</span>${gameTags(g, 4).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>
    <div class="qcard__price">${priceHTML(g, true)}</div>
  </div>
  <span class="qcard__stamp qcard__stamp--wish">Wishlisted</span>
  <span class="qcard__stamp qcard__stamp--skip">Not for me</span>
</article>`;

export function mountQueue(root, cleanups) {
  const stage = $('[data-qstage]', root);
  const count = $('[data-qcount]', root);
  const bar = $('[data-qbar]', root);
  const done = $('[data-qdone]', root);
  const controls = $('[data-qcontrols]', root);
  let i = 0;
  let busy = false;
  const tally = { wish: 0, skip: 0 };

  function render() {
    const left = queue.slice(i, i + 3);
    count.textContent = queue.length ? `${Math.min(i + 1, queue.length)} of ${queue.length}` : '';
    bar.style.transform = `scaleX(${queue.length ? i / queue.length : 1})`;
    if (!left.length) return finish();
    stage.innerHTML = left.map((g, d) => cardHTML(g, d)).reverse().join('');
    setAmbient(left[0].header);
    markViewed(left[0].id);
    bindDrag($(`.qcard[data-depth="0"]`, stage));
  }

  function finish() {
    stage.innerHTML = '';
    controls.hidden = true;
    done.hidden = false;
    done.innerHTML = `<h2>That's your queue</h2><p>You wishlisted ${tally.wish} and passed on ${tally.skip}. The next queue uses what you just told us.</p>
      <div class="queue__done-actions"><button type="button" class="btn btn--primary" data-qagain>Start a new queue</button><a class="btn btn--ghost" href="#/browse/foryou">See all recommendations</a><a class="btn btn--ghost" href="#/browse/wishlist">Open wishlist</a></div>`;
    $('[data-qagain]', done).addEventListener('click', () => { queue = discoveryQueue(12); i = 0; tally.wish = tally.skip = 0; controls.hidden = false; done.hidden = true; render(); });
    count.textContent = 'Done';
    bar.style.transform = 'scaleX(1)';
  }

  function advance(dir, action) {
    if (busy) return;
    const top = $('.qcard[data-depth="0"]', stage);
    const g = queue[i];
    if (!top || !g) return;
    if (action === 'wish') { if (!state.wish.has(g.id)) toggleWish(g.id); tally.wish++; top.classList.add('is-wished'); }
    if (action === 'skip') { ignore(g.id); tally.skip++; top.classList.add('is-skipped'); }
    busy = true;
    const finishStep = () => { busy = false; i++; render(); };
    if (reduceMotion.matches) return finishStep();
    top.style.transition = '';
    top.classList.add(dir < 0 ? 'out-left' : 'out-right');
    $$('.qcard', stage).forEach((c) => { if (c !== top) c.dataset.depth = String(+c.dataset.depth - 1); });
    top.addEventListener('transitionend', finishStep, { once: true });
    setTimeout(() => { if (busy) finishStep(); }, 600);
  }

  function open() {
    const g = queue[i];
    if (!g) return;
    markSource($('.qcard[data-depth="0"]', stage));
    location.hash = `#/app/${g.id}`;
  }

  function act(a) {
    if (a === 'skip') advance(-1, 'skip');
    if (a === 'next') advance(1, 'next');
    if (a === 'wish') { advance(1, 'wish'); toast('Added to your wishlist'); }
    if (a === 'open') open();
  }

  function bindDrag(card) {
    if (!card) return;
    let x0 = null;
    let dx = 0;
    card.addEventListener('pointerdown', (e) => { if (e.button) return; x0 = e.clientX; dx = 0; card.setPointerCapture(e.pointerId); card.style.transition = 'none'; });
    card.addEventListener('pointermove', (e) => {
      if (x0 == null) return;
      dx = e.clientX - x0;
      card.style.transform = `translateX(${dx}px) rotate(${dx / 28}deg)`;
      card.classList.toggle('lean-wish', dx > 70);
      card.classList.toggle('lean-skip', dx < -70);
    });
    const end = () => {
      if (x0 == null) return;
      x0 = null;
      card.style.transition = '';
      card.classList.remove('lean-wish', 'lean-skip');
      if (dx > 120) { card.style.transform = ''; act('wish'); }
      else if (dx < -120) { card.style.transform = ''; act('skip'); }
      else { card.style.transform = ''; if (Math.abs(dx) < 6) open(); }
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  }

  controls.addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) act(b.dataset.q); });
  const onKey = (e) => {
    if (e.target.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'enter' && e.target.closest?.('button, a')) return; // let the focused control handle it
    const map = { arrowleft: 'skip', arrowright: 'next', w: 'wish', enter: 'open' };
    if (map[k] && !controls.hidden) { e.preventDefault(); act(map[k]); }
  };
  document.addEventListener('keydown', onKey);
  cleanups.push(() => document.removeEventListener('keydown', onKey));
  render();
}
