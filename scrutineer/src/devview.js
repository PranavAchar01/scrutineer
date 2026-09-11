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
const FN = (name, small) => SCR.devtheme.font(name, small);

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

  // blame and selection were the same question asked twice — what did each component cost,
  // and which one is worth changing — so they share one row per component now.
  const by = {};
  for (const st_ of D.standings) by[st_.role] = { ...st_ };
  for (const a of D.alternatives) by[a.role] = { ...(by[a.role] || { role: a.role }), ...a };
  D.roleRows = Object.values(by);

  // every WCAG rule the audit fired, weighted, per run — the broadcast's own heatmap
  const W = { critical: 10, serious: 5, moderate: 2, minor: 1 };
  const byRule = {};
  D.rounds.forEach((rd, i) => {
    for (const pg of (rd.pages || [])) for (const v of (pg.rules || [])) {
      const row = byRule[v.id] || (byRule[v.id] = new Array(D.rounds.length).fill(0));
      row[i] += (W[v.impact] || 1) * (v.n || 1);
    }
  });
  D.ruleRows = Object.entries(byRule).map(([id, perRun]) => ({ id, perRun }));
}

V.setRun = function (i) {
  D.at = Math.max(0, Math.min(D.rounds.length - 1, i | 0));
  pushStrip();
};

V.setPhase = function (name, verdict, tone) {
  D.phase = name; D.verdict = verdict; D.verdictTone = tone;
  pushStrip();
};

// One scalar set, shared by the strip and read from the same round every panel uses.
function pushStrip() {
  if (!V.setRunState || !D.rounds.length) return;
  const r = D.rounds[D.at] || {}, prev = D.at > 0 ? D.rounds[D.at - 1] : null;
  const pages = r.pages || [];
  V.setRunState({
    run: D.at + 1, of: D.rounds.length, phase: D.phase,
    score: r.official_s, delta: prev ? prev.official_s - r.official_s : null,
    clean: pages.filter(p => p.passed).length, total: pages.length,
    spend: r.cost_usd, tier: D.tier, circuit: D.circuit,
    verdict: D.verdict, verdictTone: D.verdictTone,
  });
}

// The broadcast names the state of tune and the circuit over the picture; the developer
// view has no picture, so it carries the same two words in the strip.
// undefined means "leave this one alone". The garage repaints the state of tune without
// knowing a circuit, and passing null there used to wipe the circuit off the strip.
V.setContext = function (tier, circuit) {
  if (tier !== undefined) D.tier = tier;
  if (circuit !== undefined) D.circuit = circuit;
  pushStrip();
};

// ---------------------------------------------------------------------------------------
// furniture
// ---------------------------------------------------------------------------------------
function card(host, id, icon, title, note) {
  const n = el('div', 'dcard');
  const h = el('div', 'dcard-h');
  h.innerHTML = `<span>${SCR.devtheme.iconSvg(icon, 17)}${title}</span>`
    + (note ? `<em>${note}</em>` : '');
  const cv = el('canvas');
  n.append(h, cv);
  host.append(n);
  cards[id] = { canvas: cv, ctx: cv.getContext('2d'), w: 0, h: 0 };
  return n;
}

// Nine panels, down from eleven. Blame and selection were one question asked twice, so
// they are one table now; the WCAG tag counts are already a panel in the broadcast.
// The broadcast's right-hand rail is ten scalars — where the season is, what it scored,
// what it cost, and whether the change was kept. None of them were on this page. They go in
// one strip rather than ten cards: they are readouts, not graphs.
const PHASES = [['RUN', 'build'], ['SCORE', 'audit'], ['DIAGNOSE', 'blame'],
  ['CHANGE', 'patch'], ['GATES', 'check'], ['RESULT', 'verdict']];

function buildStrip(host) {
  const strip = el('div', 'dstrip');
  strip.innerHTML =
    '<div class="ds-run"><b data-run>—</b><span data-of></span></div>'
    + '<div class="ds-steps" data-steps></div>'
    + '<div class="ds-stats">'
    + stat('score', 'score') + stat('delta', 'delta') + stat('clean', 'clean')
    + stat('spend', 'spend') + stat('tier', 'tune') + stat('circuit', 'circuit')
    + '</div>'
    + '<div class="ds-verdict" data-verdict><i></i><b>standby</b></div>';
  host.append(strip);
  const steps = strip.querySelector('[data-steps]');
  for (const [key, label] of PHASES) {
    const n = el('div', 'ds-step'); n.dataset.phase = key;
    n.innerHTML = `<u></u><span>${label}</span>`;
    steps.append(n);
  }
  return strip;
}
function stat(key, label) {
  return `<div class="ds-stat"><span>${label}</span><b data-${key}>—</b></div>`;
}

