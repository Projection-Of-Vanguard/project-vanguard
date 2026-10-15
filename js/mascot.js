// Vanguard, the mascot: a little cloud-headed robot in the corner of the store. Click it and a
// question box pops out; it turns its head to the box and watches you type, its eyes following
// the text. Asking takes you to AI chat (js/views/chat.js) with the answer from the connected AI.

import { icon } from './ui.js';

let uid = 0;
/** The robot as an SVG. Parts animate through CSS classes on the root (.vg). */
export function mascotSVG(cls = '') {
  const n = ++uid;
  const id = (s) => `vg${n}-${s}`;
  return `<svg class="vg ${cls}" viewBox="0 0 120 150" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="${id('cloud')}" cx="38%" cy="28%" r="80%"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#e8f0fc"/><stop offset="1" stop-color="#c5d7f2"/></radialGradient>
    <linearGradient id="${id('blue')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d9cf2"/><stop offset="1" stop-color="#2c68d2"/></linearGradient>
    <linearGradient id="${id('body')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d3e1f5"/></linearGradient>
    <linearGradient id="${id('visor')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2026"/><stop offset="1" stop-color="#0d0e11"/></linearGradient>
    <filter id="${id('glow')}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <ellipse class="vg__shadow" cx="60" cy="146" rx="21" ry="3.4"/>
  <g class="vg__all">
    <g class="vg__body">
      <path d="M43 99q-10 5-12 17" stroke="url(#${id('blue')})" stroke-width="10" stroke-linecap="round" fill="none"/>
      <path d="M77 99q10 5 12 17" stroke="url(#${id('blue')})" stroke-width="10" stroke-linecap="round" fill="none"/>
      <circle cx="31" cy="118" r="6.5" fill="url(#${id('blue')})"/><circle cx="89" cy="118" r="6.5" fill="url(#${id('blue')})"/>
      <rect x="46.5" y="122" width="11" height="15" rx="4.5" fill="url(#${id('body')})"/><rect x="62.5" y="122" width="11" height="15" rx="4.5" fill="url(#${id('body')})"/>
      <rect x="45.5" y="132" width="13" height="8" rx="3.5" fill="url(#${id('blue')})"/><rect x="61.5" y="132" width="13" height="8" rx="3.5" fill="url(#${id('blue')})"/>
      <rect x="40" y="88" width="40" height="40" rx="16" fill="url(#${id('body')})"/>
      <path d="M40 101a12 12 0 0 1 7-11M80 101a12 12 0 0 0-7-11" stroke="url(#${id('blue')})" stroke-width="5" stroke-linecap="round" fill="none"/>
      <g class="vg__emblem" fill="none" stroke="#2c68d2" stroke-linecap="round"><circle cx="60" cy="109" r="9" stroke-width="2"/><path d="M54.5 112.8l5.6-4.4" stroke-width="2"/><circle cx="62.8" cy="105.9" r="2.8" stroke-width="1.8"/><circle cx="54.3" cy="112.9" r="1.4" fill="#2c68d2" stroke="none"/></g>
    </g>
    <g class="vg__head">
      <g class="vg__rim" fill="url(#${id('blue')})">
        <circle cx="63" cy="55" r="30"/><circle cx="40" cy="47" r="17"/><circle cx="87" cy="47" r="17"/><circle cx="49" cy="31" r="17"/><circle cx="75" cy="29" r="18"/><circle cx="33" cy="65" r="15"/><circle cx="93" cy="65" r="15"/><ellipse cx="63" cy="73" rx="33" ry="15"/>
      </g>
      <g class="vg__cloud" fill="url(#${id('cloud')})">
        <circle cx="60" cy="52" r="30"/><circle cx="37" cy="44" r="17"/><circle cx="83" cy="44" r="17"/><circle cx="46" cy="28" r="17"/><circle cx="72" cy="26" r="18"/><circle cx="30" cy="62" r="15"/><circle cx="90" cy="62" r="15"/><ellipse cx="60" cy="70" rx="33" ry="15"/>
      </g>
      <rect class="vg__visor" x="30" y="41" width="60" height="37" rx="13" fill="url(#${id('visor')})"/>
      <path d="M38 45h44" stroke="rgba(255,255,255,.08)" stroke-width="2.5" stroke-linecap="round"/>
      <g class="vg__face" filter="url(#${id('glow')})" stroke="#93d2ff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <g class="vg__eyes"><path d="M42 52l9 7.5-9 7.5"/><path d="M63 66.5h15"/></g>
        <g class="vg__happy"><path d="M41 63l6-6 6 6"/><path d="M66 63l6-6 6 6"/></g>
        <g class="vg__dots" fill="#93d2ff" stroke="none"><circle cx="47" cy="60" r="3.2"/><circle cx="60" cy="60" r="3.2"/><circle cx="73" cy="60" r="3.2"/></g>
      </g>
    </g>
  </g>
</svg>`;
}

