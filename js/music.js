// Game soundtracks to listen to while browsing (Settings > Music). Copyright: nothing is copied or
// downloaded. Each album plays through Bandcamp's own embedded player from the composer's official
// Bandcamp page, which is how the artists choose to share it, and links back there to buy it.
// The player sits in a dock outside the page, so music keeps playing while you move around the store.

import { $, esc, icon } from './ui.js';

export const SOUNDTRACKS = [
  { key: 'undertale', game: 'UNDERTALE', composer: 'Toby Fox', app: 391540, album: 2955245981, art: 'a2854475053', url: 'https://tobyfox.bandcamp.com/album/undertale-soundtrack' },
  { key: 'deltarune', game: 'DELTARUNE Chapter 1', composer: 'Toby Fox', app: 1671210, album: 4122870521, art: 'a0588444455', url: 'https://tobyfox.bandcamp.com/album/deltarune-chapter-1-ost' },
  { key: 'hollowknight', game: 'Hollow Knight', composer: 'Christopher Larkin', app: 367520, album: 2306704082, art: 'a0907743342', url: 'https://christopherlarkin.bandcamp.com/album/hollow-knight-original-soundtrack' },
  { key: 'silksong', game: 'Hollow Knight: Silksong', composer: 'Christopher Larkin', app: 1030300, album: 2861197113, art: 'a2085224863', url: 'https://christopherlarkin.bandcamp.com/album/hollow-knight-silksong-original-soundtrack' },
  { key: 'celeste', game: 'Celeste', composer: 'Lena Raine', app: 504230, album: 571927662, art: 'a2002083581', url: 'https://radicaldreamland.bandcamp.com/album/celeste-original-soundtrack' },
  { key: 'hades', game: 'Hades', composer: 'Darren Korb', app: 1145360, album: 3745911129, art: 'a2368914893', url: 'https://supergiantgames.bandcamp.com/album/hades-original-soundtrack' },
  { key: 'stardew', game: 'Stardew Valley', composer: 'ConcernedApe', app: 413150, album: 1011649507, art: 'a1362241216', url: 'https://concernedape.bandcamp.com/album/stardew-valley-ost' },
  { key: 'minecraft', game: 'Minecraft (Volume Alpha)', composer: 'C418', app: null, album: 1349219244, art: 'a3390257927', url: 'https://c418.bandcamp.com/album/minecraft-volume-alpha' },
  { key: 'ftl', game: 'FTL: Faster Than Light', composer: 'Ben Prunty', app: 212680, album: 944775128, art: 'a0460013667', url: 'https://benprunty.bandcamp.com/album/ftl' },
  { key: 'bastion', game: 'Bastion', composer: 'Darren Korb', app: 107100, album: 503501171, art: 'a2603294510', url: 'https://supergiantgames.bandcamp.com/album/bastion-original-soundtrack' },
  { key: 'transistor', game: 'Transistor', composer: 'Darren Korb', app: 237930, album: 2382383956, art: 'a2239763770', url: 'https://supergiantgames.bandcamp.com/album/transistor-original-soundtrack' },
  { key: 'fez', game: 'FEZ', composer: 'Disasterpeace', app: 224760, album: 688853505, art: 'a1214364768', url: 'https://disasterpeace.bandcamp.com/album/fez-ost' },
];
const cover = (t) => `https://f4.bcbits.com/img/${t.art}_5.jpg`;
const byKey = (k) => SOUNDTRACKS.find((t) => t.key === k);
const player = (t) => {
  const accent = (getComputedStyle(document.documentElement).getPropertyValue('--blue').trim() || '#1a9fff').replace('#', '');
  return `https://bandcamp.com/EmbeddedPlayer/album=${t.album}/size=large/bgcol=0b1424/linkcol=${/^[0-9a-f]{6}$/i.test(accent) ? accent : '1a9fff'}/artwork=small/tracklist=true/transparent=true/`;
};