// Everything the strip shows for the run the page is sitting on.
V.setRunState = function (o) {
  const strip = $('devStrip'); if (!strip) return;
  const put = (sel, v, cls) => { const n = strip.querySelector(sel); if (!n) return;
    n.textContent = v === undefined || v === null || v === '' ? '—' : v;
    if (cls !== undefined) n.className = cls; };
  put('[data-run]', o.run ? 'run ' + o.run : '—');
  put('[data-of]', o.of ? '/ ' + o.of : '');
  put('[data-score]', o.score === undefined ? null : o.score.toFixed(2));
  // One deadband, used for the sign and the colour alike. Reading them off different
  // thresholds printed a delta of -0.001 as "+0.00", which says worse and means unchanged.
  const dz = o.delta === undefined || o.delta === null ? null
    : Math.abs(o.delta) < 0.005 ? 0 : o.delta;
  put('[data-delta]', dz === null ? null
    : (dz > 0 ? '−' : dz < 0 ? '+' : '') + Math.abs(dz).toFixed(2),
    dz > 0 ? 'good' : dz < 0 ? 'bad' : '');
  put('[data-clean]', o.total ? `${o.clean} / ${o.total}` : null, o.clean ? 'good' : '');
  put('[data-spend]', o.spend === undefined ? null : '$' + o.spend.toFixed(4));
  put('[data-tier]', o.tier || null);
  put('[data-circuit]', o.circuit || null);

  const at = PHASES.findIndex(p => p[0] === o.phase);
  for (const n of strip.querySelectorAll('.ds-step')) {
    const i = PHASES.findIndex(p => p[0] === n.dataset.phase);
    n.classList.toggle('on', i === at);
    n.classList.toggle('done', at >= 0 && i < at);
  }
  const v = strip.querySelector('[data-verdict]');
  if (v) {
    const word = o.verdict || 'standby';
    v.querySelector('b').textContent = word;
    v.className = 'ds-verdict' + (o.verdictTone ? ' ' + o.verdictTone : '');
  }
};

