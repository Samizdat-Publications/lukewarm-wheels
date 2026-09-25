// 32-v2791.js - the Mattel V2791 Criss Cross Crash hub as a PROP, plus its two piece types.
//
// The hub is a plus-shaped moulding whose four straight lanes form a # (four crash points),
// with four foam booster wheels (one per arm, each between the two lanes of its arm, all
// turning clockwise seen from above). The set file (35-sets.js) chains the hub's lanes and
// four lobes into one circuit:
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
  const { Hb, dHb, ddHb, comb } = HW.pieces.basis;
  const nelderMead = HW.pieces.nelderMead;

  // ---------------------------------------------------------- half-lobe solver
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

  // ---------------------------------------------------------- frames of reference
  // lobe-local (u,w,y) -> world, for the NW lobe; then k quarter-turns clockwise (x,z)->(-z,x)
  const toNW = (q) => [(-q[0] + q[1]) * R2, q[2], (-q[0] - q[1]) * R2];
  const rotQ = (v, k) => { let x = v[0], z = v[2]; for (let i = 0; i < k; i++) { const t = x; x = -z; z = t; } return [x, v[1], z]; };
  const mir = (q) => [q[0], -q[1], q[2]];
  const neg = (q) => [-q[0], -q[1], -q[2]];

  function lobeSegments(h, k, name, kind, bank) {
    const [A, v0, a0, a1, v1, X] = h.ctrl;
    const entry = [A, v0, a0, a1, v1, X];
    // exit half = mirror (w -> -w) of the entry half, traversed backwards
    const exit = [mir(X), neg(mir(v1)), mir(a1), mir(a0), neg(mir(v0)), mir(A)];
    const W = (arr) => arr.map((q) => rotQ(toNW(q), k));
    return [
      HW.Path.quintic(...W(entry), { name: name + '-in', lobe: name, kind, half: 0, region: name, bank }),
      HW.Path.quintic(...W(exit), { name: name + '-out', lobe: name, kind, half: 1, region: name, bank }),
    ];
  }

  // ---------------------------------------------------------- hub moulding
  // Axis-aligned boxes {c:[x,y,z], h:[hx,hy,hz], kind}. The lanes run on the deck top
  // (y = deckH). Each lane has an outer (left) wall and an inner (right) wall; walls stop
  // at the # crossings (the crossing lane passes through) and the inner wall opens where
  // the foam wheel reaches into the lane.
  function buildHub(P, cfg, lanes, wheels, foamR) {
    const p = P.hubLane, Lh = P.hubHalf, h0 = P.deckH, W = cfg.laneW, wt = cfg.wallT, wh = cfg.wallH;
    const armW = p + W / 2 + wt + 0.6;
    const gapHalf = W / 2 + wt, bAt = P.boosterAt;
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
  // post standing just outside the loop, bracketed to the channel. Each sweep's
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
      if (lobe.kind === 'loop') {
        // The car rides the inside of the loop, so the tower must stand OUTSIDE it: just
        // beyond the corner of the channel furthest from the hub, gripping it with a clip.
        const ol = Math.hypot(f.px, f.pz) || 1, ox = f.px / ol, oz = f.pz / ol;
        corners.sort((p, q) => (q[0] * ox + q[2] * oz) - (p[0] * ox + p[2] * oz));
        const far = corners[0];
        out.push({ lobe: name, kind: 'post', x: far[0] + ox * 1.1, z: far[2] + oz * 1.1, top: far[1], s, half: 0.6, clip: far, track: path });
      } else {
        corners.sort((p, q) => p[1] - q[1]);
        const low = corners[0];
        out.push({ lobe: name, kind: 'block', x: f.px, z: f.pz, top: Math.max(0.15, low[1]), s, half: 1.7, track: path });
      }
    }
    return out;
  }

  // ---------------------------------------------------------- the prop
  const cache = {};
  const solve = (g, P) => {
    const k = JSON.stringify([g, P.hubLane, P.hubHalf, P.deckH]);
    if (!cache[k]) cache[k] = solveHalf(g, P.hubLane, P.hubHalf, P.deckH, g.seed || null);
    return cache[k];
  };

  HW.v2791 = {
    // re-solve a lobe shape from scratch (tools/simtest.mjs solve)
    solveHalf: (g, P) => solveHalf(g, P.hubLane, P.hubHalf, P.deckH, null),

    // before the tracks are built: the lanes and the two lobe shapes
    prepare(ctx) {
      const P = ctx.params, p = P.hubLane, Lh = P.hubHalf, h0 = P.deckH;
      const hub = {
        lanes: {
          C: { name: 'C', from: [-p, h0, Lh], to: [-p, h0, -Lh], dir: [0, 0, -1] },
          A: { name: 'A', from: [-Lh, h0, -p], to: [Lh, h0, -p], dir: [1, 0, 0] },
          D: { name: 'D', from: [p, h0, -Lh], to: [p, h0, Lh], dir: [0, 0, 1] },
          B: { name: 'B', from: [Lh, h0, p], to: [-Lh, h0, p], dir: [-1, 0, 0] },
        },
        halves: { loop: solve(P.loop, P), sweep: solve(P.sweep, P) },
      };
      ctx.props.v2791 = hub;
      return hub;
    },

    // after the circuit exists: boosters, the # crossings, wall gaps, joints, hub boxes, supports
    finish(ctx, L) {
      const P = ctx.params, cfg = ctx.cfg, hub = ctx.props.v2791, lanes = hub.lanes;
      const p = P.hubLane, Lh = P.hubHalf, h0 = P.deckH, W = cfg.laneW;
      const track = L.tracks.find((t) => t.segments.some((sg) => sg.meta.lane));
      const path = track, segs = track.segments;

      // lane start positions along s
      const laneS = {};
      for (const seg of segs) if (seg.meta.lane) laneS[seg.meta.lane] = { s0: seg.s0, s1: seg.s0 + seg.length, seg };
      const lobes = {};
      for (const seg of segs) if (seg.meta.lobe) {
        const Lb = lobes[seg.meta.lobe] || (lobes[seg.meta.lobe] = { name: seg.meta.lobe, kind: seg.meta.kind, s0: Infinity, s1: -Infinity });
        Lb.s0 = Math.min(Lb.s0, seg.s0); Lb.s1 = Math.max(Lb.s1, seg.s0 + seg.length);
      }
      // world point on lane `ln` at signed distance d from the hub centre along its direction
      const laneSAt = (ln, coord) => {
        const Ln = lanes[ln];
        const a = Ln.from, dir = Ln.dir;
        const along = (coord - (a[0] * dir[0] + a[2] * dir[2]));
        return laneS[ln].s0 + along;
      };

      // --- boosters: one wheel per arm at distance boosterAt from the centre, between that
      // arm's two lanes. Each wheel serves two lanes; the far wall of each lane is the anvil.
      const foamR = (p + W / 2) - P.nipGap;
      const bAt = P.boosterAt;
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
          const Ln = lanes[ln];
          const coord = w.pos[0] * Ln.dir[0] + w.pos[2] * Ln.dir[2];
          boosters.push({ wheel: w.name, lane: ln, s: laneSAt(ln, coord), wheelPos: w.pos, track, foamR, foamEdge: p - foamR, id: w.name + '/' + ln });
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
        crossings.push({ name: a + b, pos: [xs, h0, zs], lanes: [a, b], s: [sA, sB], track });
      }
      // wall gaps: along each lane, the other lane's full width including its walls
      const gapHalf = W / 2 + cfg.wallT;
      const gaps = [];
      for (const c of crossings) for (const s of c.s) gaps.push([s - gapHalf, s + gapHalf, c.name]);
      for (const [a, b] of gaps) for (let i = Math.floor(a / path.ds); i <= Math.ceil(b / path.ds); i++) path.noWall[((i % path.N) + path.N) % path.N] = 1;

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
      track.joints = joints;
      // connector clips under every joint that is not a hub edge
      const hubEdges = Object.values(laneS).flatMap((ln) => [ln.s0, ln.s1]);
      track.clips = joints.filter((js) => !hubEdges.some((e) => Math.abs(e - js) < 0.5));

      // ---- the hub moulding, as boxes shared by the renderer and the Rapier colliders
      const box = buildHub(P, cfg, lanes, wheels, foamR);
      Object.assign(L, {
        lanes, laneS, lobes, boosters, wheels, crossings, gaps, foamR, hub: box,
        halves: hub.halves,
        dims: Object.assign(L.dims, { p, Lh, h0 }),
      });
      Object.assign(L.stats, { loopApex: hub.halves.loop.X[2], sweepApex: hub.halves.sweep.X[2], loopMinR: hub.halves.loop.minR, sweepMinR: hub.halves.sweep.minR });
      L.supports.push(...computeSupports({ path, lobes }, cfg));
    },
  };

  // ---------------------------------------------------------- piece types
  // a hub lane: the straight moulded into the hub (the hub draws it and its walls)
  HW.pieces.types.hubLane = (pc, pose, ctx) => {
    const Ln = ctx.props.v2791.lanes[pc.lane];
    return { segs: [HW.Path.line(Ln.from, Ln.to, { name: 'lane ' + pc.lane, lane: pc.lane, region: 'hub', flat: true, channel: false })],
      pose: { p: Ln.to.slice(), t: Ln.dir.slice(), right: [-Ln.dir[2], 0, Ln.dir[0]] } };
  };

  // a lobe: two mirrored quintic halves from one hub lane's exit to the next lane's entry,
  // banked by the heartline rule for the speed a car would have there
  HW.pieces.types.lobe = (pc, pose, ctx) => {
    const P = ctx.params, g = HW.units.G, h0 = P.deckH, vRef = P.bankVRef, lossG = P.bankLossG;
    const kind = pc.shape;
    const bank = (info) => {
      const m = info.seg.meta;
      const along = m.half === 0 ? info.s - info.seg.s0 : info.s - info.seg.s0 + info.seg.length;
      const v2 = vRef * vRef - 2 * g * (info.y - h0) - 2 * lossG * g * along;
      return { flat: false, vNom: Math.sqrt(Math.max(v2, 60 * 60)), gain: 1, maxDeg: kind === 'sweep' ? P.sweepMaxBank : null };
    };
    const segs = lobeSegments(ctx.props.v2791.halves[kind], pc.turn, pc.id, kind, bank);
    for (const sg of segs) { sg.meta.channel = true; sg.meta.autoSupport = false; sg.meta.noAutoJoints = true; }
    return { segs, pose };
  };
})(window.HW);
