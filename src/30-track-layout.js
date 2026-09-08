// 30-track-layout.js — lane geometry of the Criss Cross Crash set (SPEC s5).
// Two independent closed circuits (NS and EW) cross in the hub at four points.
// Each arm carries one outbound lane (right of the outward heading, +laneOffset)
// and one inbound lane (left, -laneOffset). Each arm has a lobe: a short RIGHT
// junction turn of splayDeg, a straight, a big LEFT arc of (180 + 2*splay) degrees
// tilted up onto a track support at its apex, a straight, and a RIGHT junction
// turn back into the inbound lane.
(function (HW) {
  const V = HW.V, M = HW.math;
  const SAMPLE_DS = 0.25; // cm between path samples

  const ARMS = {
    N: { d: V.make(0, 0, -1) }, E: { d: V.make(1, 0, 0) },
    S: { d: V.make(0, 0, 1) },  W: { d: V.make(-1, 0, 0) },
  };
  for (const k in ARMS) ARMS[k].r = V.rightOf(ARMS[k].d), ARMS[k].name = k;
  const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };

  // ---- segment primitives: each has length estimate, pointAt(u), upAt(u) -----
  function straightSeg(p0, p1, meta) {
    const len = V.dist(p0, p1);
    return { kind: 'straight', meta, length: len, p0, p1, pointAt: (u) => V.lerp(p0, p1, u), upAt: () => V.UP };
  }

  // Horizontal arc from p0 with heading h, radius R, sweep (rad), turning dir ('left'|'right').
  // Optional apex lift (cm) with blend fraction and armD (outward arm direction = tilt axis).
  function arcSeg(p0, h, R, sweep, dir, meta, lift = 0, blend = 0.12, armD = null) {
    const left = dir === 'left';
    const c = V.addScaled(p0, left ? V.leftOf(h) : V.rightOf(h), R);
    const e0 = left ? V.rightOf(h) : V.leftOf(h); // centre -> start
    const sgn = left ? -1 : 1;                   // rotY(+) is clockwise = right turn
    const half = sweep / 2;
    const denom = 1 - Math.cos(half);
    let phi = 0, upPlane = V.UP;
    if (lift > 0 && armD) {
      const horizRun = R * (1 - Math.cos(half)); // arc ends to apex, horizontal
      phi = Math.atan2(lift, Math.max(1e-6, horizRun)); // plane tilt angle
      upPlane = V.norm(V.make(-armD.x * Math.sin(phi), Math.cos(phi), -armD.z * Math.sin(phi)));
    }
    const ease = (u) => M.smoothstep(0, blend, u) * M.smoothstep(0, blend, 1 - u);
    const profile = (u) => { const th = u * sweep; return (Math.cos(th - half) - Math.cos(half)) / denom; };
    return {
      kind: 'arc', meta, center: c, radius: R, sweep, dir, phi, upPlane, lift,
      length: R * sweep * (lift > 0 ? 1.03 : 1),
      pointAt(u) {
        const th = u * sweep;
        const p = V.addScaled(c, V.rotY(e0, sgn * th), R);
        p.y = lift > 0 ? lift * profile(u) * ease(u) : 0;
        return p;
      },
      upAt(u) { return lift > 0 ? V.norm(V.lerp(V.UP, upPlane, ease(u))) : V.UP; },
    };
  }

  // ---- build a lobe for one arm: out-turn, out-splay, big arc, in-splay, in-turn ------
  function lobeSegments(arm, cfg, d) {
    const A = ARMS[arm], H = cfg.hubHalf, L = cfg.laneOffset, S = cfg.straightLen, rt = cfg.junctionRadius;
    const b = d.splay, R = d.curveRadius;
    const hOut = V.norm(V.addScaled(V.scale(A.d, Math.cos(b)), A.r, Math.sin(b)));       // heading after the out-turn
    const hInBack = V.norm(V.addScaled(V.scale(A.d, Math.cos(b)), A.r, -Math.sin(b)));   // from the in-turn outward (reverse of arrival heading)
    const aOut = V.addScaled(V.scale(A.d, H), A.r, L);
    const aIn = V.addScaled(V.scale(A.d, H), A.r, -L);
    const outTurn = arcSeg(aOut, A.d, rt, b, 'right', { arm, name: arm + '-out-turn' });
    const e1 = outTurn.pointAt(1);
    const e2 = V.addScaled(e1, hOut, S);
    const e1m = V.addScaled(V.addScaled(aIn, A.d, rt * Math.sin(b)), A.r, -rt * (1 - Math.cos(b))); // mirror of e1
    const e2m = V.addScaled(e1m, hInBack, S);
    const sweep = Math.PI + 2 * b;
    const arc = arcSeg(e2, hOut, R, sweep, 'left', { arm, name: arm + '-lobe' }, cfg.lobeLift, cfg.lobeBlend, A.d);
    const hIn = V.scale(hInBack, -1);
    const inTurn = arcSeg(e1m, hIn, rt, b, 'right', { arm, name: arm + '-in-turn' });
    const c1 = V.dist(arc.pointAt(1), e2m), c2 = V.dist(inTurn.pointAt(1), aIn);
    if (c1 > 0.05 || c2 > 0.05) console.warn('[track] lobe', arm, 'closure error', c1.toFixed(3), c2.toFixed(3));
    return [
      outTurn,
      straightSeg(e1, e2, { arm, name: arm + '-out-splay' }),
      arc,
      straightSeg(e2m, e1m, { arm, name: arm + '-in-splay' }),
      inTurn,
    ];
  }
  // Hub straight: inbound lane of arm X straight through the centre to the outbound lane of the opposite arm.
  function hubSegment(fromArm, cfg) {
    const X = ARMS[fromArm], Y = ARMS[OPPOSITE[fromArm]], H = cfg.hubHalf, L = cfg.laneOffset;
    const aIn = V.addScaled(V.scale(X.d, H), X.r, -L);
    const aOut = V.addScaled(V.scale(Y.d, H), Y.r, L);
    return straightSeg(aIn, aOut, { arm: fromArm + OPPOSITE[fromArm], name: fromArm + '-in-hub-' + OPPOSITE[fromArm] + '-out' });
  }

  // ---- sample a closed list of segments into a path object -------------------
  function buildPath(name, segs) {
    const P = [], T = [], UP = [], RT = [], SEG = [], SS = [];
    let s = 0;
    const milestones = [];
    segs.forEach((seg, si) => {
      const n = Math.max(2, Math.ceil(seg.length / SAMPLE_DS));
      milestones.push({ name: seg.meta.name, s, seg: si });
      let prev = seg.pointAt(0);
      for (let i = 0; i < n; i++) { // exclude u=1: next segment starts there
        const u = i / n;
        const p = seg.pointAt(u);
        if (i > 0) s += V.dist(prev, p);
        prev = p;
        const du = 1 / n;
        const t = V.norm(V.sub(seg.pointAt(Math.min(1, u + du)), seg.pointAt(Math.max(0, u - du))));
        let up = seg.upAt(u);
        let right = V.norm(V.cross(t, up));
        up = V.norm(V.cross(right, t));
        P.push(p); T.push(t); UP.push(up); RT.push(right); SEG.push(si); SS.push(s);
      }
      s += V.dist(prev, seg.pointAt(1));
    });
    const closeGap = V.dist(segs[segs.length - 1].pointAt(1), segs[0].pointAt(0));
    const length = s + closeGap;
    const N = P.length;
    if (closeGap > 0.05) console.warn('[track] circuit', name, 'closure gap', closeGap.toFixed(3));

    function idxFor(sq) {
      const sw = M.wrap(sq, length);
      let lo = 0, hi = N - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (SS[mid] <= sw) lo = mid; else hi = mid - 1; }
      return { i: lo, sw };
    }
    function sample(sq) {
      const { i, sw } = idxFor(sq);
      const j = (i + 1) % N;
      const s0 = SS[i], s1 = j === 0 ? length : SS[j];
      const f = s1 > s0 ? M.clamp((sw - s0) / (s1 - s0), 0, 1) : 0;
      const p = V.lerp(P[i], P[j], f);
      const t = V.norm(V.lerp(T[i], T[j], f));
      let up = V.norm(V.lerp(UP[i], UP[j], f));
      const right = V.norm(V.cross(t, up)); up = V.norm(V.cross(right, t));
      const seg = segs[SEG[i]];
      return { p, t, up, right, bank: Math.asin(M.clamp(right.y, -1, 1)), kind: seg.kind, seg, segIndex: SEG[i], s: sw };
    }
    // Nearest point on the path. hintS narrows the search to +-window cm.
    function project(q, hintS, window = 40) {
      let best = -1, bd = Infinity;
      const scan = (i) => { const dx = P[i].x - q.x, dy = P[i].y - q.y, dz = P[i].z - q.z; const d2 = dx * dx + dy * dy + dz * dz; if (d2 < bd) { bd = d2; best = i; } };
      if (hintS != null) {
        const { i } = idxFor(hintS); const w = Math.ceil(window / SAMPLE_DS);
        for (let k = -w; k <= w; k++) scan(((i + k) % N + N) % N);
        if (Math.sqrt(bd) > 8) { bd = Infinity; best = -1; }
      }
      if (best < 0) for (let i = 0; i < N; i++) scan(i);
      const iA = (best - 1 + N) % N, iB = (best + 1) % N;
      const segA = V.sub(P[iB], P[iA]); const la = V.dot(segA, segA) || 1;
      const f = M.clamp(V.dot(V.sub(q, P[iA]), segA) / la, 0, 1);
      const s = SS[iA] + f * (SAMPLE_DS * 2);
      const fr = sample(s);
      const dq = V.sub(q, fr.p);
      return { s: M.wrap(s, length), lateral: V.dot(dq, fr.right), height: V.dot(dq, fr.up), dist: V.len(dq), frame: fr };
    }
    return { name, length, sample, project, milestones, segments: segs, samples: { P, T, UP, RT, SS, N }, ds: SAMPLE_DS };
  }

  HW.track = {
    ARMS, OPPOSITE,
    build(cfg = HW.config) {
      const d = cfg.derived();
      const ns = buildPath('NS', [hubSegment('S', cfg), ...lobeSegments('N', cfg, d), hubSegment('N', cfg), ...lobeSegments('S', cfg, d)]);
      const ew = buildPath('EW', [hubSegment('W', cfg), ...lobeSegments('E', cfg, d), hubSegment('E', cfg), ...lobeSegments('W', cfg, d)]);
      const circuits = [ns, ew];
      const circuitOfArm = { N: ns, S: ns, E: ew, W: ew };
      const L = cfg.laneOffset;
      // boosters: one wheel per arm, two zones (out lane, in lane)
      const boosters = [], wheels = [];
      for (const arm of ['N', 'E', 'S', 'W']) {
        const A = ARMS[arm];
        const center = V.scale(A.d, cfg.boosterR); center.y = d.foamWheelRadius;
        wheels.push({ arm, center, radius: d.foamWheelRadius });
        for (const lane of ['out', 'in']) {
          const path = circuitOfArm[arm];
          const q = V.addScaled(V.scale(A.d, cfg.boosterR), A.r, lane === 'out' ? L : -L);
          const pr = path.project(q);
          boosters.push({ arm, lane, name: arm + '-' + lane, path, s: pr.s, center, wheelRadius: d.foamWheelRadius, wheelSide: -1 });
        }
      }
      const crossings = [V.make(L, 0, L), V.make(-L, 0, L), V.make(L, 0, -L), V.make(-L, 0, -L)];
      // gates: named start positions = the booster zones; placement backs the car off by its half length.
      const gates = {};
      for (const b of boosters) gates[b.name] = { path: b.path, s: b.s, boosterName: b.name, arm: b.arm, lane: b.lane };
      const lineUp = ['N-out', 'S-out', 'E-out', 'W-out', 'N-in'];
      let minX = 0, maxX = 0, minZ = 0, maxZ = 0, maxY = 0;
      for (const c of circuits) for (const p of c.samples.P) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); maxY = Math.max(maxY, p.y); }
      const track = {
        circuits, circuitOfArm, boosters, wheels, crossings, gates, lineUp,
        crossHalf: d.crossHalf, foamWheelRadius: d.foamWheelRadius, curveRadius: d.curveRadius,
        bounds: { minX, maxX, minZ, maxZ, maxY }, cfg: Object.assign({}, cfg), derived: d,
        inCrossing: (p) => Math.abs(p.x) < d.crossHalf && Math.abs(p.z) < d.crossHalf,
        nearWheel: (p) => wheels.some((w) => V.distXZ(p, w.center) < d.foamWheelRadius + 0.6),
        supports: circuits.flatMap((c) => c.segments.filter((sg) => sg.kind === 'arc' && sg.lift > 0).map((sg) => ({ p: sg.pointAt(0.5), arm: sg.meta.arm }))),
      };
      HW.log('track built', { NS: ns.length.toFixed(1), EW: ew.length.toFixed(1), R: d.curveRadius.toFixed(2), wheelR: d.foamWheelRadius.toFixed(2), footprint: (maxX - minX).toFixed(0) });
      return track;
    },
  };
})(window.HW);
