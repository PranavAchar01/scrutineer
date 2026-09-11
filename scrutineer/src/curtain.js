// ============================================================================
// SCR.curtain — the pit-lane shutter between the garage and the track.
//
// A block wipe drawn in the same pixel grid as the stage itself: cells march in
// from the left and right edges, meet in the middle, and the scene is swapped
// behind them at full close. Then the same march runs backwards and the new
// scene is revealed from the middle outwards.
//
// It runs on its own rAF clock rather than scene time: a seek or a pause must
// never leave the shutter half-shut over the picture.
// ============================================================================
(function (SCR) {
'use strict';
const C = SCR.curtain = {};

const CELL = 18;            // css px per block — the grid reads as pixels, not as a fade
const DUR = 0.34;           // seconds for one direction
const LEAD = 0.22;          // fraction of the sweep a column spends as the bright leading edge

let cv = null, ctx = null, W = 0, H = 0, cols = 0, rows = 0;
let raf = 0, last = 0;
const st = { p: 0, dir: 0, cb: null, then: null, running: false };
// Per-row jitter, so the leading edge is ragged rather than a ruled line.
let jitter = [];

function size() {
  if (!cv) return;
  const w = cv.clientWidth | 0, h = cv.clientHeight | 0;
  if (!w || !h) return;
  if (w === W && h === H) return;
  W = cv.width = w; H = cv.height = h;
  cols = Math.ceil(W / CELL); rows = Math.ceil(H / CELL);
  jitter = new Array(rows);
  for (let r = 0; r < rows; r++) jitter[r] = Math.random() * 0.14;
}

// How far into the sweep this column closes: 0 at the outer edge, 1 in the middle.
function reach(c, r) {
  const half = cols / 2;
  const fromEdge = c < half ? c : (cols - 1 - c);
  return Math.min(1, fromEdge / half + (jitter[r] || 0));
}

function paint() {
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  const p = st.p;
  if (p <= 0) return;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = reach(c, r);
      if (p < k) continue;
      // the freshest cells burn gold, the settled ones go to the night palette
      const age = p - k;
      ctx.fillStyle = age < LEAD * 0.5 ? '#F4C542'
        : age < LEAD ? '#B04BFF'
        : ((c + r) & 1) ? '#06081A' : '#0B1038';
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }
  }
}

function tick(ts) {
  if (!st.running) return;
  if (!last) last = ts;
  const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
  st.p += (dt / DUR) * st.dir;

  if (st.dir > 0 && st.p >= 1) {
    st.p = 1; paint();
    // fully shut: nothing of the swap can be seen happening
    const fn = st.cb; st.cb = null;
    if (fn) { try { fn(); } catch (e) { void e; } }
    st.dir = -1;
    raf = requestAnimationFrame(tick);
    return;
  }
  if (st.dir < 0 && st.p <= 0) {
    st.p = 0; st.running = false; ctx && ctx.clearRect(0, 0, W, H);
    cv.hidden = true;
    const fn = st.then; st.then = null;
    if (fn) { try { fn(); } catch (e) { void e; } }
    return;
  }
  paint();
  raf = requestAnimationFrame(tick);
}

C.attach = function (canvas) {
  cv = canvas; if (!cv) return;
  ctx = cv.getContext('2d');
  cv.hidden = true;
  size();
  window.addEventListener('resize', () => { size(); if (st.running) paint(); });
};

C.ready = () => !!ctx;

// Shut the curtain, run `swapFn` behind it, open it again. `after` runs once the
// picture is fully back. Reduced motion skips the theatre entirely.
C.swap = function (swapFn, after) {
  if (!ctx || (SCR.app && SCR.app.reducedMotion)) {
    if (swapFn) swapFn();
    if (after) after();
    return;
  }
  cv.hidden = false;      // a display:none canvas measures zero, so unhide before sizing
  size();
  st.cb = swapFn; st.then = after || null; st.dir = 1;
  if (!st.running) { st.running = true; st.p = 0; last = 0; raf = requestAnimationFrame(tick); }
  else { st.dir = 1; }                       // mid-open when asked again: shut it back
};

C.busy = () => st.running;
// Stopping mid-sweep must not lose the swap: the callback is the scene change, and dropping
// it leaves the page believing it is on a scene it never entered. Run it, then clear.
C.stop = function () {
  st.running = false; cancelAnimationFrame(raf);
  const fn = st.cb, then = st.then; st.cb = null; st.then = null;
  if (ctx) ctx.clearRect(0, 0, W, H);
  if (cv) cv.hidden = true;
  st.p = 0; st.dir = 0;
  if (fn) { try { fn(); } catch (e) { void e; } }
  if (then) { try { then(); } catch (e) { void e; } }
};
})(window.SCR = window.SCR || {});
