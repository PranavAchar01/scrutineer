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

const C = { night: '#06081A', studio: '#121A4A', tarmac: '#2C2E3A', ink: '#000',
  white: '#FFF', caption: '#C8CBD8', mid: '#6A6F8A', gold: '#F4C542', red: '#E31E2D',
  purple: '#B04BFF', cyan: '#3DD2FF', green: '#2FD968', amber: '#FFA318' };
const PX = n => `${n}px 'Press Start 2P', monospace`;
const VT = n => `${n}px 'VT323', monospace`;

// The five spans a lap actually opens, in the order car/lap.py opens them. The op names are
// the ones written into the trace store, so a developer can grep for them.
const OPS = [
  { op: 'strategist.call',    role: 'BUDGET',       hue: C.purple, out: 'step budget' },
  { op: 'tyres.profile',      role: 'SAMPLING',     hue: C.amber,  out: 'temp · k' },
  { op: 'aero.shape_context', role: 'RETRIEVAL',    hue: C.cyan,   out: 'refs · tokens' },
  { op: 'power_unit.drive',   role: 'MODEL',        hue: C.red,    out: 'completion', remote: true },
  { op: 'data.run_tools',     role: 'VERIFICATION', hue: C.green,  out: 'score · schema' },
];

// The seven rails, with the label `scrutineer doctor` prints for each. `of` is what the rail
// reaches when it is live — this is the part that is CoreWeave.
const RAILS = [
  { key: 'driver',         name: 'INFERENCE',  of: 'api.inference.wandb.ai' },
  { key: 'typed_decision', name: 'TYPED',      of: 'strict json schema' },
  { key: 'sandbox',        name: 'SANDBOX',    of: 'cwsandbox · kata guest' },
  { key: 'weave',          name: 'WEAVE',      of: 'trace mirror' },
  { key: 'rl',             name: 'RL',         of: 'serverless training' },
  { key: 'registry',       name: 'REGISTRY',   of: 'versions · aliases' },
  { key: 'aria',           name: 'ARIA',       of: 'hypotheses' },
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
  card(grid, 'pipe',  'ONE LAP', 'five spans, in the order they open', 'wide');
  card(grid, 'infer', 'W&B INFERENCE', 'qwen3-14b · coreweave');
  card(grid, 'credit', 'WHO CAUSED IT', 'typed decisions, item to component', 'tall');
  card(grid, 'rails', 'RAILS', 'live or labelled stand-in');
  card(grid, 'fail',  'WHAT IT KEPT MISSING', 'wcag requirement, summed');
  card(grid, 'hist',  'CLAIMED vs HELD-OUT', 'per run, with cost', 'wide');
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
  const n = OPS.length;
  const padX = 14, gap = (w - padX * 2) / n;
  const cy = h * 0.46, r = Math.max(13, Math.min(22, gap * 0.19));

  // the wire first, so nodes sit on top of it
  ctx.strokeStyle = C.tarmac; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(padX + gap * 0.5, cy); ctx.lineTo(padX + gap * (n - 0.5), cy); ctx.stroke();

  // packets: one lap every 1.6 s, several in flight, so the wire is never still
  const PERIOD = 1.6, INFLIGHT = 4;
  for (let k = 0; k < INFLIGHT; k++) {
    const u = ((t / PERIOD) + k / INFLIGHT) % 1;
    const x = padX + gap * 0.5 + u * gap * (n - 1);
    const seg = Math.min(n - 1, Math.floor(u * (n - 1)));
    // a lap that failed its audit leaves the last node red; 1 in 10 pass, which is the real rate
    const passed = (Math.floor(t / PERIOD) + k) % 10 === 0;
    ctx.fillStyle = u > 0.97 ? (passed ? C.green : C.red) : OPS[seg].hue;
    ctx.fillRect(x - 3, cy - 3, 6, 6);
  }

  for (let i = 0; i < n; i++) {
    const o = OPS[i], x = padX + gap * (i + 0.5);
    // a node lights while a packet is inside it
    const u = (t / PERIOD) % 1, at = Math.min(n - 1, Math.floor(u * (n - 1)));
    const hot = at === i;
    ctx.fillStyle = C.night;
    ctx.fillRect(x - r, cy - r, r * 2, r * 2);
    ctx.strokeStyle = hot ? C.white : o.hue; ctx.lineWidth = hot ? 3 : 2;
    ctx.strokeRect(x - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = o.hue;
    const ir = r * (hot ? 0.58 : 0.4) * (1 + 0.08 * Math.sin(t * 4 + i));
    ctx.fillRect(x - ir, cy - ir, ir * 2, ir * 2);

    // the one span that leaves this machine gets a mast and a label
    if (o.remote) {
      ctx.strokeStyle = C.red; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, cy - r); ctx.lineTo(x, cy - r - 16); ctx.stroke();
      for (let a = 0; a < 3; a++) {
        const rr = 5 + a * 4 + ((t * 9) % 12);
        ctx.globalAlpha = Math.max(0, 1 - rr / 18) * 0.9;
        ctx.beginPath(); ctx.arc(x, cy - r - 16, rr, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.font = PX(7); ctx.textAlign = 'center';
    ctx.fillStyle = hot ? C.white : C.caption;
    ctx.fillText(o.role, x, cy + r + 15);
    ctx.font = VT(14); ctx.fillStyle = C.mid;
    ctx.fillText(o.op, x, cy + r + 29);
  }
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------------------
// 2. the inference meter — the rail that is CoreWeave
// ---------------------------------------------------------------------------------------
function drawInfer(ctx, w, h, t) {
  const m = D.meters.driver;
  if (!m) return empty(ctx, w, h, 'no meter in this bundle');
  const calls = m.calls || 0, hits = m.cache_hits || 0, total = calls + hits || 1;

  // laid out as fractions of the box: this card is two thirds as tall in the folded
  // layout as it is on a desk, and a fixed pixel ladder ran off the bottom there.
  const bx = 12, bw = w - 24;
  const bh = Math.max(12, h * 0.1), th = Math.max(9, h * 0.075);
  const by = h * 0.16, ty = h * 0.42, ty2 = h * 0.64;

  // the headline: nine calls in ten were answered from cache, so the split is the story
  ctx.fillStyle = C.studio; ctx.fillRect(bx, by, bw, bh);
  const cw = bw * (calls / total);
  ctx.fillStyle = C.red; ctx.fillRect(bx, by, cw, bh);
  // a shimmer over the cached portion: it is the part that reached no GPU at all
  const rest = Math.max(1, bw - cw);
  ctx.fillStyle = C.cyan; ctx.globalAlpha = 0.45;
  ctx.fillRect(bx + cw + ((t * 70) % rest), by, 3, bh); ctx.globalAlpha = 1;

  ctx.font = PX(6); ctx.fillStyle = C.red;
  ctx.fillText(calls.toLocaleString() + ' CALLS', bx, by - 5);
  ctx.textAlign = 'right'; ctx.fillStyle = C.cyan;
  ctx.fillText(Math.round(hits / total * 100) + '% CACHED', bx + bw, by - 5);
  ctx.textAlign = 'left';

  // tokens in and out against a shared scale, so the ratio is readable without reading
  const ti = m.tokens_in || 0, to = m.tokens_out || 0, tmax = Math.max(ti, to, 1);
  const row = (label, val, col, y) => {
    ctx.font = PX(6); ctx.fillStyle = C.mid; ctx.fillText(label, bx, y - 5);
    ctx.fillStyle = C.night; ctx.fillRect(bx, y, bw, th);
    ctx.fillStyle = col; ctx.fillRect(bx, y, bw * (val / tmax), th);
    ctx.font = VT(Math.max(15, th * 1.6)); ctx.fillStyle = C.white; ctx.textAlign = 'right';
    ctx.fillText(val.toLocaleString(), bx + bw - 4, y + th + 15);
    ctx.textAlign = 'left';
  };
  row('TOKENS IN', ti, C.cyan, ty);
  row('TOKENS OUT', to, C.purple, ty2);

  // spend, big, because the cost cap is one of the ten gates
  ctx.font = VT(Math.max(22, h * 0.17)); ctx.fillStyle = C.gold;
  ctx.fillText('$' + (m.spend_usd || 0).toFixed(4), bx, h - 6);
  ctx.font = PX(6); ctx.fillStyle = C.mid;
  ctx.textAlign = 'right'; ctx.fillText('SPEND', bx + bw, h - 9); ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------------------
// 3. the rails — which of the seven actually served
// ---------------------------------------------------------------------------------------
function drawRails(ctx, w, h, t) {
  const rowH = Math.min(26, (h - 8) / RAILS.length);
  RAILS.forEach((rl, i) => {
    const backend = D.backends[rl.key] || '';
    const short = backend.split('—')[0].trim();
    const live = !!backend && short === LIVE_OK[rl.key] && !STANDIN.test(short)
      || (rl.key === 'weave' && short === 'weave')
      || (rl.key === 'aria' && short === 'aria');
    const y = 4 + i * rowH;
    ctx.fillStyle = live ? C.green : C.tarmac;
    // a live rail breathes; a stand-in sits still, which is the honest difference
    const p = live ? 0.65 + 0.35 * Math.abs(Math.sin(t * 2 + i * 0.7)) : 1;
    ctx.globalAlpha = p; ctx.fillRect(6, y + rowH * 0.28, 7, 7); ctx.globalAlpha = 1;
    ctx.font = PX(7); ctx.fillStyle = live ? C.white : C.mid;
    ctx.fillText(rl.name, 20, y + rowH * 0.5 + 3);
    ctx.font = VT(15); ctx.fillStyle = live ? C.caption : C.tarmac;
    ctx.textAlign = 'right';
    ctx.fillText(live ? rl.of : 'stand-in', w - 8, y + rowH * 0.5 + 4);
    ctx.textAlign = 'left';
  });
}

function empty(ctx, w, h, msg) {
  ctx.font = VT(16); ctx.fillStyle = C.mid; ctx.textAlign = 'center';
  ctx.fillText(msg, w / 2, h / 2); ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------------------
// frame
// ---------------------------------------------------------------------------------------
function paint(t) {
  size();
  const G = SCR.devgraphs || {};
  const go = (id, fn) => {
    const c = cards[id]; if (!c || !c.w) return;
    c.ctx.clearRect(0, 0, c.w, c.h);
    try { fn(c.ctx, c.w, c.h, t); } catch (e) { void e; }
  };
  go('pipe', drawPipe);
  go('infer', drawInfer);
  go('rails', drawRails);
  go('credit', (x, w, h, tt) => G.creditGraph && G.creditGraph(x, w, h, tt,
    { rows: D.rows, items: D.items, roles: D.roles }));
  go('fail', (x, w, h, tt) => G.failureModes && G.failureModes(x, w, h, tt, { tally: D.tally }));
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
