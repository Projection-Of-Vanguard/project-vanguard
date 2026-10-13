// Loaded as a classic script in <head> so saved appearance settings apply before first paint.
// Exposes window.STPrefs for the settings module.
(function () {
  'use strict';

  var DEFAULTS = {
    // Appearance
    theme: 'navy', accent: '#1a9fff', sale: 'lime', radius: 'default', density: 'comfortable', font: 'default', scale: 100,
    // Background
    ambient: true, ambientStrength: 80, grid: true, grain: true, transparency: true,
    // Animations
    motion: 'system', speed: 1, transition: 'morph', morph: true, hover: 'zoom', stagger: true,
    autoplay: true, autoplaySec: 7, parallax: true, shimmer: true,
    // Store
    hideAdult: true, hideOwned: true, hideIgnored: true, players: true, personalize: true, defaultSort: 'rel', saleAlerts: true,
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
    root.dataset.ambient = p.ambient ? 'on' : 'off';
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
    s.zoom = String(Math.max(80, Math.min(130, +p.scale || 100)) / 100);
  }

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