V.build = function () {
  const host = $('dev'); if (!host || host.dataset.built) return;
  host.dataset.built = '1';
  readBundle();
  const strip = buildStrip(host);
  strip.id = 'devStrip';
  const grid = el('div', 'dgrid');
  host.append(grid);
  card(grid, 'pipe',   'activity',  'one lap', 'five spans');
  card(grid, 'hist',   'trending',  'claimed vs held-out', 'seconds');
  card(grid, 'calib',  'crosshair', 'calibration', 'seconds');
  card(grid, 'infer',  'cpu',       'inference', 'qwen3-14b');
  card(grid, 'rails',  'server',    'rails', '');
  card(grid, 'credit', 'share',     'attribution', 'this run');
  card(grid, 'funnel', 'filter',    'gates', 'season');
  card(grid, 'tamper', 'shield',    'tamper', 'role / obligation');
  card(grid, 'roles',  'sliders',   'blame and selection', 'seconds');
  card(grid, 'built',  'activity',  'interfaces built', 'this run');
  card(grid, 'rules',  'filter',    'wcag rules', 'run by run');
  card(grid, 'diff',   'share',     'the change', 'this run');
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
// 1. one lap, as the five spans it opens.
// The only panel allowed to move: the motion is throughput, which is the thing it is about.
// ---------------------------------------------------------------------------------------
function drawPipe(ctx, w, h, t) {
  const c = C(), th = T(), small = th.small(w, h);
  const n = OPS.length, padX = 16, gap = (w - padX * 2) / n;
  const cy = h * 0.42, r = Math.max(10, Math.min(17, gap * 0.15));

  ctx.strokeStyle = c.line; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX + gap * 0.5, th.crisp(cy)); ctx.lineTo(padX + gap * (n - 0.5), th.crisp(cy));
  ctx.stroke();

  const PERIOD = 1.9, INFLIGHT = 5;
  for (let k = 0; k < INFLIGHT; k++) {
    const u = ((t / PERIOD) + k / INFLIGHT) % 1;
    const x = padX + gap * 0.5 + u * gap * (n - 1);
    const seg = Math.min(n - 1, Math.floor(u * (n - 1)));
    // one lap in ten came back clean, which is the real rate
    const passed = (Math.floor(t / PERIOD) + k) % 10 === 0;
    ctx.fillStyle = u > 0.95 ? (passed ? c.green : c.rose) : c[OPS[seg].hue];
    th.rr(ctx, x - 2.5, cy - 2.5, 5, 5, 1.5); ctx.fill();
  }

  for (let i = 0; i < n; i++) {
    const o = OPS[i], x = padX + gap * (i + 0.5), hue = c[o.hue];
    const u = (t / PERIOD) % 1, at = Math.min(n - 1, Math.floor(u * (n - 1)));
    const hot = at === i;
    ctx.fillStyle = c.panel; th.rr(ctx, x - r, cy - r, r * 2, r * 2, 5); ctx.fill();
    ctx.strokeStyle = hot ? hue : c.line; ctx.lineWidth = hot ? 1.6 : 1;
    th.rr(ctx, x - r, cy - r, r * 2, r * 2, 5); ctx.stroke();
    ctx.fillStyle = hue; ctx.globalAlpha = hot ? 1 : 0.5;
    const ir = r * 0.36;
    th.rr(ctx, x - ir, cy - ir, ir * 2, ir * 2, 2); ctx.fill();
    ctx.globalAlpha = 1;

    // the one span that leaves this machine. The icon replaces the sentence that was here.
    if (o.remote) {
      th.icon(ctx, 'server', x - 9, cy - r - 26, 18, c.rose);
      ctx.strokeStyle = c.rose; ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(th.crisp(x), cy - r - 4); ctx.lineTo(th.crisp(x), cy - r - 27);
      ctx.stroke(); ctx.setLineDash([]);
    }

    ctx.textAlign = 'center';
    ctx.font = FN('label', small); ctx.fillStyle = hot ? c.text : c.dim;
    ctx.fillText(o.role, x, cy + r + 16);
    ctx.font = FN('axis', small); ctx.fillStyle = c.mute;
    ctx.fillText(o.op, x, cy + r + 29);
  }
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------------------
// 2. the inference meter — the rail that is CoreWeave. Static: a spend figure that
// shimmered implied it was still moving, and it is not.
// ---------------------------------------------------------------------------------------
function drawInfer(ctx, w, h) {
  const c = C(), th = T(), small = th.small(w, h);
  const m = D.meters.driver;
  if (!m) return th.empty(ctx, w, h, 'no meter');
  const calls = m.calls || 0, hits = m.cache_hits || 0, total = calls + hits || 1;

  const bx = 13, bw = w - 26;
  const bh = Math.max(8, h * 0.07), tb = Math.max(6, h * 0.05);
  const by = h * 0.22, ty = h * 0.47, ty2 = h * 0.68;

  // nine calls in ten were answered from cache, so the split is the headline
  ctx.fillStyle = c.grid; th.rr(ctx, bx, by, bw, bh, bh / 2); ctx.fill();
  const cw = Math.max(2, bw * (calls / total));
  ctx.save(); th.rr(ctx, bx, by, bw, bh, bh / 2); ctx.clip();
  ctx.fillStyle = c.rose; ctx.fillRect(bx, by, cw, bh);
  ctx.fillStyle = c.teal; ctx.globalAlpha = 0.3; ctx.fillRect(bx + cw, by, bw - cw, bh);
  ctx.globalAlpha = 1; ctx.restore();

  ctx.font = FN('sub', small); ctx.fillStyle = c.rose;
  ctx.fillText(calls.toLocaleString() + ' calls', bx, by - 7);
  ctx.textAlign = 'right'; ctx.fillStyle = c.teal;
  ctx.fillText(Math.round(hits / total * 100) + '% cached', bx + bw, by - 7);
  ctx.textAlign = 'left';

  const ti = m.tokens_in || 0, to = m.tokens_out || 0, tmax = Math.max(ti, to, 1);
  const row = (label, val, col, y) => {
    ctx.font = FN('sub', small); ctx.fillStyle = c.dim; ctx.fillText(label, bx, y - 6);
    ctx.fillStyle = c.grid; th.rr(ctx, bx, y, bw, tb, tb / 2); ctx.fill();
    ctx.fillStyle = col; th.rr(ctx, bx, y, Math.max(2, bw * (val / tmax)), tb, tb / 2); ctx.fill();
    ctx.font = FN('value', small); ctx.fillStyle = c.text; ctx.textAlign = 'right';
    ctx.fillText(val.toLocaleString(), bx + bw, y - 6);
    ctx.textAlign = 'left';
  };
  row('tokens in', ti, c.blue, ty);
  row('tokens out', to, c.violet, ty2);

  ctx.font = FN('hero', small); ctx.fillStyle = c.amber;
  ctx.fillText('$' + (m.spend_usd || 0).toFixed(4), bx, h - 10);
  ctx.font = FN('sub', small); ctx.fillStyle = c.mute;
  ctx.textAlign = 'right'; ctx.fillText('spend', bx + bw, h - 11); ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------------------
// 3. the rails. The dot breathes only on a rail that is actually serving, which is the
// one thing on this card worth a glance.
// ---------------------------------------------------------------------------------------
function drawRails(ctx, w, h, t) {
  const c = C(), th = T(), small = th.small(w, h);
  const rowH = Math.min(22, (h - 6) / RAILS.length);
  RAILS.forEach((rl, i) => {
    const backend = (D.backends[rl.key] || '').split('—')[0].trim();
    const live = !!backend && backend === LIVE_OK[rl.key];
    const midY = 3 + i * rowH + rowH * 0.5;
    ctx.fillStyle = live ? c.green : c.line;
    ctx.globalAlpha = live ? 0.55 + 0.45 * Math.abs(Math.sin(t * 1.6 + i * 0.6)) : 1;
    ctx.beginPath(); ctx.arc(9, midY, 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = FN('label', small); ctx.fillStyle = live ? c.text : c.mute;
    ctx.fillText(rl.name, 19, midY + 4);
    ctx.font = FN('axis', small); ctx.fillStyle = live ? c.dim : c.mute;
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
  const G = SCR.devgraphs || {}, P = SCR.devpanels || {}, AU = SCR.devaudit || {},
    RN = SCR.devrun || {};
  const r = D.rounds[D.at] || {};
  const go = (id, fn) => {
    const c = cards[id]; if (!c || !c.w) return;
    c.ctx.clearRect(0, 0, c.w, c.h);
    try { fn(c.ctx, c.w, c.h, t); } catch (e) { void e; }
  };
  go('pipe', drawPipe);
  go('infer', drawInfer);
  go('rails', drawRails);
  go('hist', (x, w, h, tt) => G.runHistory && G.runHistory(x, w, h, tt,
    { runs: D.runs, at: D.at }));
  // attribution, blame and the change are all about ONE run — the one the page is on —
  // so they follow the season rather than showing a union of every round at once.
  go('credit', (x, w, h, tt) => G.creditGraph && G.creditGraph(x, w, h, tt, runRows(r)));
  go('funnel', (x, w, h, tt) => P.gateFunnel && P.gateFunnel(x, w, h, tt,
    { gates: D.gates, entered: D.entered, accepted: D.accepted }));
  go('roles', (x, w, h, tt) => AU.roleTable && AU.roleTable(x, w, h, tt, runRoles(r)));
  go('calib', (x, w, h, tt) => P.calibration && P.calibration(x, w, h, tt,
    { points: D.calib, at: D.at }));
  go('tamper', (x, w, h, tt) => AU.tamperMatrix && AU.tamperMatrix(x, w, h, tt, { flags: D.flags }));
  go('built', (x, w, h, tt) => RN.interfaces && RN.interfaces(x, w, h, tt, { pages: r.pages || [] }));
  go('rules', (x, w, h, tt) => RN.ruleHeat && RN.ruleHeat(x, w, h, tt,
    { rules: D.ruleRows, runs: D.rounds.length, at: D.at }));
  go('diff', (x, w, h, tt) => RN.diffView && RN.diffView(x, w, h, tt,
    { diff: r.diff || '', summary: r.diff_summary || '', part: r.part || '' }));
}

// The router rows of one round, with its own item and role axes.
function runRows(r) {
  const rows = r.router_rows || [];
  return { rows, items: [...new Set(rows.map(x => x.item))].sort(),
    roles: [...new Set(rows.map(x => x.blamed_role))] };
}
// One row per component for this round: its standing merged with its shortlist entry.
function runRoles(r) {
  const by = {};
  for (const st_ of Object.values(r.standings || {})) by[st_.role] = { ...st_ };
  for (const a of (r.alternatives || [])) by[a.role] = { ...(by[a.role] || { role: a.role }), ...a };
  return { rows: Object.values(by), chosen: r.role || null, threshold: 0 };
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
  // the season sets run, phase and verdict long before this view is first opened, so the
  // strip has to be filled from the state we already hold rather than wait for the next change
  pushStrip();
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
