// Steam store redesign — local data server.
// Run standalone with `node server.mjs`, or start in-process from the desktop app (app/main.cjs).
//
// Catalog: every game on Steam with at least `minPlayers` people playing (judged by the
// 24-hour peak of live player counts), up to `catalogMax` games, taken from Steam's own
// "most played", top-seller, new and trending rankings. Rebuilt on a schedule; games that
// grow past the threshold are added, games that drop below it or get delisted are removed.
//
// Security: binds to 127.0.0.1 only, rejects foreign Host headers (DNS rebinding),
// requires same-origin + CSRF token on every write, rate-limits each endpoint group,
// validates all parameters, sends a strict Content-Security-Policy, and never sends the
// AI provider key back to the browser.

import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream, existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CC = 'US';
const LANG = 'english';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SteamRedesignConcept/2.0', 'Accept-Language': 'en-US,en;q=0.9' };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Public mode: the hosted website (Vercel). Data lives in Vercel Blob, settings that change the
// server are switched off, and only the deployment's own domains are answered.
const PUBLIC = process.env.PUBLIC_MODE === '1';
// Home server (ProjectServer on a spare PC): read-only like the website, but data, photos and the
// hourly deal feed live on that PC's disk, and phones on the network connect to it directly.
const HOME = process.env.HOME_MODE === '1';
const SHARED = PUBLIC || HOME;
const APP_ORIGIN = 'https://app.projectvanguard';

const DEFAULT_CONFIG = { catalogMax: 10000, minPlayers: 100, refreshHours: 6, aiEnabled: true };

/* ------------------------------------------------------------------ fetch */

let active = 0;
const waiting = [];
const MAX_CONCURRENT = 16;
const slot = () => new Promise((r) => (active < MAX_CONCURRENT ? (active++, r()) : waiting.push(r)));
const release = () => { const n = waiting.shift(); if (n) n(); else active--; };

async function get(url, { json = true, timeout = 20000, retries = 2, headers = UA } = {}) {
  await slot();
  try {
    for (let i = 0; ; i++) {
      try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeout), redirect: 'follow' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return json ? await res.json() : await res.text();
      } catch (e) {
        if (i >= retries) throw new Error(`${e.message} — ${String(url).slice(0, 110)}`);
        await new Promise((r) => setTimeout(r, 700 * (i + 1)));
      }
    }
  } finally { release(); }
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

/* ---------------------------------------------------------------- state */

let DATA, CACHE, CATALOG_FILE, HISTORY_FILE, CONFIG_FILE, SECRETS_FILE, SPY_FILE;
let config = { ...DEFAULT_CONFIG };
let secrets = null; // { get(): string|null, set(v: string|null) }
let catalog = null;
let catalogBody = null;
let building = null;
let buildProgress = '';
let buildPct = 0;
let lastError = null;
// The hosted site runs on several instances at once, so its token is derived from a project secret
const CSRF = PUBLIC && process.env.CRON_SECRET ? crypto.createHmac('sha256', process.env.CRON_SECRET).update('vanguard-csrf').digest('hex') : crypto.randomBytes(32).toString('hex');

const mem = new Map();
async function cached(key, ttl, fn) {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const file = path.join(CACHE, key.replace(/[^a-z0-9_-]/gi, '_') + '.json');
  if (!hit) {
    try {
      const disk = JSON.parse(await fs.readFile(file, 'utf8'));
      if (Date.now() - disk.t < ttl) { mem.set(key, disk); return disk.v; }
    } catch { /* not cached */ }
  }
  try {
    const v = await fn();
    const entry = { t: Date.now(), v };
    mem.set(key, entry);
    if (mem.size > 2000) mem.delete(mem.keys().next().value);
    fs.writeFile(file, JSON.stringify(entry)).catch(() => {});
    return v;
  } catch (e) {
    if (hit) return hit.v; // serve stale on upstream failure
    throw e;
  }
}

const loadJSON = async (file, fallback) => { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; } };

