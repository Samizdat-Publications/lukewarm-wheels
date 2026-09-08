// tools/lobetest.mjs — headless physics harness for T18a (no browser, no renderer).
// Usage: node tools/lobetest.mjs [jsonConfigPatch]
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const RAPIER_PATH = process.env.RAPIER_MJS ||
  'C:/Users/stewa/AppData/Local/Temp/claude/C--Users-stewa-OneDrive-Documents-Claude-Projects-Hot-Wheels-Sim/6d3d5827-39c1-4fbd-85e3-a5112ba00c92/scratchpad/rapier.mjs';
const RAPIER = (await import(pathToFileURL(RAPIER_PATH).href)).default;
await RAPIER.init();

globalThis.window = globalThis;
globalThis.RAPIER = RAPIER;
const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
for (const f of ['00-namespace', '10-config', '20-catalog', '30-track-layout', '31-track-mesh',
                 '40-electrical', '41-booster', '42-vehicle', '43-sim']) require(path.join(root, 'src', f + '.js'));
const HW = globalThis.HW;
HW.log = () => {};

const H = 1 / 240;
export function run(cfg = {}, opts = {}) {
  HW.config.reset();
  for (const k in cfg) HW.config[k] = cfg[k];
  HW.sim.create();
  const s = HW.sim, car = s.cars[opts.carIdx || 0];
  s.reset(); s.setSwitch(true);
  for (let i = 0; i < 120; i++) s.step(H);
  car.spawnAtGate(opts.gate || 'N-out');
  const secs = opts.secs || 15, n = Math.round(240 * secs), trace = [];
  let vmax = 0, yMax = 0, off = false, maxRoll = 0; const lapTs = [];
  for (let i = 0; i < n; i++) {
    s.step(H);
    if (car.lifted) { off = 'lifted@' + (i / 240).toFixed(2); break; }
    vmax = Math.max(vmax, car.speed); yMax = Math.max(yMax, car.pos.y);
    const up = HW.math.applyQuat(car.quat, { x: 0, y: 1, z: 0 });
    const lu = car.frame ? car.frame.up : { x: 0, y: 1, z: 0 };
    const roll = Math.acos(Math.max(-1, Math.min(1, up.x * lu.x + up.y * lu.y + up.z * lu.z))) * 180 / Math.PI;
    maxRoll = Math.max(maxRoll, roll);
    while (lapTs.length < car.laps) lapTs.push(+(i / 240).toFixed(2));
    if (car.offTrack && !off) off = 'offtrack@' + (i / 240).toFixed(2);
    if (opts.trace && i % opts.trace === 0) trace.push([(i / 240).toFixed(2), 's' + car.s.toFixed(0), 'v' + car.speed.toFixed(0),
      'lat' + car.lateral.toFixed(2), 'y' + car.pos.y.toFixed(1), 'r' + roll.toFixed(0), 'L' + car.laps,
      car.inBooster || '', (car.frame && car.frame.seg.meta.name) || ''].join(' '));
  }
  return { vmax: +vmax.toFixed(0), yMax: +yMax.toFixed(2), laps: car.laps, lapTs, off,
    maxRoll: +maxRoll.toFixed(0), endV: +car.speed.toFixed(0), endS: +car.s.toFixed(0), stalled: car.stalled, trace };
}

export function five(cfg = {}, secs = 15) {
  HW.config.reset(); for (const k in cfg) HW.config[k] = cfg[k];
  HW.sim.create();
  const s = HW.sim;
  s.reset(); s.setSwitch(true);
  for (let i = 0; i < 120; i++) s.step(H);
  s.lineUpFive();
  let fell = 0, minY = 99;
  for (let i = 0; i < Math.round(240 * secs); i++) {
    s.step(H);
    for (const c of s.cars) if (!c.lifted) minY = Math.min(minY, c.pos.y);
  }
  for (const c of s.cars) if (c.pos.y < -5) fell++;
  return { crashes: s.crashes, minY: +minY.toFixed(2), fell,
    cars: s.cars.map((c) => ({ n: c.entry.id, laps: c.laps, v: +c.speed.toFixed(0), s: +c.s.toFixed(0), lifted: c.lifted, stalled: c.stalled, off: c.offTrack })) };
}

if (process.argv[1] && process.argv[1].endsWith('lobetest.mjs')) {
  const arg = process.argv[2] ? JSON.parse(process.argv[2]) : {};
  console.log(JSON.stringify(run(arg.cfg || {}, arg.opts || {}), null, 1));
}
