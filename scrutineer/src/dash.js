// ============================================================================
// SCR.dash — the pit wall. Every readout on the rails, driven only by numbers
// the loop actually produced.
//
// The rule for this module: a glance has to be enough. A number gets a colour
// and a bar, a state gets a lamp, a sequence gets a row of lamps. Sentences
// live under the picture, not in here.
// ============================================================================
(function (SCR) {
'use strict';
const D = SCR.dash = {};
const $ = id => document.getElementById(id);
const el = (t, c, txt) => { const n = document.createElement(t); if (c) n.className = c;
  if (txt !== undefined) n.textContent = txt; return n; };
const fx = (n, d = 2) => (n === null || n === undefined || isNaN(n)) ? '—' : Number(n).toFixed(d);

// The six phases of a run, drawn as sectors on a timing board.
const SECTORS = [
  { key: 'RUN',      label: 'BUILD' },
  { key: 'SCORE',    label: 'AUDIT' },
  { key: 'DIAGNOSE', label: 'BLAME' },
  { key: 'CHANGE',   label: 'PATCH' },
  { key: 'GATES',    label: 'CHECK' },
  { key: 'RESULT',   label: 'VERDICT' },
];

const GATE_ORDER = ['diff_size', 'comparable_ab', 'novelty', 'evidence', 'seesaw',
  'correlation', 'regression', 'cost_cap', 'scrutineering', 'rl_entropy'];
// Four letters is all a lamp needs; the sentence is in the work band below.
const GATE_TAG = { diff_size: 'SIZE', comparable_ab: 'A/B', novelty: 'NEW', evidence: 'EVID',
  seesaw: 'BOTH', correlation: 'CORR', regression: 'REGR', cost_cap: 'COST',
  scrutineering: 'FIA', rl_entropy: 'ENTR' };

const nodes = {};
let built = false;

// ---------------------------------------------------------------------------------------
// furniture
// ---------------------------------------------------------------------------------------
D.build = function () {
  if (built) return;
  built = true;

  // ---- header: the six sectors of a run ----
  const chips = $('hdrChips');
  if (chips) {
    chips.textContent = '';
    nodes.sect = {};
    SECTORS.forEach((s, i) => {
      const n = el('div', 'sect');
      n.innerHTML = `<i>S${i + 1}</i><b>${s.label}</b>`;
      chips.append(n);
      nodes.sect[s.key] = n;
    });
  }

  // ---- right rail: the telemetry stack ----
  const tele = $('tele');
  if (!tele) return;
  tele.textContent = '';

  // score: the one number the whole loop is trying to move
  const score = gauge(tele, 'SCORE', 'lower is faster');
  score.classList.add('g-hero');
  nodes.score = el('b', 'g-val', '—');
  nodes.scoreSub = el('div', 'g-sub');
  score.append(nodes.score, nodes.scoreSub);

  // delta against the previous run, drawn the way a live timing delta is
  const delta = gauge(tele, 'DELTA', 'against the last run');
  nodes.delta = el('b', 'g-val g-delta', '—');
  const dbar = el('div', 'dbar');
  nodes.deltaFill = el('i');
  dbar.append(el('u'), nodes.deltaFill);          // u = the centre tick
  delta.append(nodes.delta, dbar);

  // interfaces: one pip per brief, lit as each page comes back from the audit
  const clean = gauge(tele, 'INTERFACES', 'clean / built');
  nodes.cleanVal = el('b', 'g-val', '—');
  nodes.pips = el('div', 'pips');
  clean.append(nodes.cleanVal, nodes.pips);

  // budget: the cost cap, spent against allowed
  const fuel = gauge(tele, 'BUDGET', 'spent this run');
  nodes.fuelVal = el('b', 'g-val', '—');
  const fbar = el('div', 'fbar');
  nodes.fuelFill = el('i');
  fbar.append(nodes.fuelFill);
  fuel.append(nodes.fuelVal, fbar);

  // the ten gates, as a lamp panel
  const gates = gauge(tele, 'THE TEN CHECKS', 'a change passes all or none');
  nodes.lamps = el('div', 'lamps');
  nodes.lampBy = {};
  for (const g of GATE_ORDER) {
    const n = el('div', 'lamp');
    n.innerHTML = `<span>${GATE_TAG[g] || g}</span>`;
    n.dataset.gate = g;
    nodes.lamps.append(n);
    nodes.lampBy[g] = n;
  }
  gates.append(nodes.lamps);

  // the verdict light: the single thing a spectator is waiting for
  const v = el('div', 'verdict');
  v.innerHTML = '<i></i><b>STANDBY</b>';
  nodes.verdict = v;
  tele.append(v);
};

// The picture is sized in script rather than in CSS: it has to be the largest 16:9 that fits
// the deck in BOTH axes, and the station labels are positioned as a percentage of the box, so
// the box itself has to be exactly the picture — no letterboxing inside it.
D.fitStage = function () {
  const wrap = $('stageWrap'), box = $('stageBox');
  if (!wrap || !box) return;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if (!w || !h) return;
  const s = Math.min(w / 16, h / 9);
  box.style.width = Math.floor(s * 16) + 'px';
  box.style.height = Math.floor(s * 9) + 'px';
};

D.watchStage = function () {
  D.fitStage();
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => D.fitStage());
    const wrap = $('stageWrap'); if (wrap) ro.observe(wrap);
  }
  window.addEventListener('resize', () => D.fitStage());
};

