// Game soundtracks while you browse (Settings > Music), in a player you can drag anywhere.
//
// Copyright: nothing is copied, downloaded or hosted by this app. Albums play through YouTube's
// official embedded player from the composers' official releases ("Topic" album uploads), which is
// how they license them for embedding; the player stays visible (YouTube asks for at least 200×200)
// and our buttons drive it through YouTube's player messages. Albums only on Bandcamp play in
// Bandcamp's own player. Every album links to the composer's Bandcamp page to buy it.

import { esc, icon } from './ui.js';

export const SOUNDTRACKS = [
  { key: 'undertale', game: 'UNDERTALE', composer: 'Toby Fox', yt: 'OLAK5uy_ljXkQlhVlWyV7BxSxMMzgOLbzYS_-JPt4', album: 2955245981, art: 'a2854475053', url: 'https://tobyfox.bandcamp.com/album/undertale-soundtrack' },
  { key: 'deltarune', game: 'DELTARUNE Chapter 1', composer: 'Toby Fox', yt: 'OLAK5uy_kidGzGmzCUSJK1LAtIh7ngZwRF9MT3qjE', album: 4122870521, art: 'a0588444455', url: 'https://tobyfox.bandcamp.com/album/deltarune-chapter-1-ost' },
  { key: 'hollowknight', game: 'Hollow Knight', composer: 'Christopher Larkin', yt: null, album: 2306704082, art: 'a0907743342', url: 'https://christopherlarkin.bandcamp.com/album/hollow-knight-original-soundtrack' },
  { key: 'hkpiano', game: 'Hollow Knight Piano Collections', composer: 'Christopher Larkin, arr. David Peacock', yt: 'OLAK5uy_mXhU9Qga5Zg6sH93Wq2LHS4LVQzDEnSe4', album: null, art: 'a2490527831', url: 'https://materiacollective.bandcamp.com/album/hollow-knight-piano-collections' },
  { key: 'silksong', game: 'Hollow Knight: Silksong', composer: 'Christopher Larkin', yt: null, album: 2861197113, art: 'a2085224863', url: 'https://christopherlarkin.bandcamp.com/album/hollow-knight-silksong-original-soundtrack' },
  { key: 'celeste', game: 'Celeste', composer: 'Lena Raine', yt: 'OLAK5uy_ldwra1FpxzeMnDl59N6hDiGJvZmn7SUkY', album: 571927662, art: 'a2002083581', url: 'https://radicaldreamland.bandcamp.com/album/celeste-original-soundtrack' },
  { key: 'hades', game: 'Hades', composer: 'Darren Korb', yt: 'OLAK5uy_kjxEGAEQktN4lDarnp1XXNKOxBq95iFQ0', album: 3745911129, art: 'a2368914893', url: 'https://supergiantgames.bandcamp.com/album/hades-original-soundtrack' },
  { key: 'stardew', game: 'Stardew Valley', composer: 'ConcernedApe', yt: null, album: 1011649507, art: 'a1362241216', url: 'https://concernedape.bandcamp.com/album/stardew-valley-ost' },
  { key: 'minecraft', game: 'Minecraft (Volume Alpha)', composer: 'C418', yt: 'OLAK5uy_nhQ2EVQRbH-uWJbaesYXRQGZMzinN0qqg', album: 1349219244, art: 'a3390257927', url: 'https://c418.bandcamp.com/album/minecraft-volume-alpha' },
  { key: 'ftl', game: 'FTL: Faster Than Light', composer: 'Ben Prunty', yt: 'OLAK5uy_nfsrm6hDkDAOoRfa_81RisUvHd3hwaYgI', album: 944775128, art: 'a0460013667', url: 'https://benprunty.bandcamp.com/album/ftl' },
  { key: 'bastion', game: 'Bastion', composer: 'Darren Korb', yt: null, album: 503501171, art: 'a2603294510', url: 'https://supergiantgames.bandcamp.com/album/bastion-original-soundtrack' },
  { key: 'transistor', game: 'Transistor', composer: 'Darren Korb', yt: 'OLAK5uy_lSMG5N4RdAkcP9BP9UxwGgTZ0bcBPpcMg', album: 2382383956, art: 'a2239763770', url: 'https://supergiantgames.bandcamp.com/album/transistor-original-soundtrack' },
  { key: 'fez', game: 'FEZ', composer: 'Disasterpeace', yt: 'OLAK5uy_lULu81pX-hSUM3rZlMkanfXN4GKhnl-p4', album: 688853505, art: 'a1214364768', url: 'https://disasterpeace.bandcamp.com/album/fez-ost' },
];
const cover = (t) => `https://f4.bcbits.com/img/${t.art}_5.jpg`;
const byKey = (k) => SOUNDTRACKS.find((t) => t.key === k);
const YT = 'https://www.youtube-nocookie.com';

