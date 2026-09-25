// tools/regress.mjs - bit-exact regression for the physics. Every scenario runs in its own
// node process with a fixed seed and prints a fingerprint: a hash of every car's state
// sampled twice a second, plus a readable summary (laps, crashes, derails).
//
//   node tools/regress.mjs save        record tools/regress-baseline.json
//   node tools/regress.mjs             compare against it (exit 1 on any difference)
//   node tools/regress.mjs one <name>  run one scenario, print its JSON (used internally)
//
// A refactor that must not change behaviour (Phase 1: tracks as data) has to reproduce the
// baseline hash exactly. If a change is MEANT to alter the physics, re-save the baseline in
// the same commit and say why.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const BASE = path.join(HERE, 'regress-baseline.json');

// name -> { set, cars (catalog indices), secs, seed, rapier, lone }
const SCENARIOS = {
  geom:        { secs: 0 },
  'lone-0':    { lone: 0, secs: 20, seed: 1 },
  'lone-1':    { lone: 1, secs: 20, seed: 1 },
  'lone-2':    { lone: 2, secs: 20, seed: 1 },
  'lone-3':    { lone: 3, secs: 20, seed: 1 },
  'lone-4':    { lone: 4, secs: 20, seed: 1 },
  'fleet3-s3': { cars: 3, secs: 40, seed: 3, rapier: true },
  'fleet3-s4': { cars: 3, secs: 40, seed: 4, rapier: true },
  'fleet5-s7': { cars: 5, secs: 25, seed: 7, rapier: true },
  'drop3-s2':  { set: 'dropJump', cars: 3, secs: 20, seed: 2, rapier: true },
  'leap3-s2':  { set: 'loopLeap', cars: 3, secs: 30, seed: 2, rapier: true },
};

const mode = process.argv[2] || 'check';

if (mode === 'one') {
  const name = process.argv[3], sc = SCENARIOS[name];
  globalThis.window = globalThis;
  const require = createRequire(import.meta.url);
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'src', 'manifest.json'), 'utf8'));
  for (const f of manifest.scripts) { const n = +path.basename(f).slice(0, 2); if (n < 50) require(path.join(ROOT, f)); }
  const HW = globalThis.HW;
  if (sc.seed != null) HW.config.seed = sc.seed;
  if (sc.set) HW.config.set = sc.set;
  const hash = createHash('sha256');
  const out = { name };
  if (name === 'geom') {
    const sim = new HW.Sim({ RAPIER: null, catalog: [] });
    const P = sim.layout.path;
    for (const k of ['x', 'y', 'z']) { hash.update(Buffer.from(P.P[k].buffer)); hash.update(Buffer.from(P.U[k].buffer)); hash.update(Buffer.from(P.K[k].buffer)); }
    out.summary = { length: +P.length.toFixed(6), N: P.N, startS: +sim.layout.startS.toFixed(6), boosters: sim.layout.boosters.length, joints: sim.layout.joints.length, supports: sim.layout.supports.length };
  } else {
    let R = null;
    if (sc.rapier) {
      const p = path.join(HERE, 'vendor', 'rapier.mjs');
      R = (await import(pathToFileURL(p).href)).default; await R.init();
    }
    const catalog = sc.lone != null ? [HW.catalog[sc.lone]] : HW.catalog.slice(0, sc.cars);
    const sim = new HW.Sim({ RAPIER: R, catalog });
    const counts = {};
    for (const t of ['crash', 'bump', 'derail', 'recapture', 'retrieve', 'stall', 'dropped', 'lap']) { counts[t] = 0; HW.bus.on(t, () => counts[t]++); }
    if (sc.lone != null) {
      sim.setSwitch(true);
      for (let i = 0; i < 0.6 * 1920; i++) sim.step(1 / 1920);
      sim.placeOnTrack(sim.cars[0], sim.layout.startS, 0);
    } else sim.lineUpAll();
    const h = 1 / sim.cfg.substepHz, every = Math.round(0.5 / h), n = Math.round(sc.secs / h);
    const buf = new Float64Array(8);
    for (let i = 1; i <= n; i++) {
      sim.step(h);
      if (i % every) continue;
      for (const c of sim.cars) {
        buf[0] = c.mode === 'track' ? 1 : c.mode === 'free' ? 2 : c.mode === 'retrieving' ? 3 : 0;
        buf[1] = c.s; buf[2] = c.v; buf[3] = c.pos.x; buf[4] = c.pos.y; buf[5] = c.pos.z; buf[6] = c.d; buf[7] = c.h;
        hash.update(Buffer.from(buf.buffer));
      }
    }
    out.summary = { counts, laps: sim.cars.map((c) => c.laps), crashes: sim.crashCount, foam: +sim.power.surfaceSpeed.toFixed(3) };
  }
  out.hash = hash.digest('hex').slice(0, 16);
  console.log(JSON.stringify(out));
  process.exit(0);
}

const only = process.argv[3] ? process.argv[3].split(',') : Object.keys(SCENARIOS);
const results = {};
for (const name of only) {
  const t0 = Date.now();
  const txt = execFileSync(process.execPath, [fileURLToPath(import.meta.url), 'one', name], { encoding: 'utf8', env: process.env });
  results[name] = JSON.parse(txt.trim().split('\n').pop());
  results[name].secs = +((Date.now() - t0) / 1000).toFixed(1);
}
if (mode === 'save') {
  const prev = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : {};
  for (const k in results) { delete results[k].secs; prev[k] = results[k]; }
  writeFileSync(BASE, JSON.stringify(prev, null, 1) + '\n');
  for (const k in results) console.log(k.padEnd(10), results[k].hash, JSON.stringify(results[k].summary));
  console.log('saved', BASE);
} else {
  const base = JSON.parse(readFileSync(BASE, 'utf8'));
  let bad = 0;
  for (const k in results) {
    const r = results[k], b = base[k];
    const same = b && b.hash === r.hash;
    if (!same) bad++;
    console.log((same ? 'same ' : 'DIFF ') + k.padEnd(10), r.hash, `(${r.secs}s)`, same ? '' : '\n   now  ' + JSON.stringify(r.summary) + '\n   base ' + JSON.stringify(b && b.summary));
  }
  console.log(bad ? `${bad} scenario(s) differ` : 'all scenarios identical');
  process.exit(bad ? 1 : 0);
}
