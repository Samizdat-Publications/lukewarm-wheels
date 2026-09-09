// 31-track-mesh.js — turns track lane samples into triangle meshes used BOTH as
// Rapier trimesh colliders and as Three.js visual geometry (SPEC s5.3, s6).
// Output arrays: positions Float32Array (xyz), indices Uint32Array, uvs Float32Array.
(function (HW) {
  const V = HW.V;

  function MeshBuf() {
    this.pos = []; this.idx = []; this.uv = [];
  }
  MeshBuf.prototype.vert = function (p, u = 0, v = 0) { this.pos.push(p.x, p.y, p.z); this.uv.push(u, v); return this.pos.length / 3 - 1; };
  // quad a-b-c-d (counter-clockwise seen from the face normal side)
  MeshBuf.prototype.quad = function (a, b, c, d) { this.idx.push(a, b, c, a, c, d); };
  MeshBuf.prototype.finish = function () {
    return { positions: new Float32Array(this.pos), indices: new Uint32Array(this.idx), uvs: new Float32Array(this.uv), triangles: this.idx.length / 3 };
  };

  // Build one circuit: floor top ribbon (collider + visual), floor slab sides/bottom (visual),
  // walls (collider + visual).
  function buildCircuit(path, track, cfg, out) {
    const { P, N, SS } = path.samples;
    const w2 = cfg.laneWidth / 2, wt = cfg.wallThick, ft = cfg.floorThick;
    // Wall height. Every CURVED piece outside the hub (junction turn, 270 deg lobe, junction turn back)
    // is a deep moulded channel: at 20.5 cm radius / 300 cm/s the lobe pulls ~4.5 g and the 15 cm junction
    // bend up to ~11 g, so the car rides the OUTER wall and a wall shorter than the casting simply lets
    // the top corner swing over it. The hub arms keep the shallow `wallHeight` lane channel.
    // Keyed on the segment's own `deepWall` flag, not on `lift > 0` (with lobeLift = 0 the old test
    // silently dropped the lobe walls to wallHeight, so every "flat arc" experiment failed for the
    // wrong reason) and not on `kind === 'arc'` either: the junction turn now lives inside the ramp
    // segment, and at a derived radius of ~14 cm it pulls ~6.6 g at 300 cm/s, so it needs the deep
    // channel just as much as the ring does.
    // The change of height is RAMPED over wallRampLen: a hard step leaves the taller wall's end cap
    // sticking up in the lane, and a car that is a few mm off-centre (or briefly airborne) hits that cap
    // head-on at 250 cm/s and is destroyed. Real mouldings taper; so do these.
    const whTarget = (i) => { const sg = segAt(i); return sg && sg.deepWall ? cfg.lobeWallHeight : cfg.wallHeight; };
    const frames = [];
    for (let i = 0; i < N; i++) frames.push(path.sample(SS[i]));
    frames.push(path.sample(path.length - 1e-4)); // closing sample (== first)
    const M = frames.length;
    const segAt = (i) => frames[Math.min(i, M - 1)].seg;
    // box-filter the wall height over +-wallRampLen/2 so it changes as a ramp, not a step
    const rampN = Math.max(0, Math.round(cfg.wallRampLen / (2 * path.ds)));
    const whRaw = new Array(M); for (let i = 0; i < M; i++) whRaw[i] = whTarget(i);
    const wallH = new Array(M);
    for (let i = 0; i < M; i++) {
      if (rampN === 0) { wallH[i] = whRaw[i]; continue; }
      let sum = 0, n = 0;
      for (let k = -rampN; k <= rampN; k++) { sum += whRaw[((i + k) % (M - 1) + (M - 1)) % (M - 1)]; n++; }
      wallH[i] = sum / n;
    }
    const whAt = (i) => wallH[Math.min(i, M - 1)];

    // Wall presence per sample. A wall may only be removed where it would actually stand in another
    // lane (the four `#` crossing points) or in the foam wheel's slot -- and the test is run on the WALL
    // point, not on the lane centreline. The old `inCrossing(laneCentre)` test cut a 9.8 cm hole in both
    // walls at every crossing; the real gap is only as wide as the lane that crosses (~3.8 cm), and the
    // extra 6 cm let cars wander far enough off-lane to spear the wall end where it restarted.
    const clear = cfg.laneWidth / 2 + cfg.wallThick;      // corridor another lane needs kept clear
    const blocked = (q) => {
      for (const c of track.circuits) {
        if (c === path) continue;
        const pr = c.project(q);
        if (Math.abs(pr.lateral) < clear && Math.abs(pr.height) < cfg.lobeWallHeight && pr.dist < clear + 1) return true;
      }
      return track.nearWheel(q);
    };
    const wallPoint = (i, sgn) => V.addScaled(frames[i].p, frames[i].right, sgn * (w2 + wt / 2 + cfg.wallInset));
    const leftWall = new Array(M), rightWall = new Array(M);
    for (let i = 0; i < M; i++) {
      leftWall[i] = !blocked(wallPoint(i, -1));
      rightWall[i] = !blocked(wallPoint(i, 1));
    }
    // Drop slivers of wall. Where two openings nearly meet -- the foam wheel slot ends at z = -5.55
    // and the crossing gap starts at z = -4.89 -- the sample test leaves a 6 mm ISLAND of wall
    // between them, too short to carry a lead-in at either end: a spike with two square end caps
    // standing in the lane. Measured: a car leaving the inbound nip at 156 cm/s hit that cap
    // head-on (contact normal 0.98 along the lane, J192) and stopped dead.
    // Only true slivers are deleted; runs up to 2*wallFlareLen are kept but RECESSED (see emitRun),
    // because deleting them all left the hub arm with 25 cm of open side and nothing to lean on.
    const dropShortRuns = (present) => {
      let i = 0;
      while (i < M) {
        if (!present[i]) { i++; continue; }
        let j = i, len = 0;
        while (j < M - 1 && present[j + 1]) { len += V.dist(frames[j].p, frames[j + 1].p); j++; }
        if (len < cfg.wallMinRun) for (let k = i; k <= j; k++) present[k] = false;
        i = j + 1;
      }
    };
    dropShortRuns(leftWall); dropShortRuns(rightWall);

    // ---- floor top ribbon ----
    const fl = out.floor, fv = out.floorVisual;
    const topL = [], topR = [];
    for (let i = 0; i < M; i++) {
      const f = frames[i];
      const l = V.addScaled(f.p, f.right, -w2 - wt), r = V.addScaled(f.p, f.right, w2 + wt);
      const u = SS[Math.min(i, N - 1)] / 10;
      topL.push(fl.vert(l, u, 0)); topR.push(fl.vert(r, u, 1));
    }
    for (let i = 0; i < M - 1; i++) fl.quad(topL[i], topL[i + 1], topR[i + 1], topR[i]);
    // visual slab: top + bottom + sides
    const vTL = [], vTR = [], vBL = [], vBR = [];
    for (let i = 0; i < M; i++) {
      const f = frames[i];
      const l = V.addScaled(f.p, f.right, -w2 - wt), r = V.addScaled(f.p, f.right, w2 + wt);
      const u = SS[Math.min(i, N - 1)] / 10;
      vTL.push(fv.vert(l, u, 0)); vTR.push(fv.vert(r, u, 1));
      vBL.push(fv.vert(V.addScaled(l, f.up, -ft), u, 0)); vBR.push(fv.vert(V.addScaled(r, f.up, -ft), u, 1));
    }
    for (let i = 0; i < M - 1; i++) {
      fv.quad(vTL[i], vTL[i + 1], vTR[i + 1], vTR[i]);      // top
      fv.quad(vBR[i], vBR[i + 1], vBL[i + 1], vBL[i]);      // bottom
      fv.quad(vBL[i], vBL[i + 1], vTL[i + 1], vTL[i]);      // left side
      fv.quad(vTR[i], vTR[i + 1], vBR[i + 1], vBR[i]);      // right side
    }

    // ---- walls: inner face, top, outer face for each run (visual + solid box colliders) ----
    // A wall run STOPS at the crossing square and at the foam wheel slot, and it used to restart
    // with a square end cap ~0.44 cm outboard of the car's side. A car that drifts across the gap
    // hits that cap head-on at 300 cm/s and is destroyed. The first attempt bolted a separate
    // angled "flare" box onto each end of a run; that just moved the problem, because the flare's
    // own end face met the normal boxes at 22 deg and a car hit THAT (measured: J799 head-on,
    // -125 cm/s in one step, contact normal 0.93 along the lane).
    // Now there is ONE primitive: every box is built from the two ends of its stretch of the
    // INNER FACE LINE, and that line simply moves outward over `wallFlareLen` at each end of the
    // run. Consecutive boxes therefore share a face by construction and no cap is ever exposed to
    // the lane; a run shorter than 2*wallFlareLen is recessed along its whole length, which is what
    // happens to the 1.5-2.2 cm islands the wheel slot and the two crossings leave in a hub arm.
    const wb = out.walls;
    const setback = cfg.wallFlareLen * Math.tan(HW.units.degToRad(cfg.wallFlareDeg));
    // runs of consecutive present samples, per side
    function runsOf(present) {
      const runs = []; let cur = null;
      for (let i = 0; i < M; i++) {
        if (present[i]) { if (!cur) { cur = []; runs.push(cur); } cur.push(i); } else cur = null;
      }
      return runs.filter((r) => r.length > 1);
    }
    // extra[i] = how far outward this sample's inner face is pushed (0 mid-run, `setback` at an end)
    function extraFor(runs) {
      const extra = new Float64Array(M);
      for (const run of runs) {
        const cum = [0];
        for (let k = 1; k < run.length; k++) cum.push(cum[k - 1] + V.dist(frames[run[k - 1]].p, frames[run[k]].p));
        const total = cum[cum.length - 1];
        for (let k = 0; k < run.length; k++) {
          const dEnd = Math.min(cum[k], total - cum[k]);
          extra[run[k]] = cfg.wallFlareLen > 0 ? setback * (1 - Math.min(1, dEnd / cfg.wallFlareLen)) : 0;
        }
      }
      return extra;
    }

    function emitBoxes(side, run, extra) {
      const sgn = side === 'L' ? -1 : 1, segLen = cfg.wallSegLen;
      const facePt = (i) => V.addScaled(frames[i].p, frames[i].right, sgn * (w2 + wt / 2 + cfg.wallInset + extra[i]));
      let i0 = 0;
      while (i0 < run.length - 1) {
        let i1 = i0, len = 0;
        while (i1 < run.length - 1 && len < segLen) { len += V.dist(frames[run[i1]].p, frames[run[i1 + 1]].p); i1++; }
        const pa = facePt(run[i0]), pb = facePt(run[i1]);
        const d = V.dist(pa, pb);
        if (d < 1e-4) { i0 = i1; continue; }
        const wh = whAt(run[(i0 + i1) >> 1]);
        const mid = V.lerp(pa, pb, 0.5);
        const t = V.norm(V.sub(pb, pa));
        let up = V.norm(V.lerp(frames[run[i0]].up, frames[run[i1]].up, 0.5));
        const right = V.norm(V.cross(t, up)); up = V.norm(V.cross(right, t));
        out.wallBoxes.push({ center: V.addScaled(mid, up, wh / 2), quat: HW.math.quatFromBasis(right, up, V.scale(t, -1)),
          half: { x: wt / 2, y: wh / 2, z: d / 2 + 0.05 }, tapered: extra[run[i0]] > 1e-6 || extra[run[i1]] > 1e-6 });
        i0 = i1;
      }
    }

    function wallStrip(side, present) {
      const sgn = side === 'L' ? -1 : 1;
      const runs = runsOf(present), extra = extraFor(runs);
      for (const run of runs) {
        let prev = null;
        for (const i of run) {
          const f = frames[i];
          const wh = whAt(i);
          const inner = V.addScaled(f.p, f.right, sgn * (w2 + extra[i]));
          const outer = V.addScaled(f.p, f.right, sgn * (w2 + wt + extra[i]));
          const u = SS[Math.min(i, N - 1)] / 10;
          const cur = {
            ib: wb.vert(inner, u, 0), it: wb.vert(V.addScaled(inner, f.up, wh), u, 1),
            ot: wb.vert(V.addScaled(outer, f.up, wh), u, 1), ob: wb.vert(outer, u, 0),
          };
          if (prev) {
            if (side === 'L') { // inner face normal points +right (into the lane)
              wb.quad(prev.ib, prev.it, cur.it, cur.ib);
              wb.quad(prev.it, prev.ot, cur.ot, cur.it);
              wb.quad(prev.ot, prev.ob, cur.ob, cur.ot);
            } else {
              wb.quad(prev.it, prev.ib, cur.ib, cur.it);
              wb.quad(prev.ot, prev.it, cur.it, cur.ot);
              wb.quad(prev.ob, prev.ot, cur.ot, cur.ob);
            }
          }
          prev = cur;
        }
        emitBoxes(side, run, extra);
      }
    }
    wallStrip('L', leftWall);
    wallStrip('R', rightWall);
  }

  HW.trackMesh = {
    build(track, cfg = HW.config) {
      const out = { floor: new MeshBuf(), floorVisual: new MeshBuf(), walls: new MeshBuf(), wallBoxes: [] };
      for (const c of track.circuits) buildCircuit(c, track, cfg, out);
      const d = track.derived;
      const armHalfW = d.crossHalf;                       // half width of a hub arm
      const housingHalfW = Math.max(0.4, cfg.laneOffset - cfg.laneWidth / 2 - cfg.wallThick);
      const hub = {
        armHalfW, housingHalfW, housingHeight: 2.2,
        // flat plates under the lanes (visual + cuboid colliders), top at y = -0.05
        plates: [
          { center: V.make(0, -cfg.floorThick / 2 - 0.05, 0), half: V.make(armHalfW + 0.6, cfg.floorThick / 2, cfg.hubHalf) },
          { center: V.make(0, -cfg.floorThick / 2 - 0.05, 0), half: V.make(cfg.hubHalf, cfg.floorThick / 2, armHalfW + 0.6) },
        ],
        // raised housing between the two lanes of each arm, from the crossing square to the arm end,
        // with a slot for the foam wheel (renderer draws it; colliders come from the lane walls)
        housings: ['N', 'E', 'S', 'W'].map((arm) => {
          const A = HW.track.ARMS[arm];
          const r0 = d.crossHalf, r1 = cfg.hubHalf;
          return { arm, from: V.scale(A.d, r0), to: V.scale(A.d, r1), halfW: housingHalfW, wheel: track.wheels.find((w) => w.arm === arm) };
        }),
      };
      const res = {
        floor: out.floor.finish(), floorVisual: out.floorVisual.finish(), walls: out.walls.finish(), wallBoxes: out.wallBoxes, hub,
        supports: track.supports,
      };
      HW.log('track mesh', { floorTris: res.floor.triangles, wallTris: res.walls.triangles, wallBoxes: res.wallBoxes.length });
      return res;
    },
  };
})(window.HW);
