// ============================================================================
// SCR.devgraphs — three canvas readouts for the developer dashboard.
//
// These are pure: given (ctx, w, h, t, data) they draw and nothing else. No
// frame state, no timers — `t` is the only clock, so a caller can scrub, pause
// or re-render at any rate and get the same picture. That is what lets the
// dashboard tear down and rebuild panels without motion popping.
//
// All three are now still. Under devtheme's MOTION rule movement is spent on
// throughput, liveness, "you are here" and "flagged"; only runHistory has one
// of those (the current run), and a still marker says it. So `t` is taken and
// ignored — the signature stays because the caller passes it.
// ============================================================================
(function (SCR) {
'use strict';
const G = SCR.devgraphs = {};

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
// alpha is applied via globalAlpha rather than rgba strings — no per-frame string building.

// mast modes are the taxonomy the diagnoser blames; colour is the only legend we get.
function modeColor (C, m) {
  if (m === '1.4-loss-of-history') return C.blue;
  if (m === '1.5-unaware-of-stopping') return C.amber;
  if (m === '1.2-tool-schema-error') return C.rose;
  return C.violet;
}

// ---------------------------------------------------------------------------------------
// 1. credit graph — who got blamed for what, and how sure we were
//
// Static by design: edge colour is the mast mode, edge width and opacity are the
// diagnoser's confidence, node size is how many rows landed on that role. Nothing here
// is in flight, so nothing here moves.
// ---------------------------------------------------------------------------------------
G.creditGraph = function (ctx, w, h, t, data) {
  const T = SCR.devtheme;
  if (!T || !(w > 0) || !(h > 0)) return;
  const C = T.C;

  const rows = data && data.rows;
  let items = data && data.items;
  let roles = data && data.roles;
  if (!rows || !rows.length) { T.empty(ctx, w, h); return; }

  // tolerate a caller that hands us rows only.
  if (!items || !items.length) { items = []; for (let i = 0; i < rows.length; i++) { const v = rows[i] && rows[i].item; if (v && items.indexOf(v) < 0) items.push(v); } }
  if (!roles || !roles.length) { roles = []; for (let i = 0; i < rows.length; i++) { const v = rows[i] && rows[i].blamed_role; if (v && roles.indexOf(v) < 0) roles.push(v); } }
  if (!items.length || !roles.length) { T.empty(ctx, w, h); return; }

  ctx.save();

  // one decision from the box, taken once — every font call downstream reads it.
  const small = h < 190 || w < 300;
  const padX = small ? 20 : 30;
  const padY = small ? 12 : 16;
  const xL = padX, xR = w - padX;
  const span = xR - xL;
  if (span < 24) { ctx.restore(); T.empty(ctx, w, h); return; }

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

    ctx.globalAlpha = 0.14 + conf * 0.42;
    ctx.strokeStyle = modeColor(C, r.mast_mode);
    ctx.lineWidth = 0.6 + conf * 1.7;
    ctx.beginPath();
    ctx.moveTo(xL, y0);
    ctx.bezierCurveTo(c0, y0, c1, y1, xR, y1);
    ctx.stroke();
  }

  // ---- nodes ----
  ctx.font = T.font('label', small);
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'right';
  for (let i = 0; i < items.length; i++) {
    const y = yOf(i, items.length);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.grid;
    ctx.beginPath(); ctx.arc(xL, y, 3.2, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = C.dim; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(xL, y, 3.2, 0, TAU); ctx.stroke();
    if (items.length <= 14) { ctx.globalAlpha = 0.7; ctx.fillStyle = C.dim; ctx.fillText(String(items[i]), xL - 6, y); }
  }

  ctx.textAlign = 'left';
  for (let i = 0; i < roles.length; i++) {
    const y = yOf(i, roles.length);
    const share = counts[i] / maxCount;
    const rr = 3 + share * (small ? 4 : 7);
    ctx.globalAlpha = 0.18 + share * 0.3;
    ctx.fillStyle = C.amber;
    ctx.beginPath(); ctx.arc(xR, y, rr + 3.5, 0, TAU); ctx.fill();      // halo carries the weight
    ctx.globalAlpha = 0.45 + share * 0.55;
    ctx.beginPath(); ctx.arc(xR, y, rr, 0, TAU); ctx.fill();
    if (roles.length <= 14) {
      const tx = xR + rr + 5;
      ctx.globalAlpha = 0.5 + share * 0.5;
      ctx.fillStyle = share > 0.5 ? C.text : C.dim;
      ctx.font = T.font('label', small);
      const nm = String(roles[i]);
      ctx.fillText(nm, tx, y);
      // the count says what the disc size means, so the disc needs no legend.
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = C.mute;
      ctx.font = T.font('value', small);
      ctx.fillText(String(counts[i]), tx + ctx.measureText(nm).width + 5, y);
    }
  }

  ctx.restore();
};

// ---------------------------------------------------------------------------------------
// 2. failure modes — which WCAG tags the agent keeps missing
// ---------------------------------------------------------------------------------------
G.failureModes = function (ctx, w, h, t, data) {
  const T = SCR.devtheme;
  if (!T || !(w > 0) || !(h > 0)) return;
  const C = T.C;

  const tally = data && data.tally;
  if (!tally) { T.empty(ctx, w, h); return; }

  const keys = Object.keys(tally);
  if (!keys.length) { T.empty(ctx, w, h); return; }
  keys.sort((a, b) => (tally[b] - tally[a]) || (a < b ? -1 : 1));
  const n = Math.min(keys.length, 8);

  let max = 0;
  for (let i = 0; i < n; i++) { const v = +tally[keys[i]] || 0; if (v > max) max = v; }
  if (!(max > 0)) { T.empty(ctx, w, h); return; }

  ctx.save();

  const small = h < 190 || w < 300;
  const labelW = clamp(w * 0.28, 44, 96);
  const numW = small ? 30 : 40;
  const x0 = labelW + 6;
  const track = w - x0 - numW - 4;
  if (track < 12) { ctx.restore(); T.empty(ctx, w, h); return; }

  const rowH = h / n;
  const barH = clamp(rowH * 0.5, 3, 16);
  ctx.textBaseline = 'middle';

  for (let i = 0; i < n; i++) {
    const v = +tally[keys[i]] || 0;
    const y = rowH * (i + 0.5);
    const col = i < 2 ? C.rose : i < 4 ? C.amber : C.blue;
    const bw = Math.max(1, track * (v / max));

    // rail first, so short bars still read as a position on a scale
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.line;
    ctx.fillRect(x0, y - barH / 2, track, barH);

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = col;
    ctx.fillRect(x0, y - barH / 2, bw, barH);

    ctx.globalAlpha = 0.82;
    ctx.fillStyle = C.dim;
    ctx.font = T.font('label', small);
    ctx.textAlign = 'left';
    ctx.fillText(String(keys[i]).slice(0, 12), 2, y);

    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.font = T.font('value', small);
    ctx.textAlign = 'right';
    ctx.fillText(String(v), w - 2, y);
  }

  ctx.restore();
};

// ---------------------------------------------------------------------------------------
// 3. run history — claimed vs held-out, and what it cost
// ---------------------------------------------------------------------------------------
G.runHistory = function (ctx, w, h, t, data) {
  const T = SCR.devtheme;
  if (!T || !(w > 0) || !(h > 0)) return;
  const C = T.C;

  const runs = data && data.runs;
  if (!runs || runs.length < 1) { T.empty(ctx, w, h); return; }

  ctx.save();

  const small = h < 190 || w < 300;
  const padL = small ? 22 : 30, padR = small ? 8 : 12;
  const padT = small ? 14 : 18;
  const costH = clamp(h * 0.16, 10, 34);
  const padB = costH + (small ? 12 : 16);
  const pw = w - padL - padR, ph = h - padT - padB;
  if (pw < 10 || ph < 10) { ctx.restore(); T.empty(ctx, w, h); return; }

  // y never starts at zero: the whole story lives in the third significant figure.
  let lo = Infinity, hi = -Infinity, cmax = 0;
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i]; if (!r) continue;
    const a = +r.official, b = +r.claimed, c = +r.cost;
    if (isFinite(a)) { if (a < lo) lo = a; if (a > hi) hi = a; }
    if (isFinite(b)) { if (b < lo) lo = b; if (b > hi) hi = b; }
    if (isFinite(c) && c > cmax) cmax = c;
  }
  if (!isFinite(lo) || !isFinite(hi)) { ctx.restore(); T.empty(ctx, w, h); return; }
  const pad = (hi - lo) * 0.12 || Math.max(Math.abs(hi) * 0.01, 0.5);
  lo -= pad; hi += pad;

  const n = runs.length;
  const xOf = i => n < 2 ? padL + pw / 2 : padL + pw * (i / (n - 1));
  const yOf = v => padT + ph * (1 - (v - lo) / (hi - lo));

  // ---- band: the gap between what was claimed and what held out is the whole point ----
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = C.violet;
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
  line('claimed', C.violet, 1.4);
  line('official', C.amber, 1.8);

  // ---- cost, along the floor ----
  const base = h - (small ? 8 : 12);
  if (cmax > 0) {
    const bw = Math.max(1.5, pw / n * 0.34);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = C.blue;
    for (let i = 0; i < n; i++) {
      const c = runs[i] ? +runs[i].cost : NaN; if (!isFinite(c)) continue;
      const bh = Math.max(1, costH * (c / cmax));
      ctx.fillRect(xOf(i) - bw / 2, base - bh, bw, bh);
    }
  }

  // ---- the run we are standing in — "you are here", still ----
  const at = (data && typeof data.at === 'number') ? clamp(data.at | 0, 0, n - 1) : -1;
  if (at >= 0 && runs[at]) {
    const mx = xOf(at);
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, padT - 4); ctx.lineTo(mx, h - 4); ctx.stroke();
    const v = +runs[at].official;
    if (isFinite(v)) {
      const my = yOf(v);
      ctx.globalAlpha = 0.35; ctx.strokeStyle = C.text; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(mx, my, 5.5, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = C.text;
      ctx.beginPath(); ctx.arc(mx, my, 2.2, 0, TAU); ctx.fill();
    }
  }

  // ---- four numbers, no axis furniture ----
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = C.mute;
  ctx.font = T.font('axis', small);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillText((hi - pad).toFixed(1), padL - 3, padT + 4);
  ctx.fillText((lo + pad).toFixed(1), padL - 3, padT + ph - 4);
  ctx.textAlign = 'left';
  ctx.fillText(String(runs[0] && runs[0].i !== undefined ? runs[0].i : 0), padL, h - 3);
  ctx.textAlign = 'right';
  ctx.fillText(String(runs[n - 1] && runs[n - 1].i !== undefined ? runs[n - 1].i : n - 1), w - padR, h - 3);

  // ---- what the numbers are in. three axes, three units, no sentence ----
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = C.mute;
  ctx.font = T.font('sub', small);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('seconds', padL - (small ? 20 : 28), padT - 5);
  ctx.textBaseline = 'middle';
  ctx.fillText('run', padL + 14, h - 3);
  if (cmax > 0) { ctx.textAlign = 'right'; ctx.fillText('cost $', w - padR, base - costH - 4); }

  ctx.restore();
};

})(window.SCR = window.SCR || {});
