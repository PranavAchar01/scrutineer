// ============================================================================
// SCR.trackScene — cars lapping a circuit with broadcast cameras (chase, T-cam, trackside, heli, grid, auto director)
// One instance per session; the season swaps circuits between sessions.
// ============================================================================
(function (SCR) {
'use strict';
const E = SCR.engine, TS = SCR.trackScene = {};
TS.MODES = ['AUTO', 'CHASE', 'ONBOARD', 'TV', 'HELI', 'STUDIO'];
// create({R, world, car(state), ghost?, meshFor(state)->mesh, ghostMesh}) -> scene
TS.create = function (o) {
  const R = o.R, sc = { world: o.world, circ: o.world.circuit, car: o.car, ghost: o.ghost || null, ghostActive: false, mode: 'AUTO', activeTV: -1, autoPhase: 0, autoT: 0, label: 'CAM · CHASE', fx: [], orbit: 0.9, curvS: 0, sideS: 1, cut: true, smooth: { x: 0, y: 3, z: -10, tx: 0, ty: 0, tz: 0, init: false } };
  const cam = R.cam;
  sc.setWorld = w => { sc.world = w; sc.circ = w.circuit; sc.activeTV = -1; sc.smooth.init = false; sc.cut = true; sc.curvS = 0; sc.sideS = 1; };
  const tvDist = k => { let d = sc.world.tvcams[k].s - sc.car.s; if (d > sc.circ.len / 2) d -= sc.circ.len; if (d < -sc.circ.len / 2) d += sc.circ.len; return d; };
  function tvPick() {
    const cams = sc.world.tvcams; if (!cams.length) return -1;
    if (sc.activeTV >= 0 && sc.activeTV < cams.length) { const d = tvDist(sc.activeTV); if (d > -70 && d < 110) return sc.activeTV; }
    let best = -1, bd = 1e9; for (let k = 0; k < cams.length; k++) { const d = tvDist(k); if (d >= -8 && d < 110 && d < bd) { bd = d; best = k; } } if (best >= 0) return best;
    for (let k = 0; k < cams.length; k++) { const d = tvDist(k); if (d < 0 && d > -70 && -d < bd) { bd = -d; best = k; } } return best;
  }
  // The circuit is stored every 4 m, so reading it with a floor() hands the camera a basis
  // that steps about fifteen times a second at racing speed. Every mode that follows the
  // track inherited that as a jolt through a corner — worst on the T-cam, which had no
  // smoothing at all to hide it. Interpolate between the two neighbouring points instead,
  // renormalising the tangent so the frame stays orthonormal.
  function basis(s_) {
    const f = s_ / sc.circ.step, i0 = Math.floor(f), u = f - i0;
    const a = sc.circ.at(i0), b = sc.circ.at(i0 + 1);
    let tx = a.tx + (b.tx - a.tx) * u, tz = a.tz + (b.tz - a.tz) * u;
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    return { i: i0, tx, tz, nx: -tz, nz: tx, curv: a.curv + (b.curv - a.curv) * u };
  }
  sc.updateCamera = function (dt) {
    const car = sc.car, circ = sc.circ; let mode = sc.mode;
    if (sc.mode === 'AUTO') { sc.autoT += dt; const seq = ['TV', 'CHASE', 'TV', 'ONBOARD', 'HELI', 'CHASE']; if (sc.autoT > 7) { sc.autoT = 0; sc.autoPhase = (sc.autoPhase + 1) % seq.length; } mode = seq[sc.autoPhase]; }
    const sp = basis(car.s), i = sp.i, tx = sp.tx, tz = sp.tz, nx = sp.nx, nz = sp.nz;
    // curvature decides how far the chase camera swings to the inside, multiplied by 60, so
    // an unfiltered step in it throws the camera metres sideways. Lean into a corner instead.
    sc.curvS += (sp.curv - sc.curvS) * Math.min(1, dt * 3.5);
    // outside() is a sign, and it flips between adjacent points mid-corner. Easing it moves
    // the helicopter across the track over about a second rather than teleporting it.
    sc.sideS += (circ.outside(i) - sc.sideS) * Math.min(1, dt * 1.2);
    let px_, py_, pz_, tx_, ty_, tz_, fov = 40, lag = 6;
    if (mode === 'TV') { const k = tvPick(); if (k < 0) mode = 'CHASE'; else { if (k !== sc.activeTV) sc.cut = true; sc.activeTV = k; } }
    if (mode === 'CHASE') { px_ = car.x - tx * 8 - nx * sc.curvS * 60; py_ = 2.7; pz_ = car.z - tz * 8 - nz * sc.curvS * 60; tx_ = car.x + tx * 6; ty_ = 0.8; tz_ = car.z + tz * 6; fov = 44; lag = 7; }
    else if (mode === 'STUDIO') { const ang = E.time * 0.5 + sc.orbit, rr = 5.4; px_ = car.x + Math.sin(ang) * rr; py_ = 1.75; pz_ = car.z + Math.cos(ang) * rr; tx_ = car.x; ty_ = 0.45; tz_ = car.z; fov = 34; lag = 60; }
    else if (mode === 'ONBOARD') { px_ = car.x - tx * 0.15; py_ = 1.3; pz_ = car.z - tz * 0.15; tx_ = car.x + tx * 40; ty_ = 0.6; tz_ = car.z + tz * 40; fov = 66; lag = 22; }
    else if (mode === 'HELI') { const side = sc.sideS; px_ = car.x - tx * 22 - nx * side * 16; py_ = 34; pz_ = car.z - tz * 22 - nz * side * 16; tx_ = car.x + tx * 8; ty_ = 0; tz_ = car.z + tz * 8; fov = 38; lag = 3; }
    else { const c = sc.world.tvcams[sc.activeTV]; px_ = c.x; py_ = c.y; pz_ = c.z; tx_ = car.x; ty_ = 0.6; tz_ = car.z; const d = Math.hypot(c.x - car.x, c.z - car.z); fov = Math.max(9, Math.min(46, 620 / Math.max(12, d))); lag = 14; }
    // Snap on the frame the shot changes, because that is a cut and a cut should be instant.
    // Snapping every frame, which is what the T-cam and the trackside cameras used to do,
    // means no filtering at all — the quantised basis went straight to the screen.
    const sm = sc.smooth, cut = sc.cut || !sm.init;
    sc.cut = false;
    if (cut) { sm.x = px_; sm.y = py_; sm.z = pz_; sm.tx = tx_; sm.ty = ty_; sm.tz = tz_; sm.init = true; }
    const k2 = Math.min(1, dt * lag); sm.x += (px_ - sm.x) * k2; sm.y += (py_ - sm.y) * k2; sm.z += (pz_ - sm.z) * k2;
    const k3 = Math.min(1, dt * lag * 2);
    sm.tx += (tx_ - sm.tx) * k3; sm.ty += (ty_ - sm.ty) * k3; sm.tz += (tz_ - sm.tz) * k3;
    cam.pos = [sm.x, sm.y, sm.z]; cam.target = [sm.tx, sm.ty, sm.tz]; cam.fov = fov;
    sc.label = mode === 'STUDIO' ? 'CAM · GRID' : mode === 'TV' ? `CAM ${sc.activeTV + 1} · TRACKSIDE` : mode === 'CHASE' ? 'CAM · CHASE' : mode === 'ONBOARD' ? 'CAM · T-CAM' : 'CAM · HELI';
  };
  // render: draws sky, world, pools, shadow, ghost, car, sparks, outline. meshes: {car, ghost}
  sc.render = function (meshes) {
    R.begin(); R.sky(); R.drawStatic(sc.world.mesh); R.drawLightPools(sc.world.lightpools);
    const xf = SCR.car.makeXform(sc.car); R.drawDynamic(meshes.car, xf, 'shadow', 0);
    if (sc.ghostActive && sc.ghost && meshes.ghost) R.drawDynamic(meshes.ghost, SCR.car.makeXform(sc.ghost), 'ghost', 0);
    R.drawDynamic(meshes.car, xf, 'solid', 0); SCR.sim.drawSparks(R, sc.fx); R.outline();
  };
  sc.setMode = m => { if (TS.MODES.includes(m)) { sc.mode = m; sc.autoT = 0; sc.cut = true; } };
  return sc;
};
})(window.SCR = window.SCR || {});
