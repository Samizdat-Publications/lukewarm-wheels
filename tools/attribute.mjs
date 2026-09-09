// tools/attribute.mjs — WHAT is taking the energy? Splits the per-step loss of specific energy
// into buckets by what was true that step: chassis touching a wall (and how hard), how many
// wheels were on the ground. A loss that is insensitive to every friction coefficient has to be
// coming from somewhere; this says which.
// Usage: node tools/attribute.mjs '{"cfg":{...},"from":26,"to":125,"secs":5}'
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
const HW = globalThis.HW; HW.log = () => {};
const A = process.argv[2] ? JSON.parse(process.argv[2]) : {};
HW.config.reset(); for (const k in (A.cfg || {})) HW.config[k] = A.cfg[k];
HW.sim.create();
const s = HW.sim, H = 1 / HW.config.physicsHz, G = HW.units.G;
const from = A.from ?? 26, to = A.to ?? 125;
const B = { wallHit: { dE: 0, ds: 0, n: 0 }, wheelsUp: { dE: 0, ds: 0, n: 0 },
            airborne: { dE: 0, ds: 0, n: 0 }, clean: { dE: 0, ds: 0, n: 0 } };
let impulseTotal = 0, steps = 0;
for (const carIdx of (A.cars || [0, 1, 2, 3, 4])) for (const back of (A.backs || [0, 0.11, 0.29, 0.53])) {
  const car = s.cars[carIdx];
  s.reset(); s.setSwitch(true);
  for (let i = 0; i < Math.round(1 / H); i++) s.step(H);
  car.spawnAtGate(A.gate || 'N-out', back);
  let prev = null;
  for (let i = 0; i < Math.round((A.secs || 5) / H); i++) {
    s.step(H);
    if (car.lifted || car.offTrack) break;
    const E = 0.5 * car.speed * car.speed + G * car.pos.y;
    const cur = { s: car.s, E };
    if (prev && cur.s > prev.s && cur.s - prev.s < 5 && prev.s >= from && prev.s < to) {
      let imp = 0;
      s.world.contactPairsWith(car.collider, (other) => {
        s.world.contactPair(car.collider, other, (man) => {
          for (let k = 0; k < man.numContacts(); k++) imp = Math.max(imp, man.contactImpulse(k));
        });
      });
      impulseTotal += imp; steps++;
      let nUp = 0; for (let k = 0; k < 4; k++) { const w = car.wheelState(k); if (w && !w.contact) nUp++; }
      const b = nUp === 4 ? B.airborne : imp > 20 ? B.wallHit : nUp > 0 ? B.wheelsUp : B.clean;
      b.dE += cur.E - prev.E; b.ds += cur.s - prev.s; b.n++;
    }
    prev = cur;
  }
}
console.log('bucket      steps    cm    lost(erg/g)   drag(g) in that bucket   share of total loss');
let tot = 0; for (const k in B) tot += -B[k].dE;
for (const k of ['wallHit', 'wheelsUp', 'airborne', 'clean']) {
  const b = B[k];
  console.log(k.padEnd(11) + String(b.n).padStart(6) + b.ds.toFixed(0).padStart(7)
    + (-b.dE).toFixed(0).padStart(13) + '   ' + (b.ds > 0 ? (-b.dE / b.ds / G).toFixed(3) : '-').padStart(7)
    + '                ' + (100 * -b.dE / tot).toFixed(0) + ' %');
}
console.log('mean max contact impulse per step:', (impulseTotal / Math.max(1, steps)).toFixed(0), 'g.cm/s');
