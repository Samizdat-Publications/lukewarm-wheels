// tools/simtest.mjs - headless physics runs (no browser). Loads src/00..49 in node.
//
//   node tools/simtest.mjs lone [secs] [castingIndex]   one car, reports laps, speeds, energy
//   node tools/simtest.mjs five [secs]                   line up all five (needs Rapier)
//   node tools/simtest.mjs geom                          track geometry summary
//   env CFG='{"muWall":0.2}' overrides config keys
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
globalThis.window = globalThis;
const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'src', 'manifest.json'), 'utf8'));
for (const f of manifest.scripts) { const n = +path.basename(f).slice(0, 2); if (n < 50) require(path.join(ROOT, f)); }
const HW = globalThis.HW;
if (process.env.CFG) Object.assign(HW.config, JSON.parse(process.env.CFG));

async function rapier() {
  const p = path.join(HERE, 'vendor', 'rapier.mjs');
  if (!existsSync(p)) { console.log('(no tools/vendor/rapier.mjs; run node tools/fetch-rapier.mjs)'); return null; }
  const R = (await import(pathToFileURL(p).href)).default;
  await R.init();
  return R;
}

const mode = process.argv[2] || 'lone';
const fmt = (x, d = 0) => (x == null ? '-' : (+x).toFixed(d));

if (mode === 'solve') {
  // re-solve both V2791 lobe shapes from scratch and print the handle lengths for 35-sets.js
  const P = HW.sets.crissCross.params;
  for (const k of ['loop', 'sweep']) {
    const g = Object.assign({}, P[k]); delete g.q;
    const r = HW.v2791.solveHalf(g, P);
    console.log(k + '.q =', JSON.stringify(r.q.map((v) => +v.toFixed(4))), ' minR', r.minR.toFixed(2), ' half length', r.len.toFixed(1));
  }
  process.exit(0);
}

if (mode === 'geom') {
  const L = HW.layout.build(HW.config);
  const P = L.path;
  let ymax = 0, kmax = 0, bankMax = 0;
  for (let i = 0; i < P.N; i++) { ymax = Math.max(ymax, P.P.y[i]); kmax = Math.max(kmax, Math.hypot(P.K.x[i], P.K.y[i], P.K.z[i])); bankMax = Math.max(bankMax, Math.acos(Math.max(-1, Math.min(1, P.U.y[i]))) * 57.3); }
  console.log({ length: +P.length.toFixed(1), N: P.N, joints: P.jointErrors.length, apex: +ymax.toFixed(1), minR: +(1 / kmax).toFixed(2), maxRoll: +bankMax.toFixed(0), footprint: +L.stats.footprint.toFixed(1), startS: +L.startS.toFixed(2) });
  console.log('lanes', Object.fromEntries(Object.entries(L.laneS).map(([k, v]) => [k, [+v.s0.toFixed(1), +v.s1.toFixed(1)]])));
  console.log('lobes', Object.fromEntries(Object.entries(L.lobes).map(([k, v]) => [k, [+v.s0.toFixed(1), +v.s1.toFixed(1), v.kind]])));
  console.log('boosters', L.boosters.map((b) => b.wheel + b.lane + '@' + b.s.toFixed(1)).join(' '));
  console.log('crossings', L.crossings.map((c) => c.name + '@' + c.s.map((x) => x.toFixed(1)).join('/')).join(' '));
  process.exit(0);
}

if (mode === 'lone') {
  const secs = +(process.argv[3] || 60), idx = +(process.argv[4] || 0);
  const sim = new HW.Sim({ RAPIER: null });
  const car = sim.cars[idx];
  const L = sim.layout, path = L.path;
  sim.setSwitch(true);
  for (let i = 0; i < 0.6 * 1920; i++) sim.step(1 / 1920);
  sim.placeOnTrack(car, L.startS, 0);
  const h = 1 / sim.cfg.substepHz, n = Math.round(secs / h);
  const regions = {};
  let derails = 0, stalls = 0, minNf = Infinity, apexMin = {};
  HW.bus.on('derail', (e) => { derails++; console.log('  derail', e.cause, 'at s=' + fmt(e.car.s, 1), path.region(e.car.s), 't=' + fmt(e.t, 2)); });
  HW.bus.on('stall', (e) => { stalls++; console.log('  stall at s=' + fmt(e.car.s, 1), path.region(e.car.s), 't=' + fmt(e.t, 2)); });
  for (let i = 0; i < n; i++) {
    sim.step(h);
    if (car.mode !== 'track') continue;
    const rg = path.region(car.s);
    const R = regions[rg] || (regions[rg] = { vmin: 1e9, vmax: 0, wallMax: 0, gMax: 0 });
    R.vmin = Math.min(R.vmin, Math.abs(car.v)); R.vmax = Math.max(R.vmax, Math.abs(car.v));
    R.wallMax = Math.max(R.wallMax, car.Nw / car.m / 981); R.gMax = Math.max(R.gMax, car.Nf / car.m / 981);
    const lobe = L.lobes[rg];
    if (lobe && lobe.kind === 'loop' && Math.abs(car.s - (lobe.s0 + lobe.s1) / 2) < 1) apexMin[rg] = Math.min(apexMin[rg] ?? 1e9, Math.abs(car.v));
  }
  const E = car.energy, tot = E.roll + E.wall + E.side + E.air + E.impact;
  console.log(`${car.name}: ${car.laps} laps in ${secs}s, last ${fmt(car.lastLap, 2)}s best ${fmt(car.bestLap, 2)}s, top ${fmt(car.topSpeed)} cm/s, mode ${car.mode}, derails ${derails}, stalls ${stalls}`);
  console.log('  foam', fmt(sim.power.surfaceSpeed), 'cm/s; motor', fmt(sim.power.telemetry().rpmMotor), 'rpm', fmt(sim.power.state.I, 2), 'A');
  for (const [k, R] of Object.entries(regions)) console.log(`  ${k.padEnd(4)} v ${fmt(R.vmin)}..${fmt(R.vmax)}  wall<=${fmt(R.wallMax, 2)}g  floor<=${fmt(R.gMax, 1)}g`);
  console.log('  loop apex min speed', JSON.stringify(Object.fromEntries(Object.entries(apexMin).map(([k, v]) => [k, +v.toFixed(0)]))));
  const J = (x) => (x * 1e-7).toFixed(3) + 'J';
  console.log(`  energy in ${J(E.boost)}; lost: roll ${J(E.roll)} wall ${J(E.wall)} side ${J(E.side)} air ${J(E.air)} impact ${J(E.impact)} (sum ${J(tot)})`);
  process.exit(0);
}