// YouTube-style glyphs (filled, 24×24)
const G = {
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>',
  pause: '<rect x="6" y="5" width="4.2" height="14" rx="1.2"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.2"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  next: '<path d="M5 6.2v11.6a.9.9 0 0 0 1.4.75L15 12.75a.9.9 0 0 0 0-1.5L6.4 5.45A.9.9 0 0 0 5 6.2z"/><rect x="16.4" y="5.5" width="2.6" height="13" rx="1"/>',
  prev: '<path d="M19 6.2v11.6a.9.9 0 0 1-1.4.75L9 12.75a.9.9 0 0 1 0-1.5l8.6-5.8A.9.9 0 0 1 19 6.2z"/><rect x="5" y="5.5" width="2.6" height="13" rx="1"/>',
  back10: '<path d="M12 5a7 7 0 1 1-6.6 9.3 1 1 0 1 1 1.9-.6A5 5 0 1 0 12 7v1.6a.6.6 0 0 1-1 .45L8 6.5a.6.6 0 0 1 0-.9l3-2.55a.6.6 0 0 1 1 .45z"/><text x="12" y="15.4" text-anchor="middle" font-size="6.6" font-weight="700" font-family="system-ui">10</text>',
  fwd10: '<path d="M12 5a7 7 0 1 0 6.6 9.3 1 1 0 1 0-1.9-.6A5 5 0 1 1 12 7v1.6a.6.6 0 0 0 1 .45l3-2.55a.6.6 0 0 0 0-.9l-3-2.55a.6.6 0 0 0-1 .45z"/><text x="12" y="15.4" text-anchor="middle" font-size="6.6" font-weight="700" font-family="system-ui">10</text>',
  vol: '<path d="M4 9.5h3.2L11.5 6v12l-4.3-3.5H4z"/><path d="M14.5 8.8a4.4 4.4 0 0 1 0 6.4M17 6.3a8 8 0 0 1 0 11.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  mute: '<path d="M4 9.5h3.2L11.5 6v12l-4.3-3.5H4z"/><path d="M15 9.5l5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  shuffle: '<path d="M4 7h3.2c1.4 0 2.6.7 3.4 1.8l3 4.4A4 4 0 0 0 17 15h1.5M4 17h3.2c1 0 1.9-.4 2.6-1M14 8.6A4 4 0 0 1 17 7h1.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M17.5 4.5 20.5 7l-3 2.5zM17.5 12.5l3 2.5-3 2.5z"/>',
  repeat: '<path d="M5 11V9.5A2.5 2.5 0 0 1 7.5 7H18M19 13v1.5a2.5 2.5 0 0 1-2.5 2.5H6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M16.5 4.5 19.5 7l-3 2.5zM7.5 14.5 4.5 17l3 2.5z"/>',
  grow: '<path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  shrink: '<path d="M20 10h-6V4M4 14h6v6M14 10l6.5-6.5M10 14l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  grip: '<circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="7" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="17" r="1.5"/><circle cx="15" cy="17" r="1.5"/>',
};
const g = (name, cls = '') => `<svg class="mp__g ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${G[name]}</svg>`;
const clock = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/* ------------------------------------------------------------ saved layout */
const UI_KEY = 'st-music-ui';
const ui = (() => { try { return { mode: innerWidth < 600 ? 'compact' : 'full', volume: 70, muted: false, shuffle: false, loop: true, ...JSON.parse(localStorage.getItem(UI_KEY) || '{}') }; } catch { return { mode: 'full', volume: 70, muted: false, shuffle: false, loop: true }; } })();
const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* storage off */ } };

