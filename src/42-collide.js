// 42-collide.js - oriented-box contact and rigid-body impulses for car-car hits.
// A car is a box (its body shell): centre c, orthonormal axes a[0..2] (right, up, back),
// half extents e[0..2]. The separating-axis test (15 axes, Gottschalk) gives the axis of
// least penetration as the contact normal; the impulse is the textbook rigid-body one
// with restitution and a Coulomb-capped friction impulse.
(function (HW) {
  const V = HW.V;

  // Build an OBB for a car from its current pose.
  function obb(car, out) {
    out = out || { c: {}, a: [{}, {}, {}], e: [0, 0, 0] };
    const q = car.quat;
    HW.Q.rotate(q, { x: 1, y: 0, z: 0 }, out.a[0]);
    HW.Q.rotate(q, { x: 0, y: 1, z: 0 }, out.a[1]);
    HW.Q.rotate(q, { x: 0, y: 0, z: 1 }, out.a[2]);
    const up = out.a[1];
    out.c.x = car.pos.x + up.x * car.boxCy; out.c.y = car.pos.y + up.y * car.boxCy; out.c.z = car.pos.z + up.z * car.boxCy;
    out.e[0] = car.boxHalf.x; out.e[1] = car.boxHalf.y; out.e[2] = car.boxHalf.z;
    return out;
  }

  // SAT. Returns null if separated, else { depth, n (unit, from A to B) }.
  function sat(A, B) {
    const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], AR = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { R[i][j] = V.dot(A.a[i], B.a[j]); AR[i][j] = Math.abs(R[i][j]) + 1e-6; }
    const tw = V.sub(B.c, A.c);
    const t = [V.dot(tw, A.a[0]), V.dot(tw, A.a[1]), V.dot(tw, A.a[2])];
    let best = Infinity, bestAxis = null;
    const consider = (depth, axisW) => {
      if (depth < best) {
        const l = V.len(axisW);
        if (l < 1e-6) return;
        best = depth; bestAxis = V.scale(axisW, 1 / l);
      }
    };
    // A's faces
    for (let i = 0; i < 3; i++) {
      const ra = A.e[i], rb = B.e[0] * AR[i][0] + B.e[1] * AR[i][1] + B.e[2] * AR[i][2];
      const d = ra + rb - Math.abs(t[i]); if (d < 0) return null; consider(d, A.a[i]);
    }
    // B's faces
    for (let j = 0; j < 3; j++) {
      const ra = A.e[0] * AR[0][j] + A.e[1] * AR[1][j] + A.e[2] * AR[2][j], rb = B.e[j];
      const tj = t[0] * R[0][j] + t[1] * R[1][j] + t[2] * R[2][j];
      const d = ra + rb - Math.abs(tj); if (d < 0) return null; consider(d, B.a[j]);
    }
    // edge x edge
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const i1 = (i + 1) % 3, i2 = (i + 2) % 3, j1 = (j + 1) % 3, j2 = (j + 2) % 3;
      const ra = A.e[i1] * AR[i2][j] + A.e[i2] * AR[i1][j];
      const rb = B.e[j1] * AR[i][j2] + B.e[j2] * AR[i][j1];
      const tt = Math.abs(t[i2] * R[i1][j] - t[i1] * R[i2][j]);
      const axis = V.cross(A.a[i], B.a[j]);
      const al = V.len(axis);
      if (al < 1e-4) continue;
      const d = (ra + rb - tt) / al; if (d < 0) return null;
      consider(d * 1.05, axis);                 // mild bias toward face axes (more stable normals)
    }
    if (V.dot(bestAxis, tw) < 0) bestAxis = V.scale(bestAxis, -1);
    return { depth: best, n: bestAxis };
  }

  // clamp a world point into a box
  function clampInto(B, p) {
    const d = V.sub(p, B.c); let q = V.clone(B.c);
    for (let k = 0; k < 3; k++) {
      const dist = Math.max(-B.e[k], Math.min(B.e[k], V.dot(d, B.a[k])));
      q = V.addScaled(q, B.a[k], dist);
    }
    return q;
  }
  function contactPoint(A, B) {
    return V.lerp(clampInto(B, A.c), clampInto(A, B.c), 0.5);
  }

  // inverse world inertia of a box applied to vector v
  function invI(box, m, v) {
    let out = { x: 0, y: 0, z: 0 };
    for (let k = 0; k < 3; k++) {
      const e1 = box.e[(k + 1) % 3], e2 = box.e[(k + 2) % 3];
      const I = m / 3 * (e1 * e1 + e2 * e2);
      out = V.addScaled(out, box.a[k], V.dot(box.a[k], v) / I);
    }
    return out;
  }

  // Resolve a collision between two bodies. Each body: { m, box, v, w } (w = angular vel).
  // Mutates v and w. Returns the normal impulse (g.cm/s) and the closing speed.
  function impulse(A, B, p, n, e, mu) {
    const rA = V.sub(p, A.box.c), rB = V.sub(p, B.box.c);
    const vA = V.add(A.v, V.cross(A.w, rA)), vB = V.add(B.v, V.cross(B.w, rB));
    const vr = V.sub(vA, vB);
    const vn = V.dot(vr, n);
    if (vn <= 0) return { jn: 0, closing: 0 };
    const kA = V.cross(invI(A.box, A.m, V.cross(rA, n)), rA), kB = V.cross(invI(B.box, B.m, V.cross(rB, n)), rB);
    const kn = 1 / A.m + 1 / B.m + V.dot(n, V.add(kA, kB));
    const jn = (1 + e) * vn / kn;
    const J = V.scale(n, jn);
    apply(A, rA, V.scale(J, -1)); apply(B, rB, J);
    // friction along the tangential slip
    const vA2 = V.add(A.v, V.cross(A.w, rA)), vB2 = V.add(B.v, V.cross(B.w, rB));
    const vr2 = V.sub(vA2, vB2);
    const vt = V.sub(vr2, V.scale(n, V.dot(vr2, n)));
    const st = V.len(vt);
    if (st > 1e-3) {
      const t = V.scale(vt, 1 / st);
      const tA = V.cross(invI(A.box, A.m, V.cross(rA, t)), rA), tB = V.cross(invI(B.box, B.m, V.cross(rB, t)), rB);
      const kt = 1 / A.m + 1 / B.m + V.dot(t, V.add(tA, tB));
      const jt = Math.min(mu * jn, st / kt);
      const Jt = V.scale(t, jt);
      apply(A, rA, V.scale(Jt, -1)); apply(B, rB, Jt);
    }
    return { jn, closing: vn };
  }
  function apply(b, r, J) {
    b.v = V.addScaled(b.v, J, 1 / b.m);
    b.w = V.add(b.w, invI(b.box, b.m, V.cross(r, J)));
  }

  HW.collide = { obb, sat, contactPoint, impulse, invI };
})(window.HW);
