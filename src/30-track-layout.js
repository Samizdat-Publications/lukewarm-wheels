// 30-track-layout.js — lane geometry of the Criss Cross Crash set (SPEC s5).
//
// ARCHITECTURE (re-derived 2026-09-08 from the V2791 instruction sheet, docs/V2791-half1.png
// CONTENTS page). The set ships FOUR IDENTICAL large curved track pieces -- each a single
// moulded ~270 deg arc of a circle -- and FOUR IDENTICAL adjustable "TRACK SUPPORT" ladders.
// So the four lobes are the SAME PART; what differs between the two rear lobes (which read as
// upright rings in the photos) and the two front lobes (wide flat teardrops) is only which rung
// of the ladder the arc is clipped to.
//
// Each lobe is therefore a FLAT CIRCLE TILTED OUT OF THE HORIZONTAL by `tilt`, hinged about the
// horizontal chord joining its two ends. It is a wall-of-death ring, NOT a loop-the-loop: the
// track surface normal is the (constant) plane normal, and the car is held on the circle by the
// outer wall against v^2/R, which at R=16 cm and 300 cm/s is ~5.7 g against 1 g of gravity.
// A tilted circle projects to an ELLIPSE in plan (semi-axes R across the arm, R*cos(tilt) along
// it), which is exactly why the steep rear lobes have a small plan footprint and the shallow
// front ones a large one, and why the whole set fits in ~110 cm.
//
// Two independent closed circuits (NS and EW) cross in the hub at four points. Each arm carries
// one outbound lane (right of the outward heading, +laneOffset) and one inbound lane (-laneOffset).
// Each circuit gets ONE steep lobe and ONE shallow one (arms N,E are rings; S,W are sweeps), which
// is how the instruction sheet has it: the two rings are adjacent, not opposite.
//
// Lobe = out-ramp (junction turn + straight, rising and rolling from flat to `tilt`),
//        tilted arc (270 deg, constant surface normal),
//        in-ramp (mirror, falling back to flat at the hub).
// The ramps are the flexible orange track: all of the height and roll change lives there, so the
// arc itself is exactly planar and the car never meets a twist while cornering.
(function (HW) {
  const V = HW.V, M = HW.math;
  const SAMPLE_DS = 0.25; // cm between path samples
  const K = Math.SQRT1_2; // cos 45 deg = sin 135 deg
  const HALF_SWEEP = 0.75 * Math.PI; // 135 deg; the arc spans +135 -> -135 through 0

  const ARMS = {
    N: { d: V.make(0, 0, -1) }, E: { d: V.make(1, 0, 0) },
    S: { d: V.make(0, 0, 1) },  W: { d: V.make(-1, 0, 0) },
  };
  for (const k in ARMS) ARMS[k].r = V.rightOf(ARMS[k].d), ARMS[k].name = k;
  const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };

  // ---- segment primitives: each has length estimate, pointAt(u), upAt(u) -----
  function straightSeg(p0, p1, meta) {
    const len = V.dist(p0, p1);
    return { kind: 'straight', meta, length: len, p0, p1, deepWall: false, pointAt: (u) => V.lerp(p0, p1, u), upAt: () => V.UP };
  }

  // Per-arm lobe geometry, solved from the physical constants.
  //   R      = lobeRadius, the moulded arc's radius (one part, four times)
  //   tilt   = plane tilt of that lobe (which rung of the track support)
  //   beta   = plan angle between the arm axis and the arc's end tangent. For a tilted circle the
  //            plan tangent at the ends is (cos(tilt)*d + r), so beta = atan(1/cos(tilt)) -- 45 deg
  //            only when the lobe is flat. The junction turn must deliver exactly this heading.
  //   sigma  = climb angle of the arc at its ends; the ramps must arrive at this slope.
  // Given straightLen S, the junction radius and the hub->chord gap follow from closure:
  //   gap        = rt*sin(beta) + S*cos(beta)          (along the arm)
  //   K*R - L    = rt*(1-cos(beta)) + S*sin(beta)      (across it)
  function lobeGeom(arm, cfg) {
    const tilt = HW.units.degToRad(String(cfg.loopArms || 'NE').toUpperCase().includes(arm) ? cfg.loopTiltDeg : cfg.sweepTiltDeg);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const R = cfg.lobeRadius, S = cfg.straightLen, L = cfg.laneOffset;
    const beta = Math.atan2(1, ct);
    const sb = Math.sin(beta), cb = Math.cos(beta);
    const rt = (K * R - L - S * sb) / (1 - cb);
    const gap = rt * sb + S * cb;
    const RAMP_POW = cfg.rampPow;
    const rampLen = rt * beta + S;                       // plan distance, hub gate -> arc end
    const tanSigma = st / Math.hypot(ct, 1);             // dy/d(plan) at the arc end
    // Height profile of a ramp is y0 * t^rampPow with t = plan fraction, so y'(1) = pow*y0/rampLen
    // must equal tan(sigma). The exponent decides where the vertical curvature sits: at 2 it is
    // CONSTANT, which means it jumps from nothing to 2*y0/rampLen^2 the instant the car leaves the
    // flat hub -- a step of 2.4 g at 300 cm/s that every vehicle model rings on. At 3 or more the
    // curvature starts at zero and builds, and the chord also sits lower (y0 scales as 1/pow), so
    // the whole lobe is easier to climb.
    const y0 = rampLen * tanSigma / RAMP_POW;            // height of the arc's chord above the hub
    const apex = y0 + R * (1 + K) * st;
    const rampArc = Math.hypot(rampLen, y0 * 0.72); // ~3D length of the ramp
    return { tilt, ct, st, R, S, beta, rt, gap, rampLen, rampArc, tanSigma, y0, apex, pow: RAMP_POW, sigma: Math.atan(tanSigma) };
  }

  // Ramp: junction turn of `beta` at radius rt, then a straight of length S, carrying the height
  // from 0 to g.y0 and the surface roll from flat to the lobe's plane normal. `dirSign` +1 builds
  // it outbound from the hub gate; -1 builds the inbound mirror (traversed hub-ward, so u runs
  // from the arc end back to the gate).
  function rampSeg(g, gate, d, r, meta, outbound, rollFrac) {
    const nPlane = V.norm(V.make(-d.x * g.st, g.ct, -d.z * g.st)); // lobe plane normal
    const turnLen = g.rt * g.beta;
    const side = outbound ? 1 : -1;   // outbound turns toward +r; inbound arrives from -r
    const rr = V.scale(r, side);
    // plan position at plan-distance p measured from the gate
    function planAt(p) {
      if (p <= turnLen) {
        const th = p / g.rt;
        return V.addScaled(V.addScaled(gate, d, g.rt * Math.sin(th)), rr, g.rt * (1 - Math.cos(th)));
      }
      const th = g.beta, s = p - turnLen;
      const base = V.addScaled(V.addScaled(gate, d, g.rt * Math.sin(th)), rr, g.rt * (1 - Math.cos(th)));
      const h = V.addScaled(V.scale(d, Math.cos(th)), rr, Math.sin(th));
      return V.addScaled(base, h, s);
    }
    return {
      kind: 'ramp', meta, deepWall: true, tilt: g.tilt, rampLen: g.rampLen, y0: g.y0, nPlane,
      length: g.rampArc,
      pointAt(u) {
        const t = outbound ? u : 1 - u;
        const p = planAt(t * g.rampLen);
        p.y = g.y0 * Math.pow(t, g.pow);
        return p;
      },
      upAt(u) {
        const t = outbound ? u : 1 - u;
        return V.norm(V.lerp(V.UP, nPlane, rollFrac(t * g.rampArc)));
      },
    };
  }

  // The lobe proper: a circle of radius R lying in a plane tilted by `tilt` about the horizontal
  // chord through its two ends. psi runs +135 -> -135 deg (270 deg) through 0 at the far point.
  //   xi(psi) = R*(cos psi + cos45)   is the in-plane distance from the chord, so xi = 0 at both ends
  //   P       = chordMid + d*(xi*cos tilt) + r*(R sin psi) + up*(y0 + xi*sin tilt)
  // The surface normal is the plane normal everywhere: no twist, no blend, nothing to tune.
  function tiltArcSeg(g, chordMid, d, r, meta, bankDeg, rollFrac) {
    const sweep = 2 * HALF_SWEEP;
    const arcLen = g.R * 2 * HALF_SWEEP;
    const nPlane = V.norm(V.make(-d.x * g.st, g.ct, -d.z * g.st));
    const bankMax = HW.units.degToRad(bankDeg || 0);
    const psiAt = (u) => HALF_SWEEP - sweep * u;
    return {
      kind: 'arc', meta, deepWall: true, radius: g.R, sweep, tilt: g.tilt, nPlane, apex: g.apex,
      length: g.R * sweep,
      bankAt: bankMax === 0 ? null : (u) => bankMax * M.smoothstep(0, 0.12, u) * M.smoothstep(0, 0.12, 1 - u),
      pointAt(u) {
        const psi = psiAt(u), xi = g.R * (Math.cos(psi) + K);
        const p = V.addScaled(V.addScaled(chordMid, d, xi * g.ct), r, g.R * Math.sin(psi));
        p.y = g.y0 + xi * g.st;
        return p;
      },
      // The roll eases in over the ramp AND the first `rollBlendCm` of the arc, and out again at the
      // far end: the centreline stays exactly on the tilted circle, but the ribbon twists into the
      // plane the way a flexible connector does. Without this the whole tilt has to happen in the
      // ~17 cm ramp, which warps the surface faster than the car's suspension travel can follow --
      // the front wheels unload, the car rides one wheel into the wall and departs at s~34.
      upAt(u) {
        const f = Math.min(rollFrac(g.rampArc + u * arcLen), rollFrac(g.rampArc + (1 - u) * arcLen));
        return f >= 0.999 ? nPlane : V.norm(V.lerp(V.UP, nPlane, f));
      },
    };
  }

  // ---- build a lobe for one arm: out-ramp, tilted arc, in-ramp ---------------
  function lobeSegments(arm, cfg) {
    const A = ARMS[arm], H = cfg.hubHalf, L = cfg.laneOffset;
    const g = lobeGeom(arm, cfg);
    const aOut = V.addScaled(V.scale(A.d, H), A.r, L);
    const aIn = V.addScaled(V.scale(A.d, H), A.r, -L);
    const chordMid = V.scale(A.d, H + g.gap);
    // One roll schedule for the whole lobe, in path distance from the hub gate. The tilt cannot all
    // be done inside the ramp: a rigid four-wheel car with `suspTravel` of travel across a `trackCm`
    // wide axle can only follow about 2.6 deg/cm of surface warp, so 45 deg needs >= 17 cm and the
    // ramp is barely that. `rollBlendCm` buys the rest from the first part of the arc.
    const D = g.rampArc + cfg.rollBlendCm;
    const rollFrac = (p) => M.smoothstep(0, 1, M.clamp(p / D, 0, 1));
    const out = rampSeg(g, aOut, A.d, A.r, { arm, name: arm + '-out-ramp' }, true, rollFrac);
    const arc = tiltArcSeg(g, chordMid, A.d, A.r, { arm, name: arm + '-lobe' }, cfg.lobeBankDeg, rollFrac);
    const back = rampSeg(g, aIn, A.d, A.r, { arm, name: arm + '-in-ramp' }, false, rollFrac);
    const c1 = V.dist(out.pointAt(1), arc.pointAt(0)), c2 = V.dist(arc.pointAt(1), back.pointAt(0));
    if (c1 > 0.05 || c2 > 0.05) console.warn('[track] lobe', arm, 'closure error', c1.toFixed(3), c2.toFixed(3));
    return { segs: [out, arc, back], geom: g };
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
        if (seg.bankAt) {                      // roll the cross-section about the tangent
          const bk = seg.bankAt(u);
          if (bk !== 0) {
            const cb = Math.cos(bk), sb = Math.sin(bk);
            up = V.norm(V.sub(V.scale(up, cb), V.scale(right, sb)));
            right = V.norm(V.cross(t, up));
            up = V.norm(V.cross(right, t));
          }
        }
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
    ARMS, OPPOSITE, lobeGeom,
    build(cfg = HW.config) {
      const d = cfg.derived();
      const lobes = {};
      for (const arm of ['N', 'E', 'S', 'W']) lobes[arm] = lobeSegments(arm, cfg);
      const ns = buildPath('NS', [hubSegment('S', cfg), ...lobes.N.segs, hubSegment('N', cfg), ...lobes.S.segs]);
      const ew = buildPath('EW', [hubSegment('W', cfg), ...lobes.E.segs, hubSegment('E', cfg), ...lobes.W.segs]);
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
        circuits, circuitOfArm, boosters, wheels, crossings, gates, lineUp, lobes,
        crossHalf: d.crossHalf, foamWheelRadius: d.foamWheelRadius, curveRadius: cfg.lobeRadius,
        bounds: { minX, maxX, minZ, maxZ, maxY }, cfg: Object.assign({}, cfg), derived: d,
        inCrossing: (p) => Math.abs(p.x) < d.crossHalf && Math.abs(p.z) < d.crossHalf,
        nearWheel: (p) => wheels.some((w) => V.distXZ(p, w.center) < d.foamWheelRadius + 0.6),
        // the track support clips to the arc at its apex; the renderer drops a post from there
        supports: ['N', 'E', 'S', 'W'].map((arm) => {
          const sg = lobes[arm].segs[1];
          return { p: sg.pointAt(0.5), arm, tiltDeg: HW.units.radToDeg(sg.tilt) };
        }),
      };
      HW.log('track built', {
        NS: ns.length.toFixed(1), EW: ew.length.toFixed(1), R: cfg.lobeRadius,
        footprint: (maxX - minX).toFixed(0) + ' x ' + (maxZ - minZ).toFixed(0), maxY: maxY.toFixed(1),
        lobes: Object.fromEntries(['N', 'E', 'S', 'W'].map((a) => [a, {
          tilt: HW.units.radToDeg(lobes[a].geom.tilt).toFixed(0), rt: lobes[a].geom.rt.toFixed(1),
          gap: lobes[a].geom.gap.toFixed(1), apex: lobes[a].geom.apex.toFixed(1),
        }])),
      });
      return track;
    },
  };
})(window.HW);
