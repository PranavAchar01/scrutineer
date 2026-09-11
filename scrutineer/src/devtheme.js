// ============================================================================
// SCR.devtheme — the developer view's palette, type scale, icons and motion rule.
//
// The broadcast is a pixel object: four-step ramps, Press Start 2P, a night
// palette borrowed from a 1994 arcade cabinet. The developer view is not
// pretending to be that. It is an instrument panel: a flatter cooler palette,
// real hinted type, hairlines instead of blocks.
//
// Three rules this file exists to enforce, because eleven panels drawn by four
// hands drifted apart on all three:
//
//   TYPE    six sizes, no others. Nothing builds a font string by hand.
//   MOTION  movement means something or it does not happen. See MOTION below.
//   ICONS   one set, Lucide (MIT, lucide.dev), inlined as primitives so the
//           page carries no runtime icon dependency.
// ============================================================================
(function (SCR) {
'use strict';

const T = SCR.devtheme = {};

T.C = {
  bg:     '#08090B',   // the page behind the cards
  panel:  '#0E1013',   // a card
  line:   '#1C2026',   // borders and axes
  grid:   '#161A20',   // gridlines, one step above the card
  text:   '#E7EAEE',   // primary
  dim:    '#949BA6',   // secondary — labels
  mute:   '#5C646F',   // tertiary — axis numbers, disabled
  blue:   '#5B8DEF',
  teal:   '#2DD4BF',
  green:  '#3FCF8E',
  amber:  '#F5A524',
  rose:   '#F05E6B',
  violet: '#A78BFA',
  white:  '#FFFFFF',
};

// ---------------------------------------------------------------------------------------
// type: six sizes, and nothing may invent a seventh
// ---------------------------------------------------------------------------------------
const SANS = "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO = "'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
T.SANS = SANS;
T.MONO = MONO;

// hero  one number a panel is built around      value  a number read in passing
// label the name of a thing                     sub    a qualifier on a label
// axis  a tick                                  tag    a state word, never a sentence
T.F = {
  hero:  `500 20px ${MONO}`,
  value: `400 13px ${MONO}`,
  label: `600 11px ${SANS}`,
  sub:   `500 10px ${SANS}`,
  axis:  `400 9px ${MONO}`,
  tag:   `500 9px ${SANS}`,
};
// Cards get shorter than a desk layout in the folded grid. Rather than let each panel
// invent its own shrink rule, one step down is available and that is the whole ladder.
T.Fs = {
  hero:  `500 15px ${MONO}`,
  value: `400 11px ${MONO}`,
  label: `600 10px ${SANS}`,
  sub:   `500 9px ${SANS}`,
  axis:  `400 8px ${MONO}`,
  tag:   `500 8px ${SANS}`,
};
// `small` is decided from the panel box, once, by the caller — never per string.
T.font = (name, small) => (small ? T.Fs : T.F)[name] || T.F.label;

// ---------------------------------------------------------------------------------------
// MOTION. Movement is expensive attention. It is spent on exactly four meanings:
//
//   throughput  work moving through a pipeline      (one lap)
//   liveness    a rail that is actually serving     (rails)
//   here        where the season currently sits     (claimed vs held-out)
//   flagged     the one thing that should be looked at (the seeded canary)
//
// Everything else is still. A shimmer that means nothing reads as noise once there
// are nine panels of it, which is exactly what happened.
// ---------------------------------------------------------------------------------------
T.MOTION = { throughput: true, liveness: true, here: true, flagged: true };

// ---------------------------------------------------------------------------------------
// icons: Lucide (MIT). Stored as primitives rather than path strings so the canvas
// renderer stays four cases long and the same registry serves the DOM headers.
//   p path d · r [x,y,w,h,rx] · c [cx,cy,r] · l [x1,y1,x2,y2]
// All on Lucide's 24x24 grid, stroke 2, round caps.
// ---------------------------------------------------------------------------------------
T.ICONS = {
  activity: [{ p: 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2' }],
  cpu: [{ r: [4, 4, 16, 16, 2] }, { r: [8, 8, 8, 8, 1] },
    { p: 'M12 2v2' }, { p: 'M17 2v2' }, { p: 'M7 2v2' },
    { p: 'M12 20v2' }, { p: 'M17 20v2' }, { p: 'M7 20v2' },
    { p: 'M2 7h2' }, { p: 'M2 12h2' }, { p: 'M2 17h2' },
    { p: 'M20 7h2' }, { p: 'M20 12h2' }, { p: 'M20 17h2' }],
  server: [{ r: [2, 2, 20, 8, 2] }, { r: [2, 14, 20, 8, 2] },
    { l: [6, 6, 6.01, 6] }, { l: [6, 18, 6.01, 18] }],
  share: [{ c: [18, 5, 3] }, { c: [6, 12, 3] }, { c: [18, 19, 3] },
    { l: [8.59, 13.51, 15.42, 17.49] }, { l: [15.41, 6.51, 8.59, 10.49] }],
  filter: [{ p: 'M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z' }],
  shield: [{ p: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' },
    { p: 'M12 8v4' }, { p: 'M12 16h.01' }],
  crosshair: [{ c: [12, 12, 10] }, { l: [22, 12, 18, 12] }, { l: [6, 12, 2, 12] },
    { l: [12, 6, 12, 2] }, { l: [12, 22, 12, 18] }],
  trending: [{ p: 'M16 17h6v-6' }, { p: 'm22 17-8.5-8.5-5 5L2 7' }],
  sliders: [{ p: 'M10 5H3' }, { p: 'M12 19H3' }, { p: 'M14 3v4' }, { p: 'M16 17v4' },
    { p: 'M21 12h-9' }, { p: 'M21 19h-5' }, { p: 'M21 5h-7' }, { p: 'M8 10v4' }, { p: 'M8 12H3' }],
};

const pathCache = {};
function shapes(name) {
  if (pathCache[name]) return pathCache[name];
  const src = T.ICONS[name];
  if (!src || typeof Path2D === 'undefined') return null;
  const p = new Path2D();
  for (const s of src) {
    if (s.p) p.addPath(new Path2D(s.p));
    else if (s.l) { const q = new Path2D(); q.moveTo(s.l[0], s.l[1]); q.lineTo(s.l[2], s.l[3]); p.addPath(q); }
    else if (s.c) { const q = new Path2D(); q.arc(s.c[0], s.c[1], s.c[2], 0, Math.PI * 2); p.addPath(q); }
    else if (s.r) { const q = new Path2D(); q.roundRect ? q.roundRect(s.r[0], s.r[1], s.r[2], s.r[3], s.r[4]) : q.rect(s.r[0], s.r[1], s.r[2], s.r[3]); p.addPath(q); }
  }
  pathCache[name] = p;
  return p;
}

// Draw an icon with its top-left at x,y at `size` css px. Stroke weight is scaled so a
// 14px icon and a 24px icon read as the same drawing, not as two different weights.
T.icon = function (ctx, name, x, y, size, colour, alpha) {
  const p = shapes(name); if (!p) return;
  const k = size / 24;
  ctx.save();
  ctx.translate(x, y); ctx.scale(k, k);
  ctx.strokeStyle = colour || T.C.dim;
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  ctx.stroke(p);
  ctx.restore();
};

// The same registry as markup, for the card headers.
T.iconSvg = function (name, size, colour) {
  const src = T.ICONS[name]; if (!src) return '';
  const body = src.map(s => s.p ? `<path d="${s.p}"/>`
    : s.l ? `<line x1="${s.l[0]}" y1="${s.l[1]}" x2="${s.l[2]}" y2="${s.l[3]}"/>`
    : s.c ? `<circle cx="${s.c[0]}" cy="${s.c[1]}" r="${s.c[2]}"/>`
    : `<rect x="${s.r[0]}" y="${s.r[1]}" width="${s.r[2]}" height="${s.r[3]}" rx="${s.r[4]}"/>`).join('');
  return `<svg viewBox="0 0 24 24" width="${size || 13}" height="${size || 13}" fill="none" `
    + `stroke="${colour || T.C.dim}" stroke-width="2" stroke-linecap="round" `
    + `stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
};

// ---------------------------------------------------------------------------------------
// shared furniture
// ---------------------------------------------------------------------------------------

// A hairline that survives a device-pixel-ratio of 1: canvas strokes straddle the
// coordinate, so integers blur a 1px line across two rows.
T.crisp = v => Math.round(v) + 0.5;

T.grid = function (ctx, x0, y0, w, h, lines) {
  ctx.save();
  ctx.strokeStyle = T.C.grid; ctx.lineWidth = 1;
  const n = lines || 4;
  for (let i = 0; i <= n; i++) {
    const y = T.crisp(y0 + (h * i) / n);
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); ctx.stroke();
  }
  ctx.restore();
};

T.rr = function (ctx, x, y, w, h, r) {
  const rad = Math.min(r === undefined ? 3 : r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
};

T.empty = function (ctx, w, h, msg) {
  ctx.save();
  ctx.font = T.F.sub; ctx.fillStyle = T.C.mute;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(msg || 'no data', w / 2, h / 2);
  ctx.restore();
};
})(window.SCR = window.SCR || {});
