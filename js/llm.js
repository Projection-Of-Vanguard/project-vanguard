// Free AI for AI search and price advice: a free key from Google Gemini, Groq or OpenRouter, or your own server.
// Runs in the browser (website and phone app: the key stays on the device and goes straight to
// the provider, never to Project Vanguard's servers) and in Node (desktop app: the local server
// keeps the key, encrypted). No SDKs: each provider's HTTP API is called with fetch.

// Only providers and models with a free tier are offered. "models" lists the free text models, best
// first (checked October 2026); "Load my models" shows only those. Paid providers stay defined (paid:
// true) so a key saved by an older version keeps working, but they are no longer offered.
export const PROVIDERS = {
  gemini: { label: 'Google Gemini', note: 'Free key', kind: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta', models: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'], hint: 'AIza…', keys: 'https://aistudio.google.com/apikey' },
  groq: { label: 'Groq', note: 'Free key', kind: 'openai', base: 'https://api.groq.com/openai/v1', models: ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'], hint: 'gsk_…', keys: 'https://console.groq.com/keys' },
  openrouter: { label: 'OpenRouter', note: 'Free models only', kind: 'openai', base: 'https://openrouter.ai/api/v1', models: ['openrouter/free', 'google/gemma-4-31b-it:free', 'nvidia/nemotron-3-super-120b-a12b:free', 'google/gemma-4-26b-a4b-it:free'], hint: 'sk-or-…', keys: 'https://openrouter.ai/keys' },
  custom: { label: 'Your own AI server', note: 'Ollama, LM Studio and similar, desktop app', kind: 'openai', base: '', models: [], hint: 'Optional', desktopOnly: true },
  openai: { label: 'OpenAI', paid: true, kind: 'openai', base: 'https://api.openai.com/v1', models: ['gpt-5-mini'] },
  anthropic: { label: 'Anthropic', paid: true, kind: 'anthropic', base: 'https://api.anthropic.com/v1', models: ['claude-haiku-5-5'] },
  mistral: { label: 'Mistral', paid: true, kind: 'openai', base: 'https://api.mistral.ai/v1', models: ['mistral-small-latest'] },
  deepseek: { label: 'DeepSeek', paid: true, kind: 'openai', base: 'https://api.deepseek.com/v1', models: ['deepseek-chat'] },
  xai: { label: 'xAI', paid: true, kind: 'openai', base: 'https://api.x.ai/v1', models: ['grok-3-mini'] },
};

/** Hosts the website and phone app may call directly (their Content-Security-Policy allows exactly these). */
export const AI_HOSTS = [...new Set(Object.values(PROVIDERS).filter((p) => !p.paid).map((p) => p.base && new URL(p.base).origin).filter(Boolean))];

/** Guess the provider from the shape of a key (DeepSeek and OpenAI keys look alike: pick in the menu). */
export function detectProvider(key) {
  const k = String(key || '').trim();
  if (/^sk-ant-/.test(k)) return 'anthropic';
  if (/^sk-or-/.test(k)) return 'openrouter';
  if (/^gsk_/.test(k)) return 'groq';
  if (/^xai-/.test(k)) return 'xai';
  if (/^AIza/.test(k)) return 'gemini';
  if (/^sk-/.test(k)) return 'openai';
  return null;
}

/** Check and tidy a provider setup; throws an Error with a message for the person. */
export function cleanConfig(c, { allowCustom = false } = {}) {
  const provider = PROVIDERS[c?.provider] ? c.provider : null;
  if (!provider) throw new Error('Choose an AI provider.');
  if (PROVIDERS[provider].paid) throw new Error('Only free AI is offered: choose Google Gemini, Groq or OpenRouter.');
  if (PROVIDERS[provider].desktopOnly && !allowCustom) throw new Error('Your own AI server works in the desktop app only.');
  const key = String(c.key || '').trim();
  if (provider !== 'custom' && !/^[\w.:-]{16,300}$/.test(key)) throw new Error('That API key looks incomplete. Paste the whole key.');
  if (provider === 'custom' && key && !/^[\w.:-]{1,300}$/.test(key)) throw new Error('That API key has characters a key cannot have.');
  const model = String(c.model || '').trim();
  if (model && !/^[\w.:/@-]{1,120}$/.test(model)) throw new Error('That model name has characters a model name cannot have.');
  let base = PROVIDERS[provider].base;
  if (provider === 'custom') {
    base = String(c.base || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[a-z0-9.-]+(:\d{1,5})?(\/[\w./-]*)?$/i.test(base)) throw new Error('Enter the server address, for example http://localhost:11434/v1');
    if (!model) throw new Error('Enter the model name to use on that server.');
  }
  return { provider, key, model: model || PROVIDERS[provider].models[0], base };
}

