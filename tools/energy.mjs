// tools/energy.mjs — WHERE does the specific energy go? Bins one lap by path distance and reports
// the average retarding acceleration in g for each bin, with gravity removed (a climb is a
// reservoir, not a loss). This is the energy budget: the nips are the only input, so a car must
// coast from one to the next and the only question is which stretch is eating it.
// Usage: node tools/energy.mjs '{"cfg":{...},"bin":10,"secs":8,"carIdx":0}'
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
const L0 = s.track.circuits[0].length;
const bin = A.bin || 10, nb = Math.ceil(L0 / bin);
const acc = Array.from({ length: nb }, () => ({ dE: 0, ds: 0, boost: 0, seg: '', vIn: null, vOut: 0, wOff: 0, n: 0 }));
// Average over the whole fleet and several start offsets: a single run is chaotic (tools/chaos.mjs),
// but drag binned by position and averaged over runs is stable enough to compare configs.
const fleet = A.cars || [0, 1, 2, 3, 4], backs = A.backs || [0, 0.11];
let L = L0, leftCount = 0;
for (const carIdx of fleet) for (const back of backs) {
const car = s.cars[carIdx];
s.reset(); s.setSwitch(true);
for (let i = 0; i < Math.round(1 / H); i++) s.step(H);
car.spawnAtGate(A.gate || 'N-out', back);
L = car.path ? car.path.length : L0;
let prev = null;
for (let i = 0; i < Math.round((A.secs || 8) / H); i++) {
  s.step(H);
  if (car.lifted || car.offTrack) { leftCount++; break; }
  const E = 0.5 * car.speed * car.speed + G * car.pos.y;   // specific energy, erg/g
  const cur = { s: car.s, E, y: car.pos.y };
  if (prev) {
    let ds = cur.s - prev.s; if (ds < -L / 2) ds += L; if (ds > L / 2) ds -= L;
    if (ds > 0 && ds < 5) {
      const b = acc[Math.floor(prev.s / bin) % nb];
      b.dE += cur.E - prev.E; b.ds += ds; b.n++;
      if (car.inBooster) b.boost++;
      if (b.vIn === null) b.vIn = car.speed;
      b.vOut = car.speed;
      b.seg = car.frame ? car.frame.seg.meta.name : '';
      for (let k = 0; k < 4; k++) if (!car.wheelState(k).contact) b.wOff++;
    }
  }
  prev = cur;
}
}
console.log('# ' + leftCount + ' of ' + (fleet.length * backs.length) + ' runs left the track');
console.log('lap length ' + L.toFixed(1) + ' cm, bins of ' + bin + ' cm.  drag = -dE/ds in g (gravity removed)');
console.log('   s   seg                 vIn  vOut    drag(g)  wheelsOff%  nip');
for (let i = 0; i < nb; i++) {
  const b = acc[i];
  if (!b.ds) continue;
  const g = -b.dE / b.ds / G;
  const bar = '#'.repeat(Math.max(0, Math.min(40, Math.round(g * 20))));
  console.log(String(i * bin).padStart(4) + '   ' + b.seg.padEnd(18)
    + String(Math.round(b.vIn)).padStart(4) + String(Math.round(b.vOut)).padStart(6)
    + '   ' + g.toFixed(2).padStart(6) + '  ' + String(Math.round(100 * b.wOff / (4 * b.n))).padStart(3) + '%   '
    + (b.boost ? 'NIP' : '   ') + ' ' + bar);
}
// range summaries: mean retarding acceleration over each [from,to] of path distance
for (const [a, z] of (A.summary || [[26, 44], [44, 120], [120, 140]])) {
  let dE = 0, ds = 0;
  for (let i = 0; i < nb; i++) { const c = i * bin; if (c < a || c >= z) continue; dE += acc[i].dE; ds += acc[i].ds; }
  if (ds > 0) console.log('SUMMARY s' + a + '-' + z + ': mean drag ' + (-dE / ds / G).toFixed(3) + ' g over ' + (ds / (fleet.length * backs.length)).toFixed(0) + ' cm/run');
}
