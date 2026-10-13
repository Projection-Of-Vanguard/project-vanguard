// Recommendation engine: tag vectors weighted by IDF and tag position,
// a taste profile built from what the viewer looked at, wishlisted and carted.

import { db } from './data.js';
import { state } from './state.js';

let idf = null;
const vecs = new Map();

function ensureIdf() {
  if (idf) return;
  idf = new Map();
  const n = db.games.length;
  for (const [t, c] of db.tagCount) idf.set(t, Math.log(n / (1 + c)) + 0.2);
}

function vec(g) {
  let v = vecs.get(g.id);
  if (v) return v;
  ensureIdf();
  const w = new Map();
  let norm = 0;
  g.tags.forEach((t, i) => { const x = (idf.get(t) || 0.2) / (1 + i * 0.22); w.set(t, x); norm += x * x; });
  v = { w, norm: Math.sqrt(norm) || 1 };
  vecs.set(g.id, v);
  return v;
}

function cosine(a, b) {
  let dot = 0;
  const [s, l] = a.w.size < b.w.size ? [a, b] : [b, a];
  for (const [t, x] of s.w) { const y = l.w.get(t); if (y) dot += x * y; }
  return dot / (a.norm * b.norm);
}

const playable = (g) => !state.ignored.has(g.id);

/** Tag-vector similarity between two games, 0..1. */
export const similarity = (a, b) => cosine(vec(a), vec(b));

/** Games most similar to `g`. */
export function similar(g, n = 12, { exclude = new Set() } = {}) {
  const a = vec(g);
  const out = [];
  for (const x of db.games) {
    if (x.id === g.id || exclude.has(x.id) || !playable(x)) continue;
    const s = cosine(a, vec(x));
    if (s > 0.18) out.push([x, s * (0.8 + 0.2 * x.quality) + (x.ts ? 0.02 / (1 + x.ts / 300) : 0)]);
  }
  return out.sort((p, q) => q[1] - p[1]).slice(0, n).map(([x]) => x);
}

/** Taste profile from history; null when the viewer has no signals yet. */
/** Every signal that feeds the taste profile, strongest first. */
function signals() {
  const out = [];
  state.liked.forEach((id) => out.push([db.byId.get(id), 1.8, 'liked']));
  state.wish.forEach((id) => out.push([db.byId.get(id), 1.4, 'wishlisted']));
  state.cart.forEach((id) => out.push([db.byId.get(id), 1.2, 'added to your cart']));
  state.owned.forEach((id) => out.push([db.byId.get(id), 0.9, 'own']));
  state.viewed.slice(0, 25).forEach((v, i) => out.push([db.byId.get(v.id), Math.pow(0.88, i), 'viewed']));
  return out.filter(([g]) => g);
}

function profile() {
  if (!personalOn()) return null;
  const w = new Map();
  const add = (g, k) => { for (const [t, x] of vec(g).w) w.set(t, (w.get(t) || 0) + x * k); };
  for (const [g, k] of signals()) add(g, k);
  ensureIdf();
  for (const t of state.seeds) w.set(t, (w.get(t) || 0) + (idf.get(t) || 1) * 1.6);
  for (const t of state.hiddenTags) w.delete(t);
  if (!w.size) return null;
  let norm = 0;
  for (const x of w.values()) norm += x * x;
  return { w, norm: Math.sqrt(norm) };
}

const personalOn = () => window.STPrefs?.get().personalize !== false;
export const hasHistory = () => personalOn() && (state.viewed.length > 0 || state.wish.size > 0 || state.cart.length > 0 || state.liked.size > 0 || state.seeds.length > 0 || state.owned.size > 0);

/** The viewer's strongest tags, 0..1, for the taste profile on the recommendations page. */
export function tasteProfile(n = 14) {
  const p = profile();
  if (!p) return [];
  const top = [...p.w].sort((a, b) => b[1] - a[1]).slice(0, n);
  const max = top[0]?.[1] || 1;
  return top.map(([id, x]) => ({ id, weight: x / max }));
}

/** Why a game was recommended: the closest game from the viewer's history and the shared tags. */
export function explain(g) {
  const p = profile();
  if (!p) return '';
  let best = null;
  for (const [s, , how] of signals()) { if (s.id === g.id) continue; const v = cosine(vec(s), vec(g)); if (!best || v > best.v) best = { s, v, how }; }
  const shared = g.tags.filter((t) => p.w.has(t)).sort((a, b) => p.w.get(b) - p.w.get(a)).slice(0, 2).map((t) => db.tags.get(t)).filter(Boolean);
  if (best && best.v > 0.45) return `Like ${best.s.name}, which you ${best.how}`;
  if (shared.length) return `You like ${shared.join(' and ')}`;
  return '';
}

/** Personal picks within a filter (on sale, new releases, ...). */
export function forYouWhere(pred, n = 18) {
  const p = profile();
  if (!p) return [];
  const skip = new Set([...state.viewed.map((v) => v.id), ...state.cart, ...state.wish]);
  const out = [];
  for (const g of db.games) {
    if (skip.has(g.id) || !playable(g) || !pred(g)) continue;
    const s = cosine(p, vec(g));
    if (s > 0.1) out.push([g, s * (0.6 + 0.4 * g.quality)]);
  }
  return out.sort((a, b) => b[1] - a[1]).slice(0, n).map(([g]) => g);
}

