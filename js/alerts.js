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
  // The phone app also checks the deal feed, so it runs even without price alerts
  if (checking || (!android() && !Object.keys(state.targets).length)) return checking;
  checking = (async () => {
    // The phone app keeps one record of what it already notified, shared with its background checks
    if (android()) {
      const { hits = [] } = await android().checkNow().catch(() => ({}));
      const [h] = hits;
      if (h) toast(hits.length === 1 ? h.title : `${hits.length} new price alerts and deals`, { label: 'View', fn: () => { location.hash = hits.length === 1 && h.id > 0 ? `#/app/${h.id}` : '#/browse/specials'; } });
      return;
    }
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

/* Free games and big deals (desktop app, and the website while it's open; the phone app checks
   natively in the background). The server records them after each catalog update: /api/events. */
const SINCE = 'st-events-since';
function notifyAny(title, body, hash) {
  if (window.desktop?.notify) return window.desktop.notify(title, body, hash);
  if ('Notification' in window && Notification.permission === 'granted') {
    try { const n = new Notification(title, { body, icon: 'assets/icon.png' }); n.onclick = () => { window.focus(); if (hash) location.hash = hash; n.close(); }; } catch { /* service-worker-only browsers */ }
  }
}
let feedBusy = false;
export async function checkDealFeed() {
  if (android() || feedBusy) return;
  const p = window.STPrefs?.get() || {};
  if (p.notifyFree === false && p.notifyDeals === false) return;
  feedBusy = true;
  try {
    let since = 0;
    try { since = +localStorage.getItem(SINCE) || 0; } catch { /* storage off */ }
    const feed = await fetch(`/api/events?since=${since}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!feed?.now) return;
    let upTo = feed.now;
    (feed.events || []).forEach((e) => { upTo = Math.max(upTo, e.ts || 0); });
    try { localStorage.setItem(SINCE, String(upTo)); } catch { /* storage off */ }
    if (!since) return; // the first check only notes where the feed is, so a week of old deals doesn't arrive at once
    const fresh = (feed.events || []).filter((e) => (e.type === 'free' && p.notifyFree !== false) || (e.type === 'deal' && p.notifyDeals !== false));
    fresh.slice(0, 3).forEach((e) => notifyAny(e.type === 'free' ? `${e.name} is free to keep` : `${e.name} is ${e.disc}% off`,
      e.type === 'free' ? (e.orig ? `Usually ${money(e.orig)}. Free on Steam for a limited time.` : 'Free on Steam for a limited time.') : `Now ${money(e.price)} on Steam.`, `#/app/${e.id}`));
    if (fresh.length > 3) notifyAny(`${fresh.length - 3} more deals on Steam`, 'Open Steam Redesigned to see the latest free games and discounts.', null);
    const [e] = fresh;
    if (e) toast(fresh.length === 1 ? (e.type === 'free' ? `${e.name} is free to keep on Steam` : `${e.name} is ${e.disc}% off`) : `${fresh.length} new free games and deals`,
      { label: 'View', fn: () => { location.hash = fresh.length === 1 ? `#/app/${e.id}` : '#/browse/specials'; } });
  } finally { feedBusy = false; }
}

/**
 * Settings > Notifications > "Free game notification test": sends a notification the way a free
 * game alert arrives, and returns what could stop real ones: [{ ok, text }].
 */
export async function testFreeGame() {
  const p = window.STPrefs?.get() || {};
  const report = [];
  const title = 'Test: free game alerts work';
  const body = "This is how you'll hear when a game becomes free to keep.";
  if (android()) {
    let r = await android().testNotification();
    if (!r.permission) { await android().requestPermissions().catch(() => {}); r = await android().testNotification(); }
    report.push(r.sent ? { ok: true, text: 'Test notification sent. Look in your notification shade.' }
      : { ok: false, text: !r.appEnabled || !r.permission ? 'Notifications are off for Steam Redesigned. Turn them on in Android Settings > Apps > Steam Redesigned > Notifications.' : 'The "Deals and free games" category is off. Turn it on in Android Settings > Apps > Steam Redesigned > Notifications.' });
    report.push(r.background ? { ok: true, text: 'Background checks are on: about every hour, even with the app closed.' } : { ok: false, text: 'Background checks are not scheduled. Open the app once more; if this stays, battery saver may be blocking them.' });
    report.push({ ok: true, text: r.server ? `Checks use your home server (${r.server}), or the online service when it's away.` : 'Checks use the online service.' });
  } else if (window.desktop?.notify) {
    window.desktop.notify(title, `${body} Free game alerts in the desktop app arrive while it runs, including from the tray.`, null);
    report.push({ ok: true, text: 'Windows notification sent. If none appeared, check Windows Settings > System > Notifications > Steam Redesigned, and Do not disturb.' });
    report.push({ ok: true, text: 'The app checks for new free games after each catalog update, while it is running (it can stay in the tray).' });
  } else if ('Notification' in window) {
    const perm = Notification.permission === 'default' ? await Notification.requestPermission().catch(() => 'denied') : Notification.permission;
    if (perm === 'granted') { notifyAny(title, body, null); report.push({ ok: true, text: 'Browser notification sent. The website can only notify you while it is open in a tab.' }); }
    else report.push({ ok: false, text: 'This browser blocks notifications from this site. Allow them in the site settings (the icon next to the address), or get the app for notifications in the background.' });
  } else report.push({ ok: false, text: 'This browser cannot show notifications. Get the desktop or Android app for free game alerts.' });
  report.splice(1, 0, p.notifyFree === false ? { ok: false, text: '"New free games" is off, so real free game alerts are not sent. Turn it on above.' } : { ok: true, text: '"New free games" is on.' });
  toast(title);
  return report;
}

/** Ask for notification permission when the first alert is set (needs the click that set it). */
function askPermission() {
  if (android()) return android().requestPermissions().catch(() => {});
  if (!window.desktop && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}

/** The phone's background checks need the alert targets, the wishlist (for deals) and the home server. */
function syncAndroid() {
  const p = window.STPrefs?.get() || {};
  android()?.sync({
    targets: JSON.stringify(state.targets),
    wishlist: JSON.stringify([...state.wish]),
    server: window.mobileApp?.homeServer || '',
    notifyFree: p.notifyFree !== false,
    notifyDeals: p.notifyDeals !== false,
  }).catch(() => {});
}

export function initPriceAlerts() {
  syncAndroid();
  window.addEventListener('prefs', syncAndroid);
  onChange((what) => {
    if (what === 'wish') syncAndroid();
    if (what !== 'targets') return;
    syncAndroid();
    if (Object.keys(state.targets).length) { askPermission(); checkPriceAlerts(); }
  });
  checkPriceAlerts();
  checkDealFeed();
  setInterval(() => { checkPriceAlerts(); checkDealFeed(); }, CHECK_EVERY);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkPriceAlerts(); checkDealFeed(); } });
}
