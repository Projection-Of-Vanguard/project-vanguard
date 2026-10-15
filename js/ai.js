// AI search: the connected AI (any provider, see llm.js) turns a natural-language request into filters;
// this module applies them to the catalog and ranks the results. Without an API key an offline
// parser understands the common patterns (price, tags, "like X", platforms, release window).

import { db, norm, searchGames, tagName, tagId, post, getSession } from './data.js';
import { askJSON, sanitizeIntent, cleanAdvice, SEARCH_SYSTEM, PRICE_SYSTEM, PROVIDERS } from './llm.js';
import { similarity } from './recs.js';

const SYNONYMS = {
  // English
  friends: 'Co-op', coop: 'Co-op', 'co op': 'Co-op', together: 'Co-op', scary: 'Horror', spooky: 'Horror', horror: 'Horror',
  farming: 'Farming Sim', farm: 'Farming Sim', cozy: 'Cozy', cosy: 'Cozy', chill: 'Relaxing', relaxing: 'Relaxing',
  shooter: 'Shooter', shooting: 'Shooter', fps: 'FPS', racing: 'Racing', cars: 'Driving', driving: 'Driving',
  space: 'Space', zombie: 'Zombies', zombies: 'Zombies', story: 'Story Rich', narrative: 'Story Rich', hard: 'Difficult',
  difficult: 'Difficult', pixel: 'Pixel Graphics', anime: 'Anime', survival: 'Survival', rpg: 'RPG', strategy: 'Strategy',
  multiplayer: 'Multiplayer', online: 'Online Co-Op', 'single player': 'Singleplayer', singleplayer: 'Singleplayer',
  'open world': 'Open World', soulslike: 'Souls-like', 'souls like': 'Souls-like', roguelike: 'Roguelike', roguelite: 'Roguelite',
  puzzle: 'Puzzle', platformer: 'Platformer', building: 'Building', 'city builder': 'City Builder', sandbox: 'Sandbox',
  crafting: 'Crafting', fantasy: 'Fantasy', 'sci fi': 'Sci-fi', scifi: 'Sci-fi', war: 'War', military: 'Military',
  football: 'Soccer', soccer: 'Soccer', sports: 'Sports', fighting: 'Fighting', cute: 'Cute', funny: 'Funny', vr: 'VR',
  'turn based': 'Turn-Based Strategy', tactics: 'Tactical', stealth: 'Stealth', mystery: 'Mystery', detective: 'Detective',
  // Turkish
  korku: 'Horror', arkadas: 'Co-op', arkadaslarla: 'Co-op', ciftlik: 'Farming Sim', 'acik dunya': 'Open World', yaris: 'Racing',
  araba: 'Driving', strateji: 'Strategy', 'hayatta kalma': 'Survival', uzay: 'Space', hikaye: 'Story Rich', zor: 'Difficult',
  rahatlatici: 'Relaxing', futbol: 'Soccer', savas: 'War', bulmaca: 'Puzzle', 'tek oyunculu': 'Singleplayer', 'cok oyunculu': 'Multiplayer',
};

