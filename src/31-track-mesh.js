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
    const whAt = (f) => (f.seg && f.seg.lift > 0 ? cfg.lobeWallHeight : cfg.wallHeight); // tall walls on the tilted curves
    const frames = [];
    for (let i = 0; i < N; i++) frames.push(path.sample(SS[i]));
    frames.push(path.sample(path.length - 1e-4)); // closing sample (== first)
    const M = frames.length;

    // wall presence per sample
    const leftWall = new Array(M), rightWall = new Array(M);
    for (let i = 0; i < M; i++) {
      const p = frames[i].p;
      const cross = track.inCrossing(p);
      leftWall[i] = !cross && !track.nearWheel(p);
      rightWall[i] = !cross;
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
        const wh = whAt(fa);
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
    function wallStrip(side, present) {
      const sgn = side === 'L' ? -1 : 1;
      let prev = null, run = [];
      for (let i = 0; i < M; i++) {
        if (!present[i]) { prev = null; if (run.length > 1) emitBoxes(side, run); run = []; continue; }
        run.push(i);
        const f = frames[i];
        const wh = whAt(f);
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
      if (run.length > 1) emitBoxes(side, run);
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
