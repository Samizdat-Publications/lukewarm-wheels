// 30-track-path.js - a track centreline, resampled uniformly by arc length, with a banked
// frame (T forward, U up out of the running surface, R = T x U to the right). A path is
// either CLOSED (a circuit: s wraps) or OPEN (a run with two ends: s is clamped, and what
// happens at an end is up to the track graph, see 32-track-build.js).
//
// The circuit is a chain of segments: exact straight lines (the hub lanes) and clamped
// cubic B-splines (the lobes). A clamped B-spline whose first three control points are
// collinear with the incoming straight starts with the straight's position, heading AND
// zero curvature, so every joint is G2 (curvature-continuous) by construction. That
// matters: a curvature step is a step in the normal force, which a car feels as a slam.
//
// Banking is computed, not drawn. For a nominal speed v_n(s) the force the track must
// supply per unit mass is f = v_n^2 * kappa - g. Pointing U along f (minus its tangential
// part) is the bank at which a car at v_n needs no side force at all - the same rule a
// roller-coaster designer uses for the heartline. Where v_n^2 * kappa beats gravity over
// the top of a loop, f points DOWN and the car rides upside down on the inside of the
// loop. A slower car than v_n slides toward the inner wall; a much slower one falls off.
(function (HW) {
  const M = HW.math;

  // ---------------------------------------------------------------- segments
  function line(a, b, meta = {}) {
    return {
      kind: 'line', meta, t0: 0, t1: 1,
      point(t, p, d1, d2) {
        p[0] = a[0] + (b[0] - a[0]) * t; p[1] = a[1] + (b[1] - a[1]) * t; p[2] = a[2] + (b[2] - a[2]) * t;
        d1[0] = b[0] - a[0]; d1[1] = b[1] - a[1]; d1[2] = b[2] - a[2];
        d2[0] = 0; d2[1] = 0; d2[2] = 0;
      },
    };
  }

  // clamped uniform B-spline of degree k through control points P[0..n]
  function bspline(P, meta = {}, k = 3) {
    const n = P.length - 1;
    if (n < k) throw new Error('bspline needs at least ' + (k + 1) + ' control points');
    const U = [];
    for (let i = 0; i <= k; i++) U.push(0);
    for (let i = 1; i <= n - k; i++) U.push(i);
    for (let i = 0; i <= k; i++) U.push(n - k + 1);
    const tMax = n - k + 1;
    // derivative control nets
    function deriv(Pc, Uc, deg) {
      const Q = [];
      for (let i = 0; i < Pc.length - 1; i++) {
        const den = Uc[i + deg + 1] - Uc[i + 1];
        const f = den > 0 ? deg / den : 0;
        Q.push([(Pc[i + 1][0] - Pc[i][0]) * f, (Pc[i + 1][1] - Pc[i][1]) * f, (Pc[i + 1][2] - Pc[i][2]) * f]);
      }
      return { Q, U: Uc.slice(1, Uc.length - 1), deg: deg - 1 };
    }
    const D1 = deriv(P, U, k), D2 = deriv(D1.Q, D1.U, k - 1);
    const tmp = [];
    for (let i = 0; i <= k; i++) tmp.push([0, 0, 0]);
    function deBoor(Pc, Uc, deg, t, out) {
      const nn = Pc.length - 1;
      if (deg === 0) {
        let span = 0;
        for (let i = 0; i < nn + 1; i++) if (t >= Uc[i] && t < Uc[i + 1]) { span = i; break; }
        if (t >= Uc[nn + 1]) span = nn;
        out[0] = Pc[span][0]; out[1] = Pc[span][1]; out[2] = Pc[span][2];
        return;
      }
      let span = deg;
      while (span < nn && t >= Uc[span + 1]) span++;
      for (let j = 0; j <= deg; j++) { const s = Pc[j + span - deg]; tmp[j][0] = s[0]; tmp[j][1] = s[1]; tmp[j][2] = s[2]; }
      for (let r = 1; r <= deg; r++) {
        for (let j = deg; j >= r; j--) {
          const i = j + span - deg;
          const den = Uc[i + deg - r + 1] - Uc[i];
          const al = den > 0 ? (t - Uc[i]) / den : 0;
          tmp[j][0] = (1 - al) * tmp[j - 1][0] + al * tmp[j][0];
          tmp[j][1] = (1 - al) * tmp[j - 1][1] + al * tmp[j][1];
          tmp[j][2] = (1 - al) * tmp[j - 1][2] + al * tmp[j][2];
        }
      }
      out[0] = tmp[deg][0]; out[1] = tmp[deg][1]; out[2] = tmp[deg][2];
    }
    return {
      kind: 'bspline', meta, t0: 0, t1: tMax, ctrl: P,
      point(t, p, d1, d2) {
        deBoor(P, U, k, t, p);
        deBoor(D1.Q, D1.U, D1.deg, t, d1);
        deBoor(D2.Q, D2.U, D2.deg, t, d2);
      },
    };
  }

  // Quintic Hermite: matches position, first AND second derivative at both ends, so two of
  // these meeting with equal (p, p', p'') are G2 by construction. Used for the lobes: each
  // lobe is two mirror-image halves meeting at the apex.
  function quintic(p0, v0, a0, a1, v1, p1, meta = {}) {
    const C = [p0, v0, a0, a1, v1, p1];
    const comb = (h, out) => {
      for (let k = 0; k < 3; k++) out[k] = h[0] * C[0][k] + h[1] * C[1][k] + h[2] * C[2][k] + h[3] * C[3][k] + h[4] * C[4][k] + h[5] * C[5][k];
    };
    const h = [0, 0, 0, 0, 0, 0];
    return {
      kind: 'quintic', meta, t0: 0, t1: 1, ctrl: C,
      point(t, p, d1, d2) {
        const t2 = t * t, t3 = t2 * t, t4 = t3 * t, t5 = t4 * t;
        h[0] = 1 - 10 * t3 + 15 * t4 - 6 * t5; h[1] = t - 6 * t3 + 8 * t4 - 3 * t5;
        h[2] = 0.5 * t2 - 1.5 * t3 + 1.5 * t4 - 0.5 * t5; h[3] = 0.5 * t3 - t4 + 0.5 * t5;
        h[4] = -4 * t3 + 7 * t4 - 3 * t5; h[5] = 10 * t3 - 15 * t4 + 6 * t5;
        comb(h, p);
        h[0] = -30 * t2 + 60 * t3 - 30 * t4; h[1] = 1 - 18 * t2 + 32 * t3 - 15 * t4;
        h[2] = t - 4.5 * t2 + 6 * t3 - 2.5 * t4; h[3] = 1.5 * t2 - 4 * t3 + 2.5 * t4;
        h[4] = -12 * t2 + 28 * t3 - 15 * t4; h[5] = 30 * t2 - 60 * t3 + 30 * t4;
        comb(h, d1);
        h[0] = -60 * t + 180 * t2 - 120 * t3; h[1] = -36 * t + 96 * t2 - 60 * t3;
        h[2] = 1 - 9 * t + 18 * t2 - 10 * t3; h[3] = 3 * t - 12 * t2 + 10 * t3;
        h[4] = -24 * t + 84 * t2 - 60 * t3; h[5] = 60 * t - 180 * t2 + 120 * t3;
        comb(h, d2);
      },
    };
  }

  // ---------------------------------------------------------------- build
  // segments: array of line()/bspline()/quintic(), end-to-end; a closed path closes back
  // on the first. opts.closed (default true). opts.ds: target sample spacing (cm).
  // opts.bank(i, info): per-sample bank spec { flat, vNom: cm/s, gain: 0..1, maxDeg,
  //   roll: radians (an explicit roll about T from no-bank, overrides the heartline) }.
  function build(segments, opts = {}) {
    const dsTarget = opts.ds || 0.2;
    const closed = opts.closed !== false;
    const p = [0, 0, 0], d1 = [0, 0, 0], d2 = [0, 0, 0];
    // 1. fine arc-length table per segment
    const tables = [];
    let total = 0;
    for (const seg of segments) {
      const N = seg.kind === 'line' ? 2 : Math.max(200, Math.ceil((seg.t1 - seg.t0) * 400));
      const ts = new Float64Array(N + 1), ss = new Float64Array(N + 1);
      let prev = null, acc = 0;
      for (let i = 0; i <= N; i++) {
        const t = seg.t0 + (seg.t1 - seg.t0) * (i / N);
        seg.point(t, p, d1, d2);
        if (prev) acc += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
        prev = [p[0], p[1], p[2]];
        ts[i] = t; ss[i] = acc;
      }
      // refine the chord sum with a speed-weighted estimate (Simpson on |d1|) for splines
      if (seg.kind !== 'line') {
        let L = 0; const K = N * 4;
        const h = (seg.t1 - seg.t0) / K;
        const sp = (t) => { seg.point(t, p, d1, d2); return Math.hypot(d1[0], d1[1], d1[2]); };
        for (let i = 0; i < K; i += 2) { const a = seg.t0 + i * h; L += (h / 3) * (sp(a) + 4 * sp(a + h) + sp(a + 2 * h)); }
        const f = L / acc; for (let i = 0; i <= N; i++) ss[i] *= f; acc = L;
      }
      tables.push({ seg, ts, ss, len: acc, s0: total });
      seg.length = acc; seg.s0 = total;
      total += acc;
    }
    // 2. uniform resample
    // closed: N samples, the last one ds short of the first; open: N samples, both ends included
    const N = closed ? Math.max(8, Math.round(total / dsTarget)) : Math.max(2, Math.round(total / dsTarget)) + 1;
    const ds = closed ? total / N : total / (N - 1);
    const A = (n) => new Float64Array(n);
    const P = { x: A(N), y: A(N), z: A(N) }, T = { x: A(N), y: A(N), z: A(N) }, K = { x: A(N), y: A(N), z: A(N) };
    const segIdx = new Int16Array(N);
    let ti = 0, tab = tables[0], j = 0;
    for (let i = 0; i < N; i++) {
      const s = i * ds;
      while (ti < tables.length - 1 && s >= tables[ti].s0 + tables[ti].len) { ti++; tab = tables[ti]; j = 0; }
      const local = M.clamp(s - tab.s0, 0, tab.len);
      while (j < tab.ss.length - 2 && tab.ss[j + 1] < local) j++;
      const f = (local - tab.ss[j]) / Math.max(1e-12, tab.ss[j + 1] - tab.ss[j]);
      const t = tab.ts[j] + (tab.ts[j + 1] - tab.ts[j]) * M.clamp(f, 0, 1);
      tab.seg.point(t, p, d1, d2);
      const sp = Math.hypot(d1[0], d1[1], d1[2]) || 1;
      const tx = d1[0] / sp, ty = d1[1] / sp, tz = d1[2] / sp;
      const dd = d2[0] * tx + d2[1] * ty + d2[2] * tz;
      P.x[i] = p[0]; P.y[i] = p[1]; P.z[i] = p[2];
      T.x[i] = tx; T.y[i] = ty; T.z[i] = tz;
      const k2 = sp * sp;
      K.x[i] = (d2[0] - dd * tx) / k2; K.y[i] = (d2[1] - dd * ty) / k2; K.z[i] = (d2[2] - dd * tz) / k2;
      segIdx[i] = ti;
    }
    const path = { N, ds, length: total, P, T, K, segIdx, segments, tables, closed };
    checkJoints(path);
    computeFrames(path, opts.bank || (() => ({ flat: true })), opts);
    attachLookup(path);
    return path;
  }

  function checkJoints(path) {
    const segs = path.segments, p = [0, 0, 0], a = [0, 0, 0], b = [0, 0, 0], q = [0, 0, 0], c = [0, 0, 0], d = [0, 0, 0];
    path.jointErrors = [];
    for (let i = 0; i < segs.length - (path.closed ? 0 : 1); i++) {
      const s1 = segs[i], s2 = segs[(i + 1) % segs.length];
      s1.point(s1.t1, p, a, b); s2.point(s2.t0, q, c, d);
      const gap = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      const la = Math.hypot(...a) || 1, lc = Math.hypot(...c) || 1;
      const cosang = (a[0] * c[0] + a[1] * c[1] + a[2] * c[2]) / (la * lc);
      const ang = Math.acos(M.clamp(cosang, -1, 1)) * 180 / Math.PI;
      if (gap > 1e-3 || ang > 0.05) path.jointErrors.push({ at: i, gap, angDeg: ang, names: [s1.meta.name, s2.meta.name] });
    }
    if (path.jointErrors.length) console.warn('[path] joint discontinuities', path.jointErrors);
  }

  // ---------------------------------------------------------------- frames / banking
  function computeFrames(path, bankSpec, opts) {
    const { N, T, K, P } = path, g = HW.units.G;
    const Ux = new Float64Array(N), Uy = new Float64Array(N), Uz = new Float64Array(N);
    const flat = new Uint8Array(N), gain = new Float64Array(N);
    let px = 0, py = 1, pz = 0;
    for (let i = 0; i < N; i++) {
      const spec = bankSpec(i, { s: i * path.ds, y: P.y[i], seg: path.segments[path.segIdx[i]] }) || { flat: true };
      const tx = T.x[i], ty = T.y[i], tz = T.z[i];
      // "no-bank" up: world up with the tangential part removed
      let fx = -ty * tx, fy = 1 - ty * ty, fz = -ty * tz;
      let fl = Math.hypot(fx, fy, fz);
      let ux, uy, uz;
      if (fl > 0.05) { fx /= fl; fy /= fl; fz /= fl; } else { fx = px; fy = py; fz = pz; }
      if (spec.flat) {
        ux = fx; uy = fy; uz = fz; flat[i] = 1;
      } else if (spec.roll != null) {
        // an explicit roll about T, measured from no-bank (a corkscrew, a banked curve by hand)
        const c = Math.cos(spec.roll), sn = Math.sin(spec.roll);
        ux = fx * c + (ty * fz - tz * fy) * sn; uy = fy * c + (tz * fx - tx * fz) * sn; uz = fz * c + (tx * fy - ty * fx) * sn;
        gain[i] = 1;
      } else {
        const v2 = spec.vNom * spec.vNom;
        // required specific force  f = v^2 kappa - gvec = v^2 kappa + g*Y
        let rx = v2 * K.x[i], ry = v2 * K.y[i] + g, rz = v2 * K.z[i];
        const rt = rx * tx + ry * ty + rz * tz; rx -= rt * tx; ry -= rt * ty; rz -= rt * tz;
        const rl = Math.hypot(rx, ry, rz);
        if (rl < 1e-6) { ux = px; uy = py; uz = pz; }
        else {
          rx /= rl; ry /= rl; rz /= rl;
          // blend between no-bank and full heartline bank, then cap the bank angle
          const gn = spec.gain == null ? 1 : spec.gain;
          let bx = fx + (rx - fx) * gn, by = fy + (ry - fy) * gn, bz = fz + (rz - fz) * gn;
          let bl = Math.hypot(bx, by, bz);
          if (bl < 1e-6) { bx = rx; by = ry; bz = rz; bl = 1; }
          bx /= bl; by /= bl; bz /= bl;
          if (spec.maxDeg != null && fl > 0.05) {
            const cosb = M.clamp(bx * fx + by * fy + bz * fz, -1, 1), ang = Math.acos(cosb), cap = spec.maxDeg * Math.PI / 180;
            if (ang > cap) {
              // rotate f toward b by exactly cap about T
              const sx = by * fz - bz * fy, sy = bz * fx - bx * fz, sz = bx * fy - by * fx;
              const sgn = Math.sign(sx * tx + sy * ty + sz * tz) || 1;
              // f rotated about axis T by -sgn*cap  (axis T, right-handed)
              const c = Math.cos(cap), sn = Math.sin(cap) * -sgn;
              const kx = tx, ky = ty, kz = tz, kd = kx * fx + ky * fy + kz * fz;
              bx = fx * c + (ky * fz - kz * fy) * sn + kx * kd * (1 - c);
              by = fy * c + (kz * fx - kx * fz) * sn + ky * kd * (1 - c);
              bz = fz * c + (kx * fy - ky * fx) * sn + kz * kd * (1 - c);
            }
          }
          ux = bx; uy = by; uz = bz;
        }
        gain[i] = spec.gain == null ? 1 : spec.gain;
      }
      // keep continuity: never let U flip relative to the previous sample
      if (i > 0 && ux * px + uy * py + uz * pz < -0.2) { ux = px; uy = py; uz = pz; }
      Ux[i] = ux; Uy[i] = uy; Uz[i] = uz; px = ux; py = uy; pz = uz;
    }
    // Smooth the ROLL, not the vector. Roll is measured about T from a rotation-minimising
    // frame (double reflection, Wang et al. 2008), which is defined even where the track is
    // vertical. Two passes: a slew limit on the twist rate (a rigid car can only follow so
    // much warp), then diffusion with the flat samples held fixed, so the bank always leaves
    // a flat lane continuously instead of stepping. On a closed path sample N is sample 0
    // come round again; on an open path the last sample is N-1 and both ends are held.
    const last = path.closed ? N : N - 1;
    const Nr = { x: new Float64Array(N + 1), y: new Float64Array(N + 1), z: new Float64Array(N + 1) };
    {
      let rx = Ux[0], ry = Uy[0], rz = Uz[0];
      const d0 = rx * T.x[0] + ry * T.y[0] + rz * T.z[0]; rx -= d0 * T.x[0]; ry -= d0 * T.y[0]; rz -= d0 * T.z[0];
      let l0 = Math.hypot(rx, ry, rz) || 1; rx /= l0; ry /= l0; rz /= l0;
      Nr.x[0] = rx; Nr.y[0] = ry; Nr.z[0] = rz;
      for (let i = 0; i < last; i++) {
        const j = (i + 1) % N;
        const v1x = P.x[j] - P.x[i], v1y = P.y[j] - P.y[i], v1z = P.z[j] - P.z[i];
        const c1 = v1x * v1x + v1y * v1y + v1z * v1z || 1e-12;
        let a = 2 / c1 * (v1x * rx + v1y * ry + v1z * rz);
        const rLx = rx - a * v1x, rLy = ry - a * v1y, rLz = rz - a * v1z;
        a = 2 / c1 * (v1x * T.x[i] + v1y * T.y[i] + v1z * T.z[i]);
        const tLx = T.x[i] - a * v1x, tLy = T.y[i] - a * v1y, tLz = T.z[i] - a * v1z;
        const v2x = T.x[j] - tLx, v2y = T.y[j] - tLy, v2z = T.z[j] - tLz;
        const c2 = v2x * v2x + v2y * v2y + v2z * v2z;
        if (c2 > 1e-14) { a = 2 / c2 * (v2x * rLx + v2y * rLy + v2z * rLz); rx = rLx - a * v2x; ry = rLy - a * v2y; rz = rLz - a * v2z; }
        else { rx = rLx; ry = rLy; rz = rLz; }
        const tj = T.x[j] * rx + T.y[j] * ry + T.z[j] * rz; rx -= tj * T.x[j]; ry -= tj * T.y[j]; rz -= tj * T.z[j];
        const l = Math.hypot(rx, ry, rz) || 1; rx /= l; ry /= l; rz /= l;
        Nr.x[i + 1] = rx; Nr.y[i + 1] = ry; Nr.z[i + 1] = rz;   // index N = sample 0 reached again (holonomy)
      }
    }
    const th = new Float64Array(N + 1);
    for (let i = 0; i <= last; i++) {
      const k = i % N, tx = T.x[k], ty = T.y[k], tz = T.z[k];
      const nx = Nr.x[i], ny = Nr.y[i], nz = Nr.z[i], ux = Ux[k], uy = Uy[k], uz = Uz[k];
      const cx = ny * uz - nz * uy, cy = nz * ux - nx * uz, cz = nx * uy - ny * ux;
      let a = Math.atan2(cx * tx + cy * ty + cz * tz, nx * ux + ny * uy + nz * uz);
      if (i > 0) { while (a - th[i - 1] > Math.PI) a -= 2 * Math.PI; while (a - th[i - 1] < -Math.PI) a += 2 * Math.PI; }
      th[i] = a;
    }
    const fixed = (i) => i === last || flat[i];
    const maxRate = ((opts.maxTwistDegPerCm == null ? 7 : opts.maxTwistDegPerCm) * Math.PI / 180) * path.ds;
    for (let i = 1; i <= last; i++) if (!fixed(i)) th[i] = M.clamp(th[i], th[i - 1] - maxRate, th[i - 1] + maxRate);
    for (let i = last - 1; i >= 1; i--) if (!fixed(i)) th[i] = M.clamp(th[i], th[i + 1] - maxRate, th[i + 1] + maxRate);
    const sigma = (opts.smoothCm == null ? 2.5 : opts.smoothCm) / path.ds;
    const passes = Math.round(2 * sigma * sigma);
    const tmp = new Float64Array(N + 1);
    for (let p2 = 0; p2 < passes; p2++) {
      tmp.set(th);
      for (let i = 1; i < last; i++) if (!fixed(i)) th[i] = 0.25 * tmp[i - 1] + 0.5 * tmp[i] + 0.25 * tmp[i + 1];
    }
    const R = { x: new Float64Array(N), y: new Float64Array(N), z: new Float64Array(N) };
    for (let i = 0; i < N; i++) {
      const tx = T.x[i], ty = T.y[i], tz = T.z[i];
      let ux, uy, uz;
      if (flat[i]) { ux = Ux[i]; uy = Uy[i]; uz = Uz[i]; }
      else {
        const c = Math.cos(th[i]), s = Math.sin(th[i]);
        const nx = Nr.x[i], ny = Nr.y[i], nz = Nr.z[i];
        ux = nx * c + (ty * nz - tz * ny) * s; uy = ny * c + (tz * nx - tx * nz) * s; uz = nz * c + (tx * ny - ty * nx) * s;
      }
      const d = ux * tx + uy * ty + uz * tz; ux -= d * tx; uy -= d * ty; uz -= d * tz;
      const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
      Ux[i] = ux; Uy[i] = uy; Uz[i] = uz;
      R.x[i] = ty * uz - tz * uy; R.y[i] = tz * ux - tx * uz; R.z[i] = tx * uy - ty * ux;
    }
    path.U = { x: Ux, y: Uy, z: Uz };
    path.R = R;
    path.flat = flat;
  }

  // ---------------------------------------------------------------- lookup
  function attachLookup(path) {
    const { N, ds, P, T, U, R, K } = path;
    // f = frame object reused by callers: { px,py,pz, tx.., ux.., rx.., kx.., i, frac }
    const closed = path.closed;
    path.frame = function (s, f) {
      let i, a, j;
      if (closed) {
        s = ((s % path.length) + path.length) % path.length;
        const x = s / ds; i = Math.floor(x); a = x - i; if (i >= N) i = N - 1;
        j = i + 1 < N ? i + 1 : 0;
      } else {
        // past an open end the track carries on straight (a lip the car's rear is still on)
        if (s < 0 || s > path.length) {
          const e = s < 0 ? 0 : path.length;
          f = path.frame(e, f);
          const over = s - e;
          f.px += f.tx * over; f.py += f.ty * over; f.pz += f.tz * over;
          f.kx = 0; f.ky = 0; f.kz = 0; f.s = s;
          return f;
        }
        const x = s / ds; i = Math.floor(x); if (i > N - 2) i = N - 2;
        a = x - i; if (a > 1) a = 1;
        j = i + 1;
      }
      const b = 1 - a;
      f = f || {};
      f.i = i; f.frac = a; f.s = s;
      f.px = P.x[i] * b + P.x[j] * a; f.py = P.y[i] * b + P.y[j] * a; f.pz = P.z[i] * b + P.z[j] * a;
      let tx = T.x[i] * b + T.x[j] * a, ty = T.y[i] * b + T.y[j] * a, tz = T.z[i] * b + T.z[j] * a;
      let l = Math.hypot(tx, ty, tz) || 1; f.tx = tx / l; f.ty = ty / l; f.tz = tz / l;
      let ux = U.x[i] * b + U.x[j] * a, uy = U.y[i] * b + U.y[j] * a, uz = U.z[i] * b + U.z[j] * a;
      l = Math.hypot(ux, uy, uz) || 1; f.ux = ux / l; f.uy = uy / l; f.uz = uz / l;
      f.rx = f.ty * f.uz - f.tz * f.uy; f.ry = f.tz * f.ux - f.tx * f.uz; f.rz = f.tx * f.uy - f.ty * f.ux;
      f.kx = K.x[i] * b + K.x[j] * a; f.ky = K.y[i] * b + K.y[j] * a; f.kz = K.z[i] * b + K.z[j] * a;
      return f;
    };
    // nearest sample to a world point, optionally near a hint s (search window in cm)
    path.nearest = function (x, y, z, hintS, windowCm) {
      let best = -1, bd = Infinity;
      if (hintS != null) {
        const w = Math.ceil((windowCm || 20) / ds), c = Math.round(hintS / ds);
        for (let k = -w; k <= w; k++) {
          const i = closed ? (((c + k) % N) + N) % N : c + k;
          if (i < 0 || i >= N) continue;
          const d = (P.x[i] - x) ** 2 + (P.y[i] - y) ** 2 + (P.z[i] - z) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
      } else {
        const g = path.grid;
        if (g) {
          const cx = Math.floor(x / g.cell), cy = Math.floor(y / g.cell), cz = Math.floor(z / g.cell);
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
            const list = g.map.get((cx + a) + ',' + (cy + b) + ',' + (cz + c));
            if (!list) continue;
            for (const i of list) {
              const d = (P.x[i] - x) ** 2 + (P.y[i] - y) ** 2 + (P.z[i] - z) ** 2;
              if (d < bd) { bd = d; best = i; }
            }
          }
        }
        if (best < 0) for (let i = 0; i < N; i++) {
          const d = (P.x[i] - x) ** 2 + (P.y[i] - y) ** 2 + (P.z[i] - z) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
      }
      // refine along the tangent
      let s = best * ds;
      const tx = T.x[best], ty = T.y[best], tz = T.z[best];
      s += (x - P.x[best]) * tx + (y - P.y[best]) * ty + (z - P.z[best]) * tz;
      return { i: best, s: closed ? ((s % path.length) + path.length) % path.length : M.clamp(s, 0, path.length), dist: Math.sqrt(bd), track: path };
    };
    // signed distance a - b along the track (the short way round on a circuit)
    path.delta = closed ? (a, b) => M.loopDelta(a, b, path.length) : (a, b) => a - b;
    path.wrap = closed ? (s) => M.wrap(s, path.length) : (s) => s;
    // spatial hash for global nearest queries
    const cell = 3, map = new Map();
    for (let i = 0; i < N; i++) {
      const key = Math.floor(P.x[i] / cell) + ',' + Math.floor(P.y[i] / cell) + ',' + Math.floor(P.z[i] / cell);
      let l = map.get(key); if (!l) map.set(key, (l = [])); l.push(i);
    }
    path.grid = { cell, map };
  }

  HW.Path = { line, bspline, quintic, build };
})(window.HW);
