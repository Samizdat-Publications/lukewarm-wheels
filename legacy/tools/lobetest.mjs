// tools/lobetest.mjs — headless physics harness for T18a (no browser, no renderer).
// Usage: node tools/lobetest.mjs [jsonConfigPatch]
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

// Rapier is vendored at tools/vendor/rapier.mjs (gitignored). If it is missing, fetch the ESM
// bundle once:  node tools/fetch-rapier.mjs
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAPIER_PATH = process.env.RAPIER_MJS || path.join(HERE, 'vendor', 'rapier.mjs');
const RAPIER = (await import(pathToFileURL(RAPIER_PATH).href)).default;
await RAPIER.init();

globalThis.window = globalThis;
globalThis.RAPIER = RAPIER;
const require = createRequire(import.meta.url);
const root = path.dirname(HERE);
const ROOTDIR = root;
// Load the physics half of the app in manifest order, so a new src file is picked up here too.
const MANIFEST = JSON.parse(readFileSync(path.join(ROOTDIR, 'src', 'manifest.json'), 'utf8'));
for (const f of MANIFEST.scripts) if (!/(5[0-9]|60|90)-/.test(f)) require(path.join(ROOTDIR, f));
const HW = globalThis.HW;
HW.log = () => {};

// NB: the step size must follow HW.config.physicsHz. Hard-coding 1/240 while the world's own
// timestep tracked the config made every physicsHz experiment silently run at the wrong speed.
export function run(cfg = {}, opts = {}) {
  HW.config.reset();
  for (const k in cfg) HW.config[k] = cfg[k];
  HW.sim.create();
  const H = 1 / HW.config.physicsHz;
  const s = HW.sim, car = s.cars[opts.carIdx || 0];
  s.reset(); s.setSwitch(true);
  for (let i = 0; i < Math.round(0.5 / H); i++) s.step(H);
  car.spawnAtGate(opts.gate || 'N-out', opts.back || 0);
  const secs = opts.secs || 15, n = Math.round(secs / H), trace = [];
  let vmax = 0, yMax = 0, off = false, offS = null, maxRoll = 0; const lapTs = [];
  // v at fixed s is the only stable signal: maxS/endS are thresholds on whether a nip happens to
  // catch the car, so they flip between wildly different values for a 1% config change.
  const probeS = opts.probeS || [], probe = {}; let lastS = car.s;
  for (let i = 0; i < n; i++) {
    s.step(H);
    for (const ps of probeS) if (probe[ps] === undefined && lastS < ps && car.s >= ps && car.s - lastS < 20) probe[ps] = +car.speed.toFixed(0);
    lastS = car.s;
    if (car.lifted) { off = 'lifted@' + (i * H).toFixed(2); if (offS === null) offS = Math.round(car.s); break; }
    vmax = Math.max(vmax, car.speed); yMax = Math.max(yMax, car.pos.y);
    const up = HW.math.applyQuat(car.quat, { x: 0, y: 1, z: 0 });
    const lu = car.frame ? car.frame.up : { x: 0, y: 1, z: 0 };
    const roll = Math.acos(Math.max(-1, Math.min(1, up.x * lu.x + up.y * lu.y + up.z * lu.z))) * 180 / Math.PI;
    maxRoll = Math.max(maxRoll, roll);
    while (lapTs.length < car.laps) lapTs.push(+(i * H).toFixed(2));
    // WHERE a car leaves matters more than that it left: the departures cluster on one stretch.
    if (car.offTrack && !off) { off = 'offtrack@' + (i * H).toFixed(2); offS = Math.round(car.s); }
    if (opts.trace && i % opts.trace === 0) trace.push([(i * H).toFixed(2), 's' + car.s.toFixed(0), 'v' + car.speed.toFixed(0),
      'lat' + car.lateral.toFixed(2), 'y' + car.pos.y.toFixed(1), 'r' + roll.toFixed(0), 'L' + car.laps,
      car.inBooster || '', (car.frame && car.frame.seg.meta.name) || ''].join(' '));
  }
  return { vmax: +vmax.toFixed(0), yMax: +yMax.toFixed(2), laps: car.laps, lapTs, off, offS, probe,
    maxRoll: +maxRoll.toFixed(0), endV: +car.speed.toFixed(0), endS: +car.s.toFixed(0), stalled: car.stalled, trace };
}

export function five(cfg = {}, secs = 15) {
  HW.config.reset(); for (const k in cfg) HW.config[k] = cfg[k];
  HW.sim.create();
  const H = 1 / HW.config.physicsHz;
  const s = HW.sim;
  s.reset(); s.setSwitch(true);
  for (let i = 0; i < Math.round(0.5 / H); i++) s.step(H);
  s.lineUpFive();
  let fell = 0, minY = 99;
  for (let i = 0; i < Math.round(secs / H); i++) {
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