if (mode === 'runs') {
  // node tools/simtest.mjs runs <setId> [runsPerCar] : drop every casting down an open set,
  // one car at a time, and report what happened on each run
  const setId = process.argv[3] || 'dropJump', per = +(process.argv[4] || 3);
  HW.config.set = setId;
  const R = await rapier();
  const sim = new HW.Sim({ RAPIER: R });
  const L = sim.layout;
  console.log(`set ${L.set.name}: ` + L.tracks.map((t) => `${t.id} ${fmt(t.length, 1)} cm ${t.closed ? 'closed' : 'open'} [${fmt(t.P.y[0], 1)} -> ${fmt(t.P.y[t.N - 1], 1)}]`).join(', '));
  const h = 1 / sim.cfg.substepHz;
  let log = null;
  HW.bus.on('derail', (e) => { if (log && e.car === log.car) log.ev.push(`${e.cause} @${e.car.track.id}:${fmt(e.car.s, 1)} v=${fmt(Math.hypot(e.car.vel.x, e.car.vel.y, e.car.vel.z))}`); });
  HW.bus.on('recapture', (e) => { if (log && e.car === log.car) log.ev.push(`caught @${e.car.track.id}:${fmt(e.car.s, 1)} v=${fmt(e.car.v)}`); });
  HW.bus.on('gate', (e) => { if (log && e.car === log.car) log.ev.push(`${e.gate.kind} ${fmt(sim.time - log.t0, 3)}s v=${fmt(e.car.v)}`); });
  HW.bus.on('buffer', (e) => { if (log && e.car === log.car) log.ev.push(`buffer v=${fmt(e.speed)}`); });
  HW.bus.on('retrieve', (e) => { if (log && e.car === log.car) log.done = true; });
  const tally = {};
  for (const car of sim.cars) {
    for (let k = 0; k < per; k++) {
      for (const c of sim.cars) if (c.mode !== 'parked') sim.park(c);
      sim.placeOnTrack(car, L.start.s, 0, 0, false, L.start.track);
      log = { car, t0: sim.time, ev: [], done: false };
      let n = 0;
      while (!log.done && n++ < 20 / h) sim.step(h);
      const ok = log.ev.some((x) => x.startsWith('finish'));
      tally[car.name] = (tally[car.name] || 0) + (ok ? 1 : 0);
      console.log(`  ${car.name.padEnd(15)} ${ok ? 'OK  ' : 'FAIL'} ${log.ev.join(' | ')}`);
    }
  }
  console.log('  finished', JSON.stringify(tally));
  process.exit(0);
}

if (mode === 'five') {
  const secs = +(process.argv[3] || 60);
  const R = await rapier();
  const sim = new HW.Sim({ RAPIER: R });
  const counts = {};
  for (const t of ['crash', 'bump', 'derail', 'recapture', 'retrieve', 'stall', 'dropped', 'nudge']) { counts[t] = 0; HW.bus.on(t, () => counts[t]++); }
  const causes = {};
  HW.bus.on('derail', (e) => { const k = e.cause + '@' + sim.layout.path.region(e.car.s); causes[k] = (causes[k] || 0) + 1; });
  sim.lineUpAll();
  const h = 1 / sim.cfg.substepHz, n = Math.round(secs / h);
  let minFoam = 1e9, t0 = Date.now();
  for (let i = 0; i < n; i++) { sim.step(h); if (sim.time > 3) minFoam = Math.min(minFoam, sim.power.surfaceSpeed); }
  const wall = (Date.now() - t0) / 1000;
  console.log(`five cars, ${secs}s simulated in ${wall.toFixed(1)}s wall`);
  console.log('  events', JSON.stringify(counts));
  console.log('  derail causes', JSON.stringify(causes));
  console.log('  min foam speed after t=3', fmt(minFoam));
  for (const c of sim.cars) console.log(`  ${c.name.padEnd(14)} laps ${String(c.laps).padStart(3)}  crashes ${c.crashes}  mode ${c.mode}  best ${fmt(c.bestLap, 2)}s`);
  process.exit(0);
}