let dock = null;
function render(key) {
  const t = byKey(key);
  if (!t) { dock?.remove(); dock = null; return; }
  if (dock?.dataset.album === String(t.album)) return; // already playing this album: keep the music going
  dock?.remove();
  dock = document.createElement('aside');
  dock.className = 'music';
  dock.dataset.album = String(t.album);
  dock.setAttribute('aria-label', `Soundtrack: ${t.game}`);
  let small = false;
  try { small = localStorage.getItem('st-music-min') === '1'; } catch { /* storage off */ }
  dock.classList.toggle('is-min', small);
  dock.innerHTML = `<div class="music__bar">
      <img src="${cover(t)}" alt="" width="36" height="36">
      <div class="music__title"><b>${esc(t.game)}</b><span>${esc(t.composer)} · via Bandcamp</span></div>
      <a class="iconbtn music__buy" href="${t.url}" target="_blank" rel="noopener" title="Buy it on Bandcamp to support ${esc(t.composer)}" aria-label="Buy the ${esc(t.game)} soundtrack on Bandcamp">${icon('external', 'i i--sm')}</a>
      <button type="button" class="iconbtn" data-music-min aria-expanded="${!small}" aria-label="${small ? 'Show the player' : 'Minimize the player'}">${icon('down', 'i i--sm')}</button>
      <button type="button" class="iconbtn" data-music-close aria-label="Stop the music and close the player">${icon('x', 'i i--sm')}</button>
    </div>
    <p class="music__hint" hidden>${icon('play', 'i i--sm i--fill')}Press the play button below to start the music</p>
    <div class="music__frame"><iframe src="${player(t)}" title="${esc(t.game)} soundtrack by ${esc(t.composer)}, Bandcamp player" allow="autoplay; encrypted-media" seamless></iframe></div>
    ${window.desktop?.openSoundSettings ? '<button type="button" class="music__sound" data-music-sound>Can\'t hear it? Open Windows volume settings</button>' : ''}`;
  document.body.append(dock);
}

/** Point at the play button until it's pressed (a click in the player moves focus into its frame). */
function hint() {
  if (!dock) return;
  dock.classList.remove('is-min');
  const h = dock.querySelector('.music__hint');
  if (!h) return;
  h.hidden = false;
  dock.classList.add('is-waiting');
  const done = () => { if (document.activeElement === dock?.querySelector('iframe')) { h.hidden = true; dock.classList.remove('is-waiting'); window.removeEventListener('blur', check); } };
  const check = () => setTimeout(done, 600); // after the click has finished, so nothing moves under it
  window.addEventListener('blur', check);
}

export function initMusic() {
  const apply = () => render(window.STPrefs?.get().music || '');
  apply();
  window.addEventListener('prefs', (e) => { if (!e.detail || 'music' in e.detail) apply(); });
  window.addEventListener('music-picked', () => setTimeout(hint, 50));
  document.addEventListener('click', (e) => {
    if (!dock?.contains(e.target)) return;
    if (e.target.closest('[data-music-close]')) { window.STPrefs.set({ music: '' }); return; }
    if (e.target.closest('[data-music-sound]')) { window.desktop?.openSoundSettings?.(); return; }
    const m = e.target.closest('[data-music-min]');
    if (m) {
      const small = dock.classList.toggle('is-min');
      m.setAttribute('aria-expanded', String(!small));
      m.setAttribute('aria-label', small ? 'Show the player' : 'Minimize the player');
      try { localStorage.setItem('st-music-min', small ? '1' : '0'); } catch { /* storage off */ }
    }
  });
}

/** Settings > Music */
export function musicPaneHTML() {
  const cur = window.STPrefs?.get().music || '';
  return `<div class="set-group">
    <p class="set-note">Pick a soundtrack to play while you browse. Settings closes and a player opens in the corner: press its play button to start; it keeps playing as you move around the store. Music streams from each composer's official Bandcamp page through Bandcamp's own player: nothing is copied into this app. If you love a soundtrack, buy it there to support the composer.</p>
    <div class="ost-grid" role="radiogroup" aria-label="Soundtrack">${SOUNDTRACKS.map((t) => `<button type="button" class="ost" role="radio" aria-checked="${cur === t.key}" data-ost="${t.key}">
      <img src="${cover(t)}" alt="" loading="lazy" width="120" height="120"><span class="ost__game">${esc(t.game)}</span><span class="ost__by">${esc(t.composer)}</span></button>`).join('')}</div>
    <div class="set-row"><div><p class="set-row__label">Music</p><p class="set-row__desc">${cur ? `Now: ${esc(byKey(cur)?.game || '')}` : 'Off'}</p></div>${cur ? '<button type="button" class="btn btn--ghost btn--sm" data-ost="">Turn music off</button>' : ''}</div>
  </div>`;
}
