// tools/ens.mjs — ENSEMBLE evaluation. tools/chaos.mjs shows a 0.02 mm change of start position
// swings v@60 from 78 to 210 and laps from 0 to 1, so a single run says nothing: every config must
// be judged on a spread. Runs each of the five castings from several start offsets and reports
// mean laps, the fraction that leave the track, and the median speed at fixed s.
// Usage: node tools/ens.mjs '{"base":{...},"cases":{"name":{...}},"secs":25,"backs":[0,0.05,0.2,0.5]}'
import { run } from './lobetest.mjs';
const A = JSON.parse(process.argv[2] || '{}');
const probe = A.probe || [60, 110, 160, 220, 270];
const backs = A.backs || [0, 0.07, 0.19, 0.43];
const cars = A.cars || [0, 1, 2, 3, 4];
const secs = A.secs || 25;
const cases = A.cases && Object.keys(A.cases).length ? A.cases : { baseline: {} };
const med = (a) => { const b = a.filter((x) => x !== undefined).sort((x, y) => x - y); return b.length ? b[b.length >> 1] : '-'; };
console.log('n=' + cars.length * backs.length + ' runs/case, ' + secs + 's each');
console.log('case'.padEnd(20) + ' laps(mean max)  off%  ' + probe.map((p) => ('v@' + p).padStart(6)).join(''));
for (const [name, patch] of Object.entries(cases)) {
  const cfg = Object.assign({}, A.base || {}, patch);
  const laps = [], offs = [], P = probe.map(() => []);
  for (const carIdx of cars) for (const back of backs) {
    const r = run(cfg, { secs, probeS: probe, back, carIdx });
    laps.push(r.laps); offs.push(r.off !== false ? 1 : 0);
    probe.forEach((p, i) => P[i].push(r.probe[p]));
  }
  const mean = laps.reduce((a, b) => a + b, 0) / laps.length;
  console.log(name.padEnd(20) + '  ' + mean.toFixed(2).padStart(5) + ' ' + String(Math.max(...laps)).padStart(3)
    + '     ' + String(Math.round(100 * offs.reduce((a, b) => a + b, 0) / offs.length)).padStart(3)
    + '   ' + P.map((a) => String(med(a)).padStart(6)).join(''));
}
