// Catalog loading, normalisation, search and API helpers.

import { state } from './state.js';

// Store images; through the home server's photo cache when the phone app uses one (set in boot.js)
const CDN = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/';
const cdn = () => (window.mobileApp?.imgBase ? `${window.mobileApp.imgBase}/shared.akamai.steamstatic.com/store_item_assets/steam/apps/` : CDN);
const REVIEW_LABELS = ['', 'Overwhelmingly Negative', 'Very Negative', 'Negative', 'Mostly Negative', 'Mixed', 'Mostly Positive', 'Positive', 'Very Positive', 'Overwhelmingly Positive'];

export const db = {
  all: [],               // every game in the catalog
  games: [],             // games shown in lists (respects the adult-content setting)
  byId: new Map(),
  tags: new Map(),       // tagid -> name
  tagCount: new Map(),   // tagid -> number of games
  updated: 0,
  minPlayers: 100,
  changes: { added: [], removed: [] },
};

const asset = (id, file) => (file ? `${cdn()}${id}/${file}` : null);

/* ------------------------------------------------------- text normalising */

const ROMAN = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10', xi: '11', xii: '12' };
/** Lower-case, strip accents, apostrophes and symbols, unify roman numerals: "No Man's Sky™" -> "no mans sky". */
export function norm(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/[’'`´ʼ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .map((t) => ROMAN[t] || t)
    .join(' ');
}

export function indexName(g) {
  const n = norm(g.name);
  const tokens = n.split(' ').filter(Boolean);
  g.s_n = n;
  g.s_t = tokens;
  g.s_c = tokens.join('');
  const initial = (t) => (/^\d+$/.test(t) ? t : t[0]);
  g.s_a = tokens.map(initial).join('');
  // acronyms of every run of 2-5 words: "halo master chief collection" -> "mcc", "hmcc", ...
  g.s_sa = new Set();
  for (let i = 0; i < tokens.length; i++) for (let j = i + 2; j <= Math.min(tokens.length, i + 5); j++) g.s_sa.add(tokens.slice(i, j).map(initial).join(''));
  g.s_d = norm([...g.dev, ...g.pub].join(' '));
}

/** Damerau-Levenshtein distance, giving up once it exceeds `max`. */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array(b.length + 1);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

function tokenScore(q, tokens, acronyms) {
  let best = acronyms && q.length >= 2 && acronyms.has(q) ? 0.85 : 0;
  for (const t of tokens) {
    if (t === q) return 1;
    if (t.startsWith(q)) { best = Math.max(best, q.length >= 2 ? 0.9 : 0.5); continue; }
    if (q.length >= 4) {
      const max = q.length >= 8 ? 2 : 1;
      if (editDistance(q, t.slice(0, q.length + max), max) <= max || editDistance(q, t, max) <= max) best = Math.max(best, 0.72);
    }
    if (t.length >= 3 && q.startsWith(t)) best = Math.max(best, 0.55);
  }
  return best;
}

function trigrams(s) { const set = new Set(); const p = ` ${s} `; for (let i = 0; i < p.length - 2; i++) set.add(p.slice(i, i + 3)); return set; }
function dice(a, b) { let n = 0; for (const x of a) if (b.has(x)) n++; return (2 * n) / (a.size + b.size || 1); }

/** Fuzzy game search: forgiving about punctuation, typos, word order, numerals and acronyms. */
export function searchGames(q, limit = 8, pool = db.games) {
  const qn = norm(q);
  if (!qn) return [];
  const qt = qn.split(' ');
  let qc = qt.join('');
  // "gtav" -> "gta5": a roman numeral glued to the end of an acronym
  if (qt.length === 1) qc = qc.replace(/^([a-z]{2,4})(iii|ii|iv|vi|v|x)$/, (m, a, r) => a + ROMAN[r]);
  const out = [];
  for (const g of pool) {
    let s = 0;
    if (g.s_n === qn) s = 100;
    else if (g.s_c.startsWith(qc)) s = 82;
    else if (qc.length >= 3 && g.s_c.includes(qc)) s = 64;
    else if (qc.length >= 2 && qt.length === 1 && g.s_a === qc) s = 70;
    else if (qc.length >= 3 && /\d/.test(qc) && g.s_a.startsWith(qc)) s = 66;
    else {
      const scores = qt.map((t) => tokenScore(t, g.s_t, g.s_sa));
      const hit = scores.filter((x) => x > 0).length;
      const avg = scores.reduce((a, b) => a + b, 0) / qt.length;
      if (hit === qt.length) s = 36 + avg * 24;
      else if (qt.length >= 3 && hit >= qt.length - 1) s = 22 + avg * 10;
      else if (qc.length >= 3 && g.s_d.includes(qn)) s = 16;
    }
    if (!s) continue;
    s += 14 / (1 + (g.mp || g.ts || 6000) / 120) + g.quality * 3;
    out.push([g, s]);
  }
  if (!out.length && qc.length >= 4) {
    const qg = trigrams(qc);
    for (const g of pool) { const d = dice(qg, g.s_tri ||= trigrams(g.s_c)); if (d >= 0.42) out.push([g, d * 30]); }
  }
  return out.sort((a, b) => b[1] - a[1]).slice(0, limit).map(([g]) => g);
}

export function searchTags(q, limit = 3) {
  const n = norm(q);
  if (n.length < 2) return [];
  return [...db.tags].filter(([, name]) => norm(name).includes(n))
    .sort((a, b) => (db.tagCount.get(b[0]) || 0) - (db.tagCount.get(a[0]) || 0)).slice(0, limit);
}

/* ------------------------------------------------------------- catalog */

function normalise(r) {
  const header = asset(r.id, r.h) || `${cdn()}${r.id}/header.jpg`;
  const g = {
    id: r.id,
    name: r.n,
    lname: r.n.toLowerCase(),
    free: !!r.f,
    price: r.p,
    orig: r.o ?? r.p,
    disc: r.d || 0,
    discEnd: (r.de || 0) * 1000,
    pct: r.r || 0,
    reviews: r.rc || 0,
    score: r.rs || 0,
    release: (r.rd || 0) * 1000,
    coming: !!r.cs,
    comingText: r.cm || '',
    tags: r.tg || [],
    plat: r.pl || 0,
    deck: r.dk || 0,
    adult: !!r.ad,
    dev: r.dev || [],
    pub: r.pub || r.dev || [],
    short: r.s || '',
    players: r.pc ?? null,
    lowest: r.lo ?? null,
    peak: r.pk ?? null,
    ts: r.ts || 0, mp: r.mp || 0, nw: r.nw || 0, tr: r.tr || 0, up: r.up || 0,
    firstSeen: (r.fs || 0) * 1000,
    header,
    capsule: asset(r.id, r.c) || header,
    hero: asset(r.id, r.hr),
    tall: asset(r.id, r.lc),
    logo: `${cdn()}${r.id}/logo.png`,
  };
  g.label = g.reviews < 10 ? (g.reviews ? `${g.reviews} user review${g.reviews > 1 ? 's' : ''}` : 'No user reviews') : REVIEW_LABELS[g.score] || 'Mixed';
  g.quality = (g.pct / 100) * Math.min(1, Math.log10(g.reviews + 1) / 5);
  g.effPrice = g.free ? 0 : g.price ?? Infinity;
  indexName(g);
  return g;
}

/** Games shown in lists: respects adult content, hidden tags, owned and "not interested" settings. */
export function applyContentFilter() {
  const p = window.STPrefs?.get() || {};
  const hideAdult = p.hideAdult !== false;
  const hideOwned = p.hideOwned !== false;
  const hideIgnored = p.hideIgnored !== false;
  const tags = state.hiddenTags;
  db.games = db.all.filter((g) => !(hideAdult && g.adult)
    && !(hideOwned && state.owned.has(g.id))
    && !(hideIgnored && state.ignored.has(g.id))
    && !(tags.size && g.tags.some((t) => tags.has(t))));
  db.tagCount = new Map();
  for (const g of db.games) for (const t of g.tags) db.tagCount.set(t, (db.tagCount.get(t) || 0) + 1);
}

export async function loadCatalog(onProgress) {
  let data = null;
  for (let attempt = 0; attempt < 120 && !data; attempt++) {
    try {
      const res = await fetch('/api/catalog');
      if (res.status === 503) { const info = await res.json().catch(() => ({})); onProgress?.(info.progress || 'Building the catalog'); await new Promise((r) => setTimeout(r, 2500)); continue; }
      if (res.ok) data = await res.json();
      else break;
    } catch { break; }
  }
  if (!data?.games?.length) throw new Error('catalog unavailable');
  db.all = data.games.map(normalise);
  db.byId = new Map(db.all.map((g) => [g.id, g]));
  db.tags = new Map(Object.entries(data.tags || {}).map(([k, v]) => [+k, v]));
  db.updated = data.updated * 1000;
  db.minPlayers = data.minPlayers || 100;
  db.changes = data.changes || db.changes;
  applyContentFilter();
  return db;
}

export const pick = (ids) => ids.map((id) => db.byId.get(id)).filter(Boolean);
export const tagName = (id) => db.tags.get(id) || '';
export const tagId = (name) => { const n = name.toLowerCase(); for (const [id, t] of db.tags) if (t.toLowerCase() === n) return id; return null; };
export const gameTags = (g, n = 4) => g.tags.slice(0, n).map(tagName).filter(Boolean);

/* ------------------------------------------------------------- remote API */

const apiCache = new Map();
export function api(path, { ttl = 10 * 60e3 } = {}) {
  const hit = apiCache.get(path);
  if (hit && Date.now() - hit.t < ttl) return hit.p;
  const p = fetch(path).then(async (r) => { if (!r.ok) throw Object.assign(new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`), { status: r.status }); return r.json(); });
  apiCache.set(path, { t: Date.now(), p });
  p.catch(() => apiCache.delete(path));
  return p;
}

let session = null;
/** Session info from the local server: CSRF token and server-side settings. */
export async function getSession(force = false) {
  if (!session || force) session = await fetch('/api/session', { cache: 'no-store' }).then((r) => r.json());
  return session;
}

/** POST JSON to the local server with the CSRF token. */
export async function post(path, body) {
  const s = await getSession();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': s.csrf },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  if (data.config) session.config = data.config;
  return data;
}