/** Read a data file: the data folder locally, Vercel Blob on the hosted site. */
async function readStore(name, fallback) {
  if (!PUBLIC) return loadJSON(path.join(DATA, name), fallback);
  try {
    const { head } = await import('@vercel/blob');
    const meta = await head('data/' + name);
    const r = await fetch(meta.url + '?v=' + encodeURIComponent(String(meta.uploadedAt || Date.now())), { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    return r.ok ? await r.json() : fallback;
  } catch { return fallback; }
}
async function writeStore(name, obj) {
  if (!PUBLIC) return fs.writeFile(path.join(DATA, name), JSON.stringify(obj));
  const { put } = await import('@vercel/blob');
  await put('data/' + name, JSON.stringify(obj), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 });
}

function fileSecrets() {
  return {
    get() { try { return JSON.parse(readFileSync(SECRETS_FILE, 'utf8')).anthropicKey || null; } catch { return null; } },
    set(v) { writeFileSync(SECRETS_FILE, JSON.stringify({ anthropicKey: v || null }), { mode: 0o600 }); },
  };
}

/* ---------------------------------------------------------------- catalog */

const DATA_REQUEST = {
  include_assets: true, include_basic_info: true, include_tag_count: 12, include_reviews: true,
  include_release: true, include_platforms: true, include_all_purchase_options: true, include_related_items: true,
};

async function rankedIds(sort, total, extraFilters = {}) {
  const ids = [];
  for (let start = 0; start < total; start += 1000) {
    const count = Math.min(1000, total - start);
    const u = new URL('https://api.steampowered.com/IStoreQueryService/Query/v1/');
    u.searchParams.set('input_json', JSON.stringify({
      query: { start, count, sort, filters: { type_filters: { include_games: true }, ...extraFilters } },
      context: { language: LANG, country_code: CC }, data_request: {},
    }));
    const d = await get(u, { timeout: 60000 });
    const batch = (d.response?.ids || []).map((x) => x.appid).filter(Boolean);
    ids.push(...batch);
    if (batch.length < count) break;
  }
  return ids;
}

async function storeItems(ids) {
  const out = new Map();
  const chunks = [];
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
  await pool(chunks, 4, async (chunk) => {
    const u = new URL('https://api.steampowered.com/IStoreBrowseService/GetItems/v1/');
    u.searchParams.set('input_json', JSON.stringify({ ids: chunk.map((appid) => ({ appid })), context: { language: LANG, country_code: CC }, data_request: DATA_REQUEST }));
    try {
      const d = await get(u, { timeout: 60000 });
      for (const it of d.response?.store_items || []) if (it.success === 1 && it.visible !== false && it.appid) out.set(it.appid, it);
    } catch (e) { log(`catalog: item batch failed: ${e.message}`); }
  });
  return out;
}

async function currentPlayers(id) {
  const d = await get(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${id}`, { timeout: 15000, retries: 1 });
  return d?.response?.result === 1 ? d.response.player_count || 0 : 0;
}

const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// Shorten at a word boundary with an ellipsis, so lists never show a word cut in half
const clip = (s, n) => (s.length <= n ? s : `${s.slice(0, n + 1).replace(/\s+\S*$/, '').replace(/[,;:.\s-]+$/, '')}…`);
const assetKey = (f) => f || 0; // relative filename, e.g. '<hash>/header_alt_assets_5.jpg'

function compact(it) {
  const b = it.best_purchase_option || {};
  const a = it.assets || {};
  const rv = it.reviews?.summary_filtered || {};
  const pl = it.platforms || {};
  const rel = it.release || {};
  const tagids = (it.tags?.length ? [...it.tags].sort((x, y) => y.weight - x.weight).map((t) => t.tagid) : it.tagids || []).slice(0, 12);
  const final = b.final_price_in_cents != null ? +b.final_price_in_cents : null;
  const orig = b.original_price_in_cents != null ? +b.original_price_in_cents : final;
  const cd = it.content_descriptorids || [];
  const g = {
    id: it.appid,
    n: it.name,
    f: it.is_free ? 1 : 0,
    p: final,
    o: orig,
    d: b.discount_pct || 0,
    de: b.active_discounts?.[0]?.discount_end_date || 0,
    r: rv.percent_positive || 0,
    rc: rv.review_count || 0,
    rs: rv.review_score || 0,
    rd: rel.steam_release_date || rel.original_release_date || 0,
    cs: rel.is_coming_soon ? 1 : 0,
    cm: rel.custom_release_date_message || (/^date_/.test(rel.coming_soon_display || '') ? '' : rel.coming_soon_display || ''),
    tg: tagids,
    pl: (pl.windows ? 1 : 0) | (pl.mac ? 2 : 0) | (pl.steamos_linux ? 4 : 0),
    dk: pl.steam_deck_compat_category || 0,
    ad: cd.includes(3) || cd.includes(4) ? 1 : 0,
    dev: (it.basic_info?.developers || []).map((x) => x.name).slice(0, 2),
    pub: (it.basic_info?.publishers || []).map((x) => x.name).slice(0, 2),
    s: clip(strip(it.basic_info?.short_description), 180),
    h: assetKey(a.header),
    c: assetKey(a.main_capsule),
    hr: assetKey(a.library_hero),
    lc: assetKey(a.library_capsule),
  };
  for (const k of ['h', 'c', 'hr', 'lc', 'cm', 'de', 'd', 'dk', 'cs', 'ad']) if (!g[k]) delete g[k];
  if (!g.dev.length) delete g.dev;
  if (!g.pub.length || g.pub.join() === (g.dev || []).join()) delete g.pub;
  if (!g.f && g.p == null && !g.cs) return null; // not purchasable and not upcoming
  return g;
}

function encodeCatalog() {
  const raw = Buffer.from(JSON.stringify(catalog));
  catalogBody = {
    raw,
    gz: zlib.gzipSync(raw, { level: 9 }),
    br: zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }),
    etag: `"c-${catalog.updated}-${catalog.games.length}"`,
  };
}

async function buildCatalog() {
  if (building) return building;
  building = (async () => {
    const t0 = Date.now();
    const { catalogMax, minPlayers } = config;
    log(`catalog: rebuilding (up to ${catalogMax} games with ${minPlayers}+ players)`);

    // 1. Candidate pool from Steam's own rankings (ids only — cheap)
    buildProgress = 'Collecting rankings';
    const depth = Math.min(14000, Math.max(3000, Math.round(catalogMax * 1.3)));
    const lists = {};
    for (const [key, sort, total, filters] of [['mp', 30, depth], ['ts', 10, 3000], ['nw', 20, 300], ['tr', 12, 300], ['up', 10, 25, { coming_soon_only: true }]]) {
      try { lists[key] = await rankedIds(sort, total, filters); } catch (e) { lists[key] = []; log(`catalog: ranking ${key} failed: ${e.message}`); }
    }
    if (lists.mp.length < 100) throw new Error(`only ${lists.mp.length} ranked games returned — keeping the previous catalog`);
    const rankOf = Object.fromEntries(Object.entries(lists).map(([k, ids]) => [k, new Map(ids.map((id, i) => [id, i + 1]))]));
    const upcoming = new Set(lists.up);
    const spyIds = Object.entries(spy.ids).filter(([, c]) => c >= minPlayers * 0.5).map(([id]) => +id);
    const known = (catalog?.games || []).map((g) => g.id);
    const pool_ = [...new Set([...lists.mp, ...lists.ts, ...lists.nw, ...lists.tr, ...spyIds, ...known])].filter((id) => !upcoming.has(id));

    // 2. Live player counts for every candidate; keep a 24-hour window of samples per game
    buildProgress = `Counting players for ${pool_.length} games`;
    const history = await readStore('history.json', { firstSeen: {}, removed: [], samples: {} });
    history.samples ||= {};
    const now = Math.floor(Date.now() / 1000);
    const ccu = new Map();
    let failed = 0;
    let counted = 0;
    await pool(pool_, 16, async (id) => {
      try { ccu.set(id, await currentPlayers(id)); } catch { failed++; }
      buildPct = Math.round((++counted / pool_.length) * 85);
    });
    if (failed > pool_.length * 0.3) throw new Error(`player counts failed for ${failed} of ${pool_.length} games — keeping the previous catalog`);
    const peak = new Map();
    for (const id of pool_) {
      const recent = (history.samples[id] || []).filter(([t]) => now - t < 86400);
      if (ccu.has(id)) recent.push([now, ccu.get(id)]);
      history.samples[id] = recent.slice(-8);
      peak.set(id, Math.max(0, ...recent.map(([, v]) => v)));
    }
    for (const id of Object.keys(history.samples)) if (!history.samples[id].some(([t]) => now - t < 86400)) delete history.samples[id];

    // 3. Selection: 24h peak >= minPlayers (incumbents keep their place down to 75% of it)
    const incumbents = new Set((catalog?.games || []).map((g) => g.id));
    const chosen = pool_.filter((id) => peak.get(id) >= (incumbents.has(id) ? minPlayers * 0.75 : minPlayers))
      .sort((a, b) => peak.get(b) - peak.get(a)).slice(0, catalogMax);
    const ids = [...chosen, ...lists.up];

    // 4. Full store data for the chosen games
    buildProgress = `Loading store data for ${ids.length} games`;
    buildPct = 88;
    const items = await storeItems(ids);
    const games = [];
    for (const id of ids) {
      const it = items.get(id);
      if (!it) continue; // delisted or hidden
      const g = compact(it);
      if (!g) continue;
      for (const k of ['ts', 'nw', 'tr', 'up']) { const r = rankOf[k].get(id); if (r) g[k] = r; }
      if (ccu.has(id)) { g.pc = ccu.get(id); g.pk = peak.get(id); }
      g.fs = history.firstSeen[id] ||= now;
      // Price history: a point whenever the price or discount changes (last 80 changes)
      history.prices ||= {};
      const ph = (history.prices[id] ||= []);
      const last = ph[ph.length - 1];
      if (g.p != null && (!last || last[1] !== g.p || last[3] !== (g.d || 0))) ph.push([now, g.p, g.o, g.d || 0]);
      if (ph.length > 80) ph.splice(0, ph.length - 80);
      // Daily peak players for the last 30 days
      if (g.pc != null) {
        history.daily ||= {};
        const day = Math.floor(now / 86400);
        const dp = (history.daily[id] ||= []);
        const lastDay = dp[dp.length - 1];
        if (lastDay && lastDay[0] === day) lastDay[1] = Math.max(lastDay[1], g.pc);
        else dp.push([day, g.pc]);
        if (dp.length > 30) dp.splice(0, dp.length - 30);
        // Growth for "rising" lists: the last 3 days' peaks against the week before
        if (dp.length >= 8) {
          const avg = (a) => a.reduce((n, x) => n + x[1], 0) / a.length;
          const before = avg(dp.slice(-10, -3));
          if (before >= 20) g.gr = Math.round((avg(dp.slice(-3)) / before - 1) * 100);
        }
      }
      const low = ph.reduce((m, p) => (p[1] != null && (m == null || p[1] < m) ? p[1] : m), null);
      if (low != null && g.p != null && low < g.p) g.lo = low;
      games.push(g);
    }
    // "Most played" rank by live players
    games.filter((g) => g.pc != null).sort((a, b) => b.pc - a.pc).forEach((g, i) => { g.mp = i + 1; });

    const prevIds = new Set((catalog?.games || []).map((g) => g.id));
    const nextIds = new Set(games.map((g) => g.id));
    const added = catalog ? games.filter((g) => !prevIds.has(g.id)).map((g) => g.id) : [];
    const removed = (catalog?.games || []).filter((g) => !nextIds.has(g.id)).map((g) => ({ id: g.id, n: g.n, at: now }));
    history.removed = [...removed, ...(history.removed || [])].slice(0, 200);
    for (const r of removed) delete history.firstSeen[r.id];

    let tags = catalog?.tags || {};
    try {
      const all = await get(`https://store.steampowered.com/tagdata/populartags/${LANG}`);
      const used = new Set(games.flatMap((g) => g.tg));
      tags = Object.fromEntries(all.filter((t) => used.has(t.tagid)).map((t) => [t.tagid, t.name]));
    } catch (e) { log(`catalog: tag names failed: ${e.message}`); }

    let demos = catalog?.demos || [];
    buildProgress = 'Finding popular demos';
    try { demos = await popularDemos(); } catch (e) { log(`catalog: demos failed: ${e.message}`); }

    const previous = catalog?.games;
    catalog = { v: 3, updated: now, count: games.length, minPlayers, tags, games, demos, changes: { added, removed: history.removed.slice(0, 40) } };
    recordEvents(previous, games);
    await writeStore('catalog.json', catalog);
    await writeStore('history.json', history);
    encodeCatalog();
    lastError = null;
    buildPct = 100;
    log(`catalog: ${games.length} games (+${added.length} / -${removed.length}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    if (HOME) setTimeout(warmCache, 5000);
  })().catch((e) => { lastError = e.message; log(`catalog: build failed: ${e.message}`); }).finally(() => { building = null; buildProgress = ''; buildPct = 0; });
  return building;
}

/* ----------------------------------------------------------------- demos */
// Steam's demo listing has no popularity order, so take the newest and the most relevant demos and
// rank them by how many people are playing each one right now.
async function popularDemos() {
  const ids = new Set();
  for (const [start, sort] of [[0, 'Released_DESC'], [100, 'Released_DESC'], [200, 'Released_DESC'], [0, ''], [100, '']]) {
    try {
      const d = await get(`https://store.steampowered.com/search/results/?query=&start=${start}&count=100&category1=10&infinite=1&cc=us&l=english${sort ? `&sort_by=${sort}` : ''}`, { retries: 1 });
      for (const m of String(d?.results_html || '').matchAll(/data-ds-appid="(\d{1,8})"/g)) ids.add(+m[1]);
    } catch { /* one page missing is fine */ }
  }
  if (ids.size < 20) throw new Error(`only ${ids.size} demos listed`);
  const counts = new Map();
  await pool([...ids], 16, async (id) => { try { counts.set(id, await currentPlayers(id)); } catch { /* skip */ } });
  const top = [...counts].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([id]) => id);
  const items = await storeItems(top);
  // Software demos (utilities, benchmarks, audio and video tools...) aren't games
  const SOFTWARE = new Set([87, 1036, 84, 8013, 13906, 872, 784, 1027, 1445, 809, 5407]);
  return top.map((id) => {
    const it = items.get(id);
    if (!it || (it.tagids || []).some((t) => SOFTWARE.has(t))) return null;
    const a = it.assets || {};
    return { id, n: it.name, pc: counts.get(id), h: assetKey(a.header), c: assetKey(a.main_capsule), parent: it.related_items?.parent_appid || null, tg: (it.tagids || []).slice(0, 8) };
  }).filter(Boolean).slice(0, 40);
}