function offlineIntent(q) {
  const n = norm(q);
  const intent = { summary: '', include: [], exclude: [], similar: [], keywords: [], maxPrice: null, minReview: null, free: false, sale: false, platform: 'any', release: 'any', sort: 'relevance' };
  const price = n.match(/(?:under|below|less than|max|cheaper than|altinda|alti)\s*\$?\s*(\d{1,3})/) || n.match(/\$\s*(\d{1,3})/) || n.match(/(\d{1,3})\s*(?:dollar|usd|\$)/);
  if (price) intent.maxPrice = +price[1];
  else if (/\b(cheap|budget|ucuz)\b/.test(n)) intent.maxPrice = 10;
  if (/\b(free|ucretsiz|bedava)\b/.test(n)) intent.free = true;
  if (/\b(sale|discount|deal|deals|indirim)\b/.test(n)) intent.sale = true;
  if (/\b(mac|macos)\b/.test(n)) intent.platform = 'mac';
  else if (/\blinux\b/.test(n)) intent.platform = 'linux';
  else if (/\b(deck|steam deck|handheld)\b/.test(n)) intent.platform = 'steam_deck';
  if (/\b(upcoming|coming soon|unreleased|yakinda)\b/.test(n)) intent.release = 'upcoming';
  else if (/\b(new|newest|latest|recent|yeni)\b/.test(n)) intent.release = 'new';
  else if (/\b(classic|old|retro|eski)\b/.test(n)) intent.release = 'older';
  if (/\b(best|top rated|highest rated|masterpiece|en iyi)\b/.test(n)) { intent.sort = 'rating'; intent.minReview = 85; }
  else if (/\b(popular|everyone|most played|populer)\b/.test(n)) intent.sort = 'players';
  const like = q.match(/(?:like|similar to|benzeri|gibi)\s+([^,.;]+?)(?:\s+(?:but|with|under|that|for|ama)\b|[,.;]|$)/i);
  if (like) intent.similar.push(like[1].trim());
  const neg = [...n.matchAll(/\b(?:no|without|not|except|olmayan|haric)\s+([a-z ]{3,20})/g)].map((m) => m[1].trim());

  const found = new Map();
  const consider = (phrase, negative) => {
    const id = tagId(phrase);
    if (id && db.tagCount.get(id)) found.set(id, negative);
  };
  for (const [syn, tag] of Object.entries(SYNONYMS)) if (new RegExp(`\\b${syn}(?:s|es)?\\b`).test(n)) consider(tag, neg.some((x) => x.startsWith(syn)));
  for (const [id, name] of db.tags) {
    const t = norm(name);
    if (t.length >= 3 && new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s|es)?\\b`).test(n) && db.tagCount.get(id)) found.set(id, neg.some((x) => x.startsWith(t)));
  }
  for (const [id, negative] of found) (negative ? intent.exclude : intent.include).push(id);
  intent.include = intent.include.slice(0, 6);

  const parts = [];
  if (intent.include.length) parts.push(intent.include.map(tagName).join(', '));
  if (intent.similar.length) parts.push(`like ${intent.similar.join(', ')}`);
  if (intent.free) parts.push('free to play'); else if (intent.maxPrice != null) parts.push(`under $${intent.maxPrice}`);
  if (intent.sale) parts.push('on sale');
  intent.summary = parts.length ? `Games: ${parts.join(' · ')}.` : 'Games whose names match your words.';
  if (!intent.include.length && !intent.similar.length) intent.keywords = [q];
  return intent;
}

/* Where the AI key lives: the desktop app's local server keeps it encrypted ("server"); the website
   and phone app keep it on this device and call the provider directly ("device"). */
const AI_STORE = 'st-ai';
export const deviceAI = {
  get() { try { const c = JSON.parse(localStorage.getItem(AI_STORE) || 'null'); return c?.provider ? c : null; } catch { return null; } },
  set(c) { localStorage.setItem(AI_STORE, JSON.stringify(c)); },
  clear() { try { localStorage.removeItem(AI_STORE); } catch { /* storage off */ } },
};
export async function aiWhere() {
  const s = await getSession();
  return s.config.publicSite ? 'device' : 'server';
}
const noAI = () => Object.assign(new Error('AI is not set up. Add an API key from any AI provider in Settings > AI.'), { status: 409 });
const label = (c) => `${PROVIDERS[c.provider]?.label.replace(/ \(.*\)$/, '') || 'AI'} · ${c.model}`;

/** Ask the connected AI; fall back to the offline parser when AI is unavailable. */
export async function interpret(q) {
  try {
    if (await aiWhere() === 'server') {
      const { intent, model } = await post('/api/ai-search', { q });
      return { intent, source: model || 'AI', online: true };
    }
    const cfg = deviceAI.get();
    if (!cfg) throw noAI();
    const vocab = new Map([...db.tags].map(([id, n]) => [n.toLowerCase(), id]));
    const raw = await askJSON(cfg, { system: SEARCH_SYSTEM + [...db.tags.values()].sort().join(', '), user: q, maxTokens: 1500 });
    return { intent: sanitizeIntent(raw, vocab), source: label(cfg), online: true };
  } catch (e) {
    return { intent: offlineIntent(q), source: 'offline', online: false, reason: e.message, status: e.status };
  }
}

/** Is an AI connected on this device or desktop app? */
export async function aiConnected() {
  if (await aiWhere() === 'server') return !!(await getSession()).config.aiConfigured;
  return !!deviceAI.get();
}

/** Buying advice from the connected AI, given live store prices (see /api/stores). */
export async function priceAdvice(g, other) {
  if (await aiWhere() === 'server') return post('/api/ai-prices', { id: g.id });
  const cfg = deviceAI.get();
  if (!cfg) throw noAI();
  const usd = (c) => (c == null ? null : +(c / 100).toFixed(2));
  const facts = {
    game: g.name, free_to_play: !!g.free, steam_price_usd: usd(g.price), steam_regular_price_usd: usd(g.orig), steam_discount_percent: g.disc || 0,
    lowest_price_ever_usd: usd(other.lowest?.price), lowest_price_ever_date: other.lowest?.date ? new Date(other.lowest.date * 1000).toISOString().slice(0, 10) : null,
    stores_now: other.deals.map((x) => ({ store: x.store, price_usd: usd(x.price), regular_usd: usd(x.retail), discount_percent: x.cut })),
  };
  const raw = await askJSON(cfg, { system: PRICE_SYSTEM, user: JSON.stringify(facts), maxTokens: 1500 });
  return { advice: cleanAdvice(raw, other.deals.map((x) => x.store)), model: cfg.model };
}

/** Apply an intent to the catalog. Returns ranked games with a short "why". */
export function runIntent(intent, limit = 60) {
  const refs = intent.similar.map((s) => searchGames(s, 1)[0]).filter(Boolean);
  const refIds = new Set(refs.map((g) => g.id));
  const now = Date.now();
  const keyword = intent.keywords.map(norm).filter(Boolean);
  const out = [];
  for (const g of db.games) {
    if (refIds.has(g.id)) continue;
    if (intent.exclude.some((t) => g.tags.includes(t))) continue;
    if (intent.free && !g.free) continue;
    if (intent.sale && !g.disc) continue;
    if (intent.maxPrice != null && !(g.effPrice <= intent.maxPrice * 100)) continue;
    if (intent.minReview != null && (g.pct < intent.minReview || g.reviews < 20)) continue;
    if (intent.platform === 'mac' && !(g.plat & 2)) continue;
    if (intent.platform === 'linux' && !(g.plat & 4)) continue;
    if (intent.platform === 'steam_deck' && g.deck !== 3) continue;
    if (intent.release === 'upcoming' && !g.coming) continue;
    if (intent.release === 'new' && (g.coming || !g.release || now - g.release > 180 * 864e5)) continue;
    if (intent.release === 'older' && (!g.release || g.release > Date.UTC(2018, 0, 1))) continue;

    let tagScore = 0;
    const matched = [];
    intent.include.forEach((t, k) => {
      const pos = g.tags.indexOf(t);
      if (pos >= 0) { tagScore += (1 / (1 + k * 0.35)) * (1 / (1 + pos * 0.12)); matched.push(t); }
    });
    if (intent.include.length && !matched.length) continue;
    if (intent.include.length >= 3 && matched.length < 2) continue;

    let kwScore = 0;
    if (keyword.length) {
      const hit = keyword.every((k) => g.s_n.includes(k)) ? 1 : searchGames(keyword.join(' '), 1, [g]).length ? 0.6 : 0;
      if (!hit && !intent.include.length && !refs.length) continue;
      if (intent.keywords.length && !intent.include.length && !refs.length && !hit) continue;
      kwScore = hit;
    }

    let sim = 0;
    let simTo = null;
    for (const r of refs) { const v = similarity(r, g); if (v > sim) { sim = v; simTo = r; } }
    if (refs.length && sim < 0.2 && !matched.length) continue;

    const score = tagScore * 1.2 + sim * 3 + kwScore * 2 + g.quality * 0.7 + 0.5 / (1 + (g.mp || g.ts || 5000) / 200);
    const why = [];
    if (simTo && sim >= 0.25) why.push(`Like ${simTo.name}`);
    if (matched.length) why.push(matched.slice(0, 3).map(tagName).join(', '));
    out.push({ g, score, why: why.join(' · ') });
  }
  const p = (x) => (x.g.effPrice === Infinity ? 1e9 : x.g.effPrice);
  const sorts = {
    rating: (a, b) => b.g.quality - a.g.quality, players: (a, b) => (b.g.players || 0) - (a.g.players || 0), popular: (a, b) => (a.g.ts || 9999) - (b.g.ts || 9999),
    price_low: (a, b) => p(a) - p(b), price_high: (a, b) => p(b) - p(a), newest: (a, b) => b.g.release - a.g.release, discount: (a, b) => b.g.disc - a.g.disc,
  };
  out.sort(sorts[intent.sort] || ((a, b) => b.score - a.score));
  return { results: out.slice(0, limit), refs };
}

export const EXAMPLES = [
  'Cozy farming games to play with friends',
  'Hard roguelikes like Hades under $20',
  'Story rich RPGs with great reviews',
  'Free shooters that run on Steam Deck',
  'Horror co-op games on sale',
  'Relaxing city builders',
];
