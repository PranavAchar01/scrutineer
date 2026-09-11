// ============================================================================
// SCR.devaudit — three readouts for the audit half of the developer view.
//
// The auditor's output is three different shapes of evidence: a taxonomy of what
// it flagged, a ranking of what it chose to act on, and an interval that says
// whether it should have acted at all. Same contract as devgraphs: pure in
// (ctx, w, h, t, data), `t` is the only clock.
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
  const small = w < 420 || h < 200;
  const fs = small ? 8 : 9;
  const pad = 6;
  const capH = (h >= 190) ? 12 : 0;   // room for the one line of prose we allow

  ctx.font = T.label(fs);
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

      if (bw > 14 && bh > 13) {
        ctx.font = T.num(Math.max(8, Math.min(12, bh * 0.42)), 500);
        ctx.fillStyle = C.white; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(e.n), x + bw / 2, y + bh / 2 - 1);
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      }

      // the seeded cell is the whole point of the panel: a canary we planted, caught.
      // it has to read as "caught on purpose", not as one more hit.
      if (e.seeded) {
        ctx.strokeStyle = C.amber; ctx.lineWidth = 1.5;
        T.rr(ctx, x + 0.5, y + 0.5, bw - 1, bh - 1, 2); ctx.stroke();
        for (let p = 0; p < 2; p++) {
          const ph = ((t * 0.7 + p * 0.5) % 1 + 1) % 1;
          const g = ph * 7;
          ctx.globalAlpha = 0.5 * (1 - ph);
          ctx.lineWidth = 1;
          T.rr(ctx, x - g, y - g, bw + g * 2, bh + g * 2, 2 + g); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  if (capH) {
    ctx.font = T.label(8); ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.amber;
    ctx.fillText('ringed = seeded canary', w - pad, h - 3);
  }
  ctx.restore();
};

// ---------------------------------------------------------------------------
// 2. selection — why the loop picked the component it picked
// ---------------------------------------------------------------------------
A.selection = function (ctx, w, h, t, data) {
  if (bad(w, h)) return;
  const src = (data && data.alternatives) || null;
  if (!src || !src.length) { T.empty(ctx, w, h, 'no candidates'); return; }
  const alts = [];
  for (let i = 0; i < src.length; i++) if (src[i]) alts.push(src[i]);
  if (!alts.length) { T.empty(ctx, w, h, 'no candidates'); return; }
  alts.sort((a, b) => fin(b.gain_per_usd, 0) - fin(a.gain_per_usd, 0));

  const chosen = (data && typeof data.chosen === 'string') ? data.chosen : null;
  let maxG = 0;
  for (let i = 0; i < alts.length; i++) maxG = Math.max(maxG, fin(alts[i].gain_per_usd, 0));

  ctx.save();
  const pad = 6, headH = h >= 130 ? 13 : 0;
  const avail = h - headH - 4;
  const n = alts.length;
  const rowH = clamp(avail / n, 7, 30);
  const fs = rowH >= 18 ? 10 : (rowH >= 12 ? 9 : 8);

  let nameW = clamp(w * 0.26, 34, 112);
  let rightW = clamp(w * 0.22, 0, 92);
  let barX = pad + 8 + nameW;
  if (w - pad - rightW - barX < 24) rightW = 0;
  let barW = w - pad - rightW - barX;
  if (!(barW > 8)) { barW = 0; }

  if (headH) {
    ctx.font = T.label(8); ctx.fillStyle = C.mute;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('gain per $', barX, 9);
  }

  for (let i = 0; i < n; i++) {
    const a = alts[i];
    const y = headH + 2 + rowH * i;
    const cy = y + rowH / 2;
    const gain = fin(a.gain_per_usd, 0);
    const attempts = Math.max(0, Math.round(fin(a.n_attempts, 0)));
    const never = attempts === 0;
    const exhausted = !!a.exhausted;
    const eligible = !!a.eligible && !exhausted;
    const role = typeof a.role === 'string' ? a.role : '?';

    // the one it acted on gets a rule, not a highlight — the bars still have to be comparable.
    if (chosen && role === chosen) {
      ctx.globalAlpha = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.2));
      ctx.fillStyle = C.amber;
      T.rr(ctx, pad, y + 1.5, 2, Math.max(2, rowH - 3), 1); ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.font = T.label(fs, chosen && role === chosen ? 600 : 500);
    ctx.fillStyle = eligible ? C.text : C.mute;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const shown = fit(ctx, role, nameW);
    ctx.fillText(shown, pad + 8, cy);
    if (exhausted) { // retired: attempts spent, no fix. strike it.
      const tw = ctx.measureText(shown).width;
      ctx.strokeStyle = C.mute; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad + 8, T.crisp(cy)); ctx.lineTo(pad + 8 + tw, T.crisp(cy)); ctx.stroke();
    }

    if (barW > 8) {
      const bh = Math.max(3, Math.min(12, rowH - 6));
      const by = cy - bh / 2;
      const len = maxG > 0 ? (gain / maxG) * barW : 0;

      if (never) {
        // never blamed: leave the row almost empty, that is the finding.
        ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(barX, T.crisp(cy)); ctx.lineTo(barX + barW, T.crisp(cy)); ctx.stroke();
      } else if (exhausted) {
        ctx.save();
        T.rr(ctx, barX, by, barW, bh, 2); ctx.clip();
        ctx.globalAlpha = 0.5; ctx.strokeStyle = C.mute; ctx.lineWidth = 1;
        for (let x = barX - bh; x < barX + barW; x += 5) {
          ctx.beginPath(); ctx.moveTo(x, by + bh); ctx.lineTo(x + bh, by); ctx.stroke();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      if (len > 0.5) {
        ctx.fillStyle = eligible ? C.teal : C.mute;
        ctx.globalAlpha = eligible ? 1 : 0.5;
        T.rr(ctx, barX, by, len, bh, 2); ctx.fill();
        ctx.globalAlpha = 1;
        if (rowH >= 12 && barX + len + 34 < barX + barW) {
          ctx.font = T.num(8); ctx.fillStyle = C.dim;
          ctx.fillText(gain.toFixed(1), barX + len + 4, cy);
        }
      }
      if (exhausted && rowH >= 11) {
        ctx.font = T.label(8); ctx.fillStyle = C.mute;
        ctx.fillText(fit(ctx, 'exhausted', barW - 6), barX + 4, cy);
      }
    }

    // fix rate: the dots are the attempts, the filled ones are the fixes.
    if (rightW >= 34) {
      const rx = w - pad;
      const fr = (typeof a.fix_rate === 'number' && isFinite(a.fix_rate)) ? clamp(a.fix_rate, 0, 1) : null;
      ctx.textAlign = 'right'; ctx.font = T.num(8);
      ctx.fillStyle = fr === null ? C.mute : C.dim;
      ctx.fillText(fr === null ? '—' : fr.toFixed(2), rx, cy);
      if (fr !== null && attempts > 0 && rowH >= 11) {
        const dots = Math.min(attempts, 5);
        const hits = clamp(Math.round(fr * attempts), 0, dots);
        for (let d = 0; d < dots; d++) {
          const dx = rx - 26 - d * 6;
          if (dx < barX + barW + 4) break;
          ctx.beginPath(); ctx.arc(dx, cy, 2, 0, TAU);
          ctx.fillStyle = d < hits ? C.green : C.line; ctx.fill();
        }
      }
      ctx.textAlign = 'left';
    }
  }
  ctx.restore();
};

// ---------------------------------------------------------------------------
// 3. blame CI — blame with its confidence interval, against the act/don't-act line
// ---------------------------------------------------------------------------
A.blameCI = function (ctx, w, h, t, data) {
  if (bad(w, h)) return;
  const src = (data && data.standings) || null;
  if (!src || !src.length) { T.empty(ctx, w, h, 'no standings'); return; }
  const thr = fin(data && data.threshold, 0);

  const rows = [];
  for (let i = 0; i < src.length; i++) {
    const s = src[i];
    if (!s) continue;
    const mid = fin(s.blame_s, NaN);
    if (!isFinite(mid)) continue;
    const ci = s.ci || [];
    let lo = fin(ci[0], mid), hi = fin(ci[1], mid);
    if (lo > hi) { const q = lo; lo = hi; hi = q; }
    rows.push({ role: typeof s.role === 'string' ? s.role : '?', n: Math.max(0, Math.round(fin(s.n, 0))), mid, lo, hi });
  }
  if (!rows.length) { T.empty(ctx, w, h, 'no standings'); return; }

  let dLo = thr, dHi = thr;
  for (let i = 0; i < rows.length; i++) {
    dLo = Math.min(dLo, rows[i].lo, rows[i].mid);
    dHi = Math.max(dHi, rows[i].hi, rows[i].mid);
  }
  if (!(dHi - dLo > 1e-9)) { dLo -= 1; dHi += 1; }
  const mgn = (dHi - dLo) * 0.08; dLo -= mgn; dHi += mgn;

  ctx.save();
  const pad = 6, axisH = h >= 120 ? 14 : 0;
  const nameW = clamp(w * 0.24, 30, 96);
  const x0 = pad + nameW + 6, x1 = w - pad - 2;
  const plotW = x1 - x0;
  if (!(plotW > 20)) { ctx.restore(); T.empty(ctx, w, h, 'too small'); return; }
  const X = v => x0 + ((v - dLo) / (dHi - dLo)) * plotW;

  const top = 4, plotH = h - top - axisH;
  if (!(plotH > 8)) { ctx.restore(); T.empty(ctx, w, h, 'too small'); return; }
  const rowH = plotH / rows.length;

  // axis ticks, then the reference — the reference has to sit on top of the grid.
  if (axisH) {
    ctx.font = T.num(8); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    for (let k = 0; k <= 4; k++) {
      const v = dLo + ((dHi - dLo) * k) / 4, x = T.crisp(X(v));
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

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], cy = top + rowH * (i + 0.5);
    const clears = r.lo > thr;          // the rule: act only when the interval clears zero
    const col = clears ? C.teal : C.amber;
    const xl = X(r.lo), xh = X(r.hi), len = xh - xl;

    ctx.font = T.label(rowH >= 22 ? 10 : 9);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = clears ? C.text : C.dim;
    ctx.fillText(fit(ctx, r.role, nameW - 20), pad, cy);
    ctx.font = T.num(8); ctx.fillStyle = C.mute; ctx.textAlign = 'right';
    ctx.fillText('n' + r.n, x0 - 5, cy);

    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(xl, T.crisp(cy)); ctx.lineTo(xh, T.crisp(cy)); ctx.stroke();
    const capH2 = Math.max(3, Math.min(6, rowH * 0.22));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(T.crisp(xl), cy - capH2); ctx.lineTo(T.crisp(xl), cy + capH2);
    ctx.moveTo(T.crisp(xh), cy - capH2); ctx.lineTo(T.crisp(xh), cy + capH2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // shimmer: the interval is an estimate, so it should not sit perfectly still.
    if (len > 2) {
      const seg = Math.max(8, len * 0.18);
      const p = ((t * 0.28 + i * 0.21) % 1 + 1) % 1;
      const sx = xl - seg + p * (len + seg);
      ctx.save();
      ctx.beginPath(); ctx.rect(xl, cy - 4, len, 8); ctx.clip();
      ctx.globalAlpha = 0.25; ctx.strokeStyle = C.white; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx, cy); ctx.lineTo(sx + seg, cy); ctx.stroke();
      ctx.restore();
    }

    const dx = clamp(X(r.mid), x0 - 2, x1 + 2);
    ctx.beginPath(); ctx.arc(dx, cy, 3.5, 0, TAU);
    ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = C.panel; ctx.stroke();

    if (!clears && rowH >= 18 && plotW > 120) {
      ctx.font = T.label(8); ctx.textAlign = 'left'; ctx.fillStyle = C.amber;
      ctx.fillText('crosses', Math.min(xh + 5, x1 - 40), cy - capH2 - 4);
    }
  }
  ctx.restore();
};
})(window.SCR = window.SCR || {});
