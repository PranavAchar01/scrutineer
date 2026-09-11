// ============================================================================
// SCR.devpanels — two readouts about the agent's own judgement: what it thought
// a change was worth, and where its proposals actually die.
//
// Same contract as SCR.devgraphs: pure draw, no state between frames. Colours and
// type come from SCR.devtheme and nowhere else. Both panels are still: neither shows
// throughput, liveness, "you are here" or a flag, which are the only four things
// devtheme lets move. `t` is taken and ignored so the caller's signature holds.
// ============================================================================
(function (SCR) {
'use strict';
const P = SCR.devpanels = {};

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// tick spacing that lands on 1/2/5 x 10^n, so axis numbers stay readable at any width.
function niceStep (range, target) {
  const raw = range / (target || 4);
  if (!(raw > 0) || !isFinite(raw)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
  const n = raw / mag;
  const s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return s * mag;
}

// axis numbers carry one decimal only when the step is finer than a whole unit.
function fmt (v, step) {
  if (Math.abs(v) < 1e-9) return '0';
  return step < 1 ? v.toFixed(1) : String(Math.round(v));
}

// ---------------------------------------------------------------------------------------
// 1. calibration — predicted gain against measured gain, on one shared scale
//
// Both axes share a domain on purpose. Independent axes would stretch the measured
// range until the noise looked like signal; shared, the reference line runs corner to
// corner and every point lies flat along the floor, which is the actual finding.
// ---------------------------------------------------------------------------------------
P.calibration = function (ctx, w, h, t, data) {
  const T = SCR.devtheme;
  if (!T || !(w > 0) || !(h > 0)) return;
  const C = T.C;

  const src = data && data.points;
  const pts = [];
  if (src && src.length) {
    for (let i = 0; i < src.length; i++) {
      const p = src[i]; if (!p) continue;
      const x = +p.predicted, y = +p.measured;
      if (!isFinite(x) || !isFinite(y)) continue;
      pts.push({ x: x, y: y, on: !!p.promoted });
    }
  }
  if (!pts.length) { T.empty(ctx, w, h, 'no calibration data'); return; }

  ctx.save();

  // one decision from the box, taken once — every font call downstream reads it.
  const small = h < 190 || w < 300;
  const padL = small ? 26 : 34, padR = small ? 10 : 14;
  const padT = small ? 14 : 18, padB = small ? 20 : 28;
  const pw = w - padL - padR, ph = h - padT - padB;
  if (!(pw > 24) || !(ph > 24)) { ctx.restore(); T.empty(ctx, w, h, 'no room'); return; }

  // zero must be in frame on both axes, and the one negative measurement must fit.
  let lo = 0, hi = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i].x, b = pts[i].y;
    if (a < lo) lo = a; if (a > hi) hi = a;
    if (b < lo) lo = b; if (b > hi) hi = b;
  }
  let span = hi - lo;
  if (!(span > 0)) { lo -= 1; hi += 1; span = 2; }
  lo -= span * 0.08; hi += span * 0.08; span = hi - lo;

  const xOf = v => padL + pw * (v - lo) / span;
  const yOf = v => padT + ph * (1 - (v - lo) / span);
  const x0 = padL, x1 = padL + pw, y0 = padT, y1 = padT + ph;

  // ---- the region of under-delivery: everything below y = x ----
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.rose;
  ctx.globalAlpha = 0.05;
  ctx.beginPath();
  ctx.moveTo(xOf(lo), yOf(lo)); ctx.lineTo(xOf(hi), yOf(hi)); ctx.lineTo(xOf(hi), yOf(lo));
  ctx.closePath(); ctx.fill();

  // ---- grid at the tick values, so gridline and number always agree ----
  const step = niceStep(span, small ? 3 : 4);
  const first = Math.ceil(lo / step) * step;
  const ticks = [];
  for (let v = first, k = 0; v <= hi && k < 40; v += step, k++) ticks.push(v);

  ctx.globalAlpha = 1;
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  for (let i = 0; i < ticks.length; i++) {
    const gy = T.crisp(yOf(ticks[i])), gx = T.crisp(xOf(ticks[i]));
    ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gx, y0); ctx.lineTo(gx, y1); ctx.stroke();
  }

  // zero is the line the measurements actually sit on — give it more weight than the grid.
  ctx.strokeStyle = C.line;
  if (lo < 0 && hi > 0) {
    const zy = T.crisp(yOf(0));
    ctx.beginPath(); ctx.moveTo(x0, zy); ctx.lineTo(x1, zy); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(T.crisp(x0), y0); ctx.lineTo(T.crisp(x0), y1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x0, T.crisp(y1)); ctx.lineTo(x1, T.crisp(y1)); ctx.stroke();

  // ---- y = x, dashed so it reads as a target rather than as data ----
  const ax = xOf(lo), ay = yOf(lo), bx = xOf(hi), by = yOf(hi);
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = C.mute; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.restore();

  // ---- the gap itself: a dropped line from the line down to what was measured ----
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = C.rose; ctx.lineWidth = 1;
  let worst = 0, worstErr = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const px = clamp(xOf(p.x), x0, x1);
    const top = clamp(yOf(p.x), y0, y1), bot = clamp(yOf(p.y), y0, y1);
    ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, bot); ctx.stroke();
    const err = p.x - p.y;
    if (err > worstErr) { worstErr = err; worst = i; }
  }

  // ---- points ----
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const px = clamp(xOf(p.x), x0, x1), py = clamp(yOf(p.y), y0, y1);
    if (i === worst && worstErr > 0) {
      // the biggest miss gets a still disc behind it — size, not motion, lands the eye.
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = p.on ? C.green : C.blue;
      ctx.beginPath(); ctx.arc(px, py, 8, 0, TAU); ctx.fill();
    }
    if (p.on) {
      ctx.globalAlpha = 1; ctx.fillStyle = C.green;
      ctx.beginPath(); ctx.arc(px, py, 3.4, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.45; ctx.strokeStyle = C.green; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(px, py, 6, 0, TAU); ctx.stroke();
    } else {
      ctx.globalAlpha = 0.1; ctx.fillStyle = C.blue;
      ctx.beginPath(); ctx.arc(px, py, 3.2, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = C.blue; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(px, py, 3.2, 0, TAU); ctx.stroke();
    }
  }

  // ---- ticks, then the two axis names, then the unit both axes are in ----
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.mute;
  ctx.font = T.font('axis', small);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  for (let i = 0; i < ticks.length; i++) ctx.fillText(fmt(ticks[i], step), x0 - 4, yOf(ticks[i]));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = 0; i < ticks.length; i++) ctx.fillText(fmt(ticks[i], step), xOf(ticks[i]), y1 + 4);

  ctx.fillStyle = C.dim;
  ctx.font = T.font('label', small);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const mx0 = x0 - (small ? 22 : 30);
  ctx.fillText('measured', mx0, y0 - 5);
  const mw = ctx.measureText('measured ').width;
  ctx.textAlign = 'right';
  ctx.fillText('predicted', x1, h - 3);

  // both axes are the same quantity, so the unit is said once and qualifies both.
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = C.mute;
  ctx.font = T.font('sub', small);
  ctx.textAlign = 'left';
  ctx.fillText('seconds', mx0 + mw, y0 - 5);

  // sits on the reference line, naming what the line means rather than labelling an axis.
  ctx.globalAlpha = 0.8;
  ctx.textAlign = 'right';
  ctx.fillText('as forecast', ax + (bx - ax) * 0.66 - 5, ay + (by - ay) * 0.66 - 5);

  ctx.restore();
};

