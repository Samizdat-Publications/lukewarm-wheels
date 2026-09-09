// tools/geom.mjs — print the derived lobe geometry and a profile of one circuit.
// Usage: node tools/geom.mjs '{"loopTiltDeg":45}'
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAPIER = (await import(pathToFileURL(path.join(HERE, 'vendor', 'rapier.mjs')).href)).default;
await RAPIER.init();
globalThis.window = globalThis; globalThis.RAPIER = RAPIER;
const require = createRequire(import.meta.url);
const ROOTDIR = path.dirname(HERE);
// Load the physics half of the app in manifest order, so a new src file is picked up here too.
const MANIFEST = JSON.parse(readFileSync(path.join(ROOTDIR, 'src', 'manifest.json'), 'utf8'));
for (const f of MANIFEST.scripts) if (!/(5[0-9]|60|90)-/.test(f)) require(path.join(ROOTDIR, f));
const HW = globalThis.HW;
const patch = process.argv[2] ? JSON.parse(process.argv[2]) : {};
for (const k in patch) HW.config[k] = patch[k];
const cfg = HW.config, track = HW.track.build(cfg);
for (const arm of ['N', 'E', 'S', 'W']) {
  const g = HW.track.lobeGeom(arm, cfg);
  console.log(arm, 'tilt', (g.tilt * 180 / Math.PI).toFixed(1).padStart(5),
    'beta', (g.beta * 180 / Math.PI).toFixed(1).padStart(5), 'rt', g.rt.toFixed(2).padStart(6),
    'gap', g.gap.toFixed(2).padStart(6), 'rampLen', g.rampLen.toFixed(2).padStart(6),
    'sigma', (g.sigma * 180 / Math.PI).toFixed(1).padStart(5), 'y0', g.y0.toFixed(2).padStart(5),
    'apex', g.apex.toFixed(2).padStart(6));
}
const b = track.bounds;
console.log('footprint', (b.maxX - b.minX).toFixed(1), 'x', (b.maxZ - b.minZ).toFixed(1), 'maxY', b.maxY.toFixed(1));
for (const c of track.circuits) console.log(c.name, 'len', c.length.toFixed(1), 'milestones',
  c.milestones.map((m) => m.name + '@' + m.s.toFixed(0)).join(' '));
// profile of the NS circuit: s, y, slope, roll (surface normal tilt), plan curvature radius
const ns = track.circuits[0];
const step = +(process.argv[3] || 4);
let out = [];
for (let s = 0; s < ns.length; s += step) {
  const f = ns.sample(s), f2 = ns.sample(s + 0.5), f0 = ns.sample(s - 0.5);
  const slope = Math.asin(Math.max(-1, Math.min(1, f.t.y))) * 180 / Math.PI;
  const lean = Math.acos(Math.max(-1, Math.min(1, f.up.y))) * 180 / Math.PI;
  // curvature from the tangent turn rate
  const dth = Math.acos(Math.max(-1, Math.min(1, f0.t.x * f2.t.x + f0.t.y * f2.t.y + f0.t.z * f2.t.z)));
  const R = dth > 1e-6 ? 1 / (dth / 1.0) : 999;
  out.push(s.toFixed(0).padStart(4) + ' y' + f.p.y.toFixed(1).padStart(5) + ' slope' + slope.toFixed(0).padStart(4)
    + ' lean' + lean.toFixed(0).padStart(4) + ' R' + (R > 200 ? '  inf' : R.toFixed(0).padStart(5)) + '  ' + f.seg.meta.name);
}
console.log(out.join('\n'));
