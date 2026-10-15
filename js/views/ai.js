import { db, tagName } from '../data.js';
import { interpret, runIntent, EXAMPLES } from '../ai.js';
import { $, esc, icon, capHTML, setAmbient } from '../ui.js';
import { openSettings } from '../settings.js';

const SORT_LABELS = { rating: 'Best rated first', players: 'Most played first', popular: 'Best sellers first', price_low: 'Cheapest first', price_high: 'Priciest first', newest: 'Newest first', discount: 'Biggest discount first' };

export function viewAI(route) {
  const q = route.q || '';
  return `<div class="wrap ai">
    <form class="ai__ask reveal" style="--i:0" data-ai-form role="search">
      ${icon('sparkles')}
      <label class="sr-only" for="ai-q">Describe the games you want</label>
      <input id="ai-q" value="${esc(q)}" placeholder="Describe what you feel like playing" maxlength="300" autocomplete="off">
      <button type="submit" class="btn btn--primary btn--sm">Search</button>
    </form>
    ${q ? '<div data-ai-out></div>' : `<div class="ai__head reveal" style="--i:1"><div><h1>Search by describing it</h1><p class="ai__summary">Ask the way you'd ask a friend. Mention genres, moods, games you love, a budget or a platform.</p></div></div>
      <div class="ai__examples reveal" style="--i:2">${EXAMPLES.map((e) => `<button type="button" data-example="${esc(e)}">${esc(e)}</button>`).join('')}</div>`}
  </div>`;
}

function chips(intent) {
  const c = [];
  intent.include.forEach((t) => c.push(['include', t, tagName(t)]));
  intent.exclude.forEach((t) => c.push(['exclude', t, `No ${tagName(t)}`]));
  intent.similar.forEach((s, i) => c.push(['similar', i, `Like ${s}`]));
  intent.keywords.forEach((s, i) => c.push(['keywords', i, `“${s}”`]));
  if (intent.free) c.push(['free', 0, 'Free to play']);
  else if (intent.maxPrice != null) c.push(['maxPrice', 0, `Under $${intent.maxPrice}`]);
  if (intent.minReview != null) c.push(['minReview', 0, `${intent.minReview}%+ positive`]);
  if (intent.sale) c.push(['sale', 0, 'On sale']);
  if (intent.platform !== 'any') c.push(['platform', 0, { mac: 'macOS', linux: 'SteamOS and Linux', steam_deck: 'Steam Deck verified' }[intent.platform]]);
  if (intent.release !== 'any') c.push(['release', 0, { new: 'Recent releases', upcoming: 'Upcoming', older: 'Before 2018' }[intent.release]]);
  if (intent.sort !== 'relevance') c.push(['sort', 0, SORT_LABELS[intent.sort]]);
  return c.map(([k, v, label], i) => `<span class="ai-chip${k === 'exclude' ? ' ai-chip--neg' : ''}" style="--i:${i}">${esc(label)}<button type="button" data-drop="${k}" data-v="${v}" aria-label="Remove ${esc(label)}">${icon('x')}</button></span>`).join('');
}

function resultsHTML(state) {
  const { intent, source, online, reason, status, query } = state;
  const { results, refs } = runIntent(intent);
  if (results[0]) setAmbient(results[0].g.header);
  const badge = online
    ? `<span class="ai__source ai__source--claude">${icon('sparkles', 'i i--sm')}${esc(source)}</span>`
    : `<span class="ai__source">${icon('zap', 'i i--sm')}Offline smart search</span>`;
  return `<div class="ai__head reveal" style="--i:1">
      <div><h1>${esc(query)}</h1><p class="ai__summary">${esc(intent.summary || '')}${refs.length ? ` Matching against ${refs.map((g) => esc(g.name)).join(', ')}.` : ''}</p></div>${badge}
    </div>
    <div class="ai__chips">${chips(intent)}</div>
    ${!online && status !== 409 && reason ? `<div class="ai__banner"><span>${esc(reason)} Showing offline results.</span></div>` : ''}
    ${!online && status === 409 ? '<div class="ai__banner"><span>Connect a free AI (a free key from Google Gemini, Groq or OpenRouter) to understand longer, looser requests. These results come from the offline parser.</span><button type="button" class="btn btn--ghost btn--sm" data-open-ai>Connect an AI</button></div>' : ''}
    ${results.length
      ? `<p class="muted" style="margin-top:18px">${results.length} games</p><div class="ai__results">${results.map(({ g, why }) => capHTML(g, { sub: false, why })).join('')}</div>`
      : '<div class="empty" style="margin-top:22px"><h2>Nothing matches every filter</h2><p>Remove a filter above, or describe it differently.</p></div>'}`;
}

export function mountAI(root, route, cleanups) {
  const form = $('[data-ai-form]', root);
  const input = $('#ai-q', root);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) location.hash = `#/ai/${encodeURIComponent(q)}`;
  });
  const onExample = (e) => { const b = e.target.closest('[data-example]'); if (b) location.hash = `#/ai/${encodeURIComponent(b.dataset.example)}`; };
  root.addEventListener('click', onExample);
  cleanups.push(() => root.removeEventListener('click', onExample));
  if (!route.q) { setTimeout(() => input.focus({ preventScroll: true }), 50); return; }

  const out = $('[data-ai-out]', root);
  const alive = { v: true };
  cleanups.push(() => { alive.v = false; });
  out.innerHTML = '<div class="ai-thinking" role="status"><div class="ai-thinking__orb"></div><p>Reading your request…</p></div>';
  let st = null;
  interpret(route.q).then((r) => {
    if (!alive.v) return;
    st = { ...r, query: route.q };
    out.innerHTML = resultsHTML(st);
  });
  out.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-ai]')) return openSettings('ai');
    const d = e.target.closest('[data-drop]');
    if (!d || !st) return;
    const k = d.dataset.drop;
    const v = d.dataset.v;
    const it = st.intent;
    if (k === 'include' || k === 'exclude') it[k] = it[k].filter((t) => String(t) !== v);
    else if (k === 'similar' || k === 'keywords') it[k] = it[k].filter((_, i) => String(i) !== v);
    else if (k === 'free' || k === 'sale') it[k] = false;
    else if (k === 'platform' || k === 'release') it[k] = 'any';
    else if (k === 'sort') it.sort = 'relevance';
    else it[k] = null;
    out.innerHTML = resultsHTML(st);
  });
  if (db.games.length === 0) out.innerHTML = '<p class="muted">The catalog is still loading.</p>';
}

