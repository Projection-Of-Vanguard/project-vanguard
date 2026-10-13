// Openable comment threads for community posts and reviews. The panel animates open
// (style set in Settings > Community > Comments animation) and loads the thread on first open.

import { api } from './data.js';
import { $, esc, icon, ago, num } from './ui.js';

/** A "Comments" toggle plus its (closed) panel. `url` is the Steam Community page of the post. */
export function commentsHTML(url, count, { label } = {}) {
  if (!url) return '';
  const text = label || (count ? `${num(count)} ${count === 1 ? 'comment' : 'comments'}` : 'Comments');
  return `<div class="cmt">
    <button type="button" class="cmt-toggle" data-comments="${esc(url)}" aria-expanded="false">${icon('comment', 'i i--sm')}<span>${esc(text)}</span>${icon('down', 'i i--sm cmt-toggle__chev')}</button>
    <div class="cmt-panel" role="region" aria-label="Comments"><div class="cmt-panel__inner"></div></div>
  </div>`;
}

function listHTML(d) {
  if (!d.supported) {
    return `<p class="cmt-note">Replies to this discussion live on Steam.</p><a class="cmt-more" href="${esc(d.url)}" target="_blank" rel="noopener">Read the replies on Steam Community</a>`;
  }
  if (!d.comments.length) {
    return `<p class="cmt-note">${d.total ? 'This author keeps comments private.' : 'No comments yet.'}</p><a class="cmt-more" href="${esc(d.url)}" target="_blank" rel="noopener">Open on Steam Community</a>`;
  }
  return `<ul class="cmt-list">${d.comments.map((c, i) => `<li class="cmt-item" style="--i:${Math.min(i, 8)}">
      ${c.avatar ? `<img class="cmt-item__avatar" src="${esc(c.avatar)}" alt="" loading="lazy" width="32" height="32">` : '<span class="cmt-item__avatar"></span>'}
      <div><p class="cmt-item__head">${c.profile ? `<a href="${esc(c.profile)}" target="_blank" rel="noopener">${esc(c.author)}</a>` : esc(c.author)}${c.time ? `<span>${esc(ago(c.time * 1000))}</span>` : ''}</p>
      <p class="cmt-item__text">${esc(c.text)}</p></div>
    </li>`).join('')}</ul>
    ${d.total > d.comments.length ? `<a class="cmt-more" href="${esc(d.url)}" target="_blank" rel="noopener">See all ${num(d.total)} comments on Steam Community</a>` : ''}`;
}

async function toggle(btn) {
  const panel = btn.nextElementSibling;
  const inner = $('.cmt-panel__inner', panel);
  const open = btn.getAttribute('aria-expanded') !== 'true';
  btn.setAttribute('aria-expanded', String(open));
  panel.classList.toggle('is-open', open);
  if (!open || panel.dataset.loaded) return;
  panel.dataset.loaded = '1';
  inner.innerHTML = '<div class="cmt-loading"><span></span><span></span><span></span></div>';
  try {
    const d = await api(`/api/community/thread?url=${encodeURIComponent(btn.dataset.comments)}`);
    inner.innerHTML = listHTML(d);
  } catch {
    panel.dataset.loaded = '';
    inner.innerHTML = '<p class="cmt-note">Comments could not load. Try again in a moment.</p>';
  }
}

let installed = false;
export function initComments() {
  if (installed) return;
  installed = true;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-comments]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    toggle(btn);
  }, true);
}
