// tools/audit.mjs — static geometry audit. Finds the class of defect that costs whole debugging
// sessions: a wall box whose END CAP is exposed to the lane (a car at 300 cm/s that drifts a few
// mm hits it head-on and stops dead), a wall gap wide enough to let a car wander out, and any
// stretch where the surface twists or pitches faster than a rigid four-wheel car can follow.
// Usage: node tools/audit.mjs '{"loopTiltDeg":45}'
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAPIER = (await import(pathToFileURL(path.join(HERE, 'vendor', 'rapier.mjs')).href)).default;
await RAPIER.init();
globalThis.window = globalThis; globalThis.RAPIER = RAPIER;
const require = createRequire(import.meta.url);
for (const f of ['00-namespace', '10-config', '20-catalog', '30-track-layout', '31-track-mesh'])
  require(path.join(path.dirname(HERE), 'src', f + '.js'));
const HW = globalThis.HW; HW.log = () => {};
const V = HW.V, cfg = HW.config;
for (const k in (process.argv[2] ? JSON.parse(process.argv[2]) : {})) cfg[k] = JSON.parse(process.argv[2])[k];
const track = HW.track.build(cfg), mesh = HW.trackMesh.build(track, cfg);

// --- 1. exposed wall end caps -------------------------------------------------------------
// Each box is a cuboid with local axes (right, up, -tangent) from quatFromBasis. Its two end
// faces sit at +-half.z along the box's local Z. A cap is COVERED if another box's body contains
// that face centre. Anything else is a step in the lane.
const boxes = mesh.wallBoxes.map((b) => {
  const q = b.quat, ax = (v) => HW.math.applyQuat(q, v);
  return { b, ex: ax({ x: 1, y: 0, z: 0 }), ey: ax({ x: 0, y: 1, z: 0 }), ez: ax({ x: 0, y: 0, z: 1 }) };
});
const inside = (B, p, m) => {
  const d = V.sub(p, B.b.center);
  return Math.abs(V.dot(d, B.ex)) <= B.b.half.x + m && Math.abs(V.dot(d, B.ey)) <= B.b.half.y + m
      && Math.abs(V.dot(d, B.ez)) <= B.b.half.z + m;
};
const caps = [];
for (const B of boxes) {
  for (const sgn of [-1, 1]) {
    const face = V.addScaled(B.b.center, B.ez, sgn * B.b.half.z);
    if (boxes.some((O) => O !== B && inside(O, face, 0.06))) continue;
    // exposed: how far into the lane does it reach, and does it face along a lane?
    let worst = null;
    for (const c of track.circuits) {
      const pr = c.project(face);
      if (pr.dist > 6) continue;
      const reach = cfg.laneWidth / 2 - Math.abs(pr.lateral);   // >0 means the cap is inside the lane
      const along = Math.abs(V.dot(B.ez, pr.frame.t));          // 1 = end face square across the lane
      if (reach > -0.15 && along > 0.5 && (!worst || reach > worst.reach))
        worst = { circuit: c.name, s: pr.s, lateral: pr.lateral, reach, along, h: pr.height };
    }
    if (worst) caps.push({ face, kind: B.b.flare ? 'flare' : 'wall', ...worst });
  }
}
caps.sort((a, b) => b.reach - a.reach);
console.log('EXPOSED WALL END CAPS facing a lane:', caps.length, '(reach > 0 = the cap stands inside the lane)');
for (const c of caps.slice(0, 12)) console.log('  ' + c.kind.padEnd(5), c.circuit, 's' + c.s.toFixed(1).padStart(6),
  'lat' + c.lateral.toFixed(2).padStart(6), 'reach' + c.reach.toFixed(2).padStart(6), 'along' + c.along.toFixed(2),
  'at(' + c.face.x.toFixed(1) + ',' + c.face.y.toFixed(1) + ',' + c.face.z.toFixed(1) + ')');

// --- 2. wall coverage: where is a lane open on a side, and for how long ---------------------
for (const c of track.circuits) {
  const gaps = { L: [], R: [] };
  const w2 = cfg.laneWidth / 2 + cfg.wallThick / 2 + cfg.wallInset;
  let open = { L: null, R: null };
  for (let s = 0; s < c.length; s += 0.5) {
    const f = c.sample(s);
    for (const side of ['L', 'R']) {
      const p = V.addScaled(f.p, f.right, (side === 'L' ? -1 : 1) * w2);
      const covered = boxes.some((B) => inside(B, p, 0.35));
      if (!covered && open[side] === null) open[side] = s;
      if (covered && open[side] !== null) { gaps[side].push([open[side], s]); open[side] = null; }
    }
  }
  for (const side of ['L', 'R']) {
    if (open[side] !== null) gaps[side].push([open[side], c.length]);
    const big = gaps[side].filter(([a, b]) => b - a > 4.5);
    console.log('WALL GAPS', c.name, side, gaps[side].length, 'total,', big.length, '> 4.5 cm:',
      big.map(([a, b]) => a.toFixed(0) + '-' + b.toFixed(0) + '(' + (b - a).toFixed(1) + ')').join(' '));
  }
}

// --- 3. surface warp: how fast does the ribbon roll / pitch, vs what a rigid car can follow --
// A car with `suspTravel` of travel, `trackCm` wide and `wheelbaseCm` long lifts a wheel when the
// diagonal corner mismatch trackCm * d(roll) over the wheelbase exceeds suspTravel.
const car = HW.catalog[0];
const maxRollRate = HW.units.radToDeg(cfg.suspTravel / (car.trackCm * car.wheelbaseCm)); // deg per cm
console.log('WARP LIMIT for', car.name + ':', maxRollRate.toFixed(2), 'deg/cm of roll (suspTravel',
  cfg.suspTravel, '/ track', car.trackCm, '* wheelbase', car.wheelbaseCm + ')');
for (const c of track.circuits) {
  let worstRoll = { r: 0 }, worstPitch = { k: 0 };
  const ds = 0.5;
  for (let s = 0; s < c.length; s += ds) {
    const a = c.sample(s), b = c.sample(s + ds);
    const roll = HW.units.radToDeg(Math.acos(Math.max(-1, Math.min(1, V.dot(a.up, b.up))))) / ds;
    const pitch = Math.abs(Math.asin(Math.max(-1, Math.min(1, b.t.y))) - Math.asin(Math.max(-1, Math.min(1, a.t.y)))) / ds;
    if (roll > worstRoll.r) worstRoll = { r: roll, s, seg: a.seg.meta.name };
    if (pitch > worstPitch.k) worstPitch = { k: pitch, s, seg: a.seg.meta.name };
  }
  console.log('WARP', c.name, 'max roll', worstRoll.r.toFixed(2), 'deg/cm at s' + worstRoll.s.toFixed(0),
    worstRoll.seg, worstRoll.r > maxRollRate ? '  << OVER LIMIT' : '',
    '| max pitch curvature', worstPitch.k.toFixed(4), '/cm at s' + worstPitch.s.toFixed(0), worstPitch.seg,
    '(=' + (worstPitch.k * 300 * 300).toFixed(0) + ' cm/s2 at 300 cm/s)');
}