let dock = null;
let frame = null;
let yt = null; // YouTube player state for the open album
const zoom = () => parseFloat(getComputedStyle(document.documentElement).zoom) || 1;

/** Keep the player on screen. Positions are stored in CSS pixels of the zoomed page. */
function place() {
  // A hidden or minimised window has no size yet: wait, so the saved spot isn't lost
  if (!dock || !innerWidth || !innerHeight || !dock.offsetWidth) return;
  const z = zoom();
  const vw = innerWidth / z, vh = innerHeight / z;
  const w = dock.offsetWidth, h = dock.offsetHeight;
  if (ui.x == null || ui.y == null) { ui.x = vw < 720 ? 8 : 18; ui.y = vh - h - (vw < 720 ? 84 : 18); } // above the phone tab bar
  // Only what's shown is kept on screen; the saved spot comes back when the window is big enough again
  dock.style.left = `${Math.min(Math.max(8, ui.x), Math.max(8, vw - w - 8))}px`;
  dock.style.top = `${Math.min(Math.max(8, ui.y), Math.max(8, vh - h - 8))}px`;
}

/* --------------------------------------------------- YouTube player messages */
function send(func, args = []) { frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' }), YT); }

function onYT(e) {
  if (e.origin !== YT || !frame || e.source !== frame.contentWindow) return;
  let d;
  try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
  if (!d || !yt) return;
  if (d.event === 'onReady') {
    yt.ready = true;
    send('setVolume', [ui.volume]);
    send(ui.muted ? 'mute' : 'unMute');
    send('setShuffle', [ui.shuffle]);
    send('setLoop', [ui.loop]);
    if (yt.autoplay) send('playVideo');
  }
  const info = d.info || {};
  if (d.event === 'onStateChange' && typeof d.info === 'number') yt.state = d.info;
  if (d.event === 'infoDelivery') {
    if (typeof info.playerState === 'number') yt.state = info.playerState;
    if (typeof info.currentTime === 'number') yt.time = info.currentTime;
    if (typeof info.duration === 'number') yt.duration = info.duration;
    if (info.videoData?.title) yt.title = info.videoData.title;
    if (typeof info.playlistIndex === 'number') yt.index = info.playlistIndex;
    if (Array.isArray(info.playlist)) yt.count = info.playlist.length;
  }
  // A track the label doesn't allow outside YouTube: skip it
  if (d.event === 'onError') { yt.errors = (yt.errors || 0) + 1; if (yt.errors < 6) send('nextVideo'); }
  paint();
}

/** Reflect the player state in our controls. */
function paint() {
  if (!dock || !yt) return;
  const playing = yt.state === 1 || yt.state === 3;
  const q = (s) => dock.querySelector(s);
  q('[data-mp="toggle"]').innerHTML = g(playing ? 'pause' : 'play');
  q('[data-mp="toggle"]').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  q('.mp__track').textContent = yt.title || 'Press play';
  q('.mp__count').textContent = yt.count ? `Track ${(yt.index || 0) + 1} of ${yt.count}` : '';
  const bar = q('.mp__bar');
  if (!yt.seeking) {
    bar.max = String(Math.max(1, Math.round(yt.duration || 0)));
    bar.value = String(Math.round(yt.time || 0));
    bar.style.setProperty('--p', `${yt.duration ? (100 * (yt.time || 0)) / yt.duration : 0}%`);
  }
  q('.mp__time').textContent = clock(yt.time);
  q('.mp__dur').textContent = yt.duration ? clock(yt.duration) : '0:00';
  dock.classList.toggle('is-playing', playing);
}

/* ------------------------------------------------------------- the player */
function render(key, { autoplay = false } = {}) {
  const t = byKey(key);
  if (!t) { dock?.remove(); dock = null; frame = null; yt = null; return; }
  if (dock?.dataset.album === t.key) { if (autoplay && yt) { if (yt.ready) send('playVideo'); else yt.autoplay = true; } return; }
  dock?.remove();
  dock = document.createElement('aside');
  dock.className = `mp mp--${t.yt ? 'yt' : 'bc'}`;
  dock.dataset.album = t.key;
  dock.dataset.mode = ui.mode === 'compact' ? 'compact' : 'full';
  dock.setAttribute('aria-label', `Music player: ${t.game}`);
  const head = `<header class="mp__head">
      <button type="button" class="mp__grip" data-mp-grip aria-label="Move the player (drag, or use the arrow keys)" title="Drag to move">${g('grip')}</button>
      <img class="mp__cover" src="${cover(t)}" alt="" width="34" height="34">
      <div class="mp__title"><b>${esc(t.game)}</b><span>${esc(t.composer)}</span></div>
      <a class="mp__icon" href="${t.url}" target="_blank" rel="noopener" title="Buy it on Bandcamp to support ${esc(t.composer)}" aria-label="Buy the ${esc(t.game)} soundtrack on Bandcamp">${icon('external', 'i i--sm')}</a>
      <button type="button" class="mp__icon" data-mp="mode" aria-label="${dock.dataset.mode === 'full' ? 'Make the player smaller' : 'Make the player bigger'}">${g(dock.dataset.mode === 'full' ? 'shrink' : 'grow')}</button>
      <button type="button" class="mp__icon" data-mp="close" aria-label="Stop the music and close the player">${icon('x', 'i i--sm')}</button>
    </header>`;
  if (t.yt) {
    yt = { autoplay, state: -1, time: 0, duration: 0, title: '', index: 0, count: 0 };
    const src = `${YT}/embed/videoseries?list=${t.yt}&enablejsapi=1&controls=0&disablekb=1&playsinline=1&rel=0&iv_load_policy=3&fs=0&origin=${encodeURIComponent(location.origin)}${autoplay ? '&autoplay=1' : ''}`;
    dock.innerHTML = `${head}
      <div class="mp__screen"><iframe src="${src}" title="${esc(t.game)} soundtrack by ${esc(t.composer)} (YouTube player)" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
      <div class="mp__now"><p class="mp__track">Loading…</p><p class="mp__count"></p></div>
      <div class="mp__seek"><span class="mp__time">0:00</span><input type="range" class="mp__bar" min="0" max="1" step="1" value="0" aria-label="Position in the track"><span class="mp__dur">0:00</span></div>
      <div class="mp__controls">
        <button type="button" class="mp__btn mp__btn--sm${ui.shuffle ? ' is-on' : ''}" data-mp="shuffle" aria-pressed="${ui.shuffle}" aria-label="Shuffle" title="Shuffle">${g('shuffle')}</button>
        <button type="button" class="mp__btn" data-mp="prev" aria-label="Previous track" title="Previous track">${g('prev')}</button>
        <button type="button" class="mp__btn" data-mp="back" aria-label="Back 10 seconds" title="Back 10 seconds">${g('back10')}</button>
        <button type="button" class="mp__btn mp__btn--play" data-mp="toggle" aria-label="Play">${g('play')}</button>
        <button type="button" class="mp__btn" data-mp="fwd" aria-label="Forward 10 seconds" title="Forward 10 seconds">${g('fwd10')}</button>
        <button type="button" class="mp__btn" data-mp="next" aria-label="Next track" title="Next track">${g('next')}</button>
        <button type="button" class="mp__btn mp__btn--sm" data-mp="stop" aria-label="Stop" title="Stop">${g('stop')}</button>
      </div>
      <div class="mp__vol">
        <button type="button" class="mp__btn mp__btn--sm" data-mp="mute" aria-label="${ui.muted ? 'Unmute' : 'Mute'}" title="${ui.muted ? 'Unmute' : 'Mute'}">${g(ui.muted || !ui.volume ? 'mute' : 'vol')}</button>
        <input type="range" class="mp__volbar" min="0" max="100" step="1" value="${ui.volume}" aria-label="Volume" style="--p:${ui.muted ? 0 : ui.volume}%">
        <span class="mp__volnum">${ui.muted ? 0 : ui.volume}</span>
        <button type="button" class="mp__btn mp__btn--sm${ui.loop ? ' is-on' : ''}" data-mp="loop" aria-pressed="${ui.loop}" aria-label="Repeat the album" title="Repeat the album">${g('repeat')}</button>
      </div>
      ${window.desktop?.openSoundSettings ? '<button type="button" class="mp__sound" data-mp="sound">Still quiet? Open Windows volume settings</button>' : ''}`;
  } else {
    yt = null;
    dock.innerHTML = `${head}
      <p class="mp__note">This album is only on Bandcamp, so it plays in Bandcamp's own player: use its buttons. Albums with full controls are marked in Settings &gt; Music.</p>
      <div class="mp__bc"><iframe src="https://bandcamp.com/EmbeddedPlayer/album=${t.album}/size=large/bgcol=0b1424/linkcol=1a9fff/artwork=small/tracklist=true/transparent=true/" title="${esc(t.game)} soundtrack by ${esc(t.composer)} (Bandcamp player)" allow="autoplay; encrypted-media" seamless></iframe></div>
      ${window.desktop?.openSoundSettings ? '<button type="button" class="mp__sound" data-mp="sound">Can\'t hear it? Open Windows volume settings</button>' : ''}`;
  }
  document.body.append(dock);
  frame = dock.querySelector('iframe');
  if (t.yt) {
    // Ask the player to report its state; repeat until it answers (it may still be loading)
    let tries = 0;
    const hello = () => {
      if (!yt || yt.ready || tries++ > 40 || !frame) return;
      frame.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YT);
      setTimeout(hello, 400);
    };
    frame.addEventListener('load', hello);
  }
  requestAnimationFrame(place);
}

