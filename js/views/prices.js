// "Prices at other stores" on a game page: live prices from licensed PC stores (via CheapShark,
// see /api/stores on the server), and, when an AI is connected, its buying advice and the other
// platforms and subscriptions the game is on.

import { api } from '../data.js';
import { aiConnected, priceAdvice } from '../ai.js';
import { $, esc, icon, money, steamUrl } from '../ui.js';
import { openSettings } from '../settings.js';

const VERDICTS = { buy: ['Good time to buy', 'buy'], wait: ['Worth waiting for a sale', 'wait'], free: ['Free to play', 'free'] };
const TYPE_LABELS = { pc: 'PC', console: 'Console', subscription: 'Subscription', mobile: 'Mobile', cloud: 'Cloud' };
const when = (t) => new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

function rowsHTML(g, deals) {
  const max = Math.max(...deals.map((d) => d.retail || d.price), 1);
  const best = deals[0]?.price;
  return deals.map((d, i) => {
    const isSteam = d.store === 'Steam';
    const top = d.price === best;
    return `<li class="pscan__row${top ? ' is-best' : ''}" style="--i:${i};--w:${Math.max(6, Math.round((d.price / max) * 100))}%">
      <img class="pscan__icon" src="${esc(d.icon)}" alt="" width="16" height="16" loading="lazy">
      <span class="pscan__store">${esc(d.store)}${top ? '<em>Best price</em>' : ''}</span>
      <span class="pscan__bar" aria-hidden="true"><i></i></span>
      <span class="pscan__price">${d.cut > 0 ? `<s>${money(d.retail)}</s>` : ''}<b>${d.price === 0 ? 'Free' : money(d.price)}</b>${d.cut > 0 ? `<small>-${d.cut}%</small>` : ''}</span>
      <a class="pscan__go" href="${esc(isSteam ? steamUrl(g.id) : d.url)}" target="_blank" rel="noopener" ${isSteam ? `data-steam="${g.id}"` : ''} aria-label="Open ${esc(g.name)} at ${esc(d.store)}">${icon('external', 'i i--sm')}</a>
    </li>`;
  }).join('');
}

function adviceHTML(r) {
  const a = r.advice;
  const [label, cls] = VERDICTS[a.verdict] || VERDICTS.buy;
  const groups = {};
  a.platforms.forEach((p) => { (groups[p.type] ||= []).push(p); });
  return `<div class="pscan__ai is-in">
    <p class="pscan__verdict pscan__verdict--${cls}">${icon(cls === 'wait' ? 'clock' : 'check', 'i i--sm')}${label}</p>
    ${a.headline ? `<h3 class="pscan__headline">${esc(a.headline)}</h3>` : ''}
    ${a.advice ? `<p class="pscan__advice">${esc(a.advice)}</p>` : ''}
    ${a.platforms.length ? `<div class="pscan__platforms">${Object.entries(groups).map(([type, list]) => `<div><p class="pscan__ptype">${TYPE_LABELS[type] || type}</p>
      <ul>${list.map((p) => `<li><b>${esc(p.name)}</b>${p.note ? `<span>${esc(p.note)}</span>` : ''}</li>`).join('')}</ul></div>`).join('')}</div>` : ''}
    <p class="pscan__fine">Advice from ${esc(r.model || 'your AI')}. Prices above are live; the platform list comes from the AI's own knowledge and can be out of date.</p>
  </div>`;
}

