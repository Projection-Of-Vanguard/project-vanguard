// Per-viewer state kept in localStorage: cart, wishlist, viewed history, ignored games, follows.

const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (what, id) => listeners.forEach((fn) => fn(what, id));

export const state = {
  cart: read('st-cart', []),
  wish: new Set(read('st-wish', [])),
  viewed: read('st-viewed', []),        // [{ id, t }] newest first
  ignored: new Set(read('st-ignored', [])),
  follow: new Set(read('st-follow', [])),
  owned: new Set(read('st-owned', [])),         // games the viewer marked "I own this"
  liked: new Set(read('st-liked', [])),         // "More like this" feedback on recommendations
  hiddenTags: new Set(read('st-hidden-tags', [])), // tags hidden from the whole store
  seeds: read('st-seeds', []),                  // favourite tags picked on the recommendations page
  targets: read('st-targets', {}),              // { appid: cents } wishlist price alerts
  compare: read('st-compare', []),              // up to 4 games side by side
};

function toggleIn(setKey, storeKey, id, kind) {
  const on = !state[setKey].has(id);
  if (on) state[setKey].add(id); else state[setKey].delete(id);
  write(storeKey, [...state[setKey]]); emit(kind, id);
  return on;
}
export const toggleOwned = (id) => toggleIn('owned', 'st-owned', id, 'owned');
export const toggleLiked = (id) => toggleIn('liked', 'st-liked', id, 'liked');
export const toggleHiddenTag = (id) => toggleIn('hiddenTags', 'st-hidden-tags', id, 'hiddenTags');
export function setSeeds(tags) { state.seeds = [...new Set(tags)].slice(0, 12); write('st-seeds', state.seeds); emit('seeds'); }
export function setTarget(id, cents) {
  if (cents == null) delete state.targets[id]; else state.targets[id] = cents;
  write('st-targets', state.targets); emit('targets', id);
}
export function toggleCompare(id) {
  const on = !state.compare.includes(id);
  state.compare = on ? [...state.compare, id].slice(-4) : state.compare.filter((x) => x !== id);
  write('st-compare', state.compare); emit('compare', id);
  return on;
}
export function unignore(id) { state.ignored.delete(id); write('st-ignored', [...state.ignored]); emit('ignored', id); }

export function prune(valid) {
  state.cart = state.cart.filter(valid);
  state.wish = new Set([...state.wish].filter(valid));
  state.viewed = state.viewed.filter((v) => valid(v.id));
}

export const inCart = (id) => state.cart.includes(id);
export function addToCart(id) { if (inCart(id)) return false; state.cart.push(id); write('st-cart', state.cart); emit('cart', id); return true; }
export function removeFromCart(id) { state.cart = state.cart.filter((x) => x !== id); write('st-cart', state.cart); emit('cart', id); }

export function toggleWish(id) {
  const on = !state.wish.has(id);
  if (on) state.wish.add(id); else state.wish.delete(id);
  write('st-wish', [...state.wish]); emit('wish', id);
  return on;
}

export function toggleFollow(id) {
  const on = !state.follow.has(id);
  if (on) state.follow.add(id); else state.follow.delete(id);
  write('st-follow', [...state.follow]); emit('follow', id);
  return on;
}

export function markViewed(id) {
  if (window.STPrefs?.get().personalize === false) return; // history is off in Settings > Store
  state.viewed = [{ id, t: Date.now() }, ...state.viewed.filter((v) => v.id !== id)].slice(0, 40);
  write('st-viewed', state.viewed); emit('viewed', id);
}
export function clearViewed() { state.viewed = []; write('st-viewed', []); emit('viewed'); }

/** Empty the wishlist, cart or "not interested" list (Settings > Catalog & data). */
export function clearList(kind) {
  if (kind === 'wish') { state.wish.clear(); write('st-wish', []); }
  if (kind === 'cart') { state.cart = []; write('st-cart', []); }
  if (kind === 'ignored') { state.ignored.clear(); write('st-ignored', []); }
  if (kind === 'owned') { state.owned.clear(); write('st-owned', []); }
  if (kind === 'liked') { state.liked.clear(); write('st-liked', []); }
  if (kind === 'hiddenTags') { state.hiddenTags.clear(); write('st-hidden-tags', []); }
  if (kind === 'targets') { state.targets = {}; write('st-targets', {}); }
  emit(kind);
}

export function ignore(id) { state.ignored.add(id); write('st-ignored', [...state.ignored]); emit('ignored', id); }