// ---------------------------------------------------------------------------------------
// 2. gate funnel — how many proposals are still alive after each gate
//
// Survivors are min(alive, pass), not alive - fail: a proposal that fails one gate is
// never re-tested downstream, so a later gate's fail tally can count corpses. Only a
// gate that actually shrinks the band is drawn as a cut, and only that cut gets a number.
// ---------------------------------------------------------------------------------------
P.gateFunnel = function (ctx, w, h, t, data) {
  const T = SCR.devtheme;
  if (!T || !(w > 0) || !(h > 0)) return;
  const C = T.C;

  const src = data && data.gates;
  const gates = [];
  if (src && src.length) {
    for (let i = 0; i < src.length; i++) {
      const g = src[i]; if (!g) continue;
      const pass = +g.pass;
      if (!isFinite(pass) || pass < 0) continue;
      gates.push({ name: String(g.gate || g.name || ''), pass: pass });
    }
  }
  if (!gates.length) { T.empty(ctx, w, h, 'no gate data'); return; }

  let entered = +(data && data.entered);
  if (!isFinite(entered) || entered <= 0) entered = gates[0].pass;
  if (!(entered > 0)) { T.empty(ctx, w, h, 'no proposals'); return; }

  // vals[0] = entered, vals[i+1] = alive after gate i, last = accepted.
  const vals = [entered];
  const kills = [];
  for (let i = 0; i < gates.length; i++) {
    const after = Math.min(vals[i], gates[i].pass);
    kills.push(vals[i] - after);
    vals.push(after);
  }
  let accepted = +(data && data.accepted);
  if (!isFinite(accepted) || accepted < 0) accepted = vals[vals.length - 1];
  accepted = Math.min(accepted, vals[vals.length - 1]);
  const lastGate = vals[vals.length - 1];
  vals.push(accepted);

  ctx.save();

  // one decision from the box, taken once — every font call downstream reads it.
  const small = h < 190 || w < 300;
  const padL = small ? 22 : 30, padR = small ? 22 : 30;
  const padT = small ? 12 : 16, padB = small ? 16 : 22;
  const pw = w - padL - padR, ph = h - padT - padB;
  const n = vals.length;
  if (!(pw > 40) || !(ph > 20) || n < 2) { ctx.restore(); T.empty(ctx, w, h, 'no room'); return; }

  const cy = padT + ph / 2;
  const maxBand = clamp(ph * 0.62, 8, 64);
  const xOf = i => padL + pw * (i / (n - 1));
  const hhOf = v => Math.max(0.8, (maxBand / 2) * clamp(v / entered, 0, 1));
  const segW = pw / (n - 1);

  // ---- band outline: hold flat through a gate, then ease down to the new count ----
  const SAMP = 5;
  const edge = [];
  for (let i = 0; i < n - 1; i++) {
    const xa = xOf(i), xb = xOf(i + 1);
    const ha = hhOf(vals[i]), hb = hhOf(vals[i + 1]);
    for (let k = 0; k < SAMP; k++) {
      const u = k / SAMP;
      const e = u < 0.45 ? 0 : (u - 0.45) / 0.55;
      edge.push({ x: xa + (xb - xa) * u, hh: ha + (hb - ha) * (e * e * (3 - 2 * e)) });
    }
  }
  edge.push({ x: xOf(n - 1), hh: hhOf(vals[n - 1]) });

  const bandPath = () => {
    ctx.beginPath();
    for (let i = 0; i < edge.length; i++) ctx[i ? 'lineTo' : 'moveTo'](edge[i].x, cy - edge[i].hh);
    for (let i = edge.length - 1; i >= 0; i--) ctx.lineTo(edge[i].x, cy + edge[i].hh);
    ctx.closePath();
  };

  ctx.globalAlpha = 0.16; ctx.fillStyle = C.blue; bandPath(); ctx.fill();
  ctx.globalAlpha = 0.55; ctx.strokeStyle = C.blue; ctx.lineWidth = 1; bandPath(); ctx.stroke();

  // ---- gate markers ----
  const showAll = segW >= 52;
  ctx.textBaseline = 'middle';
  for (let i = 0; i < gates.length; i++) {
    const x = xOf(i + 1);
    const hb = hhOf(vals[i]), ha = hhOf(vals[i + 1]);
    if (kills[i] > 0) {
      // a real cut: the notch height is exactly the band the gate removed.
      ctx.globalAlpha = 0.9; ctx.strokeStyle = C.rose; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, cy - hb); ctx.lineTo(x, cy - ha); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, cy + ha); ctx.lineTo(x, cy + hb); ctx.stroke();
      ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, cy - hb - 5); ctx.lineTo(x, cy + hb + 5); ctx.stroke();
    } else {
      ctx.globalAlpha = 0.45; ctx.strokeStyle = C.mute; ctx.lineWidth = 1;
      const cx = T.crisp(x);
      ctx.beginPath(); ctx.moveTo(cx, cy - hb - 3); ctx.lineTo(cx, cy + hb + 3); ctx.stroke();
    }
  }

  // names below the band; snake_case is a key, not something to read.
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = 0; i < gates.length; i++) {
    const cut = kills[i] > 0;
    if (!cut && !showAll) continue;
    const x = clamp(xOf(i + 1), padL, padL + pw);
    const nm = gates[i].name.replace(/_/g, ' ');
    ctx.globalAlpha = cut ? 1 : 0.75;
    ctx.fillStyle = cut ? C.dim : C.mute;
    ctx.font = T.font('label', small);
    ctx.fillText(nm, x, cy + maxBand / 2 + (small ? 7 : 10));
  }

  // the kill count rides above the notch, where the band actually steps down.
  ctx.textBaseline = 'alphabetic';
  for (let i = 0; i < gates.length; i++) {
    if (!(kills[i] > 0)) continue;
    const x = clamp(xOf(i + 1), padL, padL + pw);
    ctx.globalAlpha = 1; ctx.fillStyle = C.rose;
    ctx.font = T.font('value', small);
    ctx.fillText('−' + kills[i], x, cy - maxBand / 2 - (small ? 5 : 8));
  }

  // ---- the two counts that matter, at the mouth and at the spout ----
  // accepted is what the funnel is for, so it is the one number in hero.
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.text; ctx.textAlign = 'right';
  ctx.font = T.font('value', small);
  ctx.fillText(String(entered), padL - 5, cy);
  ctx.fillStyle = accepted > 0 ? C.green : C.mute; ctx.textAlign = 'left';
  ctx.font = T.font('hero', small);
  ctx.fillText(String(accepted), padL + pw + 5, cy);

  // the band is a headcount, not a rate — say so once, under the mouth.
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = C.mute; ctx.textAlign = 'right';
  ctx.font = T.font('sub', small);
  ctx.fillText('proposals', padL - 5, cy + (small ? 10 : 13));

  // the last narrowing is not a gate — keep it mute so it cannot be read as one.
  if (accepted < lastGate) {
    ctx.globalAlpha = 0.5; ctx.strokeStyle = C.mute; ctx.lineWidth = 1;
    const cx = T.crisp(xOf(n - 1));
    ctx.beginPath();
    ctx.moveTo(cx, cy - hhOf(lastGate) - 3); ctx.lineTo(cx, cy + hhOf(lastGate) + 3);
    ctx.stroke();
  }

  ctx.restore();
};

})(window.SCR = window.SCR || {});
