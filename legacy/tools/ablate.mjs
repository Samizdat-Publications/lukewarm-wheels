// tools/ablate.mjs — one-at-a-time parameter ablation judged on v at FIXED s (the only stable
// signal; endS/maxS are thresholds on nip capture). Usage:
//   node tools/ablate.mjs '{"base":{...},"probe":[60,110,160,220,270],"cases":{"name":{...}}}'
import { run } from './lobetest.mjs';
const A = JSON.parse(process.argv[2]);
const probe = A.probe || [60, 110, 160, 220, 270];
const cases = Object.assign({ baseline: {} }, A.cases || {});
const head = probe.map((p) => ('v@' + p).padStart(6)).join('');
console.log('case'.padEnd(22) + head + '   laps  off');
for (const [name, patch] of Object.entries(cases)) {
  const r = run(Object.assign({}, A.base || {}, patch), { secs: A.secs || 25, probeS: probe });
  console.log(name.padEnd(22) + probe.map((p) => String(r.probe[p] ?? '-').padStart(6)).join('')
    + '   ' + String(r.laps).padStart(2) + '   ' + String(r.off));
}