export function mountPriceScan(box, g, alive) {
  if (!box) return;
  box.innerHTML = `<div class="block-head"><h2 class="block-title" id="h-prices">Prices at other stores</h2></div>
    <div class="pscan is-scanning" aria-busy="true"><div class="pscan__beam" aria-hidden="true"></div><p class="pscan__status" role="status">Checking licensed stores…</p></div>`;
  api(`/api/stores/${g.id}`, { ttl: 30 * 60e3 }).then(async (other) => {
    if (!alive.v) return;
    const deals = other.deals || [];
    const best = deals[0];
    const steam = deals.find((d) => d.store === 'Steam');
    const cheaper = best && g.price != null && best.price < g.price;
    const connected = await aiConnected().catch(() => false);
    if (!alive.v) return;
    box.innerHTML = `<div class="block-head"><h2 class="block-title" id="h-prices">Prices at other stores</h2></div>
    <div class="pscan">
      <div class="pscan__stats">
        <div><p>Best today</p><b>${best ? (best.price === 0 ? 'Free' : money(best.price)) : g.free ? 'Free' : g.price != null ? money(g.price) : '—'}</b><span>${best ? esc(best.store) : 'Steam'}</span></div>
        <div><p>On Steam</p><b>${g.free ? 'Free' : g.price != null ? money(g.price) : '—'}</b><span>${g.disc ? `${g.disc}% off` : 'Regular price'}</span></div>
        <div><p>Lowest ever</p><b>${other.lowest ? money(other.lowest.price) : '—'}</b><span>${other.lowest?.date ? when(other.lowest.date) : 'Not recorded'}</span></div>
      </div>
      ${deals.length > 1 || (deals.length && !steam)
        ? `<p class="pscan__lead">${cheaper ? `${esc(best.store)} is ${money(g.price - best.price)} cheaper than Steam right now.` : deals.filter((d) => d.price === best.price).length > 1 ? ((ties) => `Steam's price is the best right now; ${ties.map((d) => esc(d.store)).join(', ')} ${ties.length === 1 ? 'matches' : 'match'} it.`)(deals.filter((d) => d.price === best.price && d.store !== 'Steam')) : 'Steam has the best price right now.'} ${deals.length} licensed stores checked.</p><ol class="pscan__rows">${rowsHTML(g, deals)}</ol>`
        : `<p class="pscan__lead">${g.free ? 'Free to play on Steam.' : 'No other licensed store lists this game right now, so Steam is the place to get it.'}</p>`}
      <div class="pscan__aiwrap" data-pscan-ai>
        ${connected
          ? `<button type="button" class="btn btn--primary btn--sm pscan__ask" data-pscan-ask>${icon('sparkles', 'i i--sm')}Ask AI: buy now, or wait? And where else can I play it?</button>`
          : `<div class="pscan__connect"><p>${icon('sparkles', 'i i--sm')}Connect a free AI (a free key from Google Gemini, Groq or OpenRouter) for buying advice and the consoles and subscriptions this game is on.</p><button type="button" class="btn btn--ghost btn--sm" data-pscan-connect>Connect an AI</button></div>`}
      </div>
      <p class="pscan__fine">Prices in US dollars from licensed stores, via CheapShark. Store links go through CheapShark.</p>
    </div>`;
    const wrap = $('[data-pscan-ai]', box);
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('[data-pscan-connect]')) { openSettings('ai'); return; }
      if (!e.target.closest('[data-pscan-ask]')) return;
      wrap.innerHTML = '<div class="pscan__thinking" role="status"><span class="pscan__dots" aria-hidden="true"><i></i><i></i><i></i></span>The AI is reading the prices…</div>';
      priceAdvice(g, { deals, lowest: other.lowest }).then((r) => { if (alive.v) wrap.innerHTML = adviceHTML(r); })
        .catch((err) => { if (alive.v) wrap.innerHTML = `<div class="pscan__connect"><p>${esc(err.message)}</p><button type="button" class="btn btn--ghost btn--sm" data-pscan-connect>Open AI settings</button></div>`; });
    });
  }).catch(() => {
    if (alive.v) box.innerHTML = `<div class="block-head"><h2 class="block-title" id="h-prices">Prices at other stores</h2></div><div class="pscan"><p class="pscan__lead">Other stores' prices aren't available right now. Try again later.</p></div>`;
  });
}
