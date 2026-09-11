// ============================================================================
// SCR.devrun — the three panels about one run of the loop: what the agent built,
// which rules kept firing across runs, and the change it actually wrote.
//
// Same contract as SCR.devpanels: pure draw, no state between frames, colour and
// type from SCR.devtheme only. All three are still — none of them shows
// throughput, liveness, "you are here" or a flag, which are the only four things
// devtheme lets move. `t` is taken and ignored so the caller's signature holds.
// ============================================================================
(function (SCR) {
'use strict';
const R = SCR.devrun = {};

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const num = (v, d) => { const n = +v; return isFinite(n) ? n : d; };

// Truncation measures rather than assumes: 'checkout' and 'landmark-one-main' are
// the same string class to a guesser and very different to the renderer.
function fit (ctx, s, max) {
  if (!(max > 0)) return '';
  if (ctx.measureText(s).width <= max) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(s.slice(0, mid) + '…').width <= max) lo = mid; else hi = mid - 1;
  }
  return lo > 0 ? s.slice(0, lo) + '…' : '';
}

// ---------------------------------------------------------------------------------------
// 1. interfaces — the ten pages this run built, and which one survived
//
// Pass/fail is the tile's whole character rather than a badge on it: at 5x2 the eye
// counts borders, not glyphs, and the finding is "one green out of ten". The bar is
// normalised to the worst weighted score in the set so the tiles rank each other.
// ---------------------------------------------------------------------------------------
R.interfaces = function (ctx, w, h, t, data) {
  const T = SCR.devtheme;
  if (!T || !(w > 0) || !(h > 0)) return;
  const C = T.C;

  const src = data && data.pages;
  const pages = [];
  if (src && src.length) {
    for (let i = 0; i < src.length; i++) {
      const p = src[i]; if (!p) continue;
      pages.push({
        family: String(p.family || p.id || '?'),
        passed: !!p.passed,
        weighted: Math.max(0, num(p.weighted, 0)),
      });
    }
  }
  if (!pages.length) { T.empty(ctx, w, h, 'no interfaces built'); return; }

  ctx.save();

  // one decision from the box, taken once — every font call downstream reads it.
  const small = h < 190 || w < 300;
  const pad = small ? 6 : 10, gap = small ? 4 : 6;
  const pw = w - pad * 2, ph = h - pad * 2;
  if (!(pw > 40) || !(ph > 20)) { ctx.restore(); T.empty(ctx, w, h, 'no room'); return; }

  let worst = 0;
  for (let i = 0; i < pages.length; i++) if (pages[i].weighted > worst) worst = pages[i].weighted;

  // 5x2 is the shape this data wants; narrow boxes reflow, and a set bigger than ten
  // widens the grid rather than shrinking rows below anything readable.
  let cols = w >= 620 ? 5 : w >= 440 ? 4 : w >= 320 ? 3 : 2;
  const minTile = small ? 20 : 26;
  const maxRows = Math.max(1, Math.floor((ph + gap) / (minTile + gap)));
  cols = Math.max(cols, Math.ceil(pages.length / maxRows));
  const tw = (pw - gap * (cols - 1)) / cols;
  if (!(tw > 8)) { ctx.restore(); T.empty(ctx, w, h, 'no room'); return; }

  const rows = Math.max(1, Math.ceil(pages.length / cols));
  const th = (ph - gap * (rows - 1)) / rows;
  if (!(th > 8)) { ctx.restore(); T.empty(ctx, w, h, 'no room'); return; }

  const barH = clamp(th * 0.14, 2, 4);

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const cx = pad + (i % cols) * (tw + gap);
    const cy = pad + Math.floor(i / cols) * (th + gap);
    const tone = p.passed ? C.green : C.rose;
    const rad = Math.min(3, tw / 2, th / 2);

    ctx.globalAlpha = p.passed ? 0.07 : 0.045;
    ctx.fillStyle = p.passed ? C.green : C.panel;
    T.rr(ctx, cx, cy, tw, th, rad); ctx.fill();

    ctx.globalAlpha = p.passed ? 0.95 : 0.55;
    ctx.strokeStyle = tone; ctx.lineWidth = 1;
    T.rr(ctx, T.crisp(cx), T.crisp(cy), tw, th, rad); ctx.stroke();

    // the worst offenders read as a longer red floor to the tile, no reading required.
    if (!p.passed && worst > 0 && th > 14) {
      const frac = clamp(p.weighted / worst, 0, 1);
      const bw = (tw - 2) * frac;
      if (bw > 0.5) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = C.rose;
        ctx.fillRect(cx + 1, cy + th - 1 - barH, bw, barH);
      }
    }

    const inner = tw - (small ? 8 : 10);
    if (!(inner > 6)) continue;
    const tx = cx + (small ? 4 : 5);

    // the score sits right, the brief sits left — the pair is the whole tile.
    let right = 0;
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'middle';
    if (p.passed) {
      const r = clamp(th * 0.1, 2, 3.5);
      ctx.fillStyle = C.green;
      ctx.beginPath(); ctx.arc(cx + tw - (small ? 6 : 8), cy + th / 2, r, 0, TAU); ctx.fill();
      right = (small ? 12 : 16);
    } else if (th > 14 && tw > 44) {
      ctx.font = T.font('value', small);
      const s = String(Math.round(p.weighted));
      ctx.fillStyle = C.rose; ctx.textAlign = 'right';
      ctx.fillText(s, cx + tw - (small ? 4 : 6), cy + th / 2 - (th > 26 ? 1 : 0));
      right = ctx.measureText(s).width + (small ? 8 : 10);
    }

    ctx.font = T.font('label', small);
    ctx.fillStyle = p.passed ? C.text : C.dim;
    ctx.textAlign = 'left';
    ctx.fillText(fit(ctx, p.family, inner - right), tx, cy + th / 2 - (th > 26 ? 1 : 0));
  }

  ctx.restore();
};