function gauge(host, label, sub) {
  const n = el('div', 'gauge');
  const h = el('div', 'g-head');
  h.innerHTML = `<span>${label}</span>` + (sub ? `<em>${sub}</em>` : '');
  n.append(h);
  host.append(n);
  return n;
}

// ---------------------------------------------------------------------------------------
// readouts
// ---------------------------------------------------------------------------------------
D.phase = function (name) {
  if (!nodes.sect) return;
  const order = SECTORS.map(s => s.key);
  const at = order.indexOf(name);
  order.forEach((k, i) => {
    const n = nodes.sect[k]; if (!n) return;
    n.classList.toggle('on', i === at);
    n.classList.toggle('done', at >= 0 && i < at);
  });
};

D.score = function (v) {
  if (!nodes.score) return;
  nodes.score.textContent = fx(v);
};

D.scoreSub = function (text, tone) {
  if (!nodes.scoreSub) return;
  nodes.scoreSub.textContent = text || '';
  nodes.scoreSub.className = 'g-sub' + (tone ? ' ' + tone : '');
};

// Positive = faster than the last run. The bar grows from the centre, like a delta strip.
D.delta = function (d) {
  if (!nodes.delta) return;
  if (d === null || d === undefined || isNaN(d)) {
    nodes.delta.textContent = '—';
    nodes.delta.className = 'g-val g-delta';
    nodes.deltaFill.style.width = '0%';
    return;
  }
  const better = d > 0.005, worse = d < -0.005;
  nodes.delta.textContent = (d > 0 ? '-' : d < 0 ? '+' : '') + fx(Math.abs(d));
  nodes.delta.className = 'g-val g-delta' + (better ? ' good' : worse ? ' bad' : '');
  const mag = Math.min(1, Math.abs(d) / 12);
  nodes.deltaFill.className = better ? 'good' : worse ? 'bad' : '';
  nodes.deltaFill.style.width = (mag * 50).toFixed(1) + '%';
  nodes.deltaFill.style.left = better ? (50 - mag * 50).toFixed(1) + '%' : '50%';
};

// One pip per brief. Grey = not built yet, green = zero violations, red = violations.
D.pipsFor = function (total) {
  if (!nodes.pips) return;
  nodes.pips.textContent = '';
  for (let i = 0; i < total; i++) nodes.pips.append(el('i'));
  nodes.cleanVal.textContent = `0 / ${total}`;
};

