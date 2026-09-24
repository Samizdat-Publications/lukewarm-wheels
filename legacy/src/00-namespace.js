// 00-namespace.js — global namespace, event bus, units, tiny vector helpers.
// Plain classic script. Everything in this project hangs off window.HW.
(function () {
  const HW = (window.HW = window.HW || {});
  HW.version = '0.1.0';

  // ---- event bus -----------------------------------------------------------
  const listeners = new Map();
  HW.bus = {
    on(evt, fn) { if (!listeners.has(evt)) listeners.set(evt, new Set()); listeners.get(evt).add(fn); return fn; },
    off(evt, fn) { const s = listeners.get(evt); if (s) s.delete(fn); },
    emit(evt, data) { const s = listeners.get(evt); if (s) for (const fn of s) { try { fn(data); } catch (e) { console.error('[bus]', evt, e); } } },
  };

  // ---- units (cgs internally; SI at the config boundary) -------------------
  HW.units = {
    G: 981,                                   // cm/s^2
    NmToDyneCm: (x) => x * 1e7,               // 1 N.m = 1e7 dyne.cm
    dyneCmToNm: (x) => x / 1e7,
    kgm2ToGcm2: (x) => x * 1e7,               // 1 kg.m^2 = 1e7 g.cm^2
    NToDyne: (x) => x * 1e5,
    dyneToN: (x) => x / 1e5,
    rpmToRad: (rpm) => rpm * Math.PI / 30,
    radToRpm: (w) => w * 30 / Math.PI,
    cmsToScaleKmh: (v, scale = 64) => v * scale * 0.036, // cm/s at 1:64 -> real-world km/h equivalent
    degToRad: (d) => d * Math.PI / 180,
    radToDeg: (r) => r * 180 / Math.PI,
  };

  // ---- minimal vec3 helpers (plain {x,y,z}; no THREE dependency) -----------
  const V = {
    make: (x = 0, y = 0, z = 0) => ({ x, y, z }),
    clone: (a) => ({ x: a.x, y: a.y, z: a.z }),
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
    scale: (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s }),
    addScaled: (a, b, s) => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s }),
    dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
    cross: (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }),
    len: (a) => Math.hypot(a.x, a.y, a.z),
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
    distXZ: (a, b) => Math.hypot(a.x - b.x, a.z - b.z),
    norm: (a) => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; },
    lerp: (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }),
    // right-hand horizontal normal of a heading (Y up, +X east, +Z south):
    // heading south (0,0,1) -> right is west (-1,0,0); heading east -> right is south.
    rightOf: (t) => { const l = Math.hypot(t.x, t.z) || 1; return { x: -t.z / l, y: 0, z: t.x / l }; },
    leftOf: (t) => { const l = Math.hypot(t.x, t.z) || 1; return { x: t.z / l, y: 0, z: -t.x / l }; },
    // rotate a horizontal vector by angle a (positive = clockwise seen from above with north up,
    // i.e. east -> south -> west -> north), which is a RIGHT turn for a vehicle.
    rotY: (v, a) => { const c = Math.cos(a), s = Math.sin(a); return { x: v.x * c - v.z * s, y: v.y, z: v.x * s + v.z * c }; },
    UP: { x: 0, y: 1, z: 0 },
  };
  HW.V = V;

  HW.math = {
    clamp: (x, a, b) => (x < a ? a : x > b ? b : x),
    smoothstep: (e0, e1, x) => { const t = HW.math.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); },
    lerp: (a, b, t) => a + (b - a) * t,
    wrap: (s, L) => ((s % L) + L) % L,
  };

  // Quaternion from an orthonormal basis (right, up, forward) as column vectors.
  // Used to orient cars: local +X right, +Y up, +Z forward.
  HW.math.quatFromBasis = function (r, u, f) {
    const m00 = r.x, m01 = u.x, m02 = f.x;
    const m10 = r.y, m11 = u.y, m12 = f.y;
    const m20 = r.z, m21 = u.z, m22 = f.z;
    const tr = m00 + m11 + m22;
    let x, y, z, w;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
    else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
    else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
    else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
    return { x, y, z, w };
  };
  // Rotate vector v by quaternion q.
  HW.math.applyQuat = function (q, v) {
    const ix = q.w * v.x + q.y * v.z - q.z * v.y;
    const iy = q.w * v.y + q.z * v.x - q.x * v.z;
    const iz = q.w * v.z + q.x * v.y - q.y * v.x;
    const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
    return {
      x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
      y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
      z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
    };
  };

  HW.log = (...a) => console.log('[HW]', ...a);
})();
