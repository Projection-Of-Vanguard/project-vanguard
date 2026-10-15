// AI chat with Vanguard, the mascot (#/chat). Answers come from the AI connected in Settings > AI.
// Game titles the AI writes as [[Title]] become links, with cards for the games in this store.

import { db, norm, searchGames } from '../data.js';
import { askVanguard, aiConnected } from '../ai.js';
import { $, esc, icon, capHTML, toast } from '../ui.js';
import { mascotSVG, follow, takeAsked } from '../mascot.js';
import { openSettings } from '../settings.js';

const STORE = 'st-chat';
const SUGGESTIONS = ['What should I play this weekend?', 'Cozy games to play with a friend', 'Games like Hollow Knight', 'A short story game for one evening', 'What is a roguelite?'];
const load = () => { try { const m = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(m) ? m.filter((x) => x && typeof x.content === 'string') : []; } catch { return []; } };
const save = (msgs) => { try { localStorage.setItem(STORE, JSON.stringify(msgs.slice(-30))); } catch { /* storage off */ } };

/** A game the AI named, if it's in this store's catalog. */
function findGame(title) {
  const n = norm(title);
  if (!n) return null;
  const exact = db.all.find((g) => norm(g.name) === n);
  if (exact) return exact;
  const [hit] = searchGames(title, 1);
  return hit && (norm(hit.name).startsWith(n) || n.startsWith(norm(hit.name))) ? hit : null;
}