// ---------------------------------------------------------------------------------------
// 2. ruleHeat — which WCAG rules fired, run by run
//
// The rows are flat and that is the point: the loop is not clearing contrast, it is
// re-earning it. Nothing here interpolates or animates, because a moving cell would
// invent the trend the data refuses to show. A rule that reaches zero and stays there
// turns green — the only way elimination is visible in a matrix of sameness.
// ---------------------------------------------------------------------------------------
R.ruleHeat = function (ctx, w, h, t, data) {
  const T = SCR.devtheme;
  if (!T || !(w > 0) || !(h > 0)) return;
  const C = T.C;

  const src = data && data.rules;
  const rules = [];
  if (src && src.length) {
    for (let i = 0; i < src.length; i++) {
      const r = src[i]; if (!r) continue;
      const pr = r.perRun && r.perRun.length ? r.perRun : [];
      const vals = [];
      let total = 0;
      for (let k = 0; k < pr.length; k++) {
        const v = Math.max(0, num(pr[k], 0));
        vals.push(v); total += v;
      }
      if (!vals.length) continue;
      rules.push({ id: String(r.id || '?'), vals: vals, total: total });
    }
  }
  if (!rules.length) { T.empty(ctx, w, h, 'no rule history'); return; }

  let runs = Math.round(num(data && data.runs, 0));
  for (let i = 0; i < rules.length; i++) runs = Math.max(runs, rules[i].vals.length);
  runs = clamp(runs, 1, 200);

  rules.sort((a, b) => b.total - a.total);
  const shown = rules.slice(0, 8);

  ctx.save();

  // one decision from the box, taken once — every font call downstream reads it.
  const small = h < 190 || w < 300;
  const padT = small ? 8 : 12, padB = small ? 14 : 18;
  const padR = small ? 6 : 10, padL = small ? 6 : 10;
  const labelW = clamp(w * 0.34, 0, small ? 78 : 118);
  const gx = padL + labelW + (small ? 4 : 6);
  const gw = w - padR - gx, gh = h - padT - padB;
  if (!(gw > 24) || !(gh > 12)) { ctx.restore(); T.empty(ctx, w, h, 'no room'); return; }

  const cw = gw / runs;
  const rh = gh / shown.length;
  const at = Math.round(num(data && data.at, -1));

  let peak = 0;
  for (let i = 0; i < shown.length; i++) {
    for (let k = 0; k < shown[i].vals.length; k++) peak = Math.max(peak, shown[i].vals[k]);
  }

  // the column you are standing in, drawn under the cells so it never dims them.
  if (at >= 0 && at < runs) {
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = C.line;
    ctx.fillRect(gx + at * cw, padT - (small ? 3 : 4), cw, gh + (small ? 5 : 7));
  }

  const inset = cw > 7 && rh > 7 ? 1 : 0;
  for (let i = 0; i < shown.length; i++) {
    const r = shown[i];
    const y = padT + i * rh;

    // "eliminated" needs history, not a single zero: it only counts once the rule
    // has fired at least once and every later run is clean.
    let lastHit = -1;
    for (let k = 0; k < r.vals.length; k++) if (r.vals[k] > 0) lastHit = k;

    for (let k = 0; k < runs; k++) {
      const v = k < r.vals.length ? r.vals[k] : 0;
      const x = gx + k * cw;
      if (v > 0) {
        ctx.globalAlpha = peak > 0 ? clamp(0.16 + 0.74 * (v / peak), 0, 1) : 0.5;
        ctx.fillStyle = C.rose;
      } else if (lastHit >= 0 && k > lastHit && k < r.vals.length) {
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = C.green;
      } else {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = C.grid;
      }
      ctx.fillRect(x + inset, y + inset, Math.max(0.5, cw - inset * 2), Math.max(0.5, rh - inset * 2));
    }
  }

  // the current column keeps a hairline on top so it survives a wall of full cells.
  if (at >= 0 && at < runs && cw > 2) {
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.strokeRect(T.crisp(gx + at * cw), T.crisp(padT - (small ? 3 : 4)),
      Math.max(1, cw), gh + (small ? 5 : 7));
  }

  // rule ids left, truncated to the gutter they were given.
  ctx.globalAlpha = 1;
  ctx.font = T.font('label', small);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  if (rh >= (small ? 9 : 11)) {
    for (let i = 0; i < shown.length; i++) {
      ctx.fillStyle = shown[i].total > 0 ? C.dim : C.mute;
      ctx.fillText(fit(ctx, shown[i].id, labelW), padL, padT + i * rh + rh / 2);
    }
  }

  // run numbers along the bottom, thinned until they stop colliding.
  ctx.font = T.font('axis', small);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const stride = Math.max(1, Math.ceil((small ? 16 : 20) / Math.max(cw, 1)));
  for (let k = 0; k < runs; k += stride) {
    ctx.globalAlpha = k === at ? 1 : 0.8;
    ctx.fillStyle = k === at ? C.text : C.mute;
    ctx.fillText(String(k), gx + k * cw + cw / 2, padT + gh + (small ? 3 : 5));
  }

  ctx.restore();
};