/* -------------------------------------------------- deal feed (home server) */

// Free-to-keep games (any) and new 50%+ discounts on the 200 most played games
let events = [];
function recordEvents(previous, games) {
  if (!previous?.length) return; // the first catalog has nothing to compare with
  const now = Math.floor(Date.now() / 1000); // when recorded, so phones that checked during the build still get them
  const before = new Map(previous.map((g) => [g.id, g]));
  const popular = new Set([...games].sort((a, b) => (b.pk || 0) - (a.pk || 0)).slice(0, 200).map((g) => g.id));
  const freeToKeep = (g) => g && !g.f && g.p === 0 && g.o > 0;
  const found = [];
  for (const g of games) {
    const old = before.get(g.id);
    let type = null;
    if (freeToKeep(g) && !freeToKeep(old)) type = 'free';
    else if ((g.d || 0) >= 50 && (old?.d || 0) < 50 && popular.has(g.id)) type = 'deal';
    if (type) found.push({ key: `${type}-${g.id}-${now}`, type, id: g.id, name: g.n, price: g.p ?? 0, orig: g.o ?? null, disc: g.d || 0, ends: g.de || null, ts: now });
  }
  events = [...events.filter((e) => now - e.ts < 7 * 86400), ...found].slice(-500);
  if (found.length) log(`deals: ${found.filter((e) => e.type === 'free').length} free, ${found.filter((e) => e.type === 'deal').length} big discounts`);
  writeStore('events.json', events).catch(() => {});
}

/* ------------------------------------------------ photo cache (home server) */

// Steam's image hosts only; photos are fetched once, then served from this PC's disk
const IMG_HOSTS = ['shared.akamai.steamstatic.com', 'shared.fastly.steamstatic.com', 'shared.cloudflare.steamstatic.com', 'cdn.akamai.steamstatic.com',
  'cdn.fastly.steamstatic.com', 'cdn.cloudflare.steamstatic.com', 'store.akamai.steamstatic.com', 'store.fastly.steamstatic.com',
  'clan.akamai.steamstatic.com', 'clan.fastly.steamstatic.com', 'avatars.akamai.steamstatic.com', 'avatars.fastly.steamstatic.com',
  'avatars.steamstatic.com', 'community.akamai.steamstatic.com', 'community.fastly.steamstatic.com', 'steamcdn-a.akamaihd.net',
  'steamcommunity-a.akamaihd.net', 'steamuserimages-a.akamaihd.net', 'images.steamusercontent.com', 'img.youtube.com', 'i.ytimg.com'];
const IMG_HOST_SET = new Set(IMG_HOSTS);
const IMG_RE = new RegExp(`https://(${IMG_HOSTS.map((h) => h.replace(/\./g, '\\.')).join('|')})/`, 'g');
const IMG_MAX_BYTES = 15 * 1048576;
let IMG_DIR, imgLimit = 4 * 1073741824;
const imgFetching = new Map();

async function imageFile(upstream) {
  const key = crypto.createHash('sha1').update(upstream).digest('hex');
  const file = path.join(IMG_DIR, key.slice(0, 2), key);
  try { const type = await fs.readFile(file + '.type', 'utf8'); return { file, type, key }; } catch { /* not cached yet */ }
  if (!imgFetching.has(key)) {
    imgFetching.set(key, (async () => {
      const r = await fetch(upstream, { signal: AbortSignal.timeout(20000), headers: UA });
      const type = (r.headers.get('content-type') || '').split(';')[0];
      if (!r.ok || !/^image\/(jpeg|png|gif|webp|avif)$/.test(type)) throw fail(r.status === 404 ? 404 : 502, 'Image unavailable');
      const body = Buffer.from(await r.arrayBuffer());
      if (body.length > IMG_MAX_BYTES) throw fail(502, 'Image too large');
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, body);
      await fs.writeFile(file + '.type', type);
    })().finally(() => imgFetching.delete(key)));
  }
  await imgFetching.get(key);
  return { file, type: await fs.readFile(file + '.type', 'utf8'), key };
}

async function serveImage(req, res, pathname, search) {
  const m = /^\/img\/([a-z0-9.-]+)\/([\w\-./%~,+=@]{1,400})$/i.exec(pathname);
  if (!m || !IMG_HOST_SET.has(m[1]) || m[2].includes('..')) throw fail(404, 'Not found');
  const { file, type, key } = await imageFile(`https://${m[1]}/${m[2]}${search && search.length < 200 ? search : ''}`);
  const etag = `"i-${key}"`;
  // Public Steam photos, shown inside the app's own page: allow cross-origin use (data keeps same-origin)
  const headers = { 'Content-Type': type, 'Cache-Control': 'public, max-age=2592000, immutable', ETag: etag, 'Cross-Origin-Resource-Policy': 'cross-origin' };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return; }
  res.writeHead(200, headers);
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(file).pipe(res);
}

// Keep the photo cache under its size limit, removing the least recently used photos first
async function pruneImages() {
  const files = [];
  for (const dir of await fs.readdir(IMG_DIR).catch(() => [])) {
    for (const name of await fs.readdir(path.join(IMG_DIR, dir)).catch(() => [])) {
      if (name.endsWith('.type')) continue;
      const st = await fs.stat(path.join(IMG_DIR, dir, name)).catch(() => null);
      if (st) files.push({ f: path.join(IMG_DIR, dir, name), size: st.size, used: Math.max(st.atimeMs, st.mtimeMs) });
    }
  }
  let total = files.reduce((n, x) => n + x.size, 0);
  if (total <= imgLimit) return;
  files.sort((a, b) => a.used - b.used);
  for (const x of files) {
    if (total <= imgLimit * 0.9) break;
    await fs.rm(x.f, { force: true }); await fs.rm(x.f + '.type', { force: true });
    total -= x.size;
  }
  log(`photos: cache trimmed to ${(total / 1073741824).toFixed(2)} GB`);
}

