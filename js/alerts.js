// Price alerts: when a game with an alert drops to (or below) its target price, notify once
// through the system: Windows notifications in the desktop app, Android notifications in the
// phone app (which also checks in the background, see PriceAlertsPlugin.java), and browser
// notifications on the website when allowed. An in-app toast is shown as well.
import { state, onChange } from './state.js';
import { toast } from './ui.js';

const SEEN = 'st-alert-seen'; // { appid: price in cents already notified }
const CHECK_EVERY = 30 * 60e3;
const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const readSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN) || '{}') || {}; } catch { return {}; } };
const writeSeen = (v) => { try { localStorage.setItem(SEEN, JSON.stringify(v)); } catch { /* storage off */ } };
const android = () => window.Capacitor?.Plugins?.PriceAlerts;

function systemNotify(hit) {
  const title = `${hit.name} reached your price`;
  const body = `Now ${money(hit.price)}, at or below your alert price of ${money(hit.target)}.`;
  const hash = `#/app/${hit.id}`;
  if (window.desktop?.notify) return window.desktop.notify(title, body, hash);
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(title, { body, icon: 'assets/icon.png', tag: `price-${hit.id}` });
      n.onclick = () => { window.focus(); location.hash = hash; n.close(); };
    } catch { /* some browsers only allow notifications from a service worker */ }
  }
}

function toastHits(hits) {
  if (!hits.length) return;
  const [h] = hits;
  toast(hits.length === 1 ? `Price alert: ${h.name} is now ${money(h.price)}` : `${hits.length} games reached your alert price`,
    { label: 'View', fn: () => { location.hash = hits.length === 1 ? `#/app/${h.id}` : '#/browse/wishlist'; } });
}

let checking = null;
/** Compare current prices with the alert targets and notify about new hits. */
export function checkPriceAlerts() {
  if (checking || !Object.keys(state.targets).length) return checking;
  checking = (async () => {
    // The phone app keeps one record of what it already notified, shared with its background checks
    if (android()) { const { hits = [] } = await android().checkNow().catch(() => ({})); toastHits(hits); return; }
    const ids = Object.keys(state.targets);
    const data = await fetch(`/api/prices?ids=${ids.join(',')}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!data?.prices) return;
    const seen = readSeen();
    const hits = [];
    for (const [id, target] of Object.entries(state.targets)) {
      const p = data.prices[id];
      if (!p || p.price == null) continue;
      if (p.price <= target) {
        if (seen[id] !== p.price) { hits.push({ id: +id, name: p.name, price: p.price, target }); seen[id] = p.price; }
      } else delete seen[id]; // back above the target: alert again next time it drops
    }
    writeSeen(seen);
    hits.forEach(systemNotify);
    toastHits(hits);
  })().finally(() => { checking = null; });
  return checking;
}

/** Ask for notification permission when the first alert is set (needs the click that set it). */
function askPermission() {
  if (android()) return android().requestPermissions().catch(() => {});
  if (!window.desktop && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}

function syncAndroid() {
  android()?.sync({ targets: JSON.stringify(state.targets), api: window.mobileApp?.apiBase || '' }).catch(() => {});
}

export function initPriceAlerts() {
  syncAndroid();
  onChange((what) => {
    if (what !== 'targets') return;
    syncAndroid();
    if (Object.keys(state.targets).length) { askPermission(); checkPriceAlerts(); }
  });
  checkPriceAlerts();
  setInterval(checkPriceAlerts, CHECK_EVERY);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkPriceAlerts(); });
}
