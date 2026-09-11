// ============================================================================
// SCR.devtheme — the developer view's own palette and type.
//
// The broadcast is a pixel object: four-step ramps, Press Start 2P, a night
// palette borrowed from a 1994 arcade cabinet. The developer view is not
// pretending to be that. It is an instrument panel, so it gets a flatter, cooler
// palette, real hinted type, and hairlines instead of blocks.
//
// Kept deliberately separate from the broadcast tokens so neither can drift into
// the other: nothing in here is used outside #dev.
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

// Geist for words, Geist Mono for anything you would compare by eye. Both fall back
// through the platform stack, so a blocked font file costs weight, not layout.
const SANS = "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO = "'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
T.SANS = SANS;
T.MONO = MONO;
T.label = (px, w) => `${w || 500} ${px}px ${SANS}`;
T.num = (px, w) => `${w || 400} ${px}px ${MONO}`;

// A hairline that survives a device-pixel-ratio of 1: canvas strokes straddle the
// coordinate, so integers blur a 1px line across two rows.
T.crisp = v => Math.round(v) + 0.5;

// Draw a faint horizontal grid and return the y() mapper, so every plot in the view
// shares the same axis furniture instead of each inventing its own.
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

// Rounded rect, because nothing in this view has a hard pixel corner.
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
  ctx.font = T.label(11); ctx.fillStyle = T.C.mute;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(msg || 'no data', w / 2, h / 2);
  ctx.restore();
};
})(window.SCR = window.SCR || {});