const fail = (message, status) => Object.assign(new Error(message), { status });

async function request(url, init, label) {
  let r;
  try { r = await fetch(url, { ...init, signal: init.signal || AbortSignal.timeout(60_000) }); }
  catch (e) { throw fail(e.name === 'TimeoutError' ? `${label} took too long to answer. Try again.` : `Could not reach ${label}. Check your connection.`, 502); }
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  if (!r.ok) {
    const detail = String(data?.error?.message || data?.message || data?.error || '').replace(/\s+/g, ' ').slice(0, 160);
    if (r.status === 401 || (r.status === 403 && !/model/i.test(detail))) throw fail(`${label} rejected the API key. Check it in Settings > AI.`, 401);
    if (r.status === 429) throw fail(`${label} says you're over its rate limit or quota right now. Try again in a minute.`, 429);
    if (r.status === 404 || /model/i.test(detail)) throw fail(`${label} doesn't offer that model to this key. Pick another model in Settings > AI.${detail ? ` (${detail})` : ''}`, 400);
    throw fail(`${label} returned an error (${r.status})${detail ? `: ${detail}` : ''}.`, 502);
  }
  return data;
}

function authHeaders(cfg) {
  const p = PROVIDERS[cfg.provider];
  if (p.kind === 'anthropic') return { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
  if (p.kind === 'gemini') return { 'x-goog-api-key': cfg.key };
  return cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {};
}

/** One request, one JSON answer. */
export async function askJSON(cfg, { system, user, maxTokens = 2000 }) {
  const p = PROVIDERS[cfg.provider];
  const label = cfg.provider === 'custom' ? 'Your AI server' : p.label.replace(/ \(.*\)$/, '');
  const headers = { 'Content-Type': 'application/json', ...authHeaders(cfg) };
  const sys = `${system}\n\nAnswer with one JSON object only: no code fences, no text before or after it.`;
  let text = '';
  if (p.kind === 'anthropic') {
    const d = await request(`${cfg.base}/messages`, { method: 'POST', headers, body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, system: sys, messages: [{ role: 'user', content: user }] }) }, label);
    if (d.stop_reason === 'refusal') throw fail('The AI declined this request. Try rephrasing it.', 422);
    text = (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  } else if (p.kind === 'gemini') {
    const d = await request(`${cfg.base}/models/${encodeURIComponent(cfg.model)}:generateContent`, { method: 'POST', headers, body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: Math.max(maxTokens, 8192) },
    }) }, label);
    text = (d.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
    if (!text && d.promptFeedback?.blockReason) throw fail('The AI declined this request. Try rephrasing it.', 422);
  } else {
    const body = { model: cfg.model, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], response_format: { type: 'json_object' } };
    // OpenAI's newer models count their reasoning in this limit and only accept the newer name for it
    if (cfg.provider === 'openai') body.max_completion_tokens = Math.max(maxTokens, 6000); else body.max_tokens = Math.max(maxTokens, 4000);
    if (cfg.provider === 'groq' && /gpt-oss/.test(cfg.model)) body.reasoning_effort = 'low';
    if (cfg.provider === 'groq' && /qwen3/.test(cfg.model)) body.reasoning_effort = 'none';
    if (cfg.provider === 'openrouter') body.reasoning = { effort: 'low' };
    let d;
    try { d = await request(`${cfg.base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) }, label); }
    catch (e) {
      if (e.status !== 400 && e.status !== 502) throw e;
      delete body.response_format; // some models and servers don't take the JSON switch or the reasoning setting
      delete body.reasoning_effort; delete body.reasoning;
      d = await request(`${cfg.base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) }, label);
    }
    text = d.choices?.[0]?.message?.content || '';
  }
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try { return JSON.parse(json); } catch { throw fail('The AI answered in an unexpected format. Try again, or pick another model.', 502); }
}