function setVolume(v) {
  ui.volume = Math.max(0, Math.min(100, Math.round(v)));
  ui.muted = ui.volume === 0;
  saveUI();
  send('setVolume', [ui.volume]);
  send(ui.muted ? 'mute' : 'unMute');
  const bar = dock?.querySelector('.mp__volbar');
  if (bar) { bar.value = String(ui.volume); bar.style.setProperty('--p', `${ui.volume}%`); }
  const num = dock?.querySelector('.mp__volnum');
  if (num) num.textContent = String(ui.volume);
  const m = dock?.querySelector('[data-mp="mute"]');
  if (m) { m.innerHTML = g(ui.muted ? 'mute' : 'vol'); m.setAttribute('aria-label', ui.muted ? 'Unmute' : 'Mute'); }
}

function act(what) {
  if (what === 'close') { window.STPrefs.set({ music: '' }); return; }
  if (what === 'sound') { window.desktop?.openSoundSettings?.(); return; }
  if (what === 'mode') {
    ui.mode = ui.mode === 'compact' ? 'full' : 'compact';
    saveUI();
    dock.dataset.mode = ui.mode;
    const b = dock.querySelector('[data-mp="mode"]');
    b.innerHTML = g(ui.mode === 'full' ? 'shrink' : 'grow');
    b.setAttribute('aria-label', ui.mode === 'full' ? 'Make the player smaller' : 'Make the player bigger');
    requestAnimationFrame(place);
    return;
  }
  if (!yt) return;
  const playing = yt.state === 1 || yt.state === 3;
  if (what === 'toggle') { send(playing ? 'pauseVideo' : 'playVideo'); yt.state = playing ? 2 : 3; }
  if (what === 'stop') { send('stopVideo'); yt.state = 5; yt.time = 0; }
  if (what === 'next') send('nextVideo');
  if (what === 'prev') send(yt.time > 4 ? 'seekTo' : 'previousVideo', yt.time > 4 ? [0, true] : []);
  if (what === 'back' || what === 'fwd') { const to = Math.max(0, (yt.time || 0) + (what === 'fwd' ? 10 : -10)); send('seekTo', [to, true]); yt.time = to; }
  if (what === 'mute') { if (ui.muted || !ui.volume) setVolume(ui.volume || 60); else { ui.muted = true; saveUI(); send('mute'); const m = dock.querySelector('[data-mp="mute"]'); m.innerHTML = g('mute'); m.setAttribute('aria-label', 'Unmute'); dock.querySelector('.mp__volnum').textContent = '0'; dock.querySelector('.mp__volbar').style.setProperty('--p', '0%'); } }
  if (what === 'shuffle' || what === 'loop') {
    ui[what] = !ui[what];
    saveUI();
    send(what === 'shuffle' ? 'setShuffle' : 'setLoop', [ui[what]]);
    const b = dock.querySelector(`[data-mp="${what}"]`);
    b.classList.toggle('is-on', ui[what]);
    b.setAttribute('aria-pressed', String(ui[what]));
  }
  paint();
}

