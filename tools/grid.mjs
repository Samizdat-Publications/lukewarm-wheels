import { run } from './lobetest.mjs';
const grid = JSON.parse(process.env.GRID);
const keys = Object.keys(grid);
const out = [];
function rec(i, cfg) {
  if (i === keys.length) {
    const c = Object.assign(JSON.parse(process.env.BASE || '{}'), cfg);
    const r = run(c, { secs: 20 });
    out.push({ c, laps: r.laps, off: r.off, roll: r.maxRoll, endS: r.endS, lapTs: r.lapTs });
    return;
  }
  for (const v of grid[keys[i]]) rec(i + 1, Object.assign({}, cfg, { [keys[i]]: v }));
}
rec(0, {});
out.sort((a, b) => (b.laps - a.laps) || (a.off === false ? -1 : 1) || (a.roll - b.roll));
for (const o of out.slice(0, 16)) console.log(String(o.laps).padStart(2), 'roll' + String(o.roll).padStart(4), 'off', String(o.off).padEnd(14), 'endS' + String(o.endS).padStart(4), JSON.stringify(o.c), JSON.stringify(o.lapTs));
console.log('--- lapping configs:', out.filter((o) => o.laps >= 3).length, '/', out.length);
