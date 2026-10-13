// AI search: Claude turns a natural-language request into filters (server side, see /api/ai-search);
// this module applies them to the catalog and ranks the results. Without an API key an offline
// parser understands the common patterns (price, tags, "like X", platforms, release window).

import { db, norm, searchGames, tagName, tagId, post } from './data.js';
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

/** Ask Claude (via the local server); fall back to the offline parser when AI is unavailable. */
export async function interpret(q) {
  try {
    const { intent, model } = await post('/api/ai-search', { q });
    return { intent, source: model || 'claude', online: true };
  } catch (e) {
    return { intent: offlineIntent(q), source: 'offline', online: false, reason: e.message, status: e.status };
  }
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
