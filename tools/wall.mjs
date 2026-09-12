// tools/wall.mjs — WHY does a curve cost so much? A deterministic coast over ONE stretch of track,
// repeated for several config patches, reported as a single drag number each. The ensemble is too
// noisy (see HANDOFF "METHODOLOGY") to resolve a 20 % change; this is noise-free because the motor
// is off, the nip is disabled and the start state is identical every time.
//
// Reports, per case: how far it got, mean drag in g over the stretch, the fraction of steps with a
// chassis contact, the mean contact impulse, and the RMS of the car's LATERAL velocity. That last
// column is the tell: a car sliding smoothly along a wall has almost no lateral velocity, while a
// car ricocheting off the flat chords of a polygonal wall has a lot -- and a collisional loss is
// insensitive to the friction coefficient, which is exactly what every friction sweep has found.
//
// Usage: node tools/wall.mjs '{"v0":300,"s0":26,"s1":60,"base":{},"cases":{"name":{...}}}'
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
const MANIFEST = JSON.parse(readFileSync(path.join(ROOTDIR, 'src', 'manifest.json'), 'utf8'));
for (const f of MANIFEST.scripts) if (!/(5[0-9]|60|90)-/.test(f)) require(path.join(ROOTDIR, f));
const HW = globalThis.HW; HW.log = () => {};

const A = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const v0 = A.v0 ?? 300, s0 = A.s0 ?? 26, s1 = A.s1 ?? 60;
// springs + wheelGrip 0 removes the tyre model entirely, so what is left is the track. foamK 0
// stops the stationary foam wheel from braking the coast (HANDOFF "Gotchas").
const BASE = Object.assign({ vehicleMode: 'springs', wheelGrip: 0, crrScale: 0, foamK: 0 }, A.base || {});
const cases = A.cases && Object.keys(A.cases).length ? A.cases : { baseline: {} };
const cars = A.cars || [0];
const starts = A.starts || [0];   // s0 jitter: one run of a chaotic system says nothing, even with the motor off

function one(cfg, carIdx, dS) {
  HW.config.reset(); for (const k in cfg) HW.config[k] = cfg[k];
  HW.sim.create();
  const s = HW.sim, H = 1 / HW.config.physicsHz, G = HW.units.G, car = s.cars[carIdx];
  s.reset(); s.setSwitch(false);
  const p0 = s.track.circuits[0];
  car.placeAt(p0, s0 + dS, 0);
  for (let i = 0; i < 90; i++) s.step(H);          // settle on its springs
  const f = p0.sample(car.s);
  car.body.setLinvel({ x: f.t.x * v0, y: f.t.y * v0, z: f.t.z * v0 }, true);
  let prev = null, E0 = null, E1 = null, ds = 0, steps = 0, touch = 0, impSum = 0, impMax = 0;
  let latSq = 0, maxS = car.s, left = false;
  for (let i = 0; i < Math.round((A.secs || 5) / H); i++) {
    s.step(H);
    if (car.lifted || car.offTrack) { left = true; break; }
    if (car.s > maxS && car.s - maxS < 5) maxS = car.s;
    if (car.s >= s1) break;
    const E = 0.5 * car.speed * car.speed + G * car.pos.y;
    if (prev && car.s > prev.s && car.s - prev.s < 5) {
      if (E0 === null) E0 = prev.E;
      E1 = E; ds += car.s - prev.s; steps++;
      let imp = 0;
      s.world.contactPairsWith(car.collider, (other) => {
        s.world.contactPair(car.collider, other, (man) => {
          for (let k = 0; k < man.numContacts(); k++) imp = Math.max(imp, man.contactImpulse(k));
        });
      });
      if (imp > 1) touch++;
      impSum += imp; impMax = Math.max(impMax, imp);
      const fr = car.frame && car.frame.right ? car.frame : p0.sample(car.s);
      const v = car.body.linvel();
      const lat = v.x * fr.right.x + v.y * fr.right.y + v.z * fr.right.z;
      latSq += lat * lat;
    }
    prev = { s: car.s, E };
  }
  return { reach: maxS, left, ds, drag: ds > 1 ? -(E1 - E0) / ds / G : NaN,
           touch: steps ? touch / steps : 0, imp: steps ? impSum / steps : 0, impMax,
           lat: steps ? Math.sqrt(latSq / steps) : 0 };
}

console.log('coast ' + v0 + ' cm/s, s ' + s0 + ' -> ' + s1 + ', motor off, no tyre model');
console.log('n=' + cars.length * starts.length + ' runs/case');
console.log('case'.padEnd(22) + ' reach  drag(g)  touch%   imp   impMax   latRMS   sem');
for (const [name, patch] of Object.entries(cases)) {
  const cfg = Object.assign({}, BASE, patch);
  const rs = []; for (const c of cars) for (const dS of starts) rs.push(one(cfg, c, dS));
  const avg = (k) => rs.reduce((a, r) => a + r[k], 0) / rs.length;
  const sd = (k) => { const m = avg(k); return Math.sqrt(rs.reduce((a, r) => a + (r[k] - m) * (r[k] - m), 0) / rs.length) / Math.sqrt(rs.length); };
  console.log(name.padEnd(22)
    + avg('reach').toFixed(0).padStart(5)
    + (rs.some((r) => r.left) ? '*' : ' ')
    + avg('drag').toFixed(3).padStart(8)
    + (100 * avg('touch')).toFixed(0).padStart(7)
    + avg('imp').toFixed(0).padStart(7)
    + avg('impMax').toFixed(0).padStart(8)
    + avg('lat').toFixed(1).padStart(9)
    + '   +-' + sd('drag').toFixed(3));
}
