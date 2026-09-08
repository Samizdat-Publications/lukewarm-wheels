import { run, five } from './lobetest.mjs';
const cases = JSON.parse(process.argv[2]);
for (const [name, cfg] of Object.entries(cases)) {
  const r = run(cfg, { secs: +(process.argv[3] || 15) });
  console.log(name.padEnd(28), 'vmax', String(r.vmax).padStart(4), 'yMax', String(r.yMax).padStart(6),
    'laps', r.laps, 'lapTs', JSON.stringify(r.lapTs).padEnd(22), 'roll', String(r.maxRoll).padStart(3),
    'off', String(r.off).padEnd(14), 'endS', r.endS, 'endV', r.endV);
}
