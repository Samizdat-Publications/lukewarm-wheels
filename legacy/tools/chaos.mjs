// tools/chaos.mjs — how sensitive is a single run to a millimetre of start position?
// If v at a fixed s swings wildly for a 0.02 mm offset, single-run metrics are noise and every
// config must be judged on an ENSEMBLE. Usage: node tools/chaos.mjs '{"loopTiltDeg":18}'
import { run } from './lobetest.mjs';
const cfg = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const probe = [60, 110, 160, 220, 270];
console.log('car back     ' + probe.map((p) => ('v@' + p).padStart(6)).join('') + '  laps  off');
for (const carIdx of [0, 1]) for (const back of [0, 0.002, 0.005, 0.01, 0.05, 0.2]) {
  const r = run(cfg, { secs: 25, probeS: probe, back, carIdx });
  console.log(String(carIdx) + '   ' + String(back).padEnd(9)
    + probe.map((p) => String(r.probe[p] ?? '-').padStart(6)).join('')
    + '   ' + String(r.laps).padStart(2) + '  ' + r.off);
}
