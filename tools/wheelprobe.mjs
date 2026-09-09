// tools/wheelprobe.mjs — per-wheel compression and load for vehicleMode 'wheels', step by step.
// Usage: node tools/wheelprobe.mjs '{"cfg":{...},"from":0.05,"to":0.2,"carIdx":0}'
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
HW.config.reset(); HW.config.vehicleMode = 'wheels';
for (const k in (A.cfg || {})) HW.config[k] = A.cfg[k];
HW.sim.create();
const s = HW.sim, H = 1 / HW.config.physicsHz, car = s.cars[A.carIdx || 0];
const mg = car.entry.massG * HW.units.G;
s.reset(); s.setSwitch(true);
for (let i = 0; i < Math.round(1 / H); i++) s.step(H);
car.spawnAtGate(A.gate || 'N-out', A.back || 0);
console.log('mg =', mg.toFixed(0), 'dyne; per-wheel static =', (mg / 4).toFixed(0),
  '; cap =', (HW.config.suspMaxForceMult * mg / 4).toFixed(0));
console.log('   t     y     h   comp(FL,FR,RL,RR)          load / static      sum/mg  seg');
for (let i = 0; i < Math.round((A.to || 0.25) / H); i++) {
  s.step(H);
  const t = i * H;
  if (t < (A.from || 0) || i % (A.every || 4)) continue;
  const comps = car.wheels.map((w) => (w.contact ? w.comp : 0).toFixed(3)).join(',');
  const loads = car.wheels.map((w) => (w.load / (mg / 4)).toFixed(1)).join(',');
  const sum = car.wheels.reduce((a, w) => a + w.load, 0) / mg;
  console.log(t.toFixed(3).padStart(6), car.pos.y.toFixed(2).padStart(6), (car.height || 0).toFixed(2).padStart(6),
    '  ' + comps.padEnd(24), loads.padEnd(20), sum.toFixed(2).padStart(6),
    ' ' + ((car.frame && car.frame.seg.meta.name) || '-'));
}
