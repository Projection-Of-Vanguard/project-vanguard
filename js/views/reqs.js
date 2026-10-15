// System requirements on a game page, laid out like parts on a motherboard: each requirement sits
// in a slot with a drawing of its component (CPU, graphics card, RAM, SSD...) and the spec beside
// it. On a PC it also shows what this computer has, read locally (nothing is sent anywhere).

import { esc } from '../ui.js';

// Original line drawings (64×64). .f = body, .a = accent parts, .t = thin details.
const ART = {
  cpu: '<rect class="f" x="14" y="14" width="36" height="36" rx="4"/><rect class="a" x="22" y="22" width="20" height="20" rx="2"/><path class="t" d="M20 7v7M28 7v7M36 7v7M44 7v7M20 50v7M28 50v7M36 50v7M44 50v7M7 20h7M7 28h7M7 36h7M7 44h7M50 20h7M50 28h7M50 36h7M50 44h7"/><path class="t" d="M27 32h10M32 27v10"/>',
  gpu: '<path class="t" d="M5 15v36M5 19h4M5 47h4"/><rect class="f" x="9" y="16" width="51" height="28" rx="4"/><circle class="a" cx="24" cy="30" r="9"/><circle class="a" cx="45" cy="30" r="9"/><path class="t" d="M24 21c3 4 3 14 0 18M15 30c4-3 14-3 18 0M45 21c3 4 3 14 0 18M36 30c4-3 14-3 18 0"/><path class="f" d="M17 44v6h26v-6"/><path class="t" d="M21 47h2M26 47h2M31 47h2M36 47h2"/>',
  ram: '<rect class="f" x="4" y="20" width="56" height="20" rx="2"/><rect class="a" x="8" y="24" width="9" height="11" rx="1"/><rect class="a" x="20" y="24" width="9" height="11" rx="1"/><rect class="a" x="35" y="24" width="9" height="11" rx="1"/><rect class="a" x="47" y="24" width="9" height="11" rx="1"/><path class="t" d="M8 40v6M12 40v6M16 40v6M20 40v6M24 40v6M28 40v6M36 40v6M40 40v6M44 40v6M48 40v6M52 40v6M56 40v6"/>',
  ssd: '<path class="f" d="M5 25h50a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H5z"/><path class="t" d="M5 27v10M8 27v10"/><rect class="a" x="13" y="28" width="15" height="8" rx="1"/><rect class="a" x="31" y="28" width="11" height="8" rx="1"/><circle class="t" cx="52" cy="32" r="2.5"/>',
  os: '<rect class="f" x="8" y="12" width="48" height="40" rx="4"/><path class="t" d="M8 21h48"/><circle class="a" cx="14" cy="16.5" r="1.6"/><circle class="a" cx="19" cy="16.5" r="1.6"/><rect class="a" x="16" y="27" width="14" height="9" rx="1"/><rect class="a" x="34" y="27" width="14" height="9" rx="1"/><rect class="a" x="16" y="39" width="14" height="7" rx="1"/><rect class="a" x="34" y="39" width="14" height="7" rx="1"/>',
  api: '<path class="f" d="M32 7 55 20v24L32 57 9 44V20z"/><path class="t" d="M9 20l23 13 23-13M32 33v24"/><path class="a" d="M32 18l9 5-9 5-9-5z"/>',
  net: '<circle class="f" cx="32" cy="32" r="22"/><path class="t" d="M10 32h44M32 10c7 7 7 37 0 44M32 10c-7 7-7 37 0 44M15 20h34M15 44h34"/><circle class="a" cx="32" cy="32" r="3"/>',
  sound: '<path class="f" d="M12 25h9l12-10v34L21 39h-9z"/><path class="t" d="M40 24c4 4 4 12 0 16M45 19c7 7 7 19 0 26M50 14c10 10 10 26 0 36"/>',
  vr: '<path class="f" d="M8 22h48a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H40l-4-6h-8l-4 6H8a4 4 0 0 1-4-4V26a4 4 0 0 1 4-4z"/><circle class="a" cx="20" cy="33" r="5"/><circle class="a" cx="44" cy="33" r="5"/>',
  note: '<rect class="f" x="12" y="8" width="40" height="48" rx="4"/><path class="t" d="M20 20h24M20 28h24M20 36h16"/><circle class="a" cx="42" cy="44" r="5"/>',
};
const KINDS = [
  [/^(os|operating system)/i, 'os', 'Operating system'], [/^(processor|cpu)/i, 'cpu', 'Processor'], [/^(memory|ram)/i, 'ram', 'Memory'],
  [/^(graphics|video|gpu)/i, 'gpu', 'Graphics'], [/^(directx|vulkan|opengl|metal)/i, 'api', null], [/^(storage|hard ?drive|hard ?disk|disk space)/i, 'ssd', 'Storage'],
  [/^network/i, 'net', 'Network'], [/^(sound|audio)/i, 'sound', 'Sound card'], [/^vr/i, 'vr', 'VR'],
];
const kindOf = (k) => KINDS.find(([re]) => re.test(k)) || [null, 'note', null];
const art = (kind) => `<svg class="rq__art" viewBox="0 0 64 64" aria-hidden="true">${ART[kind] || ART.note}</svg>`;