/** Eyes follow the text: -1 (start of the box) to 0 (end), from the caret position. */
export function follow(box, svg) {
  const len = Math.max(1, box.value.length);
  const caret = box.selectionStart ?? len;
  const look = -1 + Math.min(1, caret / Math.max(24, len));
  svg.style.setProperty('--look', look.toFixed(3));
  svg.classList.remove('is-typing'); void svg.getBoundingClientRect(); svg.classList.add('is-typing');
}

/* ------------------------------------------------------- the corner helper */
const ASK_KEY = 'vg-ask';
let widget = null;

function open(force) {
  if (!widget) return;
  const show = force ?? widget.dataset.open !== 'true';
  widget.dataset.open = String(show);
  const form = widget.querySelector('.vgw__ask');
  const svg = widget.querySelector('.vg');
  widget.querySelector('.vgw__bot').setAttribute('aria-expanded', String(show));
  form.hidden = !show;
  svg.classList.toggle('is-watching', show);
  widget.querySelector('.vgw__hello')?.remove();
  if (show) { const box = form.querySelector('textarea'); setTimeout(() => { box.focus(); follow(box, svg); }, 60); }
}

function build() {
  widget = document.createElement('div');
  widget.className = 'vgw';
  widget.dataset.open = 'false';
  widget.innerHTML = `<form class="vgw__ask" hidden>
      <label class="vgw__label" for="vgw-q">Ask Vanguard</label>
      <textarea id="vgw-q" rows="2" maxlength="600" placeholder="What should I play this weekend?" autocomplete="off"></textarea>
      <div class="vgw__row"><span class="vgw__hint">Enter to ask · Shift + Enter for a new line</span><button type="submit" class="btn btn--primary btn--sm">${icon('sparkles', 'i i--sm')}Ask</button></div>
    </form>
    <button type="button" class="vgw__bot" aria-expanded="false" aria-controls="vgw-q" aria-label="Ask Vanguard, the AI helper" title="Ask Vanguard">${mascotSVG()}</button>`;
  document.body.append(widget);
  const form = widget.querySelector('.vgw__ask');
  const box = form.querySelector('textarea');
  const svg = widget.querySelector('.vg');
  widget.querySelector('.vgw__bot').addEventListener('click', () => open());
  box.addEventListener('input', () => follow(box, svg));
  box.addEventListener('keyup', (e) => { if (/Arrow|Home|End/.test(e.key)) follow(box, svg); });
  box.addEventListener('click', () => follow(box, svg));
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
    if (e.key === 'Escape') { e.stopPropagation(); open(false); widget.querySelector('.vgw__bot').focus(); }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = box.value.trim();
    if (!q) { box.focus(); return; }
    try { sessionStorage.setItem(ASK_KEY, q); } catch { /* storage off */ }
    svg.classList.add('is-thinking');
    box.value = '';
    setTimeout(() => { open(false); svg.classList.remove('is-thinking'); location.hash = '#/chat'; }, 320);
  });
  document.addEventListener('pointerdown', (e) => { if (widget?.dataset.open === 'true' && !widget.contains(e.target)) open(false); });
  // Say hello once, the first time someone sees it
  let seen = false;
  try { seen = localStorage.getItem('vg-hello') === '1'; localStorage.setItem('vg-hello', '1'); } catch { /* storage off */ }
  if (!seen) {
    const hello = document.createElement('p');
    hello.className = 'vgw__hello';
    hello.textContent = "Hi, I'm Vanguard! Click me to ask about games.";
    widget.append(hello);
    setTimeout(() => hello.remove(), 9000);
  }
}

/** Show the helper when it's on in Settings, except on the chat page (which has its own). */
function sync() {
  const on = window.STPrefs?.get().mascot !== false && !location.hash.startsWith('#/chat');
  if (on && !widget) build();
  if (widget) widget.hidden = !on;
  if (!on) open(false);
}

export function initMascot() {
  sync();
  window.addEventListener('hashchange', sync);
  window.addEventListener('prefs', (e) => { if (!e.detail || 'mascot' in e.detail) sync(); });
}

/** The question asked from the corner helper, once. */
export function takeAsked() {
  try { const q = sessionStorage.getItem(ASK_KEY); sessionStorage.removeItem(ASK_KEY); return q; } catch { return null; }
}
