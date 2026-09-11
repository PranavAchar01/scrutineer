// ============================================================================
// SCR.devaudit — two readouts for the audit half of the developer view.
//
// The auditor's output is two shapes of evidence: a taxonomy of what it flagged,
// and a table of what it blamed and what it then chose to act on. Those last two
// used to be separate panels (selection, blameCI) asking the same question from
// two sides — "which component is at fault, and which one got changed" — so they
// are one panel now. Same contract as devgraphs: pure in (ctx, w, h, t, data),
// `t` is the only clock.
// ============================================================================
(function (SCR) {
'use strict';
const A = SCR.devaudit = {};

const T = SCR.devtheme, C = T.C;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const fin = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;

// truncate to a pixel budget rather than a character count — the labels here are
// real hinted type, so their width is not a function of length.
function fit (ctx, s, max) {
  s = (s === undefined || s === null) ? '' : String(s);
  if (!(max > 0) || !s) return '';
  if (ctx.measureText(s).width <= max) return s;
  let c = s;
  while (c.length > 1) {
    c = c.slice(0, -1);
    if (ctx.measureText(c + '…').width <= max) return c + '…';
  }
  return '';
}

function bad (w, h) { return !(w > 0) || !(h > 0); }

// one shrink decision per panel, taken from the panel's own box — never per string.
function isSmall (w, h) { return SCR.devtheme.small(w, h); }

// ---------------------------------------------------------------------------
// 1. tamper matrix — functional role x obligation, as a heatmap
// ---------------------------------------------------------------------------
const ROLES = ['Planning', 'Recording', 'Evaluation', 'Execution', 'Communication'];
const OBLIG = ['Faithfulness', 'MeasurementValidity', 'Calibration', 'Completeness',
               'Consistency', 'Authorisation', 'Reversibility'];
// the taxonomy names are written for a report, not for a 30px column.
const ABBR = {
  Faithfulness: 'Faithful', MeasurementValidity: 'Measurement', Calibration: 'Calibration',
  Completeness: 'Complete', Consistency: 'Consistent', Authorisation: 'Authorise',
  Reversibility: 'Reversible'
};

function axis (given, fallback) {
  if (!given || !given.length) return fallback;
  const out = [];
  for (let i = 0; i < given.length; i++) {
    const v = given[i];
    if (typeof v === 'string' && v) out.push(v);
  }
  return out.length ? out : fallback;
}

A.tamperMatrix = function (ctx, w, h, t, data) {
  if (bad(w, h)) return;
  const flags = (data && data.flags) || null;
  if (!flags || !flags.length) { T.empty(ctx, w, h, 'no flags'); return; }

  const rows = axis(data && data.roles, ROLES);
  const cols = axis(data && data.obligations, OBLIG);
  const nR = rows.length, nC = cols.length;
  if (!nR || !nC) { T.empty(ctx, w, h, 'no taxonomy'); return; }

  // bucket into cells. a flag naming an axis we were not given is dropped rather
  // than widening the grid mid-render — the taxonomy is fixed, the flags are not.
  const cell = {}; let maxN = 0, any = false;
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i];
    if (!f) continue;
    const r = rows.indexOf(f.functional_role), c = cols.indexOf(f.obligation);
    if (r < 0 || c < 0) continue;
    const k = r + ':' + c;
    const e = cell[k] || (cell[k] = { n: 0, conf: 0, seeded: false, r: r, c: c });
    e.n++; e.conf += clamp(fin(f.confidence, 0), 0, 1);
    if (f.seeded) e.seeded = true;
    if (e.n > maxN) maxN = e.n;
    any = true;
  }
  if (!any) { T.empty(ctx, w, h, 'no flags'); return; }

  ctx.save();
  const small = isSmall(w, h);
  const pad = 6;
  const capH = (h >= 190) ? 12 : 0;   // room for the one line of prose we allow

  ctx.font = T.font('label', small);
  let leftW = 0;
  for (let i = 0; i < nR; i++) leftW = Math.max(leftW, ctx.measureText(rows[i]).width);
  leftW = clamp(leftW + 8, 28, w * 0.34);
  const topH = clamp(h * 0.34, 26, 74);

  const gx = pad + leftW, gy = topH;
  const gw = w - gx - pad, gh = h - gy - pad - capH;
  if (!(gw > 16) || !(gh > 16)) { ctx.restore(); T.empty(ctx, w, h, 'too small'); return; }

  const cw = gw / nC, ch = gh / nR;

  // column labels run bottom-to-top: at seven columns there is never horizontal room.
  ctx.fillStyle = C.dim; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  for (let c = 0; c < nC; c++) {
    const name = ABBR[cols[c]] || cols[c];
    ctx.save();
    ctx.translate(gx + cw * (c + 0.5), gy - 4);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(fit(ctx, name, topH - 6), 0, 0);
    ctx.restore();
  }

  ctx.textAlign = 'right';
  for (let r = 0; r < nR; r++) {
    ctx.fillStyle = C.dim;
    ctx.fillText(fit(ctx, rows[r], leftW - 6), gx - 6, gy + ch * (r + 0.5));
  }

  // the count inside a cell is a number read in passing, so it is `value` — and the
  // cell has to be tall enough for the size the scale hands us, not the other way round.
  const numH = small ? 13 : 16;

  for (let r = 0; r < nR; r++) {
    for (let c = 0; c < nC; c++) {
      const x = gx + cw * c + 1, y = gy + ch * r + 1;
      const bw = Math.max(1, cw - 2), bh = Math.max(1, ch - 2);
      const e = cell[r + ':' + c];
      if (!e) { // an empty cell is furniture, not information
        ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
        T.rr(ctx, T.crisp(x), T.crisp(y), Math.round(bw), Math.round(bh), 2); ctx.stroke();
        continue;
      }
      const k = maxN > 0 ? e.n / maxN : 1;
      ctx.globalAlpha = 0.16 + 0.62 * k;
      ctx.fillStyle = C.rose;
      T.rr(ctx, x, y, bw, bh, 2); ctx.fill();
      ctx.globalAlpha = 1;

      // mean confidence as an underline — a weak flag should not look like a strong one.
      const conf = clamp(e.conf / e.n, 0, 1);
      if (bw > 10 && bh > 8) {
        ctx.fillStyle = C.rose;
        ctx.fillRect(x + 2, y + bh - 3, Math.max(1, (bw - 4) * conf), 2);
      }

      if (bw > 14 && bh >= numH) {
        ctx.font = T.font('value', small);
        ctx.fillStyle = C.white; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(e.n), x + bw / 2, y + bh / 2 - 1);
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      }

      // the seeded cell is the whole point of the panel: a canary we planted, caught.
      // this is the one animation left in the file — motion here means "flagged".
      if (e.seeded) {
        ctx.strokeStyle = C.amber; ctx.lineWidth = 1.5;
        T.rr(ctx, x + 0.5, y + 0.5, bw - 1, bh - 1, 2); ctx.stroke();
        for (let p = 0; p < 2; p++) {
          const ph = ((fin(t, 0) * 0.7 + p * 0.5) % 1 + 1) % 1;
          const g = ph * 7;
          ctx.globalAlpha = clamp(0.5 * (1 - ph), 0, 1);
          ctx.lineWidth = 1;
          T.rr(ctx, x - g, y - g, bw + g * 2, bh + g * 2, 2 + g); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  if (capH) {
    ctx.font = T.font('tag', small); ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.amber;
    ctx.fillText('ringed = seeded canary', w - pad, h - 3);
  }
  ctx.restore();
};

// ---------------------------------------------------------------------------
// 2. role table — everything the loop knew, and the one it picked
//
// One row per component. The whisker is the blame interval against the act line;
// the state is a single mark on the left; gain per dollar is the price of acting.
// Nothing moves: none of the four motion meanings apply to a static ranking, and
// a shimmering interval only ever read as decoration.
// ---------------------------------------------------------------------------
A.roleTable = function (ctx, w, h, t, data) {
  if (bad(w, h)) return;
  const src = (data && data.rows) || null;
  if (!src || !src.length) { T.empty(ctx, w, h, 'no roles'); return; }

  const thr = fin(data && data.threshold, 0);
  const chosen = (data && typeof data.chosen === 'string') ? data.chosen : null;

  // per field, not per row: a standings-only row and an alternatives-only row are
  // both real rows — they just leave different columns blank.
  const rows = [];
  for (let i = 0; i < src.length; i++) {
    const s = src[i];
    if (!s) continue;
    const mid = fin(s.blame_s, 0);
    const ci = s.ci || [];
    const rawLo = fin(ci[0], NaN), rawHi = fin(ci[1], NaN);
    const hasCI = isFinite(rawLo) && isFinite(rawHi);
    let lo = hasCI ? rawLo : mid, hi = hasCI ? rawHi : mid;
    if (lo > hi) { const q = lo; lo = hi; hi = q; }
    const n = Math.max(0, Math.round(fin(s.n, 0)));
    const exhausted = !!s.exhausted;
    rows.push({
      role: (typeof s.role === 'string' && s.role) ? s.role : '?',
      n: n, mid: mid, lo: lo, hi: hi, hasCI: hasCI,
      gain: fin(s.gain_per_usd, 0),
      exhausted: exhausted,
      eligible: !!s.eligible && !exhausted,
      never: n === 0,                    // never blamed: the empty row is the finding
      clears: hasCI ? (lo > thr) : (mid > thr),
    });
  }
  if (!rows.length) { T.empty(ctx, w, h, 'no roles'); return; }
  rows.sort((a, b) => b.mid - a.mid);

  // one x-scale for every row, or the whiskers are not comparable.
  let dLo = thr, dHi = thr;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.never && !r.hasCI && r.mid === 0) continue;   // don't let empties pin the scale
    dLo = Math.min(dLo, r.lo, r.mid);
    dHi = Math.max(dHi, r.hi, r.mid);
  }
  if (!(dHi - dLo > 1e-9)) { dLo -= 1; dHi += 1; }
  const mgn = (dHi - dLo) * 0.08; dLo -= mgn; dHi += mgn;

  ctx.save();
  const small = isSmall(w, h);
  const pad = 6;
  const ruleX = 2, ruleW = 2;            // the chosen row's left rule lives here
  const nameX = ruleX + ruleW + 4;

  ctx.font = T.font('label', small);
  let nameW = 0;
  for (let i = 0; i < rows.length; i++) nameW = Math.max(nameW, ctx.measureText(rows[i].role).width);
  nameW = clamp(nameW + 4, 26, w * 0.26);

  ctx.font = T.font('value', small);
  const nW = Math.ceil(ctx.measureText('n99').width) + 6;
  let gainW = Math.ceil(ctx.measureText('999.9').width) + 6;

  const headH = h >= 130 ? (small ? 11 : 13) : 0;
  const axisH = h >= 120 ? (small ? 11 : 13) : 0;

  let x0 = nameX + nameW + nW + 6;
  let x1 = w - pad - gainW;
  if (x1 - x0 < 40) { gainW = 0; x1 = w - pad - 2; }   // the whisker outranks the price
  const plotW = x1 - x0;
  if (!(plotW > 20)) { ctx.restore(); T.empty(ctx, w, h, 'too small'); return; }
  const X = v => x0 + ((clamp(v, dLo, dHi) - dLo) / (dHi - dLo)) * plotW;

  const top = headH + 2;
  const plotH = h - top - axisH - 2;
  if (!(plotH > 6)) { ctx.restore(); T.empty(ctx, w, h, 'too small'); return; }
  const rowH = plotH / rows.length;

  if (headH) {
    ctx.font = T.font('tag', small);
    ctx.fillStyle = C.mute; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillText('blame ci', x0, headH - 2);
    if (gainW) { ctx.textAlign = 'right'; ctx.fillText('gain/$', w - pad, headH - 2); }
  }

  // ticks first, reference line on top of them.
  if (axisH) {
    ctx.font = T.font('axis', small);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    for (let k = 0; k <= 4; k++) {
      const v = dLo + ((dHi - dLo) * k) / 4, x = T.crisp(x0 + (plotW * k) / 4);
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + plotH); ctx.stroke();
      ctx.fillStyle = C.mute;
      ctx.fillText(v.toFixed(0) + 's', clamp(x, x0 + 10, x1 - 10), h - 3);
    }
  }
  const tx = T.crisp(X(thr));
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(tx, top); ctx.lineTo(tx, top + plotH); ctx.stroke();
  ctx.setLineDash([]);

  const dotR = clamp(rowH * 0.22, 2, 3.5);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const y = top + rowH * i, cy = y + rowH / 2;
    const isChosen = !!chosen && r.role === chosen;
    // teal only when the interval clears the act line; otherwise the loop may not act.
    const col = r.exhausted ? C.mute : (r.clears ? C.teal : C.amber);

    // state, as exactly one mark per row.
    if (isChosen) {
      ctx.fillStyle = C.amber;
      T.rr(ctx, ruleX, y + 1.5, ruleW, Math.max(2, rowH - 3), 1); ctx.fill();
    }

    ctx.font = T.font('label', small);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = isChosen ? C.text
      : r.exhausted ? C.mute
      : r.never ? C.mute
      : r.eligible ? C.dim : C.mute;
    const shown = fit(ctx, r.role, nameW);
    ctx.fillText(shown, nameX, cy);
    if (r.exhausted) {   // retired: attempts spent, no fix. strike the name.
      const tw = ctx.measureText(shown).width;
      ctx.strokeStyle = C.mute; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(nameX, T.crisp(cy)); ctx.lineTo(nameX + tw, T.crisp(cy)); ctx.stroke();
    }

    ctx.font = T.font('value', small);
    ctx.textAlign = 'right';
    ctx.fillStyle = r.never ? C.line : C.mute;
    ctx.fillText('n' + r.n, x0 - 6, cy);

    if (r.never && !r.hasCI) {
      // never blamed: a hairline where the interval would be, and nothing else.
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, T.crisp(cy)); ctx.lineTo(x1, T.crisp(cy)); ctx.stroke();
    } else {
      const xl = X(r.lo), xh = X(r.hi), len = xh - xl;
      const capH2 = clamp(rowH * 0.22, 2.5, 6);

      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.globalAlpha = r.exhausted ? 0.55 : 0.85;
      ctx.beginPath(); ctx.moveTo(xl, T.crisp(cy)); ctx.lineTo(xh, T.crisp(cy)); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(T.crisp(xl), cy - capH2); ctx.lineTo(T.crisp(xl), cy + capH2);
      ctx.moveTo(T.crisp(xh), cy - capH2); ctx.lineTo(T.crisp(xh), cy + capH2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // hatch the span of an exhausted row so the state reads from the whisker too,
      // without needing the name to be legible at 8px.
      if (r.exhausted && len > 2) {
        ctx.save();
        ctx.beginPath(); ctx.rect(xl, cy - capH2, len, capH2 * 2); ctx.clip();
        ctx.globalAlpha = 0.45; ctx.strokeStyle = C.mute; ctx.lineWidth = 1;
        for (let x = xl - capH2 * 2; x < xh; x += 5) {
          ctx.beginPath();
          ctx.moveTo(x, cy + capH2); ctx.lineTo(x + capH2 * 2, cy - capH2);
          ctx.stroke();
        }
        ctx.restore();
      }

      const dx = X(r.mid);
      ctx.beginPath(); ctx.arc(dx, cy, dotR, 0, TAU);
      if (r.exhausted) { ctx.strokeStyle = C.mute; ctx.lineWidth = 1.2; ctx.stroke(); }
      else { ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = C.panel; ctx.stroke(); }
    }

    // one state word, and only when there is a row tall enough to carry it.
    if (r.exhausted && rowH >= 11 && plotW > 110) {
      ctx.font = T.font('tag', small);
      ctx.textAlign = 'left'; ctx.fillStyle = C.mute;
      ctx.fillText(fit(ctx, 'exhausted', x1 - x0 - 6), x0 + 4, cy - clamp(rowH * 0.3, 4, 8));
    }

    if (gainW && r.gain !== 0) {
      ctx.font = T.font('value', small);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = isChosen ? C.text : C.dim;
      ctx.fillText(r.gain.toFixed(1), w - pad, cy);
    }
  }
  ctx.restore();
};
})(window.SCR = window.SCR || {});