/** The AI's plain text, made safe and readable: paragraphs, "- " lists, **bold**, [[game]] links. */
function render(text) {
  const games = [];
  const inline = (s) => esc(s)
    .replace(/\*\*([^*]{1,120})\*\*/g, '<b>$1</b>')
    .replace(/\[\[([^\]]{1,120})\]\]/g, (m, t) => {
      const g = findGame(t.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
      if (!g) return `<b>${t}</b>`;
      if (!games.includes(g)) games.push(g);
      return `<a class="chat__game" href="#/app/${g.id}">${esc(g.name)}</a>`;
    });
  const html = String(text).trim().split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>`).join('')}</ul>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
  return { html, games };
}

function messageHTML(m, i) {
  if (m.role === 'user') return `<div class="chat__msg chat__msg--me" style="--i:${i}"><div class="chat__bubble">${esc(m.content).replace(/\n/g, '<br>')}</div></div>`;
  const { html, games } = render(m.content);
  return `<div class="chat__msg chat__msg--bot" style="--i:${i}"><div class="chat__avatar">${mascotSVG('vg--sm')}</div><div class="chat__bubble">${html}
    ${games.length ? `<div class="chat__games">${games.slice(0, 6).map((g) => capHTML(g, { sub: false })).join('')}</div>` : ''}</div></div>`;
}

export function viewChat() {
  return `<div class="wrap chat">
    <header class="chat__head reveal" style="--i:0">
      <div class="chat__who">${mascotSVG('vg--sm')}<div><h1>AI chat with Vanguard</h1><p data-chat-model>Ask about games: what to play, what's similar, how something works.</p></div></div>
      <button type="button" class="btn btn--ghost btn--sm" data-chat-new>${icon('plus', 'i i--sm')}New chat</button>
    </header>
    <div class="chat__log" data-chat-log aria-live="polite"></div>
    <form class="chat__composer reveal" style="--i:1" data-chat-form>
      <div class="chat__perch">${mascotSVG('vg--perch is-watching')}</div>
      <label class="sr-only" for="chat-q">Your message to Vanguard</label>
      <textarea id="chat-q" rows="1" maxlength="2000" placeholder="Ask Vanguard anything about games" autocomplete="off"></textarea>
      <button type="submit" class="chat__send" aria-label="Send">${icon('right')}</button>
    </form>
    <p class="chat__fine">Answers come from the free AI you connected, and can be wrong. Prices and player counts on each game's page are live.</p>
  </div>`;
}

export function mountChat(root, cleanups) {
  const log = $('[data-chat-log]', root);
  const form = $('[data-chat-form]', root);
  const box = $('#chat-q', root);
  const perch = $('.chat__perch .vg', root);
  const alive = { v: true };
  cleanups.push(() => { alive.v = false; });
  let msgs = load();
  let busy = false;
  // Scroll to the end of the chat, where the message box sits below the conversation (not over it)
  const toEnd = () => requestAnimationFrame(() => $('.chat__fine', root).scrollIntoView({ block: 'end', behavior: 'smooth' }));

  const draw = () => {
    if (!msgs.length) {
      log.innerHTML = `<div class="chat__empty"><p>Hi! I'm Vanguard. Ask me anything about games, or start with one of these:</p>
        <div class="chat__chips">${SUGGESTIONS.map((s) => `<button type="button" class="chat__chip" data-chat-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
      return;
    }
    log.innerHTML = msgs.map(messageHTML).join('');
    toEnd();
  };
  const thinking = () => {
    log.insertAdjacentHTML('beforeend', `<div class="chat__msg chat__msg--bot" data-chat-wait><div class="chat__avatar">${mascotSVG('vg--sm is-thinking')}</div><div class="chat__bubble chat__bubble--wait"><span class="chat__dots"><i></i><i></i><i></i></span>Vanguard is thinking…</div></div>`);
    toEnd();
  };

  async function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    if (!(await aiConnected().catch(() => false))) { connectPrompt(text); return; }
    busy = true;
    form.classList.add('is-busy');
    perch.classList.add('is-thinking');
    msgs.push({ role: 'user', content: text });
    save(msgs);
    draw();
    thinking();
    try {
      const { reply, model } = await askVanguard(msgs.map(({ role, content }) => ({ role, content })));
      if (!alive.v) return;
      msgs.push({ role: 'assistant', content: reply });
      save(msgs);
      if (model) $('[data-chat-model]', root).textContent = `Answers from ${model}`;
      perch.classList.remove('is-thinking');
      perch.classList.add('is-happy');
      setTimeout(() => perch.classList.remove('is-happy'), 1600);
      draw();
    } catch (err) {
      if (!alive.v) return;
      perch.classList.remove('is-thinking');
      log.querySelector('[data-chat-wait]')?.remove();
      log.insertAdjacentHTML('beforeend', `<div class="chat__msg chat__msg--bot chat__msg--err"><div class="chat__avatar">${mascotSVG('vg--sm')}</div><div class="chat__bubble"><p>${esc(err.message || 'Something went wrong.')}</p><div class="chat__chips"><button type="button" class="chat__chip" data-chat-retry>${icon('refresh', 'i i--sm')}Try again</button>${err.status === 409 || err.status === 401 ? '<button type="button" class="chat__chip" data-chat-connect>Open AI settings</button>' : ''}</div></div></div>`);
      toEnd();
    } finally {
      busy = false;
      form.classList.remove('is-busy');
    }
  }

  function connectPrompt(text) {
    if (text) { box.value = text; follow(box, perch); }
    log.insertAdjacentHTML('beforeend', `<div class="chat__msg chat__msg--bot"><div class="chat__avatar">${mascotSVG('vg--sm')}</div><div class="chat__bubble"><p>I need an AI to think with! Connect a free one in Settings &gt; AI: Google Gemini, Groq and OpenRouter all give free keys. Your question stays here, ready to send.</p><div class="chat__chips"><button type="button" class="chat__chip" data-chat-connect>${icon('sparkles', 'i i--sm')}Connect a free AI</button></div></div></div>`);
    toEnd();
  }

  // Grow the box with its text; the perched mascot watches what's typed
  const grow = () => { box.style.height = 'auto'; box.style.height = `${Math.min(160, box.scrollHeight)}px`; };
  box.addEventListener('input', () => { grow(); follow(box, perch); });
  box.addEventListener('click', () => follow(box, perch));
  box.addEventListener('keyup', (e) => { if (/Arrow|Home|End/.test(e.key)) follow(box, perch); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', (e) => { e.preventDefault(); const t = box.value; box.value = ''; grow(); send(t); });
  root.addEventListener('click', (e) => {
    const s = e.target.closest('[data-chat-suggest]');
    if (s) { send(s.dataset.chatSuggest); return; }
    if (e.target.closest('[data-chat-connect]')) { openSettings('ai'); return; }
    if (e.target.closest('[data-chat-retry]')) {
      const last = [...msgs].reverse().find((m) => m.role === 'user');
      if (last) { msgs = msgs.slice(0, msgs.lastIndexOf(last)); send(last.content); }
      return;
    }
    if (e.target.closest('[data-chat-new]')) { msgs = []; save(msgs); draw(); box.focus(); toast('Started a new chat'); }
  });

  draw();
  const asked = takeAsked();
  if (asked) send(asked);
  else setTimeout(() => box.focus({ preventScroll: true }), 80);
}
