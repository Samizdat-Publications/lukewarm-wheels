// tools/diag.mjs — step one car and report WHY it loses energy or leaves the track.
// Prints a per-sample line and, whenever |dv| in one step exceeds `jolt`, the collider(s)
// actually in contact with the chassis and where they are relative to the lane.
// Usage: node tools/diag.mjs '{"cfg":{...},"gate":"N-out","secs":3,"every":6,"jolt":25}'
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
// Load the physics half of the app in manifest order, so a new src file is picked up here too.
const MANIFEST = JSON.parse(readFileSync(path.join(ROOTDIR, 'src', 'manifest.json'), 'utf8'));
for (const f of MANIFEST.scripts) if (!/(5[0-9]|60|90)-/.test(f)) require(path.join(ROOTDIR, f));
const HW = globalThis.HW; HW.log = () => {};

const NL = String.fromCharCode(10) + '                   ';
const A = process.argv[2] ? JSON.parse(process.argv[2]) : {};
HW.config.reset(); for (const k in (A.cfg || {})) HW.config[k] = A.cfg[k];
if (A.noWalls) {
  const orig = HW.trackMesh.build;
  HW.trackMesh.build = (t, c) => { const m = orig(t, c); m.wallBoxes = []; return m; };
}
HW.sim.create();
const s = HW.sim, car = s.cars[A.carIdx || 0], H = 1 / HW.config.physicsHz;
s.reset(); s.setSwitch(true);
for (let i = 0; i < Math.round(1 / H); i++) s.step(H);
car.spawnAtGate(A.gate || 'N-out');
const every = A.every || 6, jolt = A.jolt || 25, n = Math.round((A.secs || 3) / H);
let prevV = 0;
const kindOf = (h) => { const c = s.world.getCollider(h); return (c && c.userData && c.userData.kind) || '?'; };
for (let i = 0; i < n; i++) {
  s.step(H);
  if (car.lifted) { console.log('LIFTED at t=' + (i * H).toFixed(2)); break; }
  const wc = [0, 1, 2, 3].map((k) => (car.wheelState(k).contact ? 1 : 0)).join('');
  const dv = car.speed - prevV; prevV = car.speed;
  const big = Math.abs(dv) > jolt;
  if (i % every === 0 || big) {
    const f = car.frame;
    console.log(
      (i * H).toFixed(3).padStart(6),
      's' + car.s.toFixed(1).padStart(6), 'v' + car.speed.toFixed(0).padStart(4), 'dv' + dv.toFixed(0).padStart(5),
      'lat' + (car.lateral || 0).toFixed(2).padStart(6), 'h' + (car.height || 0).toFixed(2).padStart(6),
      'd' + (car.dist || 0).toFixed(2).padStart(5), 'y' + car.pos.y.toFixed(2).padStart(6),
      'wc' + wc, (car.inBooster || '     ').padEnd(6), 'vfoam' + (s.elec.omegaWheel * s.track.foamWheelRadius).toFixed(0).padStart(4), (f && f.seg.meta.name) || '-', big ? '  <<JOLT' : '');
  }
  if (big) {
    // Report the MANIFOLD, not just the pair: the normal says which face hit and the impulse says
    // how hard. A pair list alone is useless -- it includes every box whose AABB merely overlaps.
    const hits = [];
    s.world.contactPairsWith(car.collider, (other) => {
      s.world.contactPair(car.collider, other, (man, flipped) => {
        let imp = 0, np = man.numContacts();
        for (let k = 0; k < np; k++) imp = Math.max(imp, man.contactImpulse(k));
        if (imp < 1) return;
        const n = man.normal(), t = other.translation();
        const fwd = car.frame ? car.frame.t : { x: 0, y: 0, z: 1 };
        const along = Math.abs(n.x * fwd.x + n.y * fwd.y + n.z * fwd.z);
        hits.push(kindOf(other.handle) + '#' + other.handle + '@(' + t.x.toFixed(1) + ',' + t.y.toFixed(1) + ',' + t.z.toFixed(1) + ')'
          + ' n(' + n.x.toFixed(2) + ',' + n.y.toFixed(2) + ',' + n.z.toFixed(2) + ')'
          + ' |n.fwd|' + along.toFixed(2) + ' J' + imp.toFixed(0) + (flipped ? ' flip' : ''));
      });
    });
    console.log('        MANIFOLDS:', hits.length ? hits.join(NL) : '(none with impulse)');
  }
}
console.log(JSON.stringify({ laps: car.laps, s: +car.s.toFixed(1), v: +car.speed.toFixed(0), off: car.offTrack, lifted: car.lifted }));
