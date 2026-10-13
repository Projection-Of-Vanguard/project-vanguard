// Release calendar: upcoming games by month and recent releases by week.

import { db } from '../data.js';
import { $, esc, icon, capHTML, setAmbient } from '../ui.js';

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const DAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export function viewCalendar() {
  const now = Date.now();
  const upcoming = db.games.filter((g) => g.coming).sort((a, b) => (a.release || 9e15) - (b.release || 9e15));
  const dated = upcoming.filter((g) => g.release > now - 864e5);
  const tba = upcoming.filter((g) => !(g.release > now - 864e5));
  const months = new Map();
  for (const g of dated) { const k = MONTH.format(g.release); if (!months.has(k)) months.set(k, []); months.get(k).push(g); }
  const recent = db.games.filter((g) => !g.coming && g.release && now - g.release < 30 * 864e5).sort((a, b) => b.release - a.release);
  const days = new Map();
  for (const g of recent) { const k = DAY.format(g.release); if (!days.has(k)) days.set(k, []); days.get(k).push(g); }
  const grid = (list) => `<div class="cal__grid">${list.map((g) => capHTML(g, { variant: 'header' })).join('')}</div>`;
  return `<div class="wrap calendar">
    <header class="recs__head reveal" style="--i:0"><h1>Release calendar</h1><p>Popular games coming soon, and what came out in the last 30 days.</p></header>
    <section class="cal reveal" style="--i:1" aria-labelledby="h-up"><h2 id="h-up" class="cal__title">${icon('calendar', 'i')}Coming soon</h2>
      ${[...months].map(([m, list]) => `<div class="cal__group"><h3>${esc(m)}</h3>${grid(list)}</div>`).join('') || '<p class="muted">No dated releases right now.</p>'}
      ${tba.length ? `<div class="cal__group"><h3>Date to be announced</h3>${grid(tba)}</div>` : ''}
    </section>
    <section class="cal reveal" style="--i:2" aria-labelledby="h-recent"><h2 id="h-recent" class="cal__title">${icon('clock', 'i')}Released recently</h2>
      ${[...days].map(([d, list]) => `<div class="cal__group"><h3>${esc(d)}</h3>${grid(list)}</div>`).join('') || '<p class="muted">Nothing popular came out in the last 30 days.</p>'}
    </section>
  </div>`;
}

export function mountCalendar(root) {
  const g = db.games.find((x) => x.coming && x.hero) || db.games[0];
  if (g) setAmbient(g.header);
  return $;
}
