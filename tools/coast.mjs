// tools/coast.mjs — the cleanest possible drag measurement. Puts a car on the track with a given
// speed and NO booster, and reports the deceleration over each stretch. Safe in vehicleMode
// 'springs' with wheelGrip 0 (no tyre model to spin up, which is what makes setLinvel unsafe with
// Rapier's raycast controller). Usage: node tools/coast.mjs '{"cfg":{...},"v0":300,"s0":5}'
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
HW.config.reset(); for (const k in (A.cfg || {})) HW.config[k] = A.cfg[k];
HW.sim.create();
const s = HW.sim, H = 1 / HW.config.physicsHz, G = HW.units.G, car = s.cars[A.carIdx || 0];
s.reset(); s.setSwitch(false);                       // motor OFF: nothing but the car and the track
const path0 = s.track.circuits[0];
car.placeAt(path0, A.s0 ?? 5, 0);
for (let i = 0; i < 60; i++) s.step(H);               // let it settle
const f = path0.sample(car.s);
const v0 = A.v0 || 300;
car.body.setLinvel({ x: f.t.x * v0, y: f.t.y * v0, z: f.t.z * v0 }, true);
const bin = A.bin || 10;
let prev = null, acc = {}, maxS = car.s, left = false, backwards = 0;
for (let i = 0; i < Math.round((A.secs || 6) / H); i++) {
  s.step(H);
  if (car.lifted || car.offTrack) { left = true; break; }
  if (car.s > maxS && car.s - maxS < 5) maxS = car.s;
  const E = 0.5 * car.speed * car.speed + G * car.pos.y;
  if (prev) {
    let ds = car.s - prev.s; if (ds < -path0.length / 2) ds += path0.length;
    if (ds < 0 && ds > -5) backwards += -ds;
    if (ds > 0 && ds < 5) {
      const k = Math.floor(prev.s / bin) * bin;
      (acc[k] = acc[k] || { dE: 0, ds: 0, v: car.speed, seg: '' });
      acc[k].dE += E - prev.E; acc[k].ds += ds; acc[k].v = car.speed;
      acc[k].seg = (car.frame && car.frame.seg.meta.name) || '';
    }
  }
  prev = { s: car.s, E };
}
console.log('coast from ' + v0 + ' cm/s at s=' + (A.s0 ?? 5) + ', motor off.'
  + '   REACHED s=' + maxS.toFixed(0) + ' of ' + path0.length.toFixed(0)
  + (left ? '  (LEFT THE TRACK)' : '') + (backwards > 3 ? '  (rolled back ' + backwards.toFixed(0) + ' cm)' : '')
  + '   final v=' + car.speed.toFixed(0));
console.log('drag in g, gravity removed:');
for (const k of Object.keys(acc).map(Number).sort((a, b) => a - b)) {
  const b = acc[k];
  if (b.ds < 1) continue;
  console.log(String(k).padStart(5), 'v' + Math.round(b.v).toString().padStart(4),
    'drag ' + (-b.dE / b.ds / G).toFixed(3).padStart(7), ' ' + b.seg);
}