/**
 * A conversation turn: messages is [{ role: 'user' | 'assistant', content }], oldest first, ending
 * with the user's message. Returns the reply as plain text.
 */
export async function chat(cfg, { system, messages, maxTokens = 1200 }) {
  const p = PROVIDERS[cfg.provider];
  const label = cfg.provider === 'custom' ? 'Your AI server' : p.label.replace(/ \(.*\)$/, '');
  const headers = { 'Content-Type': 'application/json', ...authHeaders(cfg) };
  if (p.kind === 'anthropic') {
    const d = await request(`${cfg.base}/messages`, { method: 'POST', headers, body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, system, messages }) }, label);
    if (d.stop_reason === 'refusal') throw fail('The AI declined to answer that. Try asking differently.', 422);
    return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  }
  if (p.kind === 'gemini') {
    const d = await request(`${cfg.base}/models/${encodeURIComponent(cfg.model)}:generateContent`, { method: 'POST', headers, body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: Math.max(maxTokens, 8192) },
    }) }, label);
    const text = (d.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('').trim();
    if (!text && d.promptFeedback?.blockReason) throw fail('The AI declined to answer that. Try asking differently.', 422);
    return text;
  }
  const body = { model: cfg.model, messages: [{ role: 'system', content: system }, ...messages], max_tokens: Math.max(maxTokens, 4000) };
  if (cfg.provider === 'groq' && /gpt-oss/.test(cfg.model)) body.reasoning_effort = 'low';
  if (cfg.provider === 'groq' && /qwen3/.test(cfg.model)) body.reasoning_effort = 'none';
  if (cfg.provider === 'openrouter') body.reasoning = { effort: 'low' };
  if (cfg.provider === 'openai') { body.max_completion_tokens = Math.max(maxTokens, 6000); delete body.max_tokens; }
  let d;
  try { d = await request(`${cfg.base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) }, label); }
  catch (e) {
    if (e.status !== 400 && e.status !== 502) throw e;
    delete body.reasoning_effort; delete body.reasoning; // a model that doesn't take the reasoning setting
    d = await request(`${cfg.base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) }, label);
  }
  // Some reasoning models put their thinking in <think> tags; only the answer is shown
  return String(d.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/** Vanguard, the mascot: who it is and how it answers.
 *  games: popular games in the store; related: store games that match the question (relatedGames). */
export function chatSystem(games, related = []) {
  return `You are Vanguard, the friendly cloud-headed robot mascot of Steam Redesigned, an unofficial redesign of the Steam store. You are a gaming expert: answer from everything you know about games on every platform (PC, consoles, mobile, old and new), including games that aren't on Steam or in this store.

How you answer:
- Really answer the question, like a friend who knows games well: explain, compare and give reasons. When you suggest games, add a short reason for each one (what it is and why it fits).
- Be warm and to the point: a few short paragraphs, or a list of up to 6 items. No headings.
- Whenever you name a specific game, write its exact title in double square brackets, like [[Hades]] or [[Stardew Valley]]. The app links the games it sells and shows cards for them.
- The game lists below are hints about what this store sells, not limits. Never say a game "isn't in the catalog" or that you can only see some games.
- Read short follow-ups ("what about Hogwarts?") in the context of the conversation.
- Don't invent prices, discounts or player counts. The app shows live prices on each game's page.
- If a question has nothing to do with games, answer briefly and kindly steer back to games.
- Plain text. Lists use "- " at the start of a line. You may use **bold** for emphasis.
${related.length ? `\nStore games that match this question: ${related.join(', ')}\n` : ''}
Popular games in the store: ${games.join(', ')}`;
}

const STOP = new Set('the and for with what are about like some any game games play playing played that this these those from you your have has best most good great more which who how why when where does can could would should there they them into than then also just only very really want wants looking recommend recommendations suggest something anything other others new old top famous popular tell know think need'.split(' '));
/** Store games that fit the question: its words found in a game's name (strong) or tags.
 *  list: [{ name, tags (lowercase tag names), peak }]. */
export function relatedGames(list, text, limit = 16) {
  const stems = [...new Set((String(text).toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w))
    .map((w) => (w.length > 4 ? w.replace(/(ies|es|s|ing|al)$/, '') : w)))].slice(0, 14);
  if (!stems.length) return [];
  const out = [];
  for (const g of list) {
    const name = String(g.name || '').toLowerCase();
    let s = 0;
    for (const w of stems) s += name.includes(w) ? 3 : (g.tags || '').includes(w) ? 1 : 0;
    if (s) out.push([g, s]);
  }
  return out.sort((a, b) => b[1] - a[1] || (b[0].peak || 0) - (a[0].peak || 0)).slice(0, limit).map(([g]) => g.name);
}