/** Recent anchors for "Because you looked at" shelves. */
export function anchors(n = 3) {
  const seen = new Set();
  return [...[...state.liked].map((id) => db.byId.get(id)), ...state.viewed.map((v) => db.byId.get(v.id))]
    .filter((g) => g && !seen.has(g.id) && seen.add(g.id)).slice(0, n);
}

/** Personalised picks; falls back to well-reviewed popular games. */
export function forYou(n = 18) {
  const p = profile();
  const seen = new Set([...state.viewed.map((v) => v.id), ...state.cart, ...state.liked, ...state.owned]);
  if (!p) return topRated().filter((g) => !seen.has(g.id)).slice(0, n);
  const out = [];
  for (const g of db.games) {
    if (seen.has(g.id) || state.wish.has(g.id) || !playable(g) || g.coming) continue;
    const s = cosine(p, vec(g));
    if (s > 0.12) out.push([g, s * (0.65 + 0.35 * g.quality) + (g.ts ? 0.03 / (1 + g.ts / 200) : 0)]);
  }
  return out.sort((a, b) => b[1] - a[1]).slice(0, n).map(([g]) => g);
}

/** "Because you looked at X" anchored on the most recently viewed game. */
export function becauseYouViewed(n = 14) {
  const anchor = state.viewed.map((v) => db.byId.get(v.id)).find(Boolean);
  if (!anchor) return null;
  const seen = new Set(state.viewed.map((v) => v.id));
  return { anchor, items: similar(anchor, n, { exclude: seen }) };
}

export const recentlyViewed = (n = 14) => state.viewed.map((v) => db.byId.get(v.id)).filter(Boolean).slice(0, n);

/* ----------------------------------------------------------- curated lists */

const by = (f) => (a, b) => f(b) - f(a);
const released = (g) => !g.coming;

export const topSellers = () => db.games.filter((g) => g.ts && released(g)).sort((a, b) => a.ts - b.ts);
export const mostPlayed = () => db.games.filter((g) => g.mp).sort((a, b) => a.mp - b.mp);
export const newPopular = () => db.games.filter((g) => g.nw && released(g)).sort((a, b) => a.nw - b.nw);
export const trending = () => db.games.filter((g) => g.tr && released(g)).sort((a, b) => a.tr - b.tr);
export const upcoming = () => db.games.filter((g) => g.coming).sort((a, b) => (a.up || 999) - (b.up || 999) || (a.ts || 9999) - (b.ts || 9999));
export const freeToPlay = () => db.games.filter((g) => g.free && released(g)).sort((a, b) => (a.ts || 9999) - (b.ts || 9999));
export const topRated = () => db.games.filter((g) => g.reviews >= 2000 && released(g)).sort(by((g) => g.pct + Math.log10(g.reviews)));
export const specials = () => db.games.filter((g) => g.disc > 0).sort((a, b) => (a.ts || 9999) - (b.ts || 9999));
export const bigDiscounts = (min = 50) => db.games.filter((g) => g.disc >= min && g.reviews >= 50).sort(by((g) => g.disc / 100 + g.quality * 1.4));
export const hiddenGems = () => db.games.filter((g) => g.pct >= 92 && g.reviews >= 300 && g.reviews <= 12000 && released(g)).sort(by((g) => g.pct + Math.log10(g.reviews) * 2 - (g.ts || 3000) / 2000));
export const endingSoon = () => db.games.filter((g) => g.disc >= 20 && g.discEnd > Date.now() && g.reviews >= 200).sort((a, b) => a.discEnd - b.discEnd);
export const underPrice = (cents) => db.games.filter((g) => !g.free && g.price != null && g.price > 0 && g.price <= cents && released(g)).sort(by((g) => g.quality + g.disc / 200));
export const deckVerified = () => db.games.filter((g) => g.deck === 3).sort((a, b) => (a.ts || 9999) - (b.ts || 9999));
/** Games that entered the catalog in the latest refreshes (newest first). */
export const justAdded = () => {
  const oldest = Math.min(...db.games.map((g) => g.firstSeen || Infinity));
  return db.games.filter((g) => g.firstSeen > oldest).sort((a, b) => b.firstSeen - a.firstSeen || (a.ts || 9999) - (b.ts || 9999));
};
export const byTag = (tagid) => db.games.filter((g) => g.tags.includes(tagid)).sort((a, b) => (a.ts || 9999) - (b.ts || 9999));
export const newReleases = () => db.games.filter((g) => released(g) && g.release && g.release <= Date.now()).sort((a, b) => b.release - a.release);

/** Discovery queue: a personal mix of games the viewer has not looked at. */
export function discoveryQueue(n = 12) {
  const seen = new Set([...state.viewed.map((v) => v.id), ...state.wish, ...state.cart, ...state.ignored]);
  const pool = hasHistory() ? forYou(60) : [...trending().slice(0, 40), ...hiddenGems().slice(0, 40)];
  const uniq = [...new Map(pool.filter((g) => !seen.has(g.id) && g.hero).map((g) => [g.id, g])).values()];
  for (let i = uniq.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [uniq[i], uniq[j]] = [uniq[j], uniq[i]]; }
  return uniq.slice(0, n);
}