/* ------------------------------------------------------------ dragging */
function drag(e) {
  if (!dock || e.button !== 0) return;
  const handle = e.target.closest('.mp__head');
  if (!handle || (e.target.closest('button, a') && !e.target.closest('[data-mp-grip]'))) return;
  e.preventDefault();
  const z = zoom();
  const shown = () => [parseFloat(dock.style.left) || 0, parseFloat(dock.style.top) || 0];
  const [x0, y0] = shown();
  const sx = e.clientX / z - x0, sy = e.clientY / z - y0;
  dock.classList.add('is-dragging');
  try { handle.setPointerCapture(e.pointerId); } catch { /* moves still arrive while the pointer is over the player */ }
  const move = (ev) => { ui.x = ev.clientX / z - sx; ui.y = ev.clientY / z - sy; place(); };
  const up = () => { [ui.x, ui.y] = shown(); dock.classList.remove('is-dragging'); handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); saveUI(); };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
}

export function initMusic() {
  const apply = (autoplay) => render(window.STPrefs?.get().music || '', { autoplay });
  apply(false);
  window.addEventListener('prefs', (e) => { if (!e.detail || 'music' in e.detail) apply(false); });
  // Picked in Settings: that click lets the album start playing straight away
  window.addEventListener('music-picked', () => { render(window.STPrefs?.get().music || '', { autoplay: true }); });
  window.addEventListener('message', onYT);
  window.addEventListener('resize', place);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) place(); });
  document.addEventListener('pointerdown', (e) => { if (dock?.contains(e.target)) drag(e); });
  document.addEventListener('click', (e) => {
    const b = dock?.contains(e.target) && e.target.closest('[data-mp]');
    if (b) act(b.dataset.mp);
  });
  document.addEventListener('input', (e) => {
    if (!dock?.contains(e.target)) return;
    if (e.target.matches('.mp__volbar')) setVolume(+e.target.value);
    if (e.target.matches('.mp__bar') && yt) { yt.seeking = true; yt.time = +e.target.value; e.target.style.setProperty('--p', `${(100 * yt.time) / (yt.duration || 1)}%`); dock.querySelector('.mp__time').textContent = clock(yt.time); }
  });
  document.addEventListener('change', (e) => {
    if (dock?.contains(e.target) && e.target.matches('.mp__bar') && yt) { send('seekTo', [+e.target.value, true]); yt.seeking = false; }
  });
  document.addEventListener('keydown', (e) => {
    if (!dock || !e.target.closest?.('[data-mp-grip]')) return;
    const step = e.shiftKey ? 60 : 20;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    ui.x = (parseFloat(dock.style.left) || 0) + d[0]; ui.y = (parseFloat(dock.style.top) || 0) + d[1];
    place(); saveUI();
  });
}

