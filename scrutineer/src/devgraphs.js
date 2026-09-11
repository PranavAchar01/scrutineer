// ============================================================================
// SCR.devgraphs — three canvas readouts for the developer dashboard.
//
// These are pure: given (ctx, w, h, t, data) they draw and nothing else. No
// frame state, no timers — `t` is the only clock, so a caller can scrub, pause
// or re-render at any rate and get the same picture. That is what lets the
// dashboard tear down and rebuild panels without motion popping.
// ============================================================================
(function (SCR) {
'use strict';
const G = SCR.devgraphs = {};

// project tokens. nothing here invents a colour.
const NIGHT = '#06081A', STUDIO = '#121A4A', TARMAC = '#2C2E3A';
const WHITE = '#FFFFFF', CAPTION = '#C8CBD8', MID = '#6A6F8A';
const GOLD = '#F4C542', RED = '#E31E2D', PURPLE = '#B04BFF';
const CYAN = '#3DD2FF', GREEN = '#2FD968', AMBER = '#FFA318';

const PX = "px 'Press Start 2P', monospace";   // labels: shouting, so keep them short
const VT = "px 'VT323', monospace";            // numbers: the actual content

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
// alpha is applied via globalAlpha rather than rgba strings — no per-frame string building.

// mast modes are the taxonomy the diagnoser blames; colour is the only legend we get.
function modeColor (m) {
  if (m === '1.4-loss-of-history') return CYAN;
  if (m === '1.5-unaware-of-stopping') return AMBER;
  if (m === '1.2-tool-schema-error') return RED;
  return PURPLE;
}

// a panel with nothing in it should still look deliberate, not broken.
function empty (ctx, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = MID;
  ctx.font = 7 + PX;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NO DATA', w / 2, h / 2);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------
// 1. credit graph — who got blamed for what, and how sure we were
// ---------------------------------------------------------------------------------------
G.creditGraph = function (ctx, w, h, t, data) {
  if (!(w > 0) || !(h > 0)) return;
  const rows = data && data.rows;
  let items = data && data.items;
  let roles = data && data.roles;
  if (!rows || !rows.length) { empty(ctx, w, h); return; }

  // tolerate a caller that hands us rows only.
  if (!items || !items.length) { items = []; for (let i = 0; i < rows.length; i++) { const v = rows[i] && rows[i].item; if (v && items.indexOf(v) < 0) items.push(v); } }
  if (!roles || !roles.length) { roles = []; for (let i = 0; i < rows.length; i++) { const v = rows[i] && rows[i].blamed_role; if (v && roles.indexOf(v) < 0) roles.push(v); } }
  if (!items.length || !roles.length) { empty(ctx, w, h); return; }

  ctx.save();

  const tiny = w < 380 || h < 190;
  const fs = tiny ? 6 : 7;
  const padX = tiny ? 20 : 30;
  const padY = tiny ? 12 : 16;
  const xL = padX, xR = w - padX;
  const span = xR - xL;
  if (span < 24) { ctx.restore(); empty(ctx, w, h); return; }

  const yOf = (i, n) => n < 2 ? h / 2 : padY + (h - padY * 2) * (i / (n - 1));

  // role weight: AERO swallows nearly every row, and the picture should say so.
  let maxCount = 1;
  const counts = new Array(roles.length).fill(0);
  for (let i = 0; i < rows.length; i++) {
    const k = roles.indexOf(rows[i] && rows[i].blamed_role);
    if (k >= 0) { counts[k]++; if (counts[k] > maxCount) maxCount = counts[k]; }
  }

  // ---- edges ----
  ctx.lineCap = 'round';
  const cap = Math.min(rows.length, 240);       // hard ceiling keeps the 2ms budget honest
  for (let i = 0; i < cap; i++) {
    const r = rows[i]; if (!r) continue;
    const ii = items.indexOf(r.item), ri = roles.indexOf(r.blamed_role);
    if (ii < 0 || ri < 0) continue;
    const conf = clamp(typeof r.confidence === 'number' ? r.confidence : 0.5, 0, 1);
    const y0 = yOf(ii, items.length), y1 = yOf(ri, roles.length);
    const c0 = xL + span * 0.42, c1 = xR - span * 0.42;
    const col = modeColor(r.mast_mode);

    ctx.globalAlpha = 0.14 + conf * 0.42;
    ctx.strokeStyle = col;
    ctx.lineWidth = 0.6 + conf * 1.7;
    ctx.beginPath();
    ctx.moveTo(xL, y0);
    ctx.bezierCurveTo(c0, y0, c1, y1, xR, y1);
    ctx.stroke();

    // packet. the phase offset is per-edge so the bundle shimmers instead of marching.
    const s = ((t * 0.28 + i * 0.0773 + ii * 0.17) % 1);
    const u = 1 - s, a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
    const px = a * xL + b * c0 + c * c1 + d * xR;
    const py = a * y0 + b * y0 + c * y1 + d * y1;
    ctx.globalAlpha = 0.35 + 0.55 * Math.sin(s * Math.PI);   // fade in and out at the ends
    ctx.fillStyle = col;
    const pr = 0.9 + conf * 1.5;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, TAU);
    ctx.fill();
  }

  // ---- nodes ----
  ctx.font = fs + PX;
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'right';
  for (let i = 0; i < items.length; i++) {
    const y = yOf(i, items.length);
    ctx.globalAlpha = 1;
    ctx.fillStyle = STUDIO;
    ctx.beginPath(); ctx.arc(xL, y, 3.2, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = CAPTION; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(xL, y, 3.2, 0, TAU); ctx.stroke();
    if (items.length <= 14) { ctx.globalAlpha = 0.7; ctx.fillStyle = CAPTION; ctx.fillText(String(items[i]), xL - 6, y); }
  }

  ctx.textAlign = 'left';
  for (let i = 0; i < roles.length; i++) {
    const y = yOf(i, roles.length);
    const share = counts[i] / maxCount;
    const rr = 3 + share * (tiny ? 4 : 7) + Math.sin(t * 1.3 + i) * 0.35 * share;
    ctx.globalAlpha = 0.18 + share * 0.3;
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(xR, y, rr + 3.5, 0, TAU); ctx.fill();      // halo carries the weight
    ctx.globalAlpha = 0.45 + share * 0.55;
    ctx.beginPath(); ctx.arc(xR, y, rr, 0, TAU); ctx.fill();
    if (roles.length <= 14) {
      ctx.globalAlpha = 0.5 + share * 0.5;
      ctx.fillStyle = share > 0.5 ? WHITE : CAPTION;
      ctx.fillText(String(roles[i]), xR + rr + 5, y);
    }
  }

  ctx.restore();
};

// ---------------------------------------------------------------------------------------
// 2. failure modes — which WCAG tags the agent keeps missing
// ---------------------------------------------------------------------------------------
G.failureModes = function (ctx, w, h, t, data) {
  if (!(w > 0) || !(h > 0)) return;
  const tally = data && data.tally;
  if (!tally) { empty(ctx, w, h); return; }

  const keys = Object.keys(tally);
  if (!keys.length) { empty(ctx, w, h); return; }
  keys.sort((a, b) => (tally[b] - tally[a]) || (a < b ? -1 : 1));
  const n = Math.min(keys.length, 8);

  let max = 0;
  for (let i = 0; i < n; i++) { const v = +tally[keys[i]] || 0; if (v > max) max = v; }
  if (!(max > 0)) { empty(ctx, w, h); return; }

  ctx.save();

  const tiny = w < 400;
  const labelW = clamp(w * 0.28, 44, 96);
  const numW = tiny ? 30 : 40;
  const x0 = labelW + 6;
  const track = w - x0 - numW - 4;
  if (track < 12) { ctx.restore(); empty(ctx, w, h); return; }

  const rowH = h / n;
  const barH = clamp(rowH * 0.5, 3, 16);
  const fs = rowH < 18 ? 6 : 7;
  ctx.textBaseline = 'middle';

  for (let i = 0; i < n; i++) {
    const v = +tally[keys[i]] || 0;
    const y = rowH * (i + 0.5);
    const col = i < 2 ? RED : i < 4 ? AMBER : CYAN;
    const bw = Math.max(1, track * (v / max));

    // rail first, so short bars still read as a position on a scale
    ctx.globalAlpha = 1;
    ctx.fillStyle = TARMAC;
    ctx.fillRect(x0, y - barH / 2, track, barH);

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = col;
    ctx.fillRect(x0, y - barH / 2, bw, barH);

    // t never resets, so there is no grow-in to play — the leading edge breathes instead.
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 - i * 0.55);
    ctx.globalAlpha = 0.25 + pulse * 0.65;
    ctx.fillStyle = WHITE;
    ctx.fillRect(x0 + bw - 2, y - barH / 2, 2, barH);

    ctx.globalAlpha = 0.82;
    ctx.fillStyle = CAPTION;
    ctx.font = fs + PX;
    ctx.textAlign = 'left';
    ctx.fillText(String(keys[i]).slice(0, 10).toUpperCase(), 2, y);

    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.font = (rowH < 18 ? 14 : 18) + VT;
    ctx.textAlign = 'right';
    ctx.fillText(String(v), w - 2, y);
  }

  ctx.restore();
};

// ---------------------------------------------------------------------------------------
// 3. run history — claimed vs held-out, and what it cost
// ---------------------------------------------------------------------------------------
G.runHistory = function (ctx, w, h, t, data) {
  if (!(w > 0) || !(h > 0)) return;
  const runs = data && data.runs;
  if (!runs || runs.length < 1) { empty(ctx, w, h); return; }

  ctx.save();

  const tiny = w < 400 || h < 190;
  const padL = tiny ? 22 : 30, padR = tiny ? 8 : 12;
  const padT = tiny ? 10 : 14;
  const costH = clamp(h * 0.16, 10, 34);
  const padB = costH + (tiny ? 12 : 16);
  const pw = w - padL - padR, ph = h - padT - padB;
  if (pw < 10 || ph < 10) { ctx.restore(); empty(ctx, w, h); return; }

  // y never starts at zero: the whole story lives in the third significant figure.
  let lo = Infinity, hi = -Infinity, cmax = 0;
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i]; if (!r) continue;
    const a = +r.official, b = +r.claimed, c = +r.cost;
    if (isFinite(a)) { if (a < lo) lo = a; if (a > hi) hi = a; }
    if (isFinite(b)) { if (b < lo) lo = b; if (b > hi) hi = b; }
    if (isFinite(c) && c > cmax) cmax = c;
  }
  if (!isFinite(lo) || !isFinite(hi)) { ctx.restore(); empty(ctx, w, h); return; }
  const pad = (hi - lo) * 0.12 || Math.max(Math.abs(hi) * 0.01, 0.5);
  lo -= pad; hi += pad;

  const n = runs.length;
  const xOf = i => n < 2 ? padL + pw / 2 : padL + pw * (i / (n - 1));
  const yOf = v => padT + ph * (1 - (v - lo) / (hi - lo));

  // ---- band: the gap between what was claimed and what held out is the whole point ----
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = PURPLE;
  ctx.beginPath();
  for (let i = 0; i < n; i++) { const v = runs[i] ? +runs[i].claimed : NaN; ctx[i ? 'lineTo' : 'moveTo'](xOf(i), yOf(isFinite(v) ? v : lo)); }
  for (let i = n - 1; i >= 0; i--) { const v = runs[i] ? +runs[i].official : NaN; ctx.lineTo(xOf(i), yOf(isFinite(v) ? v : lo)); }
  ctx.closePath();
  ctx.fill();

  // ---- series ----
  const line = (key, col, wid) => {
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = col;
    ctx.lineWidth = wid;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < n; i++) {
      const v = runs[i] ? +runs[i][key] : NaN; if (!isFinite(v)) continue;
      const x = xOf(i), y = yOf(v);
      if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
    }
    if (started) ctx.stroke();
    ctx.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const v = runs[i] ? +runs[i][key] : NaN; if (!isFinite(v)) continue;
      ctx.beginPath(); ctx.arc(xOf(i), yOf(v), 1.6, 0, TAU); ctx.fill();
    }
  };
  line('claimed', PURPLE, 1.4);
  line('official', GOLD, 1.8);

  // ---- cost, along the floor ----
  if (cmax > 0) {
    const bw = Math.max(1.5, pw / n * 0.34);
    const base = h - (tiny ? 8 : 12);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = CYAN;
    for (let i = 0; i < n; i++) {
      const c = runs[i] ? +runs[i].cost : NaN; if (!isFinite(c)) continue;
      const bh = Math.max(1, costH * (c / cmax));
      ctx.fillRect(xOf(i) - bw / 2, base - bh, bw, bh);
    }
  }

  // ---- the run we are standing in ----
  const at = (data && typeof data.at === 'number') ? clamp(data.at | 0, 0, n - 1) : -1;
  if (at >= 0 && runs[at]) {
    const mx = xOf(at);
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, padT - 4); ctx.lineTo(mx, h - 4); ctx.stroke();
    const v = +runs[at].official;
    if (isFinite(v)) {
      const my = yOf(v);
      const p = (t * 0.8) % 1;                       // pulse rings out and dies, forever
      ctx.globalAlpha = (1 - p) * 0.8;
      ctx.strokeStyle = WHITE; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(mx, my, 2 + p * 9, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = WHITE;
      ctx.beginPath(); ctx.arc(mx, my, 2.2, 0, TAU); ctx.fill();
    }
  }

  // ---- four numbers, no axis furniture ----
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = MID;
  ctx.font = (tiny ? 14 : 17) + VT;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillText((hi - pad).toFixed(1), padL - 3, padT + 4);
  ctx.fillText((lo + pad).toFixed(1), padL - 3, padT + ph - 4);
  ctx.textAlign = 'left';
  ctx.fillText(String(runs[0] && runs[0].i !== undefined ? runs[0].i : 0), padL, h - 3);
  ctx.textAlign = 'right';
  ctx.fillText(String(runs[n - 1] && runs[n - 1].i !== undefined ? runs[n - 1].i : n - 1), w - padR, h - 3);

  ctx.restore();
};

})(window.SCR = window.SCR || {});