if (mode === 'fleet') {
  // node tools/simtest.mjs fleet <nCars> <secs> : prints a per-second timeline
  const nCars = +(process.argv[3] || 3), secs = +(process.argv[4] || 30);
  const R = await rapier();
  const sim = new HW.Sim({ RAPIER: R, catalog: HW.catalog.slice(0, nCars) });
  const counts = {};
  for (const t of ['crash', 'bump', 'derail', 'recapture', 'retrieve', 'stall', 'dropped', 'nudge']) { counts[t] = 0; HW.bus.on(t, () => counts[t]++); }
  const causes = {};
  HW.bus.on('derail', (e) => { const k = e.cause + '@' + sim.layout.path.region(e.car.s); causes[k] = (causes[k] || 0) + 1; });
  sim.lineUpAll();
  const h = 1 / sim.cfg.substepHz;
  let line = '';
  for (let sec = 1; sec <= secs; sec++) {
    let fmin = 1e9, fsum = 0, k = 0, imax = 0;
    for (let i = 0; i < 1920; i++) { sim.step(h); const f = sim.power.surfaceSpeed; fmin = Math.min(fmin, f); fsum += f; k++; imax = Math.max(imax, sim.power.state.I); }
    const modes = sim.cars.map((c) => c.mode[0]).join('');
    line = `t=${String(sec).padStart(3)} foam avg ${fmt(fsum / k)} min ${fmt(fmin)}  Imax ${fmt(imax, 2)}A  modes ${modes}  laps ${sim.cars.map((c) => c.laps).join(',')}  crashes ${counts.crash}`;
    if (sec <= 10 || sec % 5 === 0) console.log(line);
  }
  console.log('  events', JSON.stringify(counts));
  console.log('  derail causes', JSON.stringify(causes));
  process.exit(0);
}

if (mode === 'crashlog') {
  const nCars = +(process.argv[3] || 5), secs = +(process.argv[4] || 12);
  const R = await rapier();
  const sim = new HW.Sim({ RAPIER: R, catalog: HW.catalog.slice(0, nCars) });
  const P = sim.layout.path;
  const who = (c) => `${c.name.split(' ').pop()}[${c.mode}${c.mode === 'track' ? ' s=' + fmt(c.s, 1) + ' v=' + fmt(c.v) : ' v=' + fmt(Math.hypot(c.vel.x, c.vel.y, c.vel.z))} ${P.region(c.mode === 'track' ? c.s : P.nearest(c.pos.x, c.pos.y, c.pos.z).s)}]`;
  for (const t of ['crash', 'bump', 'derail', 'recapture', 'retrieve', 'dropped', 'stall']) HW.bus.on(t, (e) => {
    if (t === 'crash' || t === 'bump') console.log(fmt(e.t, 3), t.padEnd(9), who(e.a), 'x', who(e.b), 'closing', fmt(e.speed));
    else console.log(fmt(e.t, 3), t.padEnd(9), who(e.car), e.cause || '');
  });
  sim.lineUpAll();
  const h = 1 / sim.cfg.substepHz;
  for (let i = 0; i < secs / h; i++) sim.step(h);
  process.exit(0);
}

if (mode === 'phase') {
  const nCars = +(process.argv[3] || 3), secs = +(process.argv[4] || 60);
  const R = await rapier();
  const sim = new HW.Sim({ RAPIER: R, catalog: HW.catalog.slice(0, nCars) });
  let crashes = 0; HW.bus.on('crash', () => crashes++);
  sim.lineUpAll();
  const h = 1 / sim.cfg.substepHz, len = sim.layout.path.length;
  // total distance travelled, to measure phase drift
  const dist = sim.cars.map(() => 0), last = sim.cars.map((c) => c.s);
  for (let sec = 1; sec <= secs; sec++) {
    for (let i = 0; i < 1920; i++) {
      sim.step(h);
      sim.cars.forEach((c, k) => { if (c.mode === 'track') { dist[k] += HW.math.loopDelta(c.s, last[k], len); } last[k] = c.s; });
    }
    if (sec % 5 === 0) console.log(`t=${sec} crashes ${crashes} gap(ms) ` + sim.cars.slice(1).map((c, k) => fmt(((dist[0] - dist[k + 1]) % len) / 3.5, 0)).join(' '), ' laps', sim.cars.map((c) => c.laps).join(','));
  }
  process.exit(0);
}
