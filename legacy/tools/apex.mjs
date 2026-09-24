// tools/apex.mjs — how much margin does a car have AT THE CREST? T26's diagnostic.
//
// Tracing a failing run (HANDOFF T26) showed the binding constraint is not drag anywhere in
// particular, it is the ring's apex: the car reaches y = 23.7 cm at 21 cm/s against a 24.0 cm apex,
// fails to crest and rolls back down. "Mean laps" measures that only through a bimodal, very noisy
// counter. The speed AT the apex is continuous, so its median is far tighter, and it is the
// quantity the physics is actually about.
//
// Reports per config: the apex height, the speed a car needs at the BOTTOM of the lobe just to
// reach the apex with nothing to spare (sqrt(2 g dh), drag ignored -- an optimistic floor), the
// median and worst speed actually measured crossing the apex, and how many runs got there at all.
// Usage: node tools/apex.mjs '{"secs":12,"cases":{"name":{...}}}'
import { run } from './lobetest.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const HW = globalThis.HW;                       // lobetest.mjs has already booted the namespace
const A = JSON.parse(process.argv[2] || '{}');
const backs = A.backs || [0, 0.07, 0.19, 0.43, 0.31, 0.11];
const cars = A.cars || [0, 1, 2, 3, 4];
const secs = A.secs || 12;
const cases = A.cases && Object.keys(A.cases).length ? A.cases : { baseline: {} };
const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : NaN; };

console.log('n=' + cars.length * backs.length + ' runs/case, ' + secs + ' s each');
console.log('case'.padEnd(20) + '  apex  needV   reached%   v@apex: median  worst   lap1%');
for (const [name, patch] of Object.entries(cases)) {
  const cfg = Object.assign({ autoRecycle: false }, A.base || {}, patch);
  // geometry first: where is the apex, and how high above the lobe's foot?
  HW.config.reset(); for (const k in cfg) HW.config[k] = cfg[k];
  const track = HW.track.build(HW.config), p0 = track.circuits[0];
  let apexS = 0, apexY = -1;
  for (let s = 0; s < p0.length; s += 0.5) { const y = p0.sample(s).p.y; if (y > apexY) { apexY = y; apexS = s; } }
  const footY = p0.sample(p0.milestones.find((m) => m.name === 'N-out-ramp').s).p.y;
  const needV = Math.sqrt(2 * HW.units.G * (apexY - footY));
  const vs = [], lapped = [];
  for (const carIdx of cars) for (const back of backs) {
    const r = run(cfg, { secs, probeS: [Math.round(apexS)], back, carIdx });
    const v = r.probe[Math.round(apexS)];
    if (v !== undefined) vs.push(v);
    lapped.push(r.laps >= 1 ? 1 : 0);
  }
  const n = cars.length * backs.length;
  console.log(name.padEnd(20)
    + apexY.toFixed(1).padStart(6) + needV.toFixed(0).padStart(7)
    + String(Math.round(100 * vs.length / n)).padStart(9) + ' %'
    + String(vs.length ? med(vs) : '-').padStart(14) + String(vs.length ? Math.min(...vs) : '-').padStart(7)
    + String(Math.round(100 * lapped.reduce((a, b) => a + b, 0) / n)).padStart(8) + ' %');
}
