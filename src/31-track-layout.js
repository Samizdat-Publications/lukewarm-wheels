// 31-track-layout.js - the V2791 Criss Cross Crash layout: a plus-shaped hub whose four
// straight lanes form a # (four crash points), four booster wheels (one per arm, each
// between the two lanes of its arm, all turning clockwise seen from above), and four
// lobes that join each lane's exit to the next lane's entry. One continuous circuit:
//
//   lane C (north, x=-p) -> NW loop -> lane A (east, z=-p) -> NE loop ->
//   lane D (south, x=+p) -> SE sweep -> lane B (west, z=+p) -> SW sweep -> lane C
//
// Every lane passes two boosters (one in each arm it crosses), so a lap has eight pushes:
// the "eight-way booster" of the box copy. Topology read off Mattel's instruction sheet
// (docs/V2791-instructions.png, TO PLAY), see docs/SPEC.md.
//
// Each lobe is two quintic-Hermite halves, mirror images of each other, meeting at an apex
// with a prescribed position, heading and curvature. The four free handle lengths of the
// half are chosen to minimise bending energy (integral of curvature squared, plus a
// curvature-rate term): the fairest curve that hits the apex. Rear lobes are tall loops
// whose apex curvature points down, so a car at speed rides them upside down; front lobes
// are low sweeps near the floor.
(function (HW) {
  const R2 = Math.SQRT1_2;

  // ---------------------------------------------------------- half-lobe solver
  const Hb = (t) => { const t2 = t * t, t3 = t2 * t, t4 = t3 * t, t5 = t4 * t;
    return [1 - 10 * t3 + 15 * t4 - 6 * t5, t - 6 * t3 + 8 * t4 - 3 * t5, 0.5 * t2 - 1.5 * t3 + 1.5 * t4 - 0.5 * t5, 0.5 * t3 - t4 + 0.5 * t5, -4 * t3 + 7 * t4 - 3 * t5, 10 * t3 - 15 * t4 + 6 * t5]; };
  const dHb = (t) => { const t2 = t * t, t3 = t2 * t, t4 = t3 * t;
    return [-30 * t2 + 60 * t3 - 30 * t4, 1 - 18 * t2 + 32 * t3 - 15 * t4, t - 4.5 * t2 + 6 * t3 - 2.5 * t4, 1.5 * t2 - 4 * t3 + 2.5 * t4, -12 * t2 + 28 * t3 - 15 * t4, 30 * t2 - 60 * t3 + 30 * t4]; };
  const ddHb = (t) => { const t2 = t * t, t3 = t2 * t;
    return [-60 * t + 180 * t2 - 120 * t3, -36 * t + 96 * t2 - 60 * t3, 1 - 9 * t + 18 * t2 - 10 * t3, 3 * t - 12 * t2 + 10 * t3, -24 * t + 84 * t2 - 60 * t3, 60 * t - 180 * t2 + 120 * t3]; };
  const comb = (B, C) => [0, 1, 2].map((k) => B[0] * C[0][k] + B[1] * C[1][k] + B[2] * C[2][k] + B[3] * C[3][k] + B[4] * C[4][k] + B[5] * C[5][k]);

  // Lobe-local coordinates (u, w, y): u points out along the lobe's diagonal, w across it,
  // y up. The half runs from the lane end A (heading (1,1,0)/sqrt2, flat, zero curvature)
  // to the apex X (heading (0,-1,0), curvature 1/Rt pointing beta degrees below inward).
  function solveHalf(g, p, Lh, h0, seed) {
    const A = [(p + Lh) * R2, (Lh - p) * R2, h0], tA = [R2, R2, 0];
    const X = [g.ux, 0, g.yx], tX = [0, -1, 0];
    const be = g.beta * Math.PI / 180;
    const kX = [-Math.cos(be) / g.Rt, 0, -Math.sin(be) / g.Rt];
    const ctrlOf = (a, b, c, e) => [A, tA.map((x) => x * a), tA.map((x) => x * c), kX.map((x, i) => x * b * b + tX[i] * e), tX.map((x) => x * b), X];
    const stats = (q, n) => {
      const C = ctrlOf(q[0], q[1], q[2], q[3]); let E = 0, J = 0, kmax = 0, L = 0, ymin = 1e9, prevK = null;
      for (let i = 0; i <= n; i++) {
        const t = i / n, d1 = comb(dHb(t), C), d2 = comb(ddHb(t), C), P = comb(Hb(t), C);
        const sp = Math.hypot(d1[0], d1[1], d1[2]);
        const cx = d1[1] * d2[2] - d1[2] * d2[1], cy = d1[2] * d2[0] - d1[0] * d2[2], cz = d1[0] * d2[1] - d1[1] * d2[0];
        const k = Math.hypot(cx, cy, cz) / (sp * sp * sp), ds = sp / n;
        E += k * k * ds; L += ds; if (k > kmax) kmax = k; if (P[2] < ymin) ymin = P[2];
        if (prevK != null) J += ((k - prevK) / ds) ** 2 * ds; prevK = k;
      }
      return { E, J, kmax, L, ymin };
    };
    const floorY = g.floorY == null ? 0.8 : g.floorY;
    const cost = (q) => {
      if (q[0] <= 1 || q[1] <= 1) return 1e9;
      const s = stats(q, 120);
      return s.E + 2 * s.J + (s.ymin < floorY ? (floorY - s.ymin) ** 2 * 100 : 0);
    };
    const d0 = Math.hypot(X[0] - A[0], X[1] - A[1], X[2] - A[2]);
    // a solved result stored with the geometry (tools/simtest.mjs solve) skips the search
    if (g.q && g.q.length === 4 && !seed) {
      const st = stats(g.q, 600);
      return { A, X, q: g.q, ctrl: ctrlOf(g.q[0], g.q[1], g.q[2], g.q[3]), minR: 1 / st.kmax, len: st.L, ymin: st.ymin };
    }
    const starts = seed ? [seed] : [[d0, d0, 0, 0], [1.5 * d0, 1.2 * d0, 0, 0], [0.8 * d0, 1.5 * d0, 10, -10], [2 * d0, 0.7 * d0, -20, 20]];
    let best = null;
    for (const s0 of starts) {
      const r = nelderMead(cost, s0, seed ? [d0 * 0.05, d0 * 0.05, d0 * 0.2, d0 * 0.2] : [d0 * 0.3, d0 * 0.3, d0, d0], seed ? 600 : 1800);
      if (!best || r.f < best.f) best = r;
    }
    const st = stats(best.x, 600);
    return { A, X, q: best.x, ctrl: ctrlOf(best.x[0], best.x[1], best.x[2], best.x[3]), minR: 1 / st.kmax, len: st.L, ymin: st.ymin };
  }
  function nelderMead(f, x0, step, iters) {
    const n = x0.length; let S = [x0.slice()];
    for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += step[i]; S.push(x); }
    let F = S.map(f);
    for (let it = 0; it < iters; it++) {
      const idx = F.map((v, i) => i).sort((i, j) => F[i] - F[j]); S = idx.map((i) => S[i]); F = idx.map((i) => F[i]);
      const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) c[k] += S[i][k] / n;
      const xr = c.map((v, k) => v + (v - S[n][k])), fr = f(xr);
      if (fr < F[0]) { const xe = c.map((v, k) => v + 2 * (v - S[n][k])), fe = f(xe); if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; } }
      else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
      else {
        const xc = c.map((v, k) => v + 0.5 * (S[n][k] - v)), fc = f(xc);
        if (fc < F[n]) { S[n] = xc; F[n] = fc; }
        else for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, k) => S[0][k] + 0.5 * (v - S[0][k])); F[i] = f(S[i]); }
      }
    }
    return { x: S[0], f: F[0] };
  }

  // ---------------------------------------------------------- frames of reference
  // lobe-local (u,w,y) -> world, for the NW lobe; then k quarter-turns clockwise (x,z)->(-z,x)
  const toNW = (q) => [(-q[0] + q[1]) * R2, q[2], (-q[0] - q[1]) * R2];
  const rotQ = (v, k) => { let x = v[0], z = v[2]; for (let i = 0; i < k; i++) { const t = x; x = -z; z = t; } return [x, v[1], z]; };
  const mir = (q) => [q[0], -q[1], q[2]];
  const neg = (q) => [-q[0], -q[1], -q[2]];

  function lobeSegments(h, k, name, kind) {
    const [A, v0, a0, a1, v1, X] = h.ctrl;
    const entry = [A, v0, a0, a1, v1, X];
    // exit half = mirror (w -> -w) of the entry half, traversed backwards
    const exit = [mir(X), neg(mir(v1)), mir(a1), mir(a0), neg(mir(v0)), mir(A)];
    const W = (arr) => arr.map((q) => rotQ(toNW(q), k));
    return [
      HW.Path.quintic(...W(entry), { name: name + '-in', lobe: name, kind, half: 0 }),
      HW.Path.quintic(...W(exit), { name: name + '-out', lobe: name, kind, half: 1 }),
    ];
  }

  // ---------------------------------------------------------- hub moulding
  // Axis-aligned boxes {c:[x,y,z], h:[hx,hy,hz], kind}. The lanes run on the deck top
  // (y = deckH). Each lane has an outer (left) wall and an inner (right) wall; walls stop
  // at the # crossings (the crossing lane passes through) and the inner wall opens where
  // the foam wheel reaches into the lane.
  function buildHub(cfg, lanes, wheels, foamR) {
    const p = cfg.hubLane, Lh = cfg.hubHalf, h0 = cfg.deckH, W = cfg.laneW, wt = cfg.wallT, wh = cfg.wallH;
    const armW = p + W / 2 + wt + 0.6;
    const gapHalf = W / 2 + wt, bAt = cfg.boosterAt;
    const walls = [];
    const laneWalls = (L, off, skips) => {
      const dir = L.dir, right = [-dir[2], 0, dir[0]];
      const mid = [(L.from[0] + L.to[0]) / 2, 0, (L.from[2] + L.to[2]) / 2];
      let cuts = [[-Lh, Lh]];
      for (const [s0, s1] of skips) {
        const next = [];
        for (const [u0, u1] of cuts) {
          if (s1 <= u0 || s0 >= u1) { next.push([u0, u1]); continue; }
          if (s0 > u0) next.push([u0, s0]);
          if (s1 < u1) next.push([s1, u1]);
        }
        cuts = next;
      }
      for (const [u0, u1] of cuts) {
        if (u1 - u0 < 0.3) continue;
        const um = (u0 + u1) / 2, half = (u1 - u0) / 2;
        const x = mid[0] + dir[0] * um + right[0] * off, z = mid[2] + dir[2] * um + right[2] * off;
        walls.push({ c: [x, h0 + wh / 2, z], h: [dir[0] !== 0 ? half : wt / 2, wh / 2, dir[2] !== 0 ? half : wt / 2], kind: 'wall', lane: L.name });
      }
    };
    for (const k of ['C', 'A', 'D', 'B']) {
      const cross = [[-p - gapHalf, -p + gapHalf], [p - gapHalf, p + gapHalf]];
      laneWalls(lanes[k], -(W / 2 + wt / 2), cross);
      laneWalls(lanes[k], W / 2 + wt / 2, cross.concat([[-bAt - foamR, -bAt + foamR], [bAt - foamR, bAt + foamR]]));
    }
    const isl = p - W / 2 - wt;                                  // half-width of the strip between an arm's lanes
    const island = { c: [0, h0 + 0.9, 0], h: [isl, 0.9, isl], kind: 'island' };
    const housings = [];                                         // the booster wheels sit open, as on the real hub
    // battery box + motor in the north-east corner between the N and E arms
    const bx = (armW + Lh) / 2 + 0.1, bh = (Lh - armW) / 2 - 0.35;
    const battery = { c: [bx, 3.4, -bx], h: [bh, 3.4, bh], kind: 'battery' };
    return { armW, deckH: h0, isl, walls, island, housings, battery, foamR, wheelTop: h0 + 1.35 };
  }

  // ---------------------------------------------------------- supports
  // Each loop hangs from a TRACK SUPPORT tower at its apex (instruction sheet, step 2): a
  // post from the floor to the lowest corner of the channel there, with a clip. Each sweep's
  // far end rests on a low stepped block. Shared by the renderer and the Rapier colliders.
  function computeSupports(L, cfg) {
    const path = L.path, f = {}, out = [];
    const a = cfg.laneW / 2 + cfg.wallT, wh = cfg.wallH, ft = cfg.floorT;
    for (const name in L.lobes) {
      const lobe = L.lobes[name];
      const s = (lobe.s0 + lobe.s1) / 2;
      path.frame(s, f);
      // the four outer corners of the channel's cross-section at the apex
      const corners = [[-a, -ft], [a, -ft], [-a, wh], [a, wh]].map(([r, u]) => [f.px + f.rx * r + f.ux * u, f.py + f.ry * r + f.uy * u, f.pz + f.rz * r + f.uz * u]);
      corners.sort((p, q) => p[1] - q[1]);
      const low = corners[0];
      if (lobe.kind === 'loop') {
        out.push({ lobe: name, kind: 'post', x: low[0], z: low[2], top: low[1], s, half: 0.6 });
      } else {
        out.push({ lobe: name, kind: 'block', x: f.px, z: f.pz, top: Math.max(0.15, low[1]), s, half: 1.7 });
      }
    }
    return out;
  }

  // ---------------------------------------------------------- build
  HW.layout = {
    cache: {},
    build(cfg = HW.config) {
      const p = cfg.hubLane, Lh = cfg.hubHalf, h0 = cfg.deckH, W = cfg.laneW;
      const key = (g) => JSON.stringify([g, p, Lh, h0]);
      this.solveHalf = (g) => solveHalf(g, p, Lh, h0, null);
      const solve = (g) => {
        const k = key(g);
        if (!this.cache[k]) this.cache[k] = solveHalf(g, p, Lh, h0, g.seed || null);
        return this.cache[k];
      };
      const hl = solve(cfg.loop), hs = solve(cfg.sweep);

      const lanes = {
        C: { name: 'C', from: [-p, h0, Lh], to: [-p, h0, -Lh], dir: [0, 0, -1] },
        A: { name: 'A', from: [-Lh, h0, -p], to: [Lh, h0, -p], dir: [1, 0, 0] },
        D: { name: 'D', from: [p, h0, -Lh], to: [p, h0, Lh], dir: [0, 0, 1] },
        B: { name: 'B', from: [Lh, h0, p], to: [-Lh, h0, p], dir: [-1, 0, 0] },
      };
      const segs = [
        HW.Path.line(lanes.C.from, lanes.C.to, { name: 'lane C', lane: 'C' }),
        ...lobeSegments(hl, 0, 'NW', 'loop'),
        HW.Path.line(lanes.A.from, lanes.A.to, { name: 'lane A', lane: 'A' }),
        ...lobeSegments(hl, 1, 'NE', 'loop'),
        HW.Path.line(lanes.D.from, lanes.D.to, { name: 'lane D', lane: 'D' }),
        ...lobeSegments(hs, 2, 'SE', 'sweep'),
        HW.Path.line(lanes.B.from, lanes.B.to, { name: 'lane B', lane: 'B' }),
        ...lobeSegments(hs, 3, 'SW', 'sweep'),
      ];
      const g = HW.units.G, vRef = cfg.bankVRef, lossG = cfg.bankLossG;
      const path = HW.Path.build(segs, {
        ds: cfg.sampleDs,
        smoothCm: cfg.bankSmoothCm,
        bank(i, info) {
          const m = info.seg.meta;
          if (!m.lobe) return { flat: true };
          const along = m.half === 0 ? info.s - info.seg.s0 : info.s - info.seg.s0 + info.seg.length;
          const v2 = vRef * vRef - 2 * g * (info.y - h0) - 2 * lossG * g * along;
          return { flat: false, vNom: Math.sqrt(Math.max(v2, 60 * 60)), gain: 1, maxDeg: m.kind === 'sweep' ? cfg.sweepMaxBank : null };
        },
      });

      // lane start positions along s
      const laneS = {};
      for (const seg of segs) if (seg.meta.lane) laneS[seg.meta.lane] = { s0: seg.s0, s1: seg.s0 + seg.length, seg };
      const lobes = {};
      for (const seg of segs) if (seg.meta.lobe) {
        const L = lobes[seg.meta.lobe] || (lobes[seg.meta.lobe] = { name: seg.meta.lobe, kind: seg.meta.kind, s0: Infinity, s1: -Infinity });
        L.s0 = Math.min(L.s0, seg.s0); L.s1 = Math.max(L.s1, seg.s0 + seg.length);
      }
      // world point on lane `ln` at signed distance d from the hub centre along its direction
      const laneSAt = (ln, coord) => {
        const L = lanes[ln];
        const a = L.from, dir = L.dir;
        const along = (coord - (a[0] * dir[0] + a[2] * dir[2]));
        return laneS[ln].s0 + along;
      };

      // --- boosters: one wheel per arm at distance boosterAt from the centre, between that
      // arm's two lanes. Each wheel serves two lanes; the far wall of each lane is the anvil.
      const foamR = (p + W / 2) - cfg.nipGap;
      const bAt = cfg.boosterAt;
      const wheels = [
        { name: 'N', pos: [0, h0, -bAt], lanes: [['C', -bAt * -1], ['D', -bAt]] },
        { name: 'E', pos: [bAt, h0, 0], lanes: [['A', bAt], ['B', bAt * -1]] },
        { name: 'S', pos: [0, h0, bAt], lanes: [['C', bAt * -1], ['D', bAt]] },
        { name: 'W', pos: [-bAt, h0, 0], lanes: [['A', -bAt], ['B', -bAt * -1]] },
      ];
      // The lane "coordinate" used by laneSAt is position projected on the lane direction:
      // lane C runs north (dir z=-1): a point at z has coordinate -z.
      const boosters = [];
      for (const w of wheels) {
        for (const [ln] of w.lanes) {
          const L = lanes[ln];
          const coord = w.pos[0] * L.dir[0] + w.pos[2] * L.dir[2];
          boosters.push({ wheel: w.name, lane: ln, s: laneSAt(ln, coord), wheelPos: w.pos });
        }
      }
      // every booster sits on the car's RIGHT and pushes it toward the LEFT (far) wall
      for (const b of boosters) b.pushSign = -1;

      // --- crossings (#): lane X at coordinate of lane Y's centreline
      const crossings = [];
      const pairs = [['C', 'A'], ['A', 'D'], ['D', 'B'], ['B', 'C']];
      for (const [a, b] of pairs) {
        const La = lanes[a], Lb = lanes[b];
        // intersection point: C/D are x=const, A/B are z=const
        const xs = La.dir[0] === 0 ? La.from[0] : Lb.from[0];
        const zs = La.dir[2] === 0 ? La.from[2] : Lb.from[2];
        const sA = laneSAt(a, xs * La.dir[0] + zs * La.dir[2]);
        const sB = laneSAt(b, xs * Lb.dir[0] + zs * Lb.dir[2]);
        crossings.push({ name: a + b, pos: [xs, h0, zs], lanes: [a, b], s: [sA, sB] });
      }
      // wall gaps: along each lane, the other lane's full width including its walls
      const gapHalf = W / 2 + cfg.wallT;
      const gaps = [];
      for (const c of crossings) for (const s of c.s) gaps.push([s - gapHalf, s + gapHalf, c.name]);

      // per-sample flags used by the physics: 1 = no walls here
      const noWall = new Uint8Array(path.N);
      for (const [a, b] of gaps) for (let i = Math.floor(a / path.ds); i <= Math.ceil(b / path.ds); i++) noWall[((i % path.N) + path.N) % path.N] = 1;
      path.noWall = noWall;
      // region tags for the renderer and stats: 'hub' for lanes, lobe name otherwise
      path.region = (s) => {
        const seg = path.segments[path.segIdx[Math.floor((((s % path.length) + path.length) % path.length) / path.ds) % path.N]];
        return seg.meta.lane ? 'hub' : seg.meta.lobe;
      };

      // Track-piece joints. Each lobe is three moulded pieces (connector, arc, connector) and
      // meets the hub at both ends. A real joint is never perfect ("Adjust track side walls at
      // each connection point", OPERATING TIPS): every car that crosses one takes a tiny,
      // random clack. That noise is what lets cars drift in and out of phase with each other.
      const joints = [];
      for (const name in lobes) {
        const lb = lobes[name], len = lb.s1 - lb.s0;
        joints.push(lb.s0, lb.s0 + len * 0.3, lb.s0 + len * 0.7, lb.s1);
      }
      joints.sort((a, b) => a - b);

      // START HERE: lane C, south arm, just before the S booster (instruction sheet)
      const startS = boosters.find((b) => b.lane === 'C' && b.wheel === 'S').s - 4.2;

      // ---- the hub moulding, as boxes shared by the renderer and the Rapier colliders
      const hub = buildHub(cfg, lanes, wheels, foamR);

      const layout = {
        path, lanes, laneS, lobes, boosters, wheels, crossings, gaps, joints, startS, foamR, hub,
        halves: { loop: hl, sweep: hs },
        dims: { p, Lh, h0, W, wallT: cfg.wallT, wallH: cfg.wallH, floorT: cfg.floorT },
        stats: {
          length: path.length,
          loopApex: hl.X[2], sweepApex: hs.X[2],
          loopMinR: hl.minR, sweepMinR: hs.minR,
          footprint: 0,
        },
      };
      layout.supports = computeSupports(layout, cfg);
      let ext = 0; for (let i = 0; i < path.N; i++) ext = Math.max(ext, Math.abs(path.P.x[i]), Math.abs(path.P.z[i]));
      layout.stats.footprint = 2 * (ext + W / 2 + cfg.wallT);
      return layout;
    },
  };
})(window.HW);