/** Settings > Music */
export function musicPaneHTML() {
  const cur = window.STPrefs?.get().music || '';
  return `<div class="set-group">
    <p class="set-note">Pick a soundtrack and it starts playing in a player you can drag anywhere, with play, pause, stop, skip, a seek bar and volume. It keeps playing while you browse. Music streams from the composers' official releases through YouTube's player (or Bandcamp's, for albums only on Bandcamp): nothing is copied into this app. If you love a soundtrack, buy it on Bandcamp to support the composer.</p>
    <div class="ost-grid" role="radiogroup" aria-label="Soundtrack">${SOUNDTRACKS.map((t) => `<button type="button" class="ost" role="radio" aria-checked="${cur === t.key}" data-ost="${t.key}">
      <img src="${cover(t)}" alt="" loading="lazy" width="120" height="120"><span class="ost__game">${esc(t.game)}</span><span class="ost__by">${esc(t.composer)}</span><span class="ost__src">${t.yt ? 'Full controls' : 'Bandcamp player'}</span></button>`).join('')}</div>
    <div class="set-row"><div><p class="set-row__label">Music</p><p class="set-row__desc">${cur ? `Now: ${esc(byKey(cur)?.game || '')}` : 'Off'}</p></div>${cur ? '<button type="button" class="btn btn--ghost btn--sm" data-ost="">Turn music off</button>' : ''}</div>
  </div>`;
}
