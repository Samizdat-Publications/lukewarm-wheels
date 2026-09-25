// 00-core.js - namespace, event bus, units, small vector/quaternion helpers, seeded RNG.
// Plain classic script: everything hangs off window.HW. Units are cgs throughout
// (cm, g, s, dyne); Y up, +X east, +Z south (north = -Z). Car-local axes follow three.js:
// +X right, +Y up, -Z forward.
(function () {
  const HW = (window.HW = window.HW || {});
  HW.version = '2.0.0';

  // ---- event bus -------------------------------------------------------------
  // HW.bus is the page's bus; a sim can be given its own (the Track Builder's silent test drives)
  HW.makeBus = () => {
    const listeners = new Map();
    return {
      on(evt, fn) { if (!listeners.has(evt)) listeners.set(evt, new Set()); listeners.get(evt).add(fn); return fn; },
      off(evt, fn) { const s = listeners.get(evt); if (s) s.delete(fn); },
      emit(evt, data) {
        const s = listeners.get(evt);
        if (s) for (const fn of s) { try { fn(data); } catch (e) { console.error('[bus]', evt, e); } }
      },
    };
  };
  HW.bus = HW.makeBus();

  // ---- units -------------------------------------------------------------------
  HW.units = {
    G: 981,                                        // cm/s^2
    NToDyne: (x) => x * 1e5,
    dyneToN: (x) => x / 1e5,
    NmToDyneCm: (x) => x * 1e7,
    dyneCmToNm: (x) => x / 1e7,
    radToRpm: (w) => w * 30 / Math.PI,
    rpmToRad: (r) => r * Math.PI / 30,
    // A 1:64 car at v cm/s "is doing" v*64 cm/s at full size.
    scaleKmh: (v) => v * 64 * 0.036,
    scaleMph: (v) => v * 64 * 0.0223694,
    deg: (r) => r * 180 / Math.PI,
    rad: (d) => d * Math.PI / 180,
  };

  // ---- scalar helpers ------------------------------------------------------------
  const M = (HW.math = {
    clamp: (x, a, b) => (x < a ? a : x > b ? b : x),
    lerp: (a, b, t) => a + (b - a) * t,
    smoothstep: (e0, e1, x) => { const t = M.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); },
    smootherstep: (e0, e1, x) => { const t = M.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); },
    wrap: (s, L) => ((s % L) + L) % L,
    // signed shortest distance a-b on a loop of length L
    loopDelta: (a, b, L) => { let d = (a - b) % L; if (d > L / 2) d -= L; else if (d < -L / 2) d += L; return d; },
    damp: (cur, target, lambda, dt) => target + (cur - target) * Math.exp(-lambda * dt),
  });

  // ---- vec3 helpers on plain {x,y,z}. Allocating; keep out of inner loops. ----------
  const V = (HW.V = {
    make: (x = 0, y = 0, z = 0) => ({ x, y, z }),
    arr: (a) => ({ x: a[0], y: a[1], z: a[2] }),
    clone: (a) => ({ x: a.x, y: a.y, z: a.z }),
    set: (o, x, y, z) => { o.x = x; o.y = y; o.z = z; return o; },
    copy: (o, a) => { o.x = a.x; o.y = a.y; o.z = a.z; return o; },
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
    scale: (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s }),
    addScaled: (a, b, s) => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s }),
    dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
    cross: (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }),
    len: (a) => Math.hypot(a.x, a.y, a.z),
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
    norm: (a) => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; },
    lerp: (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }),
    // component of a perpendicular to unit vector n
    perp: (a, n) => { const d = a.x * n.x + a.y * n.y + a.z * n.z; return { x: a.x - n.x * d, y: a.y - n.y * d, z: a.z - n.z * d }; },
    // rotate v about unit axis k by angle a (Rodrigues)
    rotAxis: (v, k, a) => {
      const c = Math.cos(a), s = Math.sin(a), d = (k.x * v.x + k.y * v.y + k.z * v.z) * (1 - c);
      return {
        x: v.x * c + (k.y * v.z - k.z * v.y) * s + k.x * d,
        y: v.y * c + (k.z * v.x - k.x * v.z) * s + k.y * d,
        z: v.z * c + (k.x * v.y - k.y * v.x) * s + k.z * d,
      };
    },
    UP: Object.freeze({ x: 0, y: 1, z: 0 }),
  });

  // ---- quaternions {x,y,z,w} --------------------------------------------------------
  const Q = (HW.Q = {
    identity: () => ({ x: 0, y: 0, z: 0, w: 1 }),
    // Rotation whose columns are (right, up, back) = car-local +X, +Y, +Z in world.
    // Forward is -Z, so pass back = -forward. (right, up, back) must be RIGHT-handed:
    // right x up = back. Passing forward instead of back yields a reflection (the day-1 bug).
    fromBasis(r, u, b, out) {
      const m00 = r.x, m01 = u.x, m02 = b.x, m10 = r.y, m11 = u.y, m12 = b.y, m20 = r.z, m21 = u.z, m22 = b.z;
      const tr = m00 + m11 + m22;
      let x, y, z, w;
      if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
      else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
      else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
      else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
      const l = Math.hypot(x, y, z, w) || 1;
      out = out || {};
      out.x = x / l; out.y = y / l; out.z = z / l; out.w = w / l;
      return out;
    },
    rotate(q, v, out) {
      const ix = q.w * v.x + q.y * v.z - q.z * v.y, iy = q.w * v.y + q.z * v.x - q.x * v.z;
      const iz = q.w * v.z + q.x * v.y - q.y * v.x, iw = -q.x * v.x - q.y * v.y - q.z * v.z;
      out = out || {};
      out.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
      out.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
      out.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;
      return out;
    },
    mul(a, b, out) {
      out = out || {};
      const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
      const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
      const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
      const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
      out.x = x; out.y = y; out.z = z; out.w = w; return out;
    },
    fromAxisAngle(k, a) { const s = Math.sin(a / 2); return { x: k.x * s, y: k.y * s, z: k.z * s, w: Math.cos(a / 2) }; },
    slerp(a, b, t, out) {
      let bx = b.x, by = b.y, bz = b.z, bw = b.w;
      let c = a.x * bx + a.y * by + a.z * bz + a.w * bw;
      if (c < 0) { c = -c; bx = -bx; by = -by; bz = -bz; bw = -bw; }
      let k0, k1;
      if (c > 0.9995) { k0 = 1 - t; k1 = t; }
      else { const th = Math.acos(c), s = Math.sin(th); k0 = Math.sin((1 - t) * th) / s; k1 = Math.sin(t * th) / s; }
      out = out || {};
      out.x = a.x * k0 + bx * k1; out.y = a.y * k0 + by * k1; out.z = a.z * k0 + bz * k1; out.w = a.w * k0 + bw * k1;
      const l = Math.hypot(out.x, out.y, out.z, out.w) || 1;
      out.x /= l; out.y /= l; out.z /= l; out.w /= l;
      return out;
    },
  });

  // ---- deterministic RNG (mulberry32) ---------------------------------------------
  HW.rng = function (seed) {
    let a = seed >>> 0;
    const f = function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (lo, hi) => lo + (hi - lo) * f();
    f.gauss = () => { let u = 0, v = 0; while (u === 0) u = f(); while (v === 0) v = f(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    return f;
  };

  HW.log = (...a) => { if (HW.debug) console.log('[HW]', ...a); };
  HW.debug = false;
})();
