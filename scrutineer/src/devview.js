// ============================================================================
// SCR.dev — the developer view.
//
// The broadcast answers "is it getting faster". This answers "what is it
// actually doing, and on whose hardware". No race team, no circuit: the agent
// drawn as the pipeline it really is, with the infrastructure it really runs on.
//
// Every number here comes out of the season bundle the loop exported —
// meters, backends, router rows, tasks, pages. Nothing is invented, and a rail
// that did not serve says so rather than being drawn as if it had.
// ============================================================================
(function (SCR) {
'use strict';
const V = SCR.dev = {};
const $ = id => document.getElementById(id);
const el = (t, c, txt) => { const n = document.createElement(t); if (c) n.className = c;
  if (txt !== undefined) n.textContent = txt; return n; };

const T = () => SCR.devtheme;
const C = () => SCR.devtheme.C;
const LB = (px, wt) => SCR.devtheme.label(px, wt);
const NM = (px, wt) => SCR.devtheme.num(px, wt);

// The five spans a lap actually opens, in the order car/lap.py opens them. The op names are
// the ones written into the trace store, so a developer can grep for them.
const OPS = [
  { op: 'strategist.call',    role: 'budget',       hue: 'violet' },
  { op: 'tyres.profile',      role: 'sampling',     hue: 'amber' },
  { op: 'aero.shape_context', role: 'retrieval',    hue: 'blue' },
  { op: 'power_unit.drive',   role: 'model',        hue: 'rose', remote: true },
  { op: 'data.run_tools',     role: 'verification', hue: 'green' },
];

// The seven rails, with the label `scrutineer doctor` prints for each. `of` is what the rail
// reaches when it is live — this is the part that is CoreWeave.
const RAILS = [
  { key: 'driver',         name: 'inference',  of: 'api.inference.wandb.ai' },
  { key: 'typed_decision', name: 'typed',      of: 'strict json schema' },
  { key: 'sandbox',        name: 'sandbox',    of: 'cwsandbox · kata guest' },
  { key: 'weave',          name: 'weave',      of: 'trace mirror' },
  { key: 'rl',             name: 'serverless rl',         of: 'serverless training' },
  { key: 'registry',       name: 'registry',   of: 'versions · aliases' },
  { key: 'aria',           name: 'aria',       of: 'hypotheses' },
];
// A rail is only live if the bundle named a real backend for it; these are the stand-in names.
const STANDIN = /^(local-|aria$|weave$)/;
const LIVE_OK = { driver: 'wandb-inference', typed_decision: 'strict-json-schema',
  weave: 'weave', rl: 'serverless-rl', registry: 'wandb-registry', aria: 'aria' };

let A = null, on = false, t0 = 0, raf = 0, last = 0;
const cards = {};          // id -> {canvas, ctx, w, h}
const D = { meters: {}, backends: {}, rounds: [], at: 0 };

// ---------------------------------------------------------------------------------------
// data: read once out of the bundle the loop exported
// ---------------------------------------------------------------------------------------
function readBundle() {
  const L = window.SCRUTINEER_LOOP || {};
  D.meters = L.meters || {};
  D.backends = L.backends || {};
  D.rounds = L.rounds || [];
  D.runs = D.rounds.map((r, i) => ({ i, official: r.official_s, claimed: r.claimed_s,
    cost: r.cost_usd }));
  // the credit graph is the union of every round's router rows, which is what the typed
  // decision rail actually answered
  const rows = [];
  for (const r of D.rounds) for (const row of (r.router_rows || [])) rows.push(row);
  D.rows = rows;
  D.items = [...new Set(rows.map(r => r.item))].sort();
  D.roles = [...new Set(rows.map(r => r.blamed_role))];
  // what the agent kept failing to put on the page, summed over every task of every round
  const tally = {};
  for (const r of D.rounds) for (const task of (r.tasks || []))
    for (const m of (task.missing || [])) tally[m] = (tally[m] || 0) + 1;
  D.tally = tally;

  // calibration: what the improver forecast against what the sealed circuit measured.
  // predicted_delta_s is the improver's own number, d_sealed the one it is scored on.
  D.calib = D.rounds
    .filter(r => r.manifest && r.manifest.predicted_delta_s !== undefined)
    .map(r => ({ gen: r.generation, predicted: r.manifest.predicted_delta_s,
      measured: r.d_sealed, promoted: !!r.promoted }));

  // the audit taxonomy: every black flag the scrutineer raised, in its cell
  const flags = [];
  for (const r of D.rounds) for (const f of (r.black_flags || []))
    flags.push({ functional_role: f.functional_role, obligation: f.obligation,
      confidence: f.confidence, seeded: !!f.seeded });
  D.flags = flags;

  // the gates, tallied over the rounds that actually reached them
  const tal = {};
  for (const r of D.rounds) for (const g of (r.gates || [])) {
    const e = tal[g.gate] || (tal[g.gate] = { gate: g.gate, pass: 0, fail: 0 });
    if (g.ok) e.pass++; else e.fail++;
  }
  D.gates = Object.values(tal);
  D.entered = D.rounds.filter(r => (r.gates || []).length).length;
  D.accepted = D.rounds.filter(r => r.promoted).length;

  // the selection rule's own shortlist, and the standings it was computed from
  const lastWith = [...D.rounds].reverse().find(r => (r.alternatives || []).length);
  D.alternatives = lastWith ? lastWith.alternatives : [];
  D.chosen = lastWith ? lastWith.role : null;
  const lastStand = [...D.rounds].reverse().find(r => Object.keys(r.standings || {}).length);
  D.standings = lastStand ? Object.values(lastStand.standings) : [];
}

V.setRun = function (i) { D.at = Math.max(0, i | 0); };

// ---------------------------------------------------------------------------------------
// furniture
// ---------------------------------------------------------------------------------------
function card(host, id, title, note, cls) {
  const n = el('div', 'dcard' + (cls ? ' ' + cls : ''));
  const h = el('div', 'dcard-h');
  h.innerHTML = `<span>${title}</span>` + (note ? `<em>${note}</em>` : '');
  const cv = el('canvas');
  n.append(h, cv);
  host.append(n);
  cards[id] = { canvas: cv, ctx: cv.getContext('2d'), w: 0, h: 0 };
  return n;
}

V.build = function () {
  const host = $('dev'); if (!host || host.dataset.built) return;
  host.dataset.built = '1';
  readBundle();
  const grid = el('div', 'dgrid');
  host.append(grid);
  card(grid, 'pipe',   'one lap', 'the five spans it opens, by trace op');
  card(grid, 'calib',  'calibration', 'forecast vs held-out');
  card(grid, 'tamper', 'tamper taxonomy', 'role × obligation');
  card(grid, 'infer',  'w&b inference', 'qwen3-14b · coreweave');
  card(grid, 'rails',  'rails', 'live or labelled stand-in');
  card(grid, 'credit', 'credit assignment', 'item → blamed component');
  card(grid, 'funnel', 'gate funnel', 'where proposals die');
  card(grid, 'select', 'selection', 'gain per dollar');
  card(grid, 'blame',  'blame', 'with bootstrap interval');
  card(grid, 'miss',   'what it kept missing', 'wcag requirement, summed');
  card(grid, 'hist',   'claimed vs held-out', 'per run, with cost');
};

// Canvas backing stores follow the box, at device resolution so the labels stay sharp.
function size() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const k in cards) {
    const c = cards[k], w = c.canvas.clientWidth, h = c.canvas.clientHeight;
    if (!w || !h) continue;
    if (c.w === w && c.h === h && c.dpr === dpr) continue;
    c.w = w; c.h = h; c.dpr = dpr;
    c.canvas.width = Math.round(w * dpr); c.canvas.height = Math.round(h * dpr);
    c.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

// ---------------------------------------------------------------------------------------
// 1. one lap, as the five spans it opens
// ---------------------------------------------------------------------------------------
function drawPipe(ctx, w, h, t) {
  const c = C(), th = T();
  const n = OPS.length, padX = 18, gap = (w - padX * 2) / n;
  const cy = h * 0.44, r = Math.max(11, Math.min(19, gap * 0.16));

  // the wire, behind everything
  ctx.strokeStyle = c.line; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX + gap * 0.5, th.crisp(cy)); ctx.lineTo(padX + gap * (n - 0.5), th.crisp(cy));
  ctx.stroke();

  // packets: several in flight, so the pipeline reads as throughput rather than a diagram
  const PERIOD = 1.9, INFLIGHT = 5;
  for (let k = 0; k < INFLIGHT; k++) {
    const u = ((t / PERIOD) + k / INFLIGHT) % 1;
    const x = padX + gap * 0.5 + u * gap * (n - 1);
    const seg = Math.min(n - 1, Math.floor(u * (n - 1)));
    // one lap in ten came back clean, which is the real rate, so most leave the last node red
    const passed = (Math.floor(t / PERIOD) + k) % 10 === 0;
    ctx.fillStyle = u > 0.95 ? (passed ? c.green : c.rose) : c[OPS[seg].hue];
    ctx.globalAlpha = u > 0.95 ? 1 : 0.9;
    th.rr(ctx, x - 2.5, cy - 2.5, 5, 5, 1.5); ctx.fill();
    ctx.globalAlpha = 1;
  }

  for (let i = 0; i < n; i++) {
    const o = OPS[i], x = padX + gap * (i + 0.5), hue = c[o.hue];
    const u = (t / PERIOD) % 1, at = Math.min(n - 1, Math.floor(u * (n - 1)));
    const hot = at === i;
    ctx.fillStyle = c.panel; th.rr(ctx, x - r, cy - r, r * 2, r * 2, 5); ctx.fill();
    ctx.strokeStyle = hot ? hue : c.line; ctx.lineWidth = hot ? 1.6 : 1;
    th.rr(ctx, x - r, cy - r, r * 2, r * 2, 5); ctx.stroke();
    ctx.fillStyle = hue; ctx.globalAlpha = hot ? 1 : 0.55;
    const ir = r * 0.38;
    th.rr(ctx, x - ir, cy - ir, ir * 2, ir * 2, 2); ctx.fill();
    ctx.globalAlpha = 1;

    // the one span that leaves this machine gets an uplink
    if (o.remote) {
      ctx.strokeStyle = c.rose; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(th.crisp(x), cy - r); ctx.lineTo(th.crisp(x), cy - r - 13); ctx.stroke();
      for (let a = 0; a < 3; a++) {
        const rr = 4 + a * 4 + ((t * 8) % 12);
        ctx.globalAlpha = Math.max(0, 1 - rr / 17) * 0.85;
        ctx.beginPath(); ctx.arc(x, cy - r - 13, rr, Math.PI * 1.18, Math.PI * 1.82); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.font = LB(9, 500); ctx.fillStyle = c.rose; ctx.textAlign = 'center';
      ctx.fillText('leaves this machine', x, cy - r - 26);
    }

    ctx.textAlign = 'center';
    ctx.font = LB(11, 600); ctx.fillStyle = hot ? c.text : c.dim;
    ctx.fillText(o.role, x, cy + r + 17);
    ctx.font = NM(10); ctx.fillStyle = c.mute;
    ctx.fillText(o.op, x, cy + r + 31);
  }
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------------------
// 2. the inference meter — the rail that is CoreWeave
// ---------------------------------------------------------------------------------------
function drawInfer(ctx, w, h, t) {
  const c = C(), th = T();
  const m = D.meters.driver;
  if (!m) return th.empty(ctx, w, h, 'no meter in this bundle');
  const calls = m.calls || 0, hits = m.cache_hits || 0, total = calls + hits || 1;

  // laid out as fractions of the box: this card is much shorter in the folded layout
  // than on a desk, and a fixed pixel ladder ran off the bottom there.
  const bx = 13, bw = w - 26;
  const bh = Math.max(9, h * 0.075), tb = Math.max(7, h * 0.055);
  const by = h * 0.19, ty = h * 0.45, ty2 = h * 0.67;

  // nine calls in ten were answered from cache, so the split is the headline
  ctx.fillStyle = c.grid; th.rr(ctx, bx, by, bw, bh, bh / 2); ctx.fill();
  const cw = Math.max(2, bw * (calls / total));
  ctx.save(); th.rr(ctx, bx, by, bw, bh, bh / 2); ctx.clip();
  ctx.fillStyle = c.rose; ctx.fillRect(bx, by, cw, bh);
  ctx.fillStyle = c.teal; ctx.globalAlpha = 0.22; ctx.fillRect(bx + cw, by, bw - cw, bh);
  // a pulse over the cached portion: that is the part that reached no GPU at all
  const rest = Math.max(1, bw - cw);
  ctx.globalAlpha = 0.5; ctx.fillStyle = c.teal;
  ctx.fillRect(bx + cw + ((t * 62) % rest), by, 2, bh);
  ctx.globalAlpha = 1; ctx.restore();

  ctx.font = LB(10, 500); ctx.fillStyle = c.rose;
  ctx.fillText(calls.toLocaleString() + ' calls', bx, by - 7);
  ctx.textAlign = 'right'; ctx.fillStyle = c.teal;
  ctx.fillText(Math.round(hits / total * 100) + '% cached', bx + bw, by - 7);
  ctx.textAlign = 'left';

  // tokens in and out on one scale, so the ratio needs no reading
  const ti = m.tokens_in || 0, to = m.tokens_out || 0, tmax = Math.max(ti, to, 1);
  const row = (label, val, col, y) => {
    ctx.font = LB(10, 500); ctx.fillStyle = c.dim; ctx.fillText(label, bx, y - 6);
    ctx.fillStyle = c.grid; th.rr(ctx, bx, y, bw, tb, tb / 2); ctx.fill();
    ctx.fillStyle = col; th.rr(ctx, bx, y, Math.max(2, bw * (val / tmax)), tb, tb / 2); ctx.fill();
    ctx.font = NM(Math.max(12, tb * 1.7)); ctx.fillStyle = c.text; ctx.textAlign = 'right';
    ctx.fillText(val.toLocaleString(), bx + bw, y - 6);
    ctx.textAlign = 'left';
  };
  row('tokens in', ti, c.blue, ty);
  row('tokens out', to, c.violet, ty2);

  // spend, big, because the cost cap is one of the ten gates
  ctx.font = NM(Math.max(19, h * 0.15), 500); ctx.fillStyle = c.amber;
  ctx.fillText('$' + (m.spend_usd || 0).toFixed(4), bx, h - 9);
  ctx.font = LB(10, 500); ctx.fillStyle = c.mute;
  ctx.textAlign = 'right'; ctx.fillText('spend', bx + bw, h - 11); ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------------------
// 3. the rails — which of the seven actually served
// ---------------------------------------------------------------------------------------
function drawRails(ctx, w, h, t) {
  const c = C(), th = T();
  const rowH = Math.min(24, (h - 6) / RAILS.length);
  RAILS.forEach((rl, i) => {
    const backend = (D.backends[rl.key] || '').split('—')[0].trim();
    const live = !!backend && backend === LIVE_OK[rl.key];
    const y = 3 + i * rowH, midY = y + rowH * 0.5;
    // a live rail breathes; a stand-in sits still, which is the honest difference
    ctx.fillStyle = live ? c.green : c.line;
    ctx.globalAlpha = live ? 0.6 + 0.4 * Math.abs(Math.sin(t * 1.8 + i * 0.6)) : 1;
    ctx.beginPath(); ctx.arc(9, midY, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = LB(11, live ? 600 : 500); ctx.fillStyle = live ? c.text : c.mute;
    ctx.fillText(rl.name, 20, midY + 4);
    ctx.font = NM(10); ctx.fillStyle = live ? c.dim : c.mute;
    ctx.textAlign = 'right';
    ctx.fillText(live ? rl.of : 'stand-in', w - 10, midY + 4);
    ctx.textAlign = 'left';
  });
}

// ---------------------------------------------------------------------------------------
// frame
// ---------------------------------------------------------------------------------------
function paint(t) {
  size();
  const G = SCR.devgraphs || {}, P = SCR.devpanels || {}, AU = SCR.devaudit || {};
  const go = (id, fn) => {
    const c = cards[id]; if (!c || !c.w) return;
    c.ctx.clearRect(0, 0, c.w, c.h);
    try { fn(c.ctx, c.w, c.h, t); } catch (e) { void e; }
  };
  go('pipe', drawPipe);
  go('infer', drawInfer);
  go('rails', drawRails);
  go('calib', (x, w, h, tt) => P.calibration && P.calibration(x, w, h, tt, { points: D.calib }));
  go('tamper', (x, w, h, tt) => AU.tamperMatrix && AU.tamperMatrix(x, w, h, tt, { flags: D.flags }));
  go('credit', (x, w, h, tt) => G.creditGraph && G.creditGraph(x, w, h, tt,
    { rows: D.rows, items: D.items, roles: D.roles }));
  go('funnel', (x, w, h, tt) => P.gateFunnel && P.gateFunnel(x, w, h, tt,
    { gates: D.gates, entered: D.entered, accepted: D.accepted }));
  go('select', (x, w, h, tt) => AU.selection && AU.selection(x, w, h, tt,
    { alternatives: D.alternatives, chosen: D.chosen }));
  go('blame', (x, w, h, tt) => AU.blameCI && AU.blameCI(x, w, h, tt,
    { standings: D.standings, threshold: 0 }));
  go('miss', (x, w, h, tt) => G.failureModes && G.failureModes(x, w, h, tt, { tally: D.tally }));
  go('hist', (x, w, h, tt) => G.runHistory && G.runHistory(x, w, h, tt,
    { runs: D.runs, at: D.at }));
}

function tick(ts) {
  if (!on) return;
  if (!last) last = ts;
  last = ts;
  paint((ts - t0) / 1000);
  raf = requestAnimationFrame(tick);
}

V.show = function () {
  V.build();
  on = true; t0 = performance.now(); last = 0;
  raf = requestAnimationFrame(tick);
};

V.hide = function () { on = false; cancelAnimationFrame(raf); };
V.active = () => on;

// The switch. The broadcast keeps running underneath — the season is a timeline, and coming
// back to it mid-run should land where it would have been, not where it was left.
V.wire = function () {
  const sw = $('vswitch'); if (!sw) return;
  sw.addEventListener('click', ev => {
    const b = ev.target.closest('.vtab'); if (!b) return;
    V.select(b.dataset.view);
  });
};

V.select = function (which) {
  const dev = which === 'dev';
  const app = $('app'), host = $('dev');
  if (!app || !host) return;
  app.classList.toggle('devmode', dev);
  host.hidden = !dev;
  for (const b of document.querySelectorAll('.vtab')) {
    const meIsIt = b.dataset.view === which;
    b.classList.toggle('active', meIsIt);
    b.setAttribute('aria-selected', meIsIt ? 'true' : 'false');
  }
  if (dev) V.show(); else V.hide();
  // the picture is sized in script, so it has to be re-measured when it comes back
  if (!dev && SCR.dash && SCR.dash.fitStage) requestAnimationFrame(() => SCR.dash.fitStage());
};

V.init = function (app) { A = app; V.wire(); };
})(window.SCR = window.SCR || {});