// ---------------------------------------------------------------------------------------
// 3. diffView — the change the loop wrote this run
//
// Three runs in ten wrote nothing at all, so the empty case is a stated refusal rather
// than a blank card: a reader who sees nothing assumes the panel is broken. The body is
// set in the mono axis size because a diff that does not column-align is not a diff.
// ---------------------------------------------------------------------------------------
R.diffView = function (ctx, w, h, t, data) {
  const T = SCR.devtheme;
  if (!T || !(w > 0) || !(h > 0)) return;
  const C = T.C;

  const raw = data && typeof data.diff === 'string' ? data.diff : '';
  if (!raw) { T.empty(ctx, w, h, 'no change written'); return; }

  const lines = raw.split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (!lines.length) { T.empty(ctx, w, h, 'no change written'); return; }

  let add = 0, del = 0;
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    if (s.charAt(0) === '+' && s.slice(0, 3) !== '+++') add++;
    else if (s.charAt(0) === '-' && s.slice(0, 3) !== '---') del++;
  }

  ctx.save();

  // one decision from the box, taken once — every font call downstream reads it.
  const small = h < 190 || w < 300;
  const padL = small ? 8 : 12, padR = small ? 6 : 10;
  const padT = small ? 6 : 9, padB = small ? 4 : 6;
  const availW = w - padL - padR;
  if (!(availW > 24) || !(h - padT - padB > 12)) { ctx.restore(); T.empty(ctx, w, h, 'no room'); return; }

  // ---- summary: the two counts, then which part of the harness moved ----
  ctx.globalAlpha = 1;
  ctx.font = T.font('value', small);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const headH = (small ? 12 : 15);
  let hx = padL;
  const plus = '+' + add, minus = '−' + del;
  ctx.fillStyle = C.green; ctx.fillText(plus, hx, padT);
  hx += ctx.measureText(plus).width + (small ? 6 : 8);
  ctx.fillStyle = C.rose; ctx.fillText(minus, hx, padT);
  hx += ctx.measureText(minus).width + (small ? 7 : 10);

  const part = data && data.part ? String(data.part) : '';
  if (part && hx < padL + availW) {
    ctx.font = T.font('tag', small);
    ctx.fillStyle = C.mute;
    ctx.fillText(fit(ctx, part, padL + availW - hx), hx, padT + (small ? 2 : 3));
  }

  // ---- body ----
  const bodyY = padT + headH;
  const bodyH = h - bodyY - padB;
  if (!(bodyH > 6)) { ctx.restore(); return; }

  ctx.font = T.font('axis', small);
  const adv = ctx.measureText('0').width;          // measured, never assumed
  const lh = small ? 9.5 : 11;
  const rows = Math.max(0, Math.floor(bodyH / lh));
  if (!rows || !(adv > 0)) { ctx.restore(); return; }

  const more = lines.length - rows;
  const shown = more > 0 ? rows - 1 : rows;        // the tally costs one row
  const textW = availW - adv;
  const cap = Math.max(1, Math.floor(textW / adv));

  ctx.save();
  ctx.beginPath(); ctx.rect(padL, bodyY, availW, bodyH); ctx.clip();
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';

  for (let i = 0; i < shown && i < lines.length; i++) {
    const s = lines[i];
    const c0 = s.charAt(0);
    const head = s.slice(0, 3);
    let tone = C.dim, alpha = 0.9;
    if (s.slice(0, 2) === '@@') { tone = C.violet; alpha = 1; }
    else if (head === '---' || head === '+++') { tone = C.mute; alpha = 0.9; }
    else if (c0 === '+') { tone = C.green; alpha = 1; }
    else if (c0 === '-') { tone = C.rose; alpha = 1; }

    // sign and body are drawn on their own columns so the gutter stays a gutter
    // even when a leading space is eaten by the string.
    const sign = (c0 === '+' || c0 === '-') && head !== '+++' && head !== '---' ? c0 : '';
    const rest = sign ? s.slice(1) : s;
    const y = bodyY + i * lh;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = tone;
    if (sign) ctx.fillText(sign, padL, y);
    const body = rest.length > cap ? rest.slice(0, Math.max(0, cap - 1)) + '…' : rest;
    if (body) ctx.fillText(body, padL + adv, y);
  }

  if (more > 0 && shown >= 0) {
    ctx.globalAlpha = 1;
    ctx.font = T.font('tag', small);
    ctx.fillStyle = C.mute;
    ctx.fillText('+' + more + ' more lines', padL, bodyY + shown * lh);
  }

  ctx.restore();
  ctx.restore();
};

})(window.SCR = window.SCR || {});
