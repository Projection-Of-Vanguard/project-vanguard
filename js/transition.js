// Shared-element page transitions.
// When a game link is clicked, the image the viewer clicked becomes the
// game page's hero banner, morphing between the two with the View Transitions API.

import { $$, useVT } from './ui.js';

export const vt = { pending: false };

export function clearNames() {
  $$('[data-vt]').forEach((el) => { el.style.viewTransitionName = ''; el.removeAttribute('data-vt'); });
}

/** Pick the image to morph for a clicked element and tag it. */
export function markSource(el) {
  if (!el || !useVT() || window.STPrefs?.get().morph === false) return false;
  const scope = el.closest('[data-morph-scope]');
  const img = (scope && scope.querySelector('[data-morph]')) || el.querySelector?.('img') || (el.tagName === 'IMG' ? el : null);
  if (!img || !img.complete || !img.naturalWidth) return false;
  clearNames();
  img.style.viewTransitionName = 'game-hero';
  img.dataset.vt = '';
  vt.pending = true;
  return true;
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#/app/"]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button || a.getAttribute('href') === location.hash) return;
  markSource(a);
}, true);