/** The words to match the store against: the last two things the person asked. */
export const askedText = (messages) => messages.filter((m) => m.role === 'user').slice(-2).map((m) => m.content).join(' ');

/** Keep a conversation the right shape and size before it goes to a provider. */
export function cleanMessages(list) {
  const out = (Array.isArray(list) ? list : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 2000) }))
    .slice(-12);
  while (out.length && out[0].role !== 'user') out.shift();
  if (!out.length || out[out.length - 1].role !== 'user') throw fail('Write a question first.', 400);
  // providers want the turns to alternate: merge any two in a row from the same side
  return out.reduce((acc, m) => { const last = acc[acc.length - 1]; if (last && last.role === m.role) last.content += `\n\n${m.content}`; else acc.push({ ...m }); return acc; }, []);
}

/** Models this key can use, with the recommended pick first. */
export async function listModels(cfg) {
  const p = PROVIDERS[cfg.provider];
  const label = cfg.provider === 'custom' ? 'Your AI server' : p.label.replace(/ \(.*\)$/, '');
  const headers = authHeaders(cfg);
  let ids = [];
  if (p.kind === 'gemini') {
    const d = await request(`${cfg.base}/models?pageSize=200`, { headers }, label);
    ids = (d.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''))
      .filter((id) => /gemini/i.test(id) && !/embed|tts|image|vision|aqa|live|audio/i.test(id));
  } else {
    const d = await request(`${cfg.base}/models`, { headers }, label);
    ids = (d.data || d.models || []).map((m) => m.id || m.name).filter(Boolean)
      .filter((id) => !/embed|tts|whisper|dall-e|image|audio|realtime|moderation|transcri|davinci|babbage|search|guard|rerank|ocr/i.test(id));
  }
  // Only the free models: Gemini's and Groq's known free text models, OpenRouter's ":free" ones
  if (cfg.provider === 'gemini' || cfg.provider === 'groq') ids = p.models.filter((m) => ids.includes(m));
  if (cfg.provider === 'openrouter') ids = ids.filter((id) => id === 'openrouter/free' || (id.endsWith(':free') && !/safety|guard|lyria/i.test(id)));
  const known = p.models.filter((m) => ids.includes(m));
  return [...new Set([...known, ...ids.sort().reverse()])].slice(0, 80);
}

/* --------------------------------------------------------------- AI search */

