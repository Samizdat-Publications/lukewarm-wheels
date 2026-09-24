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
  // The arc's half-sweep was hard-coded here at 135 deg (a 270 deg arc) until T27, and with it the
  // two constants it implies: sin(phi) and -cos(phi), which both equal SQRT1_2 at 135, which is why
  // one `K` could stand for both. They are different quantities -- see lobeGeom.

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
  // Given straightLen S, the junction turn's LENGTH and the hub->chord gap follow from closure:
  //   gap          = Lt*Cs + S*cos(beta)               (along the arm)
  //   R*SA - L     = Lt*Ss + S*sin(beta)               (across it)
  // where SA = sin(phi) puts the arc's two ends +-R*SA either side of the arm axis, phi being the
  // arc's HALF-SWEEP.
  // where Cs, Ss are the mean cos/sin of the heading over the turn. For a plain circular arc of
  // radius rt, Cs = sin(beta)/beta and Ss = (1-cos(beta))/beta and those reduce to the old
  // rt*sin(beta) / rt*(1-cos(beta)); the general form is what lets the turn be EASED.
  //
  // THE EASEMENT (T24). The turn used to be a constant-radius arc entered straight from the hub,
  // so the lateral acceleration STEPPED from 0 to ~3 g in one 0.25 cm sample. That is exactly the
  // bug `rampPow` fixed in the vertical plane -- where removing a 2.4 g curvature step took the
  // five-car pile-up from 2-3 crashes to 10 -- and it had never been tried in plan view, even
  // though the junction turn is where 27 % of runs stop dead. `turnEaseFrac` ramps the CURVATURE
  // in and out over that fraction of the turn at each end, like the transition spiral on a
  // railway. It is not free: the same total turn in the same lateral budget means the middle must
  // be tighter, so the minimum radius falls by 1/(1 - 2*ease)... the trade is jerk against peak g,
  // and only the ensemble can say where it lands.
  function turnShape(cfg, beta) {
    // The two ends are separate, because they are not the same problem. The ENTRY meets the flat
    // hub lane at launch speed and is where the step costs something; the EXIT meets a 1 cm
    // straight and then the lobe's own curvature, the other way round, with the car already
    // slower. Easing only the entry costs half the radius penalty of easing both.
    let e0 = M.clamp(cfg.turnEaseFrac || 0, 0, 0.95);
    let e1 = M.clamp(cfg.turnEaseOutFrac == null ? e0 : cfg.turnEaseOutFrac, 0, 0.95);
    if (e0 + e1 > 0.98) { const k = 0.98 / (e0 + e1); e0 *= k; e1 *= k; }   // keep a flat top
    const mean = 1 - (e0 + e1) / 2;
    // curvature shape w(u), normalised so its mean is 1: a trapezoid, flat-topped
    const w = (e0 <= 0 && e1 <= 0) ? () => 1
      : (u) => (e0 > 0 && u < e0 ? u / e0 : e1 > 0 && u > 1 - e1 ? (1 - u) / e1 : 1) / mean;
    const N = 720, du = 1 / N;
    // W = running integral of w (so theta = beta*W), C/S = running integrals of cos/sin(theta)
    const W = new Float64Array(N + 1), C = new Float64Array(N + 1), Sn = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) {                       // trapezoid on w, then on cos/sin
      W[i] = W[i - 1] + du * (w((i - 1) * du) + w(i * du)) / 2;
      const t0 = beta * W[i - 1], t1 = beta * W[i];
      C[i] = C[i - 1] + du * (Math.cos(t0) + Math.cos(t1)) / 2;
      Sn[i] = Sn[i - 1] + du * (Math.sin(t0) + Math.sin(t1)) / 2;
    }
    return { e0, e1, N, C, Sn, Cs: C[N], Ss: Sn[N], wMax: 1 / mean };
  }

  function lobeGeom(arm, cfg) {
    const tilt = HW.units.degToRad(String(cfg.loopArms || 'NE').toUpperCase().includes(arm) ? cfg.loopTiltDeg : cfg.sweepTiltDeg);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const R = cfg.lobeRadius, S = cfg.straightLen, L = cfg.laneOffset;
    // THE ARC'S SWEEP (T27). Fixed at 270 deg until 2026-09-13, and it is the strongest lever the
    // layout has on the junction turn -- the stretch T22 measured as the most expensive on the
    // circuit and T26 watched cars leave the track in. A shorter arc turns the lane through less,
    // so each junction bend turns through less too, and the 1 - cos(beta) in the denominator of rt
    // collapses fast:
    //     sweep   300    285    270    255    240    225
    //     beta   66.1   59.6   52.5   45.0   37.0   28.4  deg
    //     rt      7.7   12.9   20.5   32.3   53.4   98.1  cm     (apex barely moves, 20.5 -> 20.6)
    // Paid for in FOOTPRINT: the hub -> chord gap runs 16.9 -> 23.6 -> 32.9 cm, because a gentler
    // bend needs further to run before it has turned enough.
    const phi = M.clamp(HW.units.degToRad(cfg.lobeSweepDeg || 270) / 2, 0.55 * Math.PI, 0.92 * Math.PI);
    const SA = Math.sin(phi);        // arc end offset from the arm axis, in units of R
    const KC = -Math.cos(phi);       // xi = R*(cos psi + KC) is the in-plane distance from the chord
    // beta is the PLAN angle of the arc's end tangent, which the junction turn must deliver. The
    // travel tangent at psi is (e2 sin psi - r cos psi), whose horizontal part at the arc's start is
    // (d*ct*sin phi - r*cos phi) -- hence atan2(KC, ct*SA). At phi = 135 that is atan2(1, ct), the
    // old closed form.
    const beta = Math.atan2(KC, ct * SA);
    const sb = Math.sin(beta), cb = Math.cos(beta);
    const turn = turnShape(cfg, beta);
    const turnLen = (R * SA - L - S * sb) / turn.Ss;     // length of the junction turn along its own arc
    const gap = turnLen * turn.Cs + S * cb;
    const rt = turnLen / (beta * turn.wMax);             // MINIMUM radius of the turn (its tightest point)
    const RAMP_POW = cfg.rampPow;
    const rampLen = turnLen + S;                         // plan distance, hub gate -> arc end
    // dy/d(plan) where the arc meets the ramp. The ramp MUST arrive at exactly this slope or the
    // joint is a kink. The old closed form st/hypot(ct,1) is only the phi = 135 deg case: in
    // general the arc's plan speed at psi is R*sqrt(cos^2 psi + ct^2 sin^2 psi) while its climb
    // rate is R*st*sin psi, so the slope at the end is st*SA/sqrt(KC^2 + ct^2*SA^2). At phi = 135
    // that reduces exactly (both KC^2 and SA^2 are 1/2, so the 1/sqrt2 cancels).
    // Getting this wrong at sweep 248 left the ramp arriving at slope 0.509 where the arc starts at
    // 0.630 -- a 5.2 deg kink, which tools/audit.mjs read as 0.2247 /cm of pitch curvature, i.e.
    // 20.6 g at 300 cm/s. Self-test check 2's heading-continuity test catches it.
    const tanSigma = st * SA / Math.hypot(KC, ct * SA);
    // Height profile of a ramp is y0 * t^rampPow with t = plan fraction, so y'(1) = pow*y0/rampLen
    // must equal tan(sigma). The exponent decides where the vertical curvature sits: at 2 it is
    // CONSTANT, which means it jumps from nothing to 2*y0/rampLen^2 the instant the car leaves the
    // flat hub -- a step of 2.4 g at 300 cm/s that every vehicle model rings on. At 3 or more the
    // curvature starts at zero and builds, and the chord also sits lower (y0 scales as 1/pow), so
    // the whole lobe is easier to climb.
    const y0 = rampLen * tanSigma / RAMP_POW;            // height of the arc's chord above the hub
    const apex = y0 + R * (1 + KC) * st;
    const rampArc = Math.hypot(rampLen, y0 * 0.72); // ~3D length of the ramp
    return { tilt, ct, st, R, S, beta, rt, turn, turnLen, gap, rampLen, rampArc, tanSigma, y0, apex,
      phi, SA, KC, pow: RAMP_POW, sigma: Math.atan(tanSigma) };
  }

  // Ramp: junction turn of `beta` at radius rt, then a straight of length S, carrying the height
  // from 0 to g.y0 and the surface roll from flat to the lobe's plane normal. `dirSign` +1 builds
  // it outbound from the hub gate; -1 builds the inbound mirror (traversed hub-ward, so u runs
  // from the arc end back to the gate).
  function rampSeg(g, gate, d, r, meta, outbound, rollFrac, bankOf) {
    const nPlane = V.norm(V.make(-d.x * g.st, g.ct, -d.z * g.st)); // lobe plane normal
    const turnLen = g.turnLen, TS = g.turn;
    const side = outbound ? 1 : -1;   // outbound turns toward +r; inbound arrives from -r
    const rr = V.scale(r, side);
    // The turn is integrated, not drawn: TS.C/TS.Sn are the running integrals of cos/sin of the
    // heading against arc length, so the position at fraction u is turnLen*(C[u], Sn[u]) in the
    // (d, rr) frame. With turnEaseFrac 0 that reproduces the circular arc exactly.
    const at = (u) => {
      const x = M.clamp(u, 0, 1) * TS.N, i = Math.min(TS.N - 1, Math.floor(x)), f = x - i;
      return { c: TS.C[i] + (TS.C[i + 1] - TS.C[i]) * f, s: TS.Sn[i] + (TS.Sn[i + 1] - TS.Sn[i]) * f };
    };
    // plan position at plan-distance p measured from the gate
    function planAt(p) {
      if (p <= turnLen) {
        const q = at(p / turnLen);
        return V.addScaled(V.addScaled(gate, d, turnLen * q.c), rr, turnLen * q.s);
      }
      const base = V.addScaled(V.addScaled(gate, d, turnLen * TS.Cs), rr, turnLen * TS.Ss);
      const h = V.addScaled(V.scale(d, Math.cos(g.beta)), rr, Math.sin(g.beta));
      return V.addScaled(base, h, p - turnLen);
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
      // The ramp carries the BANK in as well, on exactly the same schedule as the tilt roll and by
      // exactly the same construction as the arc, so the two segments share a surface frame at the
      // joint by construction. Ramping the tilt while the arc arrived already banked left an 8.9 deg
      // STEP in the surface at the joint, and a car crossing a step mid-corner at 300 cm/s stops
      // dead (measured 2026-09-10: coast reached s=172 unbanked, s=49 banked).
      bankAt: !bankOf ? null : (u) => bankOf((outbound ? u : 1 - u) * g.rampArc),
    };
  }

  // The lobe proper: a circle of radius R lying in a plane tilted by `tilt` about the horizontal
  // chord through its two ends. psi runs +135 -> -135 deg (270 deg) through 0 at the far point.
  //   xi(psi) = R*(cos psi + cos45)   is the in-plane distance from the chord, so xi = 0 at both ends
  //   P       = chordMid + d*(xi*cos tilt) + r*(R sin psi) + up*(y0 + xi*sin tilt)
  // The surface normal is the plane normal everywhere: no twist, no blend, nothing to tune.
  function tiltArcSeg(g, chordMid, d, r, meta, bankOf, bankBlendCm, rollFrac, bankProfile) {
    const sweep = 2 * g.phi;
    const arcLen = g.R * sweep;
    const nPlane = V.norm(V.make(-d.x * g.st, g.ct, -d.z * g.st));
    const bankBlend = M.clamp(bankBlendCm / arcLen, 0.05, 0.5);
    const psiAt = (u) => g.phi - sweep * u;
    return {
      kind: 'arc', meta, deepWall: true, radius: g.R, sweep, tilt: g.tilt, nPlane, apex: g.apex,
      length: g.R * sweep,
      // BANKED CHANNEL. The lobe is not a flat plane with a groove cut in it: the groove itself is
      // banked, so the surface is a shallow CONE about the circle's axis and the wheels carry part
      // of the corner instead of handing all of it to the outer wall. Positive bank raises the
      // OUTER (right-hand) edge, which is the correct sense for this left-turning arc.
      // It rides the SAME roll schedule as the tilt: the first attempt eased the bank over 12 % of
      // the arc (9 cm), which is 3.3 deg/cm at 30 deg -- above the 2.5 deg/cm a rigid four-wheel car
      // can follow, and on top of the tilt roll. That is why banking used to measure catastrophic.
      // It must start from ZERO at each joint: the ramps carry no bank, so sharing the tilt's roll
      // schedule left an 8.9 deg STEP in the surface at the ramp -> arc joint and cars stopped dead
      // there (coast: reached s=172 unbanked, s=49 at any bank, then rolled back down).
      // 'cone': the bank is CONSTANT over the whole arc, so the surface is exactly a cone about
      // the circle's axis -- zero twist, and present where the car is FASTEST. 'centre' is the
      // 2026-09-10 version that eased the bank to zero at both joints; it measured monotonically
      // worse for a findable reason: it removed the bank exactly at the arc entry, where the car
      // is at launch speed and the cornering demand is highest, and kept it only near the apex
      // where the car is slowest and a bank it cannot hold just drops it onto the inner wall.
      bankAt: !bankOf ? null : bankProfile === 'centre'
        ? (u) => bankOf(g.rampArc + u * arcLen, u) * M.smoothstep(0, bankBlend, u) * M.smoothstep(0, bankBlend, 1 - u)
        // The arc's roll distance is measured from whichever joint is nearer, so the schedule is
        // symmetric and the far ramp picks it up unchanged.
        : (u) => bankOf(g.rampArc + Math.min(u, 1 - u) * arcLen, u),
      pointAt(u) {
        const psi = psiAt(u), xi = g.R * (Math.cos(psi) + g.KC);
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
    // BANK. Along the arc, `right` is exactly the OUTWARD radial of the circle (write the tangent
    // and the plane normal in the plane's own basis and it falls out), so rolling the cross-section
    // about the tangent by b turns the surface normal b degrees toward the circle's CENTRE.
    // This is the most important number in the layout. At b = 0 the lobe is a flat ribbon lying in
    // a tilted plane, and such a surface cannot corner AT ALL -- the centre of the circle is in the
    // plane, so the direction the car must be pushed lies in the plane, and the surface normal is
    // perpendicular to it. Every one of the 2.5-5.7 g is then handed to the side wall. At b = 90 deg
    // the lobe is a genuine LOOP: the car rides the inside of the ring and the FLOOR supplies
    // v^2/R, which is how the instruction sheet draws it (a car is inverted at the apex of each
    // rear ring). In between it is a cone -- a banked channel.
    // Both ramps carry the same bank in on the same roll schedule and by the same construction as
    // the arc, so every joint is continuous by construction rather than by coincidence.
    // ONE bank schedule for the whole lobe, as a function of path distance p from the hub gate
    // (and, on the arc, of the arc parameter u). Both ramps and the arc call it, so every joint is
    // continuous by construction.
    //   * Through the JUNCTION TURN the bend is the other way round -- `right` there points AT the
    //     centre of the turn, not away from it -- so its bank is NEGATIVE in this convention. The
    //     lane leaves the hub, swings out, then curls back round the lobe: an S-bend, and a real
    //     road reverses its camber through one. The junction turn is a ~20 cm radius taken at the
    //     highest speed of the lap (5.4 g) and is the single most expensive stretch on the circuit.
    //   * Along the ARC the ideal bank tracks v^2/(R g), and v is highest at the two ends and
    //     lowest at the apex, so the bank eases from `lobeBankDeg` at the ends toward
    //     `lobeBankApexDeg` at the apex rather than being one compromise angle.
    const turnBank = HW.units.degToRad(cfg.turnBankDeg || 0);
    const bankEnd = HW.units.degToRad(cfg.lobeBankDeg || 0);
    const bankApex = HW.units.degToRad(cfg.lobeBankApexDeg == null ? cfg.lobeBankDeg : cfg.lobeBankApexDeg);
    const anyBank = turnBank || bankEnd || bankApex;
    const bankOf = !anyBank ? null : (p, u) => {
      const f = rollFrac(p);                                   // 0 at the hub gate, 1 once rolled in
      const rise = M.smoothstep(0, 1, M.clamp(p / Math.max(0.01, cfg.turnBlendCm), 0, 1));
      const target = u == null ? bankEnd : bankEnd + (bankApex - bankEnd) * Math.sin(Math.PI * u);
      return (-turnBank * (1 - f) + target * f) * rise;
    };
    const out = rampSeg(g, aOut, A.d, A.r, { arm, name: arm + '-out-ramp' }, true, rollFrac, bankOf);
    const arc = tiltArcSeg(g, chordMid, A.d, A.r, { arm, name: arm + '-lobe' }, bankOf, cfg.bankBlendCm, rollFrac, cfg.lobeBankProfile);
    const back = rampSeg(g, aIn, A.d, A.r, { arm, name: arm + '-in-ramp' }, false, rollFrac, bankOf);
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