/** What this computer reports about itself. Only on PCs, where it can be compared. */
let pcInfo;
function thisPC() { if (pcInfo === undefined) pcInfo = readPC(); return pcInfo; }
function readPC() {
  if (window.mobileApp || /Android|iPhone|iPad/i.test(navigator.userAgent)) return null;
  const pc = {};
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    // "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)" -> "NVIDIA GeForce RTX 3060"
    const m = /ANGLE \([^,]+,\s*(.+?)(?:\s*\(0x[0-9a-f]+\))?(?:\s+Direct3D|\s+OpenGL|,|\)$)/i.exec(r);
    const name = (m ? m[1] : r).replace(/\s+/g, ' ').trim();
    if (name && !/swiftshader|llvmpipe|basic render/i.test(name)) pc.gpu = name;
  } catch { /* no WebGL */ }
  if (navigator.hardwareConcurrency) pc.cpu = `${navigator.hardwareConcurrency} processor threads`;
  if (navigator.deviceMemory) pc.ram = navigator.deviceMemory >= 8 ? '8 GB or more' : `About ${navigator.deviceMemory} GB`;
  const ua = navigator.userAgent;
  pc.os = /Windows NT 10/.test(ua) ? 'Windows 10 or 11' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return pc;
}

function slotsHTML(rows, pc) {
  const notes = [];
  const slots = [];
  for (const r of rows) {
    if (!r.k) { if (!/64-bit/i.test(r.v)) notes.push(r.v); continue; }
    const [, kind, label] = kindOf(r.k);
    if (kind === 'note') { notes.push(`${r.k}: ${r.v}`); continue; }
    const mine = { cpu: pc?.cpu, gpu: pc?.gpu, ram: pc?.ram, os: pc?.os }[kind];
    slots.push(`<li class="rq__slot rq__slot--${kind}" style="--i:${slots.length}">
      <div class="rq__socket">${art(kind)}</div>
      <div class="rq__spec"><p class="rq__label">${esc(label || r.k)}</p><p class="rq__value">${esc(r.v)}</p>${mine ? `<p class="rq__mine">This PC: ${esc(mine)}</p>` : ''}</div>
    </li>`);
  }
  return `<ul class="rq__board">${slots.join('')}</ul>${notes.length ? `<div class="rq__notes">${art('note')}<p>${notes.map(esc).join('<br>')}</p></div>` : ''}`;
}

/** Older servers sent the minimum requirements as one line of text: split it back into rows. */
function fromText(text) {
  const parts = String(text || '').split(/\s*\b(OS|Processor|Memory|Graphics|DirectX|Storage|Hard Drive|Network|Sound Card|VR Support|Additional Notes):\s*/);
  const rows = parts[0].trim() ? [{ k: '', v: parts[0].trim() }] : [];
  for (let i = 1; i < parts.length; i += 2) if (parts[i + 1]?.trim()) rows.push({ k: parts[i], v: parts[i + 1].trim() });
  return rows;
}

export function reqsHTML(d) {
  if (!d.reqs && d.requirements) d.reqs = { min: fromText(d.requirements), rec: [] };
  const min = d.reqs?.min || [];
  const rec = d.reqs?.rec || [];
  if (!min.length && !rec.length) return d.requirements ? `<div class="block-head"><h2 class="block-title" id="h-reqs">System requirements</h2></div><p class="rq__plain">${esc(d.requirements)}</p>` : '';
  const x64 = [...min, ...rec].some((r) => !r.k && /64-bit/i.test(r.v));
  const both = min.length && rec.length;
  return `<div class="block-head rq__head"><h2 class="block-title" id="h-reqs">System requirements</h2>
      <div class="rq__tools">${x64 ? '<span class="rq__chip">64-bit only</span>' : ''}${both ? `<div class="segmented segmented--sm" role="radiogroup" aria-label="Requirement level"><button type="button" role="radio" aria-checked="true" data-rq="min">Minimum</button><button type="button" role="radio" aria-checked="false" data-rq="rec">Recommended</button></div>` : ''}</div></div>
    <div class="rq" data-rq-board>${slotsHTML(min.length ? min : rec, thisPC())}</div>
    ${thisPC() ? '<p class="rq__fine">"This PC" is read by your browser on this computer and is never sent anywhere. Memory is reported in rough steps.</p>' : ''}`;
}

export function mountReqs(box, d) {
  if (!box) return;
  box.innerHTML = reqsHTML(d);
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rq]');
    if (!b) return;
    box.querySelectorAll('[data-rq]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    box.querySelector('[data-rq-board]').innerHTML = slotsHTML(d.reqs[b.dataset.rq] || [], thisPC());
  });
}