export const SEARCH_SYSTEM = `You turn a player's request for games into search filters for a Steam store catalog.

Return this JSON object:
{"summary": one plain sentence in the same language as the request, "include_tags": [tags], "exclude_tags": [tags], "similar_to": [game names], "title_keywords": [words], "max_price_usd": number or null, "min_review_percent": integer or null, "free_only": boolean, "on_sale_only": boolean, "platform": "any"|"mac"|"linux"|"steam_deck", "release": "any"|"new"|"upcoming"|"older", "sort": "relevance"|"popular"|"rating"|"price_low"|"price_high"|"newest"|"discount"|"players"}

Rules:
- include_tags and exclude_tags must be copied exactly from the tag vocabulary below. Map synonyms and other languages to the closest tags (for example "farming" to "Farming Sim", "scary" to "Horror", "with friends" to "Co-op" or "Online Co-Op"). Use at most 6 include tags; put the defining ones first.
- similar_to lists games the user names as a reference point ("like Hades", "similar to Stardew Valley").
- title_keywords is only for when the user is looking for a specific title or franchise; otherwise leave it empty.
- Prices are in US dollars. "cheap" means under 10, "free" sets free_only.
- release: "new" for the last few months, "upcoming" for unreleased games, "older" for classics.
- sort: pick what the request implies ("best", "highly rated" -> rating; "popular", "everyone plays" -> players; "deals" -> discount); otherwise relevance.

Tag vocabulary:
`;

/** Keep only what the catalog understands. vocab: Map of lower-case tag name -> tag id. */
export function sanitizeIntent(raw, vocab) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const strs = (a, n = 8) => (Array.isArray(a) ? a.filter((s) => typeof s === 'string').map((s) => s.trim().slice(0, 60)).filter(Boolean).slice(0, n) : []);
  const tagIds = (a) => [...new Set(strs(a).map((s) => vocab.get(s.toLowerCase())).filter(Boolean))];
  const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
  const pick = (v, allowed, d) => (allowed.includes(v) ? v : d);
  return {
    summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 240) : '',
    include: tagIds(raw.include_tags).slice(0, 6),
    exclude: tagIds(raw.exclude_tags),
    similar: strs(raw.similar_to, 4),
    keywords: strs(raw.title_keywords, 4),
    maxPrice: num(raw.max_price_usd, 0, 500),
    minReview: num(raw.min_review_percent, 0, 100),
    free: raw.free_only === true,
    sale: raw.on_sale_only === true,
    platform: pick(raw.platform, ['any', 'mac', 'linux', 'steam_deck'], 'any'),
    release: pick(raw.release, ['any', 'new', 'upcoming', 'older'], 'any'),
    sort: pick(raw.sort, ['relevance', 'popular', 'rating', 'price_low', 'price_high', 'newest', 'discount', 'players'], 'relevance'),
  };
}

/* --------------------------------------------------------- price advice */

export const PRICE_SYSTEM = `You are a careful game-deal advisor. You get one PC game and the prices that licensed stores charge for it right now (live data), plus its price history on Steam.

Return this JSON object:
{"verdict": "buy" | "wait" | "free", "headline": a short sentence (max 12 words), "advice": 2 or 3 plain sentences, "best_store": the store name from the data with the best price, or null, "platforms": [{"name": platform or service name, "type": "pc" | "console" | "subscription" | "mobile" | "cloud", "note": a few words}]}

Rules:
- Prices and stores come ONLY from the data you were given. Never invent a price, discount or store deal.
- "verdict": "buy" when today's best price is at or near the lowest recorded price or a strong discount; "wait" when it is usually cheaper during sales; "free" when it costs nothing.
- "platforms": where else the game can be played, from your own knowledge: consoles (PlayStation, Xbox, Nintendo Switch), subscriptions (Xbox Game Pass, PlayStation Plus, EA Play, Ubisoft+) and other PC launchers. Only list ones you are confident about; leave the list empty if unsure. Keep each note under 8 words.
- Mention in "advice" whether a subscription could be cheaper than buying, when that is likely.
- Plain language, no hype, no emoji.`;

export function cleanAdvice(raw, storeNames) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const str = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const types = ['pc', 'console', 'subscription', 'mobile', 'cloud'];
  return {
    verdict: ['buy', 'wait', 'free'].includes(raw.verdict) ? raw.verdict : 'buy',
    headline: str(raw.headline, 100),
    advice: str(raw.advice, 600),
    best: storeNames.includes(raw.best_store) ? raw.best_store : null,
    platforms: (Array.isArray(raw.platforms) ? raw.platforms : []).slice(0, 10)
      .map((x) => ({ name: str(x?.name, 40), type: types.includes(x?.type) ? x.type : 'pc', note: str(x?.note, 60) })).filter((x) => x.name),
  };
}
