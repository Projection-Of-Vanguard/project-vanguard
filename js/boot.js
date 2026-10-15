// Loaded as a classic script in <head> so saved appearance settings apply before first paint.
// Exposes window.STPrefs for the settings module.
(function () {
  'use strict';

  // Android app: the interface is bundled in the APK and the data comes from the hosted API.
  // tools/build-android.mjs adds <meta name="api-base"> to the app's copy of index.html.
  // A home server (ProjectServer on a PC on the same Wi-Fi) replaces it when it answers; away from
  // home, or if it's off, the app quietly uses the hosted API for that session.
  var apiMeta = document.querySelector('meta[name="api-base"]');
  if (apiMeta) {
    var online = apiMeta.content.replace(/\/$/, '');
    var home = null;
    try { home = localStorage.getItem('st-home-server'); } catch (e) { /* storage off */ }
    if (!/^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(home || '')) home = null;
    var app = window.mobileApp = { platform: 'android', apiBase: online, onlineBase: online, homeServer: home, usingHome: false, imgBase: null, version: apiMeta.dataset.version || '' };
    document.documentElement.dataset.platform = 'android';
    // The home server speaks plain http on the LAN, which this https page may not load directly
    // (mixed content), so the app fetches it natively through /_home/ (see HomeServerProxy.java).
    app.homePath = function (url) { return '/_home/' + url.replace('://', '/'); };
    var nativeFetch = window.fetch.bind(window);
    var homeBase = home && app.homePath(home);
    var useHome = function (late) {
      app.apiBase = homeBase; app.usingHome = true; app.imgBase = homeBase + '/img'; app.homeError = null;
      try { localStorage.setItem('st-home-seen', String(Date.now())); } catch (e) { /* storage off */ }
      if (late === true) window.dispatchEvent(new CustomEvent('homeserver'));
    };
    var probe = function (ms) {
      return nativeFetch(homeBase + '/api/status', { cache: 'no-store', signal: AbortSignal.timeout(ms) })
        .then(function (r) { if (!r.ok) throw new Error(r.status === 502 ? 'it could not be reached on this Wi-Fi' : 'it answered with error ' + r.status); return r.json(); })
        .then(function (s) { if (!s || typeof s.count !== 'number') throw new Error('it is not a Project Vanguard server'); });
    };
    // A sleeping Wi-Fi radio or a busy old PC can take a few seconds to answer the first request.
    // If the server answered here before, wait longer for it; if it still doesn't answer, start
    // with the online service and keep checking, switching over as soon as it does.
    var seen = 0;
    try { seen = +localStorage.getItem('st-home-seen') || 0; } catch (e) { /* storage off */ }
    var retry = function (n) {
      if (app.usingHome || n > 20) return;
      setTimeout(function () { probe(6000).then(function () { useHome(true); }, function (e) { app.homeError = e.message; retry(n + 1); }); }, n < 3 ? 10e3 : 30e3);
    };
    app.ready = !home ? Promise.resolve() : probe(seen ? 6000 : 3500).then(useHome, function (e) {
      app.homeError = e.name === 'TimeoutError' ? 'it did not answer in time' : e.message || 'it could not be reached';
      retry(0);
    });
    window.fetch = function (input, init) {
      if (typeof input !== 'string' || !(input.indexOf('/api/') === 0 || input === '/downloads.json')) return nativeFetch(input, init);
      var rel = input;
      return app.ready.then(function () { return nativeFetch((rel === '/downloads.json' ? app.onlineBase : app.apiBase) + rel, init); });
    };
  }

  var DEFAULTS = {
    // Appearance
    theme: 'navy', accent: '#1a9fff', sale: 'lime', radius: 'default', density: 'comfortable', font: 'default', scale: 100,
    // Background
    ambient: true, ambientStrength: 80, grid: true, grain: true, transparency: true,
    bgSource: 'game', bgBlur: 0, bgDim: 60, bgDrift: false,
    music: '', // a soundtrack key from js/music.js, '' for none
    startPage: 'home', cards: 'medium', homeHide: [],
    mascot: true, // Vanguard, the AI helper in the corner
    // Animations
    motion: 'system', speed: 1, transition: 'morph', morph: true, hover: 'zoom', stagger: true,
    autoplay: true, autoplaySec: 7, parallax: true, shimmer: true,
    // Store
    hideAdult: true, hideOwned: true, hideIgnored: true, players: true, personalize: true, defaultSort: 'rel', saleAlerts: true,
    // Phone notifications from the deal feed (checked about every hour)
    notifyFree: true, notifyDeals: true,
    // Community
    textPosts: true, communityHover: 'inherit', feedIn: 'cascade', viewerAnim: 'zoom', commentsAnim: 'expand',
    // Notifications
    toastPos: 'bottom-center', toastSec: 4,
    // Accessibility
    contrast: false, underline: false, focusRing: false,
  };

  var THEMES = {
    navy:     { label: 'Navy',     ink: ['6, 11, 21', '11, 20, 36', '17, 32, 54', '24, 48, 77', '34, 65, 106', '28, 56, 92'] },
    midnight: { label: 'Midnight', ink: ['0, 0, 0', '5, 6, 9', '14, 16, 21', '23, 26, 33', '36, 40, 50', '30, 34, 43'] },
    slate:    { label: 'Slate',    ink: ['10, 12, 16', '17, 20, 26', '26, 30, 38', '36, 42, 53', '52, 60, 74', '44, 51, 63'] },
    classic:  { label: 'Classic',  ink: ['16, 19, 25', '27, 40, 56', '34, 51, 71', '42, 71, 94', '61, 93, 121', '50, 82, 108'] },
    ember:    { label: 'Ember',    ink: ['14, 9, 9', '24, 15, 16', '36, 23, 24', '52, 33, 34', '74, 46, 46', '62, 39, 40'] },
  };

  var SALES = {
    lime:  ['#c3f06a', '#35511a'],
    green: ['#5ee08f', '#14492b'],
    gold:  ['#fbc54a', '#4a3510'],
    pink:  ['#f58ac4', '#4c1838'],
    cyan:  ['#67e8f9', '#0f4352'],
  };

  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return [26, 159, 255];
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) { return [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * t); }); }
  var rgb = function (c) { return c.join(', '); };
  var hex = function (c) { return '#' + c.map(function (v) { return v.toString(16).padStart(2, '0'); }).join(''); };

  function load() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem('st-prefs') || '{}') || {}; } catch (e) { saved = {}; }
    var p = {};
    for (var k in DEFAULTS) p[k] = Object.prototype.hasOwnProperty.call(saved, k) ? saved[k] : DEFAULTS[k];
    return p;
  }
  function save(p) { try { localStorage.setItem('st-prefs', JSON.stringify(p)); } catch (e) { /* storage unavailable */ } }

  function motionLevel(p) {
    if (p.motion === 'system') return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full';
    return p.motion;
  }

  function apply(p) {
    var root = document.documentElement;
    var s = root.style;
    var theme = THEMES[p.theme] || THEMES.navy;
    ['0', '1', '2', '3', '4', 'h'].forEach(function (k, i) { s.setProperty('--ink' + k + '-rgb', theme.ink[i]); });

    var a = hexToRgb(p.accent);
    s.setProperty('--blue', hex(a));
    s.setProperty('--accent-rgb', rgb(a));
    s.setProperty('--blue-2', hex(mix(a, [255, 255, 255], 0.22)));
    s.setProperty('--blue-deep', hex(mix(a, [0, 0, 0], 0.32)));
    var glacier = mix(a, [255, 255, 255], 0.62);
    s.setProperty('--glacier', hex(glacier));
    s.setProperty('--glacier-rgb', rgb(glacier));
    s.setProperty('--tint-rgb', rgb(mix(a, [255, 255, 255], 0.45)));

    var sale = SALES[p.sale] || SALES.lime;
    s.setProperty('--sale', sale[0]);
    s.setProperty('--sale-bg', sale[1]);

    s.setProperty('--rs', p.radius === 'sharp' ? '0.3' : p.radius === 'round' ? '1.5' : '1');
    s.setProperty('--section-gap', p.density === 'compact' ? '40px' : '64px');
    s.setProperty('--ambient-opacity', String(Math.max(0, Math.min(100, +p.ambientStrength || 0)) / 100));

    var level = motionLevel(p);
    s.setProperty('--motion', level === 'off' ? '0' : String(Math.max(0.25, Math.min(3, +p.speed || 1)) * (level === 'reduced' ? 0.6 : 1)));
    root.dataset.motion = level;
    root.dataset.transition = level === 'off' ? 'none' : p.transition;
    root.dataset.hover = p.hover;
    root.dataset.stagger = p.stagger && level !== 'off' ? 'on' : 'off';
    root.dataset.shimmer = p.shimmer && level !== 'off' ? 'on' : 'off';
    root.dataset.theme = p.theme;
    root.dataset.font = p.font;
    // Backdrop: the art of the game in focus, a photo (from the device or any game's art), or plain
    var bg = p.bgSource === 'photo' || p.bgSource === 'plain' ? p.bgSource : (p.ambient === false ? 'plain' : 'game');
    var photo = null;
    try { photo = localStorage.getItem('st-bg-photo'); } catch (e) { /* storage off */ }
    if (bg === 'photo' && !photo) bg = 'game';
    if (photo && /^(data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+|https:\/\/[^"'()\s]+|\/_home\/[^"'()\s]+)$/.test(photo)) s.setProperty('--bg-photo', 'url("' + photo + '")');
    s.setProperty('--bg-blur', Math.max(0, Math.min(40, +p.bgBlur || 0)) + 'px');
    s.setProperty('--bg-dim', String(Math.max(0, Math.min(90, +p.bgDim || 0)) / 100));
    root.dataset.bg = bg;
    root.dataset.bgdrift = p.bgDrift && level === 'full' ? 'on' : 'off';
    root.dataset.ambient = bg === 'game' ? 'on' : 'off';
    root.dataset.cards = p.cards === 'small' || p.cards === 'large' ? p.cards : 'medium';
    root.dataset.homehide = Array.isArray(p.homeHide) ? p.homeHide.filter(function (x) { return /^[a-z-]{2,12}$/.test(x); }).join(' ') : '';
    root.dataset.grid = p.grid ? 'on' : 'off';
    root.dataset.grain = p.grain ? 'on' : 'off';
    root.dataset.solid = p.transparency ? 'off' : 'on';
    root.dataset.contrast = p.contrast ? 'on' : 'off';
    root.dataset.underline = p.underline ? 'on' : 'off';
    root.dataset.focus = p.focusRing ? 'strong' : 'normal';
    root.dataset.toast = p.toastPos;
    root.dataset.textposts = p.textPosts ? 'on' : 'off';
    root.dataset.chover = p.communityHover === 'inherit' ? p.hover : p.communityHover;
    root.dataset.feedin = level === 'off' ? 'none' : p.feedIn;
    root.dataset.viewer = level === 'off' ? 'none' : p.viewerAnim;
    root.dataset.cmt = level === 'off' ? 'none' : p.commentsAnim;
    // Interface size: zoom the page, and expose the factor so viewport-sized boxes (vw/vh in
    // styles.css are divided by --zoom) keep fitting the screen instead of growing with it
    var zoom = Math.max(80, Math.min(130, +p.scale || 100)) / 100;
    s.zoom = String(zoom);
    s.setProperty('--zoom', String(zoom));
    currentZoom = zoom;
    breakpoints();
  }

  // Layout breakpoints that follow Interface size. Media queries only see the window, so the
  // phone and tablet layouts would never kick in at 130%. styles.css scopes those rules to
  // html[data-lt-N] instead, set here when (window width / zoom) is N px or less. Asking matchMedia for
  // N x zoom uses the browser's own viewport width, which (unlike innerWidth on phones) doesn't grow
  // when content overflows, so at 100% this matches the original media queries exactly.
  var BREAKPOINTS = [1220, 1180, 1130, 1100, 1000, 760, 720, 560, 480, 380, 360, 320];
  var currentZoom = 1;
  function breakpoints() {
    var html = document.documentElement;
    for (var i = 0; i < BREAKPOINTS.length; i++) {
      html.toggleAttribute('data-lt-' + BREAKPOINTS[i], window.matchMedia('(max-width: ' + (BREAKPOINTS[i] * currentZoom) + 'px)').matches);
    }
  }
  window.addEventListener('resize', breakpoints);

  var current = load();
  apply(current);

  window.STPrefs = {
    DEFAULTS: DEFAULTS, THEMES: THEMES, SALES: SALES,
    get: function () { return current; },
    set: function (patch) {
      for (var k in patch) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) current[k] = patch[k];
      save(current); apply(current);
      window.dispatchEvent(new CustomEvent('prefs', { detail: patch }));
    },
    reset: function () { current = Object.assign({}, DEFAULTS); save(current); apply(current); window.dispatchEvent(new CustomEvent('prefs', { detail: current })); },
    replace: function (p) { var n = {}; for (var k in DEFAULTS) n[k] = Object.prototype.hasOwnProperty.call(p, k) ? p[k] : DEFAULTS[k]; current = n; save(current); apply(current); window.dispatchEvent(new CustomEvent('prefs', { detail: current })); },
    motionLevel: function () { return motionLevel(current); },
  };

  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function () { apply(current); });
})();
