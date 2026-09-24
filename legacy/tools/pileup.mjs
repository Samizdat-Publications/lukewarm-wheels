// tools/pileup.mjs — is it FUN? The five-car pile-up is the point of this toy, and no single-car
// number measures it. Feeds all five cars in through `lineUpFive` (the same staggered order the UI
// uses), then reports, averaged over several spin-up offsets: crashes, total laps, how many cars
// are still moving at the end, how many stalled, and how far the motor bogged. A config that laps
// beautifully with one car and bogs to a standstill with five is not the one to ship.
// Usage: node tools/pileup.mjs '{"secs":25,"cases":{"name":{...}}}'
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
const secs = A.secs || 25;
const leads = A.leads || [0, 0.13, 0.31, 0.57];   // extra spin-up before the first car: the same
                                                  // 0.02 mm chaos as everywhere else, so spread it
const cases = A.cases && Object.keys(A.cases).length ? A.cases : { baseline: {} };

function one(cfg, extraLead) {
  HW.config.reset(); for (const k in cfg) HW.config[k] = cfg[k];
  HW.config.lineUpLead = HW.config.lineUpLead + extraLead;
  HW.sim.create();
  const s = HW.sim, H = 1 / HW.config.physicsHz;
  s.reset(); s.setSwitch(true);
  for (let i = 0; i < Math.round(0.5 / H); i++) s.step(H);
  s.lineUpFive();
  let rpmMin = 1e9, fell = 0;
  for (let i = 0; i < Math.round(secs / H); i++) {
    s.step(H);
    if (i > Math.round(2 / H)) rpmMin = Math.min(rpmMin, s.elec.telemetry().rpmMotor);
  }
  let laps = 0, moving = 0, stalled = 0, off = 0;
  for (const c of s.cars) {
    laps += c.laps;
    if (c.pos.y < -5 || c.offTrack || c.lifted) off++;
    else if (c.speed > 20) moving++;
    else stalled++;
  }
  return { crashes: s.crashes, laps, moving, stalled, off, rpmMin, fell };
}

console.log('five cars, ' + secs + ' s, n=' + leads.length + ' per case');
console.log('case'.padEnd(22) + ' crashes  laps  moving stalled  off   motor rpm floor');
for (const [name, patch] of Object.entries(cases)) {
  const rs = leads.map((l) => one(Object.assign({}, A.base || {}, patch), l));
  const avg = (k) => rs.reduce((a, r) => a + r[k], 0) / rs.length;
  console.log(name.padEnd(22)
    + avg('crashes').toFixed(1).padStart(7)
    + avg('laps').toFixed(1).padStart(7)
    + avg('moving').toFixed(1).padStart(7)
    + avg('stalled').toFixed(1).padStart(8)
    + avg('off').toFixed(1).padStart(6)
    + avg('rpmMin').toFixed(0).padStart(11));
}