D.pip = function (i, ok) {
  if (!nodes.pips) return;
  const n = nodes.pips.children[i];
  if (n) n.className = ok ? 'ok' : 'no';
};

D.clean = function (clean, done, total) {
  if (!nodes.cleanVal) return;
  nodes.cleanVal.textContent = `${clean} / ${done || total}`;
  nodes.cleanVal.className = 'g-val' + (clean ? ' good' : '');
};

D.budget = function (usd, cap) {
  if (!nodes.fuelVal) return;
  if (usd === null || usd === undefined) { nodes.fuelVal.textContent = '—';
    nodes.fuelFill.style.width = '0%'; return; }
  const c = cap || 3;
  nodes.fuelVal.textContent = '$' + fx(usd);
  const k = Math.min(1, usd / c);
  nodes.fuelFill.style.width = (k * 100).toFixed(1) + '%';
  nodes.fuelFill.className = k > 0.95 ? 'bad' : k > 0.7 ? 'warn' : '';
};

// `shown` gates have fired; the rest stay dark. A failure stops the sequence, so any
// lamp after the first red stays dark on purpose.
D.gates = function (list, shown) {
  if (!nodes.lampBy) return;
  for (const g of GATE_ORDER) {
    const n = nodes.lampBy[g];
    if (n) n.className = 'lamp';
  }
  const n = shown === undefined ? (list || []).length : shown;
  (list || []).slice(0, n).forEach(g => {
    const lamp = nodes.lampBy[g.gate];
    if (lamp) lamp.className = 'lamp ' + (g.ok ? 'pass' : 'fail');
  });
};

D.gatesClear = function () { D.gates([], 0); };

// STANDBY · RUNNING · KEPT · THROWN AWAY — the one word a spectator needs.
D.verdict = function (word, tone) {
  if (!nodes.verdict) return;
  nodes.verdict.querySelector('b').textContent = word;
  nodes.verdict.className = 'verdict' + (tone ? ' ' + tone : '');
};

// The state of tune, pinned over the picture. Five pips and a name: the point is that you
// can see the car and the circuit change and then read what changed, not the other way round.
D.tier = function (index, name, of, count) {
  const hud = $('hud'); if (!hud) return;
  let box = $('tierBadge');
  if (!box) {
    box = el('div', 'tier'); box.id = 'tierBadge';
    box.innerHTML = '<div class="tier-top"><b data-name></b><span class="tier-pips" data-pips></span></div>'
      + '<div class="tier-of" data-of></div>';
    hud.append(box);
  }
  box.querySelector('[data-name]').textContent = name;
  box.querySelector('[data-of]').textContent = of || '';
  const pips = box.querySelector('[data-pips]');
  if (pips.children.length !== count) { pips.textContent = '';
    for (let i = 0; i < count; i++) pips.append(el('i')); }
  [...pips.children].forEach((p, i) => { p.className = i <= index ? 'on' : ''; });
  box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
};

// The circuit chip, opposite the state of tune: which track, how long, which camera.
// Ten different layouts read as one track filmed ten ways unless the page says otherwise.
D.circuit = function (name, metres, archetype, shot) {
  const hud = $('hud'); if (!hud) return;
  let box = $('circChip');
  if (!box) {
    box = el('div', 'circ'); box.id = 'circChip';
    box.innerHTML = '<div class="circ-top"><b data-name></b><i data-kind></i></div>'
      + '<div class="circ-sub"><span data-len></span><span data-shot></span></div>';
    hud.append(box);
  }
  const set = (sel, v) => { const n = box.querySelector(sel); if (n) n.textContent = v || ''; };
  set('[data-name]', name || '');
  set('[data-kind]', archetype || '');
  set('[data-len]', metres ? (metres / 1000).toFixed(2) + ' km' : '');
  set('[data-shot]', shot || '');
};

D.reset = function () {
  D.gatesClear();
  D.verdict('STANDBY');
  D.delta(null);
};
})(window.SCR = window.SCR || {});
