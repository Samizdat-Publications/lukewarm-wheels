// 31-track-pieces.js - the generic track pieces a set is written in, like snapping real
// orange track together: a run starts at a pose (a point and a heading) and each piece
// carries the pose on to where the next one starts.
//
// Every piece meets the next at ZERO curvature with a matching tangent, so the whole run is
// G2 (curvature-continuous) by construction: straights are exact lines, and anything that
// turns is a quintic Hermite whose ends are flat. The two free handle lengths of each
// quintic are chosen for minimum bending energy (the same fairness rule as the V2791
// lobes), so a 90 degree bend comes out as the smooth clothoid-like curve a moulded piece
// would have, not a circle with a curvature step at each end.
//
// Conventions: heading is a compass angle in degrees (0 = north = -Z, 90 = east = +X);
// pitch is degrees nose-up; a bend's angle is positive to the LEFT (anticlockwise from
// above). Lengths and radii in cm.
(function (HW) {
  const D2R = Math.PI / 180;

  // ------------------------------------------------------------ quintic Hermite basis
  const Hb = (t) => { const t2 = t * t, t3 = t2 * t, t4 = t3 * t, t5 = t4 * t;
    return [1 - 10 * t3 + 15 * t4 - 6 * t5, t - 6 * t3 + 8 * t4 - 3 * t5, 0.5 * t2 - 1.5 * t3 + 1.5 * t4 - 0.5 * t5, 0.5 * t3 - t4 + 0.5 * t5, -4 * t3 + 7 * t4 - 3 * t5, 10 * t3 - 15 * t4 + 6 * t5]; };
  const dHb = (t) => { const t2 = t * t, t3 = t2 * t, t4 = t3 * t;
    return [-30 * t2 + 60 * t3 - 30 * t4, 1 - 18 * t2 + 32 * t3 - 15 * t4, t - 4.5 * t2 + 6 * t3 - 2.5 * t4, 1.5 * t2 - 4 * t3 + 2.5 * t4, -12 * t2 + 28 * t3 - 15 * t4, 30 * t2 - 60 * t3 + 30 * t4]; };
  const ddHb = (t) => { const t2 = t * t, t3 = t2 * t;
    return [-60 * t + 180 * t2 - 120 * t3, -36 * t + 96 * t2 - 60 * t3, 1 - 9 * t + 18 * t2 - 10 * t3, 3 * t - 12 * t2 + 10 * t3, -24 * t + 84 * t2 - 60 * t3, 60 * t - 180 * t2 + 120 * t3]; };
  const comb = (B, C) => [0, 1, 2].map((k) => B[0] * C[0][k] + B[1] * C[1][k] + B[2] * C[2][k] + B[3] * C[3][k] + B[4] * C[4][k] + B[5] * C[5][k]);

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

  // curvature statistics of a quintic control net, sampled n times
  function quinticStats(C, n) {
    let E = 0, J = 0, kmax = 0, L = 0, ymin = 1e9, prevK = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n, d1 = comb(dHb(t), C), d2 = comb(ddHb(t), C), P = comb(Hb(t), C);
      const sp = Math.hypot(d1[0], d1[1], d1[2]);
      const cx = d1[1] * d2[2] - d1[2] * d2[1], cy = d1[2] * d2[0] - d1[0] * d2[2], cz = d1[0] * d2[1] - d1[1] * d2[0];
      const k = Math.hypot(cx, cy, cz) / (sp * sp * sp), ds = sp / n;
      E += k * k * ds; L += ds; if (k > kmax) kmax = k; if (P[1] < ymin) ymin = P[1];
      if (prevK != null) J += ((k - prevK) / ds) ** 2 * ds; prevK = k;
    }
    return { E, J, kmax, L, ymin };
  }

  // ------------------------------------------------------------ small vector helpers
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  // rotate v about unit axis k by angle a (Rodrigues)
  const rot = (v, k, a) => {
    const c = Math.cos(a), s = Math.sin(a), kd = k[0] * v[0] + k[1] * v[1] + k[2] * v[2], kx = cross(k, v);
    return [v[0] * c + kx[0] * s + k[0] * kd * (1 - c), v[1] * c + kx[1] * s + k[1] * kd * (1 - c), v[2] * c + kx[2] * s + k[2] * kd * (1 - c)];
  };
  const UP = [0, 1, 0];
  const dirOf = (headingDeg, pitchDeg = 0) => {
    const h = headingDeg * D2R, p = pitchDeg * D2R;
    return [Math.sin(h) * Math.cos(p), Math.sin(p), -Math.cos(h) * Math.cos(p)];
  };
  // the horizontal axis a nose-up pitch turns about (the car's right); for a vertical
  // tangent fall back to a supplied right vector
  const pitchAxis = (t, fallback) => { const a = cross(t, UP); return Math.hypot(a[0], a[1], a[2]) > 1e-6 ? norm(a) : fallback; };

  // ------------------------------------------------------------ fair joins
  // The fairest quintic from pose A to pose B: two handle lengths chosen for minimum
  // bending energy plus a curvature-rate term. Each end has zero curvature unless a
  // curvature vector is given (opts.kA, opts.kB, 1/cm), which is how a straight eases into
  // a helix: position, tangent AND curvature match, so the join is G2. Cached.
  const cache = new Map();
  function fairJoin(A, tA, B, tB, opts = {}) {
    const key = JSON.stringify([A, tA, B, tB, opts.floorY, opts.kA, opts.kB]).replace(/(\.\d{6})\d+/g, '$1');
    if (cache.has(key)) return cache.get(key);
    const chord = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    const kA = opts.kA || [0, 0, 0], kB = opts.kB || [0, 0, 0];
    const ctrlOf = (a, b) => [A, sc(tA, a), sc(kA, a * a), sc(kB, b * b), sc(tB, b), B];
    const floorY = opts.floorY;
    const cost = (q) => {
      if (q[0] < 0.2 * chord || q[1] < 0.2 * chord || q[0] > 5 * chord + 30 || q[1] > 5 * chord + 30) return 1e9;
      const s = quinticStats(ctrlOf(q[0], q[1]), 80);
      return s.E * chord + 2 * s.J * chord * chord * chord + (floorY != null && s.ymin < floorY ? (floorY - s.ymin) ** 2 * 100 : 0);
    };
    let best = null;
    for (const f0 of [0.8, 1.3]) {
      const r = nelderMead(cost, [chord * f0, chord * f0], [chord * 0.25, chord * 0.25], 260);
      if (!best || r.f < best.f) best = r;
    }
    const C = ctrlOf(best.x[0], best.x[1]), st = quinticStats(C, 400);
    const out = { ctrl: C, minR: 1 / Math.max(st.kmax, 1e-9), len: st.L };
    cache.set(key, out);
    return out;
  }

  // ------------------------------------------------------------ piece types
  // Each type: (piece, pose, ctx) -> { segs, pose } ; pose = { p, t, right }
  const T = {};

  T.straight = (pc, pose) => {
    const B = add(pose.p, sc(pose.t, pc.len));
    return { segs: [HW.Path.line(pose.p, B, {})], pose: { p: B, t: pose.t, right: pose.right } };
  };

  // a turn in plan: the tangent swings about the vertical by `angle` (+ left), keeping its pitch
  T.bend = (pc, pose, ctx) => {
    const a = pc.angle * D2R, R = pc.radius;
    const th = [pose.t[0], 0, pose.t[2]], hl = Math.hypot(th[0], th[2]) || 1, tH = [th[0] / hl, 0, th[2] / hl];
    const left = cross(UP, tH);
    const arc = R * Math.abs(a);
    const off = add(sc(tH, R * Math.sin(Math.abs(a))), sc(left, Math.sign(a) * R * (1 - Math.cos(a))));
    const B = add(add(pose.p, off), [0, pose.t[1] / hl * arc, 0]);
    const tB = rot(pose.t, UP, a);
    const j = fairJoin(pose.p, pose.t, B, tB, { floorY: ctx.floorY });
    return { segs: [HW.Path.quintic(...j.ctrl, {})], pose: { p: B, t: tB, right: norm(rot(pose.right, UP, a)) } };
  };

  // a turn in elevation: nose up (+) or down (-) by `angle` about the car's right axis
  T.pitch = (pc, pose, ctx) => {
    const a = pc.angle * D2R, R = pc.radius;
    const ax = pitchAxis(pose.t, pose.right);
    const n = cross(ax, pose.t);                       // where a nose-up turn heads
    const off = add(sc(pose.t, R * Math.sin(Math.abs(a))), sc(n, Math.sign(a) * R * (1 - Math.cos(a))));
    const B = add(pose.p, off), tB = rot(pose.t, ax, a);
    const j = fairJoin(pose.p, pose.t, B, tB, { floorY: ctx.floorY });
    return { segs: [HW.Path.quintic(...j.ctrl, {})], pose: { p: B, t: tB, right: ax } };
  };

  // a fair join to an absolute pose: { to: [x,y,z], heading, pitch }
  T.join = (pc, pose, ctx) => {
    const B = pc.to, tB = dirOf(pc.heading, pc.pitch || 0);
    const j = fairJoin(pose.p, pose.t, B, tB, { floorY: ctx.floorY });
    return { segs: [HW.Path.quintic(...j.ctrl, {})], pose: { p: B, t: tB, right: pitchAxis(tB, pose.right) } };
  };

  // ------------------------------------------------------------ helix pieces
  // One construction for three pieces. The car turns toward `side` about an axis `a`
  // (unit, perpendicular to the entry tangent t), on a helix of radius r that advances b per
  // radian along a. A clothoid-like quintic eases in from the straight (curvature ramping
  // 0 -> 1/r over `lead`), the exact helix runs for `turns`, and a mirrored quintic eases
  // out onto a straight. loop: side = up, a = left (a vertical loop, offset sideways so the
  // exit clears the entry). corkscrew: a small loop with a big sideways advance, so the car
  // rolls right over while it crosses. spiral: side = left or right, a = down (a helter-
  // skelter, the table-leg descent).
  function clothoidEnd(r, L) {
    // end of a curve whose curvature ramps linearly from 0 to 1/r over length L (in its plane)
    let x = 0, y = 0; const n = 200, ds = L / n;
    for (let i = 0; i < n; i++) { const s = (i + 0.5) * ds, ph = s * s / (2 * r * L); x += Math.cos(ph) * ds; y += Math.sin(ph) * ds; }
    return { x, y, phi: L / (2 * r) };
  }
  function helixRun(pose, ctx, { side, axis, r, b, turns, lead, meta }) {
    const t = pose.t, L = lead == null ? 1.2 * r : lead;
    const ce = clothoidEnd(r, L), th0 = ce.phi, thE = 2 * Math.PI * turns, th1 = thE - th0;
    // helix bottom (th = 0) so that its point at th0 is where the ease-in curve ends
    const B = add(add(pose.p, sc(t, ce.x - r * Math.sin(th0))), sc(side, ce.y - r * (1 - Math.cos(th0))));
    const c = add(B, sc(side, r)), e1 = sc(side, -1), e2 = t;
    const hx = HW.Path.helix(c, e1, e2, axis, r, b, th0, th1, Object.assign({}, meta));
    const P = [0, 0, 0], D1 = [0, 0, 0], D2 = [0, 0, 0];
    const at = (th) => {
      hx.point(th, P, D1, D2);
      const sp2 = D1[0] * D1[0] + D1[1] * D1[1] + D1[2] * D1[2], tt = norm(D1);
      return { p: P.slice(), t: tt, k: sc(D2, 1 / sp2) };          // D2 is normal to D1 on a helix
    };
    const h0 = at(th0), h1 = at(th1);
    // the exit mirrors the entry about the helix's last "bottom" (th = thE)
    const cs = Math.cos(thE), sn = Math.sin(thE);
    const inE = sc(add(sc(e1, cs), sc(e2, sn)), -1);             // toward the axis at thE
    const tE = norm(add(sc(e1, -sn), sc(e2, cs)));                // the helix direction there, less its advance
    const BE = add(add(c, sc(add(sc(e1, cs), sc(e2, sn)), r)), sc(axis, b * thE));
    const E = add(add(BE, sc(tE, ce.x - r * Math.sin(th0))), sc(inE, -(ce.y - r * (1 - Math.cos(th0)))));
    const j0 = fairJoin(pose.p, t, h0.p, h0.t, { kB: h0.k, floorY: ctx.floorY });
    const j1 = fairJoin(h1.p, h1.t, E, tE, { kA: h1.k, floorY: ctx.floorY });
    const segs = [HW.Path.quintic(...j0.ctrl, Object.assign({}, meta)), hx, HW.Path.quintic(...j1.ctrl, Object.assign({}, meta))];
    const right = Math.abs(tE[1]) < 0.99 ? norm(cross(tE, UP)) : pose.right;
    return { segs, pose: { p: E, t: tE, right } };
  }
  const upOf = (pose) => norm(cross(pose.right, pose.t));

  T.loop = (pc, pose, ctx) => {
    const r = pc.radius || 12, lat = pc.lateral == null ? 5 : pc.lateral;
    const left = sc(pose.right, -1);
    // a loop banks toward its own axis all the way round: bank for a fast car (heartline at
    // 450 cm/s) unless the set names the speed it expects
    return helixRun(pose, ctx, { side: upOf(pose), axis: left, r, b: lat / (2 * Math.PI), turns: 1, lead: pc.lead, meta: { maxBank: null, loop: true, vDesign: 450 } });
  };
  T.corkscrew = (pc, pose, ctx) => {
    const r = pc.radius || 7, adv = pc.advance == null ? 36 : pc.advance, dir = pc.dir === 'right' ? -1 : 1;
    return helixRun(pose, ctx, { side: upOf(pose), axis: sc(pose.right, -dir), r, b: adv / (2 * Math.PI), turns: 1, lead: pc.lead, meta: { maxBank: null, loop: true, vDesign: 450 } });
  };
  T.spiral = (pc, pose, ctx) => {
    const r = pc.radius || 15, dir = pc.dir === 'right' ? -1 : 1, drop = pc.drop == null ? 12 : pc.drop;
    const side = sc(pose.right, -dir);
    return helixRun(pose, ctx, { side, axis: [0, -1, 0], r, b: drop / (2 * Math.PI), turns: pc.turns || 1, lead: pc.lead, meta: {} });
  };

  HW.pieces = {
    types: T, fairJoin, nelderMead, quinticStats, dirOf, pitchAxis,
    basis: { Hb, dHb, ddHb, comb },
    vec: { add, sc, cross, norm, rot },
    // the start pose of a run: { at: [x,y,z], heading, pitch }
    startPose(from) {
      const t = dirOf(from.heading || 0, from.pitch || 0);
      const h = dirOf(from.heading || 0, 0);
      return { p: from.at.slice(), t, right: norm(cross(h, UP)) };
    },
  };
})(window.HW);