// After each refresh: game details for the 300 most played games and every cover photo, so taps are instant
let warming = false;
async function warmCache() {
  if (warming || !catalog) return;
  warming = true;
  const t0 = Date.now();
  try {
    const top = [...catalog.games].sort((a, b) => (b.pk || 0) - (a.pk || 0));
    for (const g of top.slice(0, 300)) { if (building) break; await appDetails(g.id).catch(() => {}); await new Promise((r) => setTimeout(r, 250)); }
    let i = 0;
    const covers = top.map((g) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${g.id}/${g.h || 'header.jpg'}`);
    await Promise.all(Array.from({ length: 4 }, async () => { while (i < covers.length && !building) await imageFile(covers[i++]).catch(() => {}); }));
    await pruneImages();
    log(`warm-up: details and photos ready in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  } finally { warming = false; }
}

// Home server: which phones use it and how much, shown in its window and on its status page
const phones = new Map(); // address -> last request time
const served = { requests: 0, photos: 0 };
function notePhone(ip, photo) {
  ip = String(ip).replace(/^::ffff:/, '');
  const now = Date.now();
  const last = phones.get(ip);
  if (!last || now - last > 30 * 60e3) log(`phone ${ip} connected`);
  phones.set(ip, now);
  served.requests++;
  if (photo) served.photos++;
}
function phoneReport() {
  const active = [...phones.values()].filter((t) => Date.now() - t < 3600e3).length;
  if (served.requests) log(`last hour: ${served.requests} requests (${served.photos} photos) for ${active} phone${active === 1 ? '' : 's'}`);
  served.requests = 0; served.photos = 0;
}

function sendHomeStatus(req, res) {
  const h = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const updated = catalog?.updated ? new Date(catalog.updated * 1000).toLocaleString() : 'not yet';
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project Vanguard home server</title>
<body style="font:16px/1.6 system-ui,sans-serif;background:#0b1424;color:#e9f1fa;max-width:640px;margin:40px auto;padding:0 16px">
<h1 style="font-size:24px">Project Vanguard home server is running</h1>
<p>${(catalog?.games.length || 0).toLocaleString('en-US')} games, last refreshed ${h(updated)}${building ? ' (refreshing now)' : ''}. Refreshes every ${config.refreshHours} hour${config.refreshHours === 1 ? '' : 's'}.</p>
<p>${events.length} deal notification${events.length === 1 ? '' : 's'} in the last 7 days.</p>
<p>${[...phones.values()].filter((t) => Date.now() - t < 3600e3).length} phone(s) used it in the last hour, ${served.requests} requests so far this hour.</p>
<p>In the Steam Redesigned app on your phone, open Settings &rsaquo; Catalog &amp; data &rsaquo; Home server and enter <b>http://${h(req.headers.host)}</b></p></body>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
  res.end(html);
}

/* ------------------------------------------------- SteamSpy discovery crawl */
// Steam's store rankings leave out some live games (Fall Guys, for one). A slow background crawl of
// SteamSpy's full game list (one page a minute, as SteamSpy asks) finds every game that had players
// recently; those become extra candidates for the live player-count check.

let spy = { page: 0, cycles: 0, ids: {}, updated: 0 };
async function spyStep() {
  try {
    const d = await get(`https://steamspy.com/api.php?request=all&page=${spy.page}`, { timeout: 60000, retries: 0 });
    const rows = Object.values(d || {});
    if (!rows.length) { spy.page = 0; spy.cycles++; }
    else {
      for (const r of rows) { const id = +r.appid; if (!id) continue; if ((r.ccu || 0) >= 20) spy.ids[id] = r.ccu; else delete spy.ids[id]; }
      spy.page++;
    }
    spy.fails = 0;
    spy.updated = Math.floor(Date.now() / 1000);
    await fs.writeFile(SPY_FILE, JSON.stringify(spy));
  } catch (e) {
    // SteamSpy answers past its last page (and when busy) with plain text. Say so once, then
    // start the next round instead of repeating the same error every minute.
    spy.fails = (spy.fails || 0) + 1;
    if (spy.fails === 1) log(`steamspy: page ${spy.page} not available right now (${String(e.message).slice(0, 60)}); trying again shortly`);
    if (spy.fails >= 3) { spy.page = 0; spy.cycles++; spy.fails = 0; }
  }
}

/* ------------------------------------------------------------ game details */

// Steam's requirement lists as rows ({ k: 'Processor', v: 'Intel Core i3-8100 or Ryzen 5 1400' });
// lines without a label ("Requires a 64-bit processor...") keep k empty
const unescape = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function reqRows(html) {
  if (!html) return [];
  const parts = /<li[\s>]/i.test(html) ? String(html).split(/<li[^>]*>/i).slice(1) : String(html).split(/<br\s*\/?>/i);
  return parts.map((p) => unescape(strip(p.replace(/<br\s*\/?>/gi, ' '))))
    .filter((t) => t && !/^(minimum|recommended)\s*:?$/i.test(t))
    .map((t) => { const m = /^([A-Za-z][A-Za-z ./&-]{1,30}):\s*(.+)$/.exec(t.replace(/^(minimum|recommended)\s*:\s*/i, '')); return m ? { k: m[1].trim(), v: m[2].trim().slice(0, 300) } : { k: '', v: t.slice(0, 300) }; })
    .slice(0, 14);
}

async function appDetails(id) {
  return cached(`app2-${id}`, 12 * 3600e3, async () => {
    const d = await get(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=${CC.toLowerCase()}&l=${LANG}`);
    const a = d?.[id]?.data;
    if (!d?.[id]?.success || !a) throw Object.assign(new Error('not found'), { status: 404 });
    const paras = (a.about_the_game || a.detailed_description || '')
      .replace(/<(br|\/p|\/h\d|\/li)\s*\/?>/gi, '\n').replace(/<li>/gi, '• ')
      .replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .split('\n').map((s) => s.trim()).filter((s) => s.length > 1);
    const aboutImgs = [...(a.about_the_game || '').matchAll(/<img[^>]+src="(https:[^"]+)"/g)].map((m) => m[1]).filter((s) => !/\.gif/i.test(s)).slice(0, 3);
    const req = strip((a.pc_requirements?.minimum || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/li>/gi, '\n'));
    return {
      id,
      name: a.name,
      short: strip(a.short_description),
      about: paras.slice(0, 40),
      aboutImgs,
      screens: (a.screenshots || []).slice(0, 14).map((s) => ({ t: s.path_thumbnail, f: s.path_full })),
      categories: (a.categories || []).map((c) => c.description),
      genres: (a.genres || []).map((g) => g.description),
      release: a.release_date?.date || '',
      metacritic: a.metacritic?.score || null,
      languages: strip(a.supported_languages || '').replace(/\*?languages with full audio support/i, '').split(',').map((s) => s.replace(/\*/g, '').trim()).filter(Boolean).slice(0, 14),
      requirements: req.replace(/^Minimum:\s*/i, '').slice(0, 600),
      reqs: { min: reqRows(a.pc_requirements?.minimum), rec: reqRows(a.pc_requirements?.recommended) },
      dlc: (a.dlc || []).length,
      free: !!a.is_free,
    };
  });
}

async function appReviews(id, order = 'all', type = 'all') {
  return cached(`reviews-${id}-${order}-${type}`, 2 * 3600e3, async () => {
    const d = await get(`https://store.steampowered.com/appreviews/${id}?json=1&filter=${order}&review_type=${type}&language=english&purchase_type=all&num_per_page=12&day_range=365`);
    return {
      summary: d.query_summary || {},
      reviews: (d.reviews || []).map((r) => ({
        id: r.recommendationid,
        up: r.voted_up,
        text: String(r.review || '').replace(/\[\/?[a-z*0-9=]+[^\]]*\]/gi, '').slice(0, 1400),
        hours: Math.round((r.author?.playtime_forever || 0) / 6) / 10,
        helpful: r.votes_up || 0,
        date: r.timestamp_created,
        author: r.author?.personaname || 'Steam user',
        avatar: /^[0-9a-f]{40}$/.test(r.author?.avatar || '') ? `https://avatars.fastly.steamstatic.com/${r.author.avatar}_medium.jpg` : null,
        profile: r.author?.steamid ? `https://steamcommunity.com/profiles/${r.author.steamid}` : null,
        games: r.author?.num_games_owned || 0,
        comments: r.comment_count || 0,
        url: r.author?.steamid ? `https://steamcommunity.com/profiles/${r.author.steamid}/recommended/${id}/` : null,
      })),
    };
  });
}

async function livePlayers(id) {
  return cached(`players-${id}`, 60e3, async () => ({ id, players: await currentPlayers(id), at: Date.now() }));
}

/* ---------------------------------------------------------------- news */

function newsItem(n, appid) {
  const c = String(n.contents || '');
  // Steam posts use {STEAM_CLAN_IMAGE} and the newer {STEAM_CLAN_LOC_IMAGE}, and both [img]url[/img] and [img src="url"]
  let img = (c.match(/\{STEAM_CLAN(?:_LOC)?_IMAGE\}([^\s\[\]"'<]+)/) || [])[1];
  if (img) img = `https://clan.akamai.steamstatic.com/images/${img.replace(/^\//, '')}`;
  else img = (c.match(/\[img\](https:[^\[]+)\[\/img\]/i) || c.match(/\[img [^\]]*src="(https:[^"]+)"/i) || c.match(/<img[^>]+src="(https:[^"]+)"/i) || [])[1] || null;
  const text = c.replace(/\{STEAM_CLAN(?:_LOC)?_IMAGE\}\S*/g, '').replace(/\[\/?[a-z*0-9]+(?:[= ][^\]]*)?\]/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
  const url = /^https:\/\//.test(n.url || '') ? n.url : `https://store.steampowered.com/news/app/${appid}`;
  return { id: n.gid, appid, title: n.title, url, author: n.author || n.feedlabel || '', date: n.date, img, text: text.slice(0, 320) };
}

async function appNews(id, count = 10) {
  return cached(`news-${id}-${count}`, 30 * 60e3, async () => {
    const d = await get(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${id}&count=${count}&maxlength=0&feeds=steam_community_announcements`);
    return (d.appnews?.newsitems || []).map((n) => newsItem(n, id));
  });
}

/* ----------------------------------------------------- community parsing */

const decode = (s) => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const txt = (s) => decode(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const grab = (s, re) => { const m = s.match(re); return m ? m[1] : null; };
const ugcSize = (u, w) => (u && /steamusercontent/.test(u) ? u.replace(/imw=\d+&?/, `imw=${w}&`) : u);
const httpsOnly = (u) => (u && /^https:\/\//.test(u) ? u : null);

function parseCards(html) {
  return html.split(/<div[^>]*class="apphub_Card (?=[a-z])/).slice(1).map((c) => {
    const url = grab(c, /data-modal-content-url="([^"]+)"/);
    const typeText = decode(grab(c, /apphub_CardContentType(?: guide)?">([^<]*)</) || '');
    let type = /apphub_CardContentMain discussion/.test(c) ? 'discussion'
      : /apphub_UserReviewCardContent/.test(c) ? 'review'
      : /CardContentType guide/.test(c) ? 'guide'
      : /alignNews/.test(c) ? 'news'
      : (typeText.replace(/^.*: /, '').toLowerCase() || 'item');
    if (type === 'workshop item') type = 'workshop';
    const card = {
      type,
      url: httpsOnly(url ? decode(url) : null),
      appid: +grab(c, /data-appid="(\d+)"/) || null,
      appName: typeText.includes(': ') ? typeText.replace(/: [^:]*$/, '') : decode(grab(c, /apphub_CardContentAppName">(?:<a[^>]*>)?([^<]*)/) || '') || null,
      author: decode(grab(c, /apphub_CardContentAuthorName[^"]*"><a href="[^"]+">([^<]*)</) || ''),
      authorUrl: httpsOnly(grab(c, /apphub_CardContentAuthorName[^"]*"><a href="([^"]+)"/)),
      avatar: httpsOnly(grab(c, /appHubIconHolder[^"]*"><img src="([^"]+)"/)),
      comments: +(grab(c, /apphub_CardCommentCount[^"]*">\s*([\d,]+)/) || '0').replace(/,/g, ''),
    };
    const img = grab(c, /apphub_CardContentPreviewImage" src="([^"]+)"/);
    if (img) {
      card.img = httpsOnly(ugcSize(decode(img), 640));
      card.big = httpsOnly(ugcSize(decode(img), 1920));
      card.w = +grab(c, /apphub_CardContentPreviewImage"[^>]*width="(\d+)"/) || null;
      card.h = +grab(c, /apphub_CardContentPreviewImage"[^>]*height="(\d+)"/) || null;
      if (/youtube\.com\/vi\/([\w-]+)/.test(img)) { const yt = img.match(/vi\/([\w-]+)/)[1]; card.img = `https://img.youtube.com/vi/${yt}/hqdefault.jpg`; card.big = card.img; card.youtube = yt; card.w = 480; card.h = 360; }
    }
    card.likes = +(grab(c, /apphub_CardRating rateUp[^"]*">\s*([\d,]+)/) || '0').replace(/,/g, '');
    card.title = txt(grab(c, /apphub_CardContentTitle[^"]*">([\s\S]*?)<\/div>/) || '').replace(/\s+$/, '') || null;
    if (type === 'guide') {
      card.title = txt(grab(c, /apphub_CardContentGuideTitle">([\s\S]*?)<\/div>/));
      card.icon = httpsOnly(decode(grab(c, /apphub_CardContentGuideImage" src="([^"]+)"/) || ''));
      card.text = txt(grab(c, /apphub_CardContentGuideDesc">([\s\S]*?)<\/div>/)).slice(0, 260);
      card.ratings = txt(grab(c, /apphub_CardRating[^"]*starRating">([^<]*)/) || '');
    }
    if (type === 'discussion') {
      card.title = txt(grab(c, /apphub_CardContentDiscussionTitle[^"]*">([\s\S]*?)<\/div>/));
      card.text = txt(grab(c, /apphub_CardTextContent">([\s\S]*?)<\/div>/)).slice(0, 320);
      card.date = txt(grab(c, /apphub_CardContentDiscussionDate">([\s\S]*?)<\/div>/));
      card.forum = txt(grab(c, /apphub_CardContentDiscussionType">([\s\S]*?)<\/div>/));
    }
    if (type === 'review') {
      card.title = txt(grab(c, /class="title">([\s\S]*?)<\/div>/));
      card.up = card.title === 'Recommended';
      card.hours = txt(grab(c, /class="hours">([\s\S]*?)<\/div>/));
      card.helpful = txt(grab(c, /found_helpful">\s*([^<]*)/));
      const m = c.match(/apphub_CardTextContent">\s*(?:<div class="date_posted">([^<]*)<\/div>)?([\s\S]*?)<\/div>/);
      card.date = m ? txt(m[1] || '') : '';
      card.text = m ? txt(m[2]).slice(0, 700) : '';
    }
    return card;
  }).filter((c) => c.url && c.type !== 'news' && (c.img || c.text || c.title));
}

/* -------------------------------------------------------- comment threads */
// Only Steam Community item and review pages are fetched; the URL is rebuilt from validated parts,
// so this endpoint cannot be pointed at any other site.
function threadUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'steamcommunity.com') return null;
  const id = u.searchParams.get('id');
  if (u.pathname.replace(/\/$/, '') === '/sharedfiles/filedetails' && /^\d{1,20}$/.test(id || '')) return { kind: 'item', url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}&l=english` };
  const m = u.pathname.match(/^\/(id\/[\w-]{2,64}|profiles\/\d{17})\/recommended\/(\d{1,8})\/?$/);
  if (m) return { kind: 'review', url: `https://steamcommunity.com/${m[1]}/recommended/${m[2]}/?l=english` };
  if (/^\/app\/\d{1,8}\/discussions\/\d+\/\d{1,20}\/?$/.test(u.pathname)) return { kind: 'discussion', url: 'https://steamcommunity.com' + u.pathname };
  return null;
}

async function commentThread(raw) {
  const t = threadUrl(raw);
  if (!t) throw Object.assign(new Error('Unsupported thread address'), { status: 400 });
  if (t.kind === 'discussion') return { kind: 'discussion', supported: false, total: null, comments: [], url: t.url };
  return cached('thread-' + crypto.createHash('sha1').update(t.url).digest('hex'), 10 * 60e3, async () => {
    const html = await get(t.url, { json: false });
    const total = +(grab(html, /_totalcount">([\d,]+)</) || '0').replace(/,/g, '') || null;
    const comments = html.split('class="commentthread_comment ').slice(1).map((c) => ({
      id: grab(c, /id="comment_(\d+)"/),
      author: decode(grab(c, /commentthread_author_link"[^>]*>\s*(?:<bdi>)?([^<]*)/) || 'Steam user').trim(),
      profile: httpsOnly(grab(c, /commentthread_author_link" href="([^"]+)"/)),
      avatar: httpsOnly(grab(c, /<img src="(https:\/\/avatars\.[^"]+)"/)),
      time: +grab(c, /data-timestamp="(\d+)"/) || null,
      text: txt((grab(c, /commentthread_comment_text"[^>]*>([\s\S]*?)<\/div>/) || '').replace(/<img[^>]*alt="([^"]*)"[^>]*>/g, ' $1 ')).slice(0, 1200),
    })).filter((c) => c.id && c.text);
    return { kind: t.kind, supported: true, total: total ?? comments.length, comments, url: t.url.replace(/[?&]l=english$/, '') };
  });
}

const SECTIONS = { all: 1, screenshots: 2, videos: 3, artwork: 4, workshop: 6, guides: 9, reviews: 10, discussions: 1, news: 0 };

async function communityHome(section, p) {
  return cached(`ch-${section}-${p}`, 20 * 60e3, async () => {
    const html = await get(`https://steamcommunity.com/apps/allcontenthome/?l=english&browsefilter=trend&appHubSubSection=${SECTIONS[section]}&forceanon=1&p=${p}&numperpage=18`, { json: false });
    return parseCards(html);
  });
}

async function communityApp(id, section, p) {
  if (section === 'news') return appNews(id, 12);
  return cached(`ca-${id}-${section}-${p}`, 20 * 60e3, async () => {
    const q = new URLSearchParams({
      userreviewsoffset: String((p - 1) * 10), p: String(p), workshopitemspage: String(p), readytouseitemspage: String(p), mtxitemspage: String(p),
      itemspage: String(p), screenshotspage: String(p), videospage: String(p), artpage: String(p), allguidepage: String(p), webguidepage: String(p),
      integratedguidepage: String(p), discussionspage: String(p), numperpage: '12', browsefilter: 'trend', appid: String(id), appHubSubSection: String(SECTIONS[section]),
      l: 'english', filterLanguage: 'default', searchText: '', forceanon: '1',
    });
    const html = await get(`https://steamcommunity.com/app/${id}/homecontent/?${q}`, { json: false });
    let cards = parseCards(html);
    if (section === 'discussions') cards = cards.filter((c) => c.type === 'discussion');
    return cards;
  });
}

async function communityNews() {
  return cached('community-news', 30 * 60e3, async () => {
    const top = (catalog?.games || []).filter((g) => g.mp).sort((a, b) => a.mp - b.mp).slice(0, 10);
    const lists = await Promise.all(top.map((g) => appNews(g.id, 3).catch(() => [])));
    return lists.flat().sort((a, b) => b.date - a.date).slice(0, 16);
  });
}

/* --------------------------------------------------------------- AI search */
// Any provider's API key works (Gemini, Groq, OpenAI, Claude, OpenRouter and more, see js/llm.js).
// The desktop app keeps the key here, encrypted; the website and phone app keep it on the device
// and call the provider themselves, so their keys never reach this server.

const llm = () => import('./js/llm.js');

/** The saved AI setup: { provider, key, model, base }, or null. Older versions saved a bare Anthropic key. */
function aiSetup() {
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'anthropic', key: process.env.ANTHROPIC_API_KEY, model: 'claude-haiku-5-5', base: 'https://api.anthropic.com/v1', source: 'environment' };
  if (SHARED) return null;
  const raw = secrets.get();
  if (!raw) return null;
  if (/^sk-ant-/.test(raw)) return { provider: 'anthropic', key: raw, model: 'claude-haiku-5-5', base: 'https://api.anthropic.com/v1', source: 'saved' };
  try { const c = JSON.parse(raw); return c?.provider ? { ...c, source: 'saved' } : null; } catch { return null; }
}

function aiReady() {
  const cfg = aiSetup();
  if (!cfg || !config.aiEnabled) throw Object.assign(new Error('AI is not set up. Add an API key from any AI provider in Settings > AI.'), { status: 409 });
  return cfg;
}

async function aiSearch(q) {
  const cfg = aiReady();
  const { askJSON, sanitizeIntent, SEARCH_SYSTEM, PROVIDERS } = await llm();
  const vocab = new Map(Object.entries(catalog?.tags || {}).map(([id, n]) => [n.toLowerCase(), +id]));
  const raw = await askJSON(cfg, { system: SEARCH_SYSTEM + Object.values(catalog?.tags || {}).sort().join(', '), user: q, maxTokens: 1500 });
  return { intent: sanitizeIntent(raw, vocab), model: `${PROVIDERS[cfg.provider].label.replace(/ \(.*\)$/, '')} · ${cfg.model}` };
}

/* ------------------------------------------------- prices at other stores */
// Live prices from licensed PC stores (GOG, Humble, Fanatical, Green Man Gaming, Epic and more)
// via CheapShark's free API, which asks for a descriptive User-Agent and its redirect links.

const CHEAPSHARK = 'https://www.cheapshark.com/api/1.0';
const CS_HEADERS = { 'User-Agent': 'ProjectVanguard-SteamRedesigned/3.3 (+https://github.com/Projection-Of-Vanguard/project-vanguard)', Accept: 'application/json' };

async function storeList() {
  return cached('cs-stores', 7 * 86400e3, async () => {
    const list = await get(`${CHEAPSHARK}/stores`, { headers: CS_HEADERS });
    return Object.fromEntries(list.filter((s) => s.isActive).map((s) => [s.storeID, { name: s.storeName, icon: `https://www.cheapshark.com${s.images.icon}` }]));
  });
}

async function otherStores(id) {
  return cached(`cs-${id}`, 3 * 3600e3, async () => {
    const stores = await storeList();
    const found = await get(`${CHEAPSHARK}/games?steamAppID=${id}`, { headers: CS_HEADERS });
    const hit = (Array.isArray(found) ? found : []).find((x) => +x.steamAppID === id);
    if (!hit) return { id, deals: [], lowest: null };
    const d = await get(`${CHEAPSHARK}/games?id=${encodeURIComponent(hit.gameID)}`, { headers: CS_HEADERS });
    const cents = (v) => Math.round(parseFloat(v) * 100);
    const deals = (d.deals || []).filter((x) => stores[x.storeID]).map((x) => ({
      store: stores[x.storeID].name, icon: stores[x.storeID].icon, price: cents(x.price), retail: cents(x.retailPrice),
      cut: Math.round(parseFloat(x.savings) || 0), url: `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(decodeURIComponent(x.dealID))}`,
    })).filter((x) => Number.isFinite(x.price)).sort((a, b) => a.price - b.price);
    const low = d.cheapestPriceEver;
    return { id, deals, lowest: low ? { price: cents(low.price), date: low.date } : null };
  });
}

/** Facts the AI gets for price advice: only live data, so it cannot make prices up. */
async function priceFacts(id) {
  const g = catalog?.games.find((x) => x.id === id);
  if (!g) throw fail(404, 'Unknown game');
  const other = await otherStores(id).catch(() => ({ deals: [], lowest: null }));
  const usd = (c) => (c == null ? null : +(c / 100).toFixed(2));
  return {
    other,
    facts: {
      game: g.n, free_to_play: !!g.f, steam_price_usd: usd(g.p), steam_regular_price_usd: usd(g.o), steam_discount_percent: g.d || 0,
      lowest_price_ever_usd: usd(other.lowest?.price), lowest_price_ever_date: other.lowest?.date ? new Date(other.lowest.date * 1000).toISOString().slice(0, 10) : null,
      stores_now: other.deals.map((x) => ({ store: x.store, price_usd: usd(x.price), regular_usd: usd(x.retail), discount_percent: x.cut })),
    },
  };
}

/** Vanguard, the mascot: one chat turn with the connected AI. */
async function aiChat(messages) {
  const cfg = aiReady();
  const { chat, chatSystem, cleanMessages, relatedGames, askedText } = await llm();
  const msgs = cleanMessages(messages);
  const games = catalog?.games || [];
  const tags = catalog?.tags || {};
  const top = [...games].sort((a, b) => (b.pk || 0) - (a.pk || 0)).slice(0, 80).map((g) => g.n);
  const related = relatedGames(games.map((g) => ({ name: g.n, tags: (g.tg || []).map((t) => tags[t] || '').join(' ').toLowerCase(), peak: g.pk })), askedText(msgs));
  const reply = await chat(cfg, { system: chatSystem(top, related), messages: msgs });
  if (!reply) throw Object.assign(new Error('The AI sent an empty answer. Try again.'), { status: 502 });
  return { reply: reply.slice(0, 6000), model: cfg.model };
}

async function aiPrices(id) {
  const cfg = aiReady();
  const { askJSON, cleanAdvice, PRICE_SYSTEM } = await llm();
  const { facts, other } = await priceFacts(id);
  const raw = await askJSON(cfg, { system: PRICE_SYSTEM, user: JSON.stringify(facts), maxTokens: 1500 });
  return { advice: cleanAdvice(raw, other.deals.map((x) => x.store)), model: cfg.model };
}

/* ---------------------------------------------------------------- security */

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' https:",
  'frame-src https://www.youtube-nocookie.com https://bandcamp.com',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function securityHeaders(res, isHtml) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  res.setHeader('X-Frame-Options', 'DENY');
  if (isHtml) res.setHeader('Content-Security-Policy', CSP);
  if (PUBLIC) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
}

const buckets = new Map();
function allow(key, perMinute) {
  const now = Date.now();
  const b = buckets.get(key) || { tokens: perMinute, t: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.t) / 60000) * perMinute);
  b.t = now;
  if (b.tokens < 1) { buckets.set(key, b); return false; }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 5000) buckets.delete(buckets.keys().next().value);
  return true;
}
const LIMITS = { catalog: 30, read: 240, community: 120, ai: 12, write: 30, refresh: 2 };

function sameToken(a) {
  if (typeof a !== 'string' || a.length !== CSRF.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(CSRF));
}

function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Request body too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
}

function publicConfig() {
  if (SHARED) return { publicSite: true, homeServer: HOME, catalogMax: config.catalogMax, minPlayers: config.minPlayers, refreshHours: HOME ? config.refreshHours : 24, aiEnabled: false, aiConfigured: false };
  const ai = aiSetup();
  const { aiModel, ...rest } = config; // older versions kept a Claude model choice here
  return { ...rest, aiConfigured: !!ai, ai: ai ? { provider: ai.provider, model: ai.model, base: ai.provider === 'custom' ? ai.base : undefined, source: ai.source } : null };
}

async function saveConfig(patch) {
  const next = { ...config };
  if (patch.catalogMax != null) next.catalogMax = Math.round(Math.min(10000, Math.max(500, +patch.catalogMax || DEFAULT_CONFIG.catalogMax)));
  if (patch.minPlayers != null) next.minPlayers = Math.round(Math.min(5000, Math.max(10, +patch.minPlayers || DEFAULT_CONFIG.minPlayers)));
  if (patch.refreshHours != null) next.refreshHours = Math.min(48, Math.max(3, +patch.refreshHours || DEFAULT_CONFIG.refreshHours));
  if (patch.aiEnabled != null) next.aiEnabled = patch.aiEnabled === true;
  config = next;
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/* ----------------------------------------------------------------- server */

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const PUBLIC_FILES = new Set(['index.html', 'styles.css', 'manifest.webmanifest']);
const PUBLIC_DIRS = ['js/', 'assets/'];

function sendJSON(req, res, status, body, maxAge = 0) {
  let text = JSON.stringify(body);
  if (HOME) {
    // The phone app reaches this server through its own /_home/<scheme>/<host> path and says so
    const via = req.headers['x-vanguard-base'] || '';
    const base = /^\/_home\/https?\/[a-z0-9.-]{1,253}(:\d{1,5})?$/i.test(via) ? via : `http://${req.headers.host}`;
    text = text.replace(IMG_RE, (m, host) => `${base}/img/${host}/`);
  }
  const raw = Buffer.from(text);
  const cacheControl = !maxAge ? 'no-store' : HOME ? `public, max-age=${maxAge}` : PUBLIC ? `public, max-age=${Math.min(maxAge, 300)}, s-maxage=${maxAge}, stale-while-revalidate=600` : `private, max-age=${maxAge}`;
  const headers = { 'Content-Type': TYPES['.json'], 'Cache-Control': cacheControl, Vary: HOME ? 'Accept-Encoding, X-Vanguard-Base' : 'Accept-Encoding' };
  if (raw.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { headers['Content-Encoding'] = 'gzip'; res.writeHead(status, headers); res.end(zlib.gzipSync(raw)); return; }
  res.writeHead(status, headers); res.end(raw);
}

function sendCatalog(req, res) {
  if (!catalogBody) {
    res.writeHead(503, { 'Content-Type': TYPES['.json'], 'Retry-After': '3', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ building: true, progress: buildProgress, error: lastError }));
    return;
  }
  if (req.headers['if-none-match'] === catalogBody.etag) { res.writeHead(304, { ETag: catalogBody.etag }); res.end(); return; }
  const enc = req.headers['accept-encoding'] || '';
  const headers = { 'Content-Type': TYPES['.json'], ETag: catalogBody.etag, 'Cache-Control': PUBLIC ? 'public, max-age=300, s-maxage=900, stale-while-revalidate=86400' : 'no-cache', Vary: 'Accept-Encoding' };
  if (/\bbr\b/.test(enc)) { headers['Content-Encoding'] = 'br'; res.writeHead(200, headers); res.end(catalogBody.br); }
  else if (/\bgzip\b/.test(enc)) { headers['Content-Encoding'] = 'gzip'; res.writeHead(200, headers); res.end(catalogBody.gz); }
  else { res.writeHead(200, headers); res.end(catalogBody.raw); }
}

function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html'; } catch { res.writeHead(400); res.end(); return; }
  if (rel.includes('\0') || rel.includes('..') || rel.includes('\\')) { res.writeHead(400); res.end(); return; }
  const allowed = PUBLIC_FILES.has(rel) || PUBLIC_DIRS.some((d) => rel.startsWith(d));
  const file = path.normalize(path.join(ROOT, rel));
  if (!allowed || !file.startsWith(ROOT + path.sep) || !TYPES[path.extname(file)] || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); return;
  }
  const st = statSync(file);
  const etag = `"${st.size}-${Math.floor(st.mtimeMs)}"`;
  const type = TYPES[path.extname(file)];
  securityHeaders(res, type.startsWith('text/html'));
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); res.end(); return; }
  const headers = { 'Content-Type': type, ETag: etag, 'Cache-Control': rel.startsWith('assets/fonts/') ? 'public, max-age=31536000, immutable' : 'no-cache', Vary: 'Accept-Encoding' };
  if (/text|javascript|json|svg|manifest/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    createReadStream(file).pipe(zlib.createGzip()).pipe(res);
  } else { res.writeHead(200, headers); createReadStream(file).pipe(res); }
}

const int = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
const fail = (status, message) => Object.assign(new Error(message), { status });

function makeHandler(port) {
  // Locally: only this machine's loopback names. Hosted: Vercel only routes this project's own domains here.
  const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  const origins = new Set([...hosts].map((h) => `http://${h}`));
  // Home server: only home-network addresses (an IP, a one-word PC name or a local name like pc.local),
  // never a website's domain, so a site that points its own name at this PC (DNS rebinding) gets nothing.
  const lanHost = /^(?:(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]{1,63}|[a-z0-9.-]{1,240}\.(?:local|lan|home|home\.arpa|internal|localdomain|ts\.net))(?::\d{1,5})?$/;
  const hostOk = (host) => (PUBLIC ? /^[a-z0-9.-]{1,253}(:\d{1,5})?$/.test(host) : HOME ? lanHost.test(host) : hosts.has(host));
  // The Android app bundles the interface and calls the hosted API from its own fixed origin.
  // ".projectvanguard" is not a real top-level domain, so no website can send this origin.
  const fromApp = (origin) => SHARED && origin === APP_ORIGIN;
  const originOk = (origin, host) => (PUBLIC ? origin === `https://${host}` || fromApp(origin) : HOME ? origin === `http://${host}` || fromApp(origin) : origins.has(origin));

  return async (req, res) => {
    // DNS-rebinding protection: only answer requests addressed to this machine
    const host = String(req.headers.host || '').toLowerCase();
    if (!hostOk(host)) { res.writeHead(421, { 'Content-Type': 'text/plain' }); res.end('Misdirected request'); return; }
    let url;
    try { url = new URL(req.url, `http://${req.headers.host}`); } catch { res.writeHead(400); res.end(); return; }
    // On Vercel every /api/* request is rewritten to one function; restore the original path
    if (PUBLIC && url.searchParams.has('__path')) {
      const p = url.searchParams.get('__path');
      url.searchParams.delete('__path');
      if (!/^[\w\/.-]{1,200}$/.test(p)) { res.writeHead(400); res.end(); return; }
      url.pathname = '/api/' + p.replace(/^\/+/, '');
    }
    const { pathname, searchParams } = url;
    const ip = PUBLIC ? String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || 'anon').split(',')[0].trim() : req.socket.remoteAddress || 'local';
    securityHeaders(res, false);
    if (SHARED) {
      res.setHeader('Access-Control-Allow-Origin', APP_ORIGIN);
      if (HOME) res.setHeader('Access-Control-Allow-Private-Network', 'true'); // the app reaching a PC on the home network
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Access-Control-Max-Age', '600');
      if (req.method === 'OPTIONS') { res.writeHead(fromApp(req.headers.origin) ? 204 : 403); res.end(); return; }
    }

    try {
      if (HOME && pathname.startsWith('/api/') && pathname !== '/api/status') notePhone(ip, false);
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (!pathname.startsWith('/api/')) {
          if (HOME && pathname.startsWith('/img/')) {
            if (!allow(`${ip}:img`, 1200)) throw fail(429, 'Too many requests');
            notePhone(ip, true);
            return await serveImage(req, res, pathname, url.search);
          }
          if (HOME && pathname === '/') return sendHomeStatus(req, res);
          if (SHARED) throw fail(404, 'Not found');
          return serveStatic(req, res, pathname);
        }
        // Daily catalog refresh on the hosted site (Vercel Cron, authenticated with CRON_SECRET)
        if (PUBLIC && pathname === '/api/cron/refresh') {
          const want = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
          const got = String(req.headers.authorization || '');
          if (!want || got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) throw fail(401, 'Unauthorized');
          await buildCatalog();
          return sendJSON(req, res, lastError ? 500 : 200, { updated: catalog?.updated || null, count: catalog?.games.length || 0, error: lastError });
        }
        // Browsers send Sec-Fetch-Site; refuse API reads initiated by other websites
        const site = req.headers['sec-fetch-site'];
        if (site && site !== 'same-origin' && site !== 'none' && !fromApp(req.headers.origin)) throw fail(403, 'Cross-site request blocked');
        let m;
        if (pathname === '/api/catalog') { if (!allow(`${ip}:catalog`, LIMITS.catalog)) throw fail(429, 'Too many requests'); return sendCatalog(req, res); }
        if (!allow(`${ip}:read`, LIMITS.read)) throw fail(429, 'Too many requests');
        if (pathname === '/api/session') return sendJSON(req, res, 200, { csrf: CSRF, config: publicConfig() });
        // New free games and big deals since a time (unix seconds): phones turn these into notifications
        if (pathname === '/api/events') {
          const since = int(searchParams.get('since') || 0, 0, 4e9) ?? 0;
          return sendJSON(req, res, 200, { now: Math.floor(Date.now() / 1000), events: events.filter((e) => e.ts > since).slice(-100) }, 60);
        }
        // Current prices for up to 100 games: price alerts check these (the phone app in the background)
        if (pathname === '/api/prices') {
          const ids = [...new Set((searchParams.get('ids') || '').split(',').map(Number))].filter((n) => Number.isInteger(n) && n > 0 && n < 1e8).slice(0, 100);
          const wanted = new Set(ids);
          const prices = {};
          for (const g of catalog?.games || []) if (wanted.has(g.id)) prices[g.id] = { name: g.n, price: g.f ? 0 : g.p ?? null, orig: g.o ?? g.p ?? null, disc: g.d || 0 };
          return sendJSON(req, res, 200, { updated: catalog?.updated || null, prices }, 300);
        }
        if (pathname === '/api/status') {
          return sendJSON(req, res, 200, { updated: catalog?.updated || null, count: catalog?.games.length || 0, building: !!building, progress: buildProgress, pct: buildPct, error: lastError, nextRefresh: catalog ? catalog.updated * 1000 + config.refreshHours * 3600e3 : null, changes: catalog?.changes || null });
        }
        if ((m = pathname.match(/^\/api\/app\/(\d{1,8})$/))) return sendJSON(req, res, 200, await appDetails(+m[1]), 3600);
        if ((m = pathname.match(/^\/api\/reviews\/(\d{1,8})$/))) {
          const order = ['all', 'recent'].includes(searchParams.get('order')) ? searchParams.get('order') : 'all';
          const type = ['all', 'positive', 'negative'].includes(searchParams.get('type')) ? searchParams.get('type') : 'all';
          return sendJSON(req, res, 200, await appReviews(+m[1], order, type), 1800);
        }
        if ((m = pathname.match(/^\/api\/history\/(\d{1,8})$/))) {
          const h = PUBLIC ? await cached('history-all', 10 * 60e3, () => readStore('history.json', {})) : await loadJSON(HISTORY_FILE, {});
          const id = m[1];
          return sendJSON(req, res, 200, { prices: h.prices?.[id] || [], samples: h.samples?.[id] || [], daily: h.daily?.[id] || [] }, 300);
        }
        if ((m = pathname.match(/^\/api\/players\/(\d{1,8})$/))) return sendJSON(req, res, 200, await livePlayers(+m[1]), 30);
        if (pathname === '/api/latest') {
          const d = await cached('latest-release', 3600e3, () => get('https://projection-of-vanguard.github.io/downloads.json'));
          return sendJSON(req, res, 200, { version: String(d?.version || '').slice(0, 20), date: d?.date || null, release: /^https:\/\/github\.com\//.test(d?.release || '') ? d.release : null }, 1800);
        }
        if ((m = pathname.match(/^\/api\/stores\/(\d{1,8})$/))) {
          if (!allow(`${ip}:stores`, 60)) throw fail(429, 'Too many requests');
          return sendJSON(req, res, 200, await otherStores(+m[1]), 1800);
        }
        if (pathname.startsWith('/api/community')) {
          if (!allow(`${ip}:community`, LIMITS.community)) throw fail(429, 'Too many requests');
          const section = searchParams.get('section') || 'all';
          const p = int(searchParams.get('p') || 1, 1, 20);
          if (!(section in SECTIONS) || !p) throw fail(400, 'Invalid section or page');
          if (pathname === '/api/community') { if (section === 'news' || section === 'discussions') throw fail(400, 'Invalid section'); return sendJSON(req, res, 200, await communityHome(section, p), 600); }
          if (pathname === '/api/community/news') return sendJSON(req, res, 200, await communityNews(), 900);
          if (pathname === '/api/community/thread') { const u = searchParams.get('url') || ''; if (u.length > 300) throw fail(400, 'Address too long'); return sendJSON(req, res, 200, await commentThread(u), 300); }
          if ((m = pathname.match(/^\/api\/community\/app\/(\d{1,8})$/))) return sendJSON(req, res, 200, await communityApp(+m[1], section, p), 600);
        }
        throw fail(404, 'Unknown endpoint');
      }

      if (req.method === 'POST') {
        // Writes: same-origin + CSRF token + JSON only
        const origin = req.headers.origin;
        if (!origin || !originOk(origin, host)) throw fail(403, 'Cross-origin request blocked');
        if (!sameToken(req.headers['x-csrf-token'])) throw fail(403, 'Missing or invalid CSRF token');
        if (!/^application\/json\b/.test(req.headers['content-type'] || '')) throw fail(415, 'Expected application/json');
        if (pathname === '/api/ai-search') {
          if (!allow(`${ip}:ai`, LIMITS.ai)) throw fail(429, 'Too many AI searches. Wait a moment and try again.');
          const { q } = await readBody(req, 4096);
          if (typeof q !== 'string' || !q.trim() || q.length > 300) throw fail(400, 'Write a request between 1 and 300 characters.');
          return sendJSON(req, res, 200, await aiSearch(q.trim()));
        }
        if (pathname === '/api/ai-chat') {
          if (!allow(`${ip}:ai`, LIMITS.ai)) throw fail(429, 'Too many questions in a row. Wait a moment and try again.');
          const { messages } = await readBody(req, 32 * 1024);
          if (!Array.isArray(messages) || messages.length > 40) throw fail(400, 'Write a question first.');
          return sendJSON(req, res, 200, await aiChat(messages));
        }
        if (pathname === '/api/ai-prices') {
          if (!allow(`${ip}:ai`, LIMITS.ai)) throw fail(429, 'Too many AI requests. Wait a moment and try again.');
          const { id } = await readBody(req, 512);
          if (!Number.isInteger(id) || id <= 0 || id > 99999999) throw fail(400, 'Unknown game');
          return sendJSON(req, res, 200, await aiPrices(id));
        }
        if (!allow(`${ip}:write`, LIMITS.write)) throw fail(429, 'Too many requests');
        if (SHARED) throw fail(403, 'This option is only available in the desktop app.');
        if (pathname === '/api/config') {
          const body = await readBody(req);
          const before = { catalogMax: config.catalogMax, minPlayers: config.minPlayers };
          await saveConfig(body);
          if (before.catalogMax !== config.catalogMax || before.minPlayers !== config.minPlayers) buildCatalog();
          return sendJSON(req, res, 200, { config: publicConfig() });
        }
        if (pathname === '/api/ai-key') {
          const body = await readBody(req, 4096);
          if (body.provider === null) { secrets.set(null); return sendJSON(req, res, 200, { config: publicConfig() }); }
          const { cleanConfig } = await llm();
          const prev = aiSetup();
          // Changing only the model of the saved key doesn't need the key again
          const key = body.key || (prev?.provider === body.provider && prev?.source === 'saved' ? prev.key : '');
          let cfg;
          try { cfg = cleanConfig({ ...body, key }, { allowCustom: true }); } catch (e) { throw fail(400, e.message); }
          secrets.set(JSON.stringify(cfg));
          return sendJSON(req, res, 200, { config: publicConfig() });
        }
        if (pathname === '/api/ai-models') {
          if (!allow(`${ip}:ai`, LIMITS.ai)) throw fail(429, 'Too many AI requests. Wait a moment and try again.');
          const body = await readBody(req, 4096);
          const { cleanConfig, listModels } = await llm();
          const prev = aiSetup();
          const key = body.key || (prev?.provider === body.provider ? prev.key : '');
          let cfg;
          try { cfg = cleanConfig({ ...body, key, model: body.model || 'any' }, { allowCustom: true }); } catch (e) { throw fail(400, e.message); }
          return sendJSON(req, res, 200, { models: await listModels(cfg) });
        }
        if (pathname === '/api/refresh') {
          if (!allow(`${ip}:refresh`, LIMITS.refresh)) throw fail(429, 'A refresh ran recently. Try again in a few minutes.');
          buildCatalog();
          return sendJSON(req, res, 202, { building: true });
        }
        throw fail(404, 'Unknown endpoint');
      }

      res.writeHead(405, { Allow: 'GET, HEAD, POST' }); res.end();
    } catch (e) {
      const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 502;
      if (status >= 500) log(`error ${pathname}: ${e.message}`);
      if (!res.headersSent) sendJSON(req, res, status, { error: status === 502 && !e.status ? 'Steam did not respond. Try again in a moment.' : e.message });
    }
  };
}

/* ------------------------------------------------------------ hosted site */

let publicReady = null;
let lastCatalogCheck = 0;
/** Request handler for the hosted website (api/index.mjs on Vercel). */
export function createPublicHandler() {
  publicReady ||= (async () => {
    DATA = '/tmp/vanguard';
    CACHE = path.join(DATA, 'cache');
    HISTORY_FILE = path.join(DATA, 'history.json');
    await fs.mkdir(CACHE, { recursive: true });
    config = { ...DEFAULT_CONFIG };
    secrets = { get: () => null, set() { throw Object.assign(new Error('Not available on the website'), { status: 403 }); } };
    catalog = await readStore('catalog.json', null);
    spy = { ...spy, ...(await readStore('steamspy.json', {})) }; // games found by the desktop app's SteamSpy crawl
    events = await readStore('events.json', []); // free games and big deals for phones away from home
    if (catalog?.games?.length) encodeCatalog();
    lastCatalogCheck = Date.now();
    return makeHandler(0);
  })();
  return async (req, res) => {
    const handler = await publicReady;
    // Pick up the daily refresh written by another instance
    if (Date.now() - lastCatalogCheck > 10 * 60e3 && !building) {
      lastCatalogCheck = Date.now();
      const fresh = await readStore('catalog.json', null);
      if (fresh?.games?.length && fresh.updated > (catalog?.updated || 0)) { catalog = fresh; encodeCatalog(); }
      const ev = await readStore('events.json', null);
      if (Array.isArray(ev)) events = ev;
    }
    return handler(req, res);
  };
}

/** Start the data server. Used by `node server.mjs` and by the desktop app. */
export async function startServer({ port = +process.env.PORT || 5173, dataDir = path.join(ROOT, 'data'), secretStore = null, host = '127.0.0.1', refreshHours = null, imageCacheGB = null } = {}) {
  DATA = dataDir;
  CACHE = path.join(DATA, 'cache');
  CATALOG_FILE = path.join(DATA, 'catalog.json');
  HISTORY_FILE = path.join(DATA, 'history.json');
  CONFIG_FILE = path.join(DATA, 'config.json');
  SECRETS_FILE = path.join(DATA, 'secrets.json');
  SPY_FILE = path.join(DATA, 'steamspy.json');
  IMG_DIR = path.join(DATA, 'img');
  await fs.mkdir(CACHE, { recursive: true });
  config = { ...DEFAULT_CONFIG, ...(await loadJSON(CONFIG_FILE, {})) };
  if (refreshHours) config.refreshHours = refreshHours;
  if (imageCacheGB) imgLimit = imageCacheGB * 1073741824;
  events = await loadJSON(path.join(DATA, 'events.json'), []);
  secrets = secretStore || fileSecrets();
  catalog = await loadJSON(CATALOG_FILE, null);
  if (catalog?.games?.length) { encodeCatalog(); log(`catalog: loaded ${catalog.games.length} games from disk`); }

  const isStale = () => !catalog || catalog.v !== 3 || Date.now() - catalog.updated * 1000 > config.refreshHours * 3600e3;
  if (isStale()) buildCatalog();
  const timer = setInterval(() => { if (isStale()) buildCatalog(); }, 10 * 60e3);
  timer.unref?.();
  spy = { ...spy, ...(await loadJSON(SPY_FILE, {})) };
  const spyTimer = setInterval(spyStep, 65e3);
  spyTimer.unref?.();
  setTimeout(spyStep, 5000).unref?.();

  const server = http.createServer({ requestTimeout: 60_000, headersTimeout: 15_000 }, makeHandler(port));
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 60;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  log(`Steam redesign running at http://localhost:${port} (${host === '127.0.0.1' ? 'local only' : 'open to this network'}; catalog refresh every ${config.refreshHours}h)`);
  if (HOME && catalog) setTimeout(warmCache, 15000).unref?.();
  if (HOME) setInterval(phoneReport, 3600e3).unref?.();
  return { port, close: () => new Promise((r) => { clearInterval(timer); clearInterval(spyTimer); server.close(() => r()); }), refresh: buildCatalog };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((e) => { console.error(e.message); process.exit(1); });
}
