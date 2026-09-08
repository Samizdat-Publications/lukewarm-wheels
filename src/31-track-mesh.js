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
    // Keyed on the segment KIND, not on `lift > 0`: with lobeLift = 0 the old test silently dropped the
    // lobe walls to wallHeight, so every "flat arc" experiment failed for the wrong reason.
    // The change of height is RAMPED over wallRampLen: a hard step leaves the taller wall's end cap
    // sticking up in the lane, and a car that is a few mm off-centre (or briefly airborne) hits that cap
    // head-on at 250 cm/s and is destroyed. Real mouldings taper; so do these.
    const whTarget = (i) => { const sg = segAt(i); return sg && sg.kind === 'arc' ? cfg.lobeWallHeight : cfg.wallHeight; };
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
    const wb = out.walls;
    function emitBoxes(side, run) {
      // run = list of frame indices with a wall; chop into boxes of ~wallSegLen along the path
      const sgn = side === 'L' ? -1 : 1, segLen = cfg.wallSegLen;
      let i0 = 0;
      while (i0 < run.length - 1) {
        let i1 = i0; let len = 0;
        while (i1 < run.length - 1 && len < segLen) { len += V.dist(frames[run[i1]].p, frames[run[i1 + 1]].p); i1++; }
        const fa = frames[run[i0]], fb = frames[run[i1]];
        const wh = whAt(run[(i0 + i1) >> 1]);
        const mid = V.lerp(fa.p, fb.p, 0.5);
        const t = V.norm(V.sub(fb.p, fa.p));
        let up = V.norm(V.lerp(fa.up, fb.up, 0.5));
        const right = V.norm(V.cross(t, up)); up = V.norm(V.cross(right, t));
        // inner face recessed by wallInset so chord-box end steps on the inside of bends cannot snag a car
        const center = V.addScaled(V.addScaled(mid, right, sgn * (w2 + wt / 2 + cfg.wallInset)), up, wh / 2);
        out.wallBoxes.push({ center, quat: HW.math.quatFromBasis(right, up, V.scale(t, -1)), half: { x: wt / 2, y: wh / 2, z: len / 2 + 0.05 } });
        i0 = i1;
      }
    }
    // Flared lane mouth. A wall run STOPS at the crossing square and at the foam-wheel slot, and it
    // restarts with a square end cap ~0.44 cm outboard of the car's side. A car that drifts across the
    // gap (it leaves every nip with 30-40 cm/s of lateral velocity) hits that cap head-on at 300 cm/s and
    // is destroyed. The real mouldings flare the lane mouth open; so do we: one extra box at each end of
    // every run, angled `wallFlareDeg` outward over `wallFlareLen`, flush with the wall at the joint.
    function emitFlare(side, runIdxs, atStart) {
      const sgn = side === 'L' ? -1 : 1, len = cfg.wallFlareLen;
      if (len <= 0 || runIdxs.length < 3) return runIdxs;
      // walk `len` cm into the run from the chosen end
      let a = atStart ? 0 : runIdxs.length - 1, b = a, acc = 0;
      const stepDir = atStart ? 1 : -1;
      while (acc < len && b + stepDir >= 0 && b + stepDir < runIdxs.length) {
        acc += V.dist(frames[runIdxs[b]].p, frames[runIdxs[b + stepDir]].p); b += stepDir;
      }
      if (acc < len * 0.6) return runIdxs;
      const fEnd = frames[runIdxs[a]], fIn = frames[runIdxs[b]];
      const setback = len * Math.tan(HW.units.degToRad(cfg.wallFlareDeg));
      const wh = whAt(runIdxs[b]);
      // inner-face line: set back OUTWARD at the gap end, flush at the inner end
      const pFar = V.addScaled(fEnd.p, fEnd.right, sgn * (w2 + cfg.wallInset + setback));
      const pNear = V.addScaled(fIn.p, fIn.right, sgn * (w2 + cfg.wallInset));
      const axis = V.norm(V.sub(pNear, pFar));
      const u = V.norm(V.lerp(fEnd.up, fIn.up, 0.5));
      const rf = V.norm(V.cross(axis, u));
      const mid = V.lerp(pFar, pNear, 0.5);
      const c = V.addScaled(V.addScaled(mid, rf, sgn * wt / 2), u, wh / 2);
      out.wallBoxes.push({ center: c, quat: HW.math.quatFromBasis(rf, u, V.scale(axis, -1)),
        half: { x: wt / 2, y: wh / 2, z: V.dist(pFar, pNear) / 2 }, flare: true });
      // the normal boxes must not fill the stretch we just set back
      return atStart ? runIdxs.slice(b) : runIdxs.slice(0, b + 1);
    }

    // A wall run gets a set-back LEAD-IN at each end: the last `wallFlareLen` of wall is angled
    // outward so the exposed end cap sits ~0.9 cm clear of the lane, instead of square across it.
    // The flare lives INSIDE the run (never out in the crossing square, which belongs to the lane
    // that crosses here), so it cannot block the other circuit.
    function emitRun(side, run) {
      let r = emitFlare(side, run, true);
      r = emitFlare(side, r, false);
      if (r.length > 1) emitBoxes(side, r);
    }

    function wallStrip(side, present) {
      const sgn = side === 'L' ? -1 : 1;
      let prev = null, run = [];
      for (let i = 0; i < M; i++) {
        if (!present[i]) { prev = null; if (run.length > 1) emitRun(side, run); run = []; continue; }
        run.push(i);
        const f = frames[i];
        const wh = whAt(i);
        const inner = V.addScaled(f.p, f.right, sgn * w2);
        const outer = V.addScaled(f.p, f.right, sgn * (w2 + wt));
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
      if (run.length > 1) emitRun(side, run);
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
