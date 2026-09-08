# HANDOFF — live project state

_Last updated: 2026-09-08 late by Opus 5 (T18a). Update this block whenever you stop._

## Strategy
`docs/ROADMAP.md` is the director's brief for the Opus 5 session: build targets
(artifact vs HD), phases 2-7, the Blender/Gemini/ElevenLabs pipeline, questions for
Stewart, risks, and the suggested first hour. Read it after this file.

## Where we are (read this first)
_State at the end of Fable session 1, 2026-09-08 late. All five Opus agents finished and committed._
- **Runs end to end**: `node tools/serve.mjs` -> http://localhost:8765/ shows the T11 renderer
  (hub, gear-train x-ray, camera presets), T12 castings with confirmed liveries, and the T13
  control panel (switch, line-up, placement by clicking a lane, gauges, tuning drawer).
  `node tools/build.mjs` -> `dist/index.html` (147 KB, CSP-safe, verified in-browser).
  `tools/selftest.html` -> 7/8 PASS. Reports for every task are in `docs/agent-reports/`.
- **Headless physics harness** (use this, not the browser, for tuning):
  `node tools/lobetest.mjs` (one car, 40 s), `tools/sweep.mjs`, `tools/grid.mjs`. ~1 s of wall
  time per 20 s simulated, deterministic. Output is JSON: laps, lapTs, off, maxRoll, stalled.
- **Physics status**: cars no longer leave the track (T18a fixed four defects, see its report
  and the Lessons below). Launch 317 cm/s standing, 399 peak. A lone car laps twice
  (t=2.67 s, 6.74 s) then **stalls in the 17 cm dead zone between an inbound nip and the
  opposite arm's outbound nip** (`endS=14`): it arrives at the hub ~10 % short on energy.
  `lineUpFive` -> all five bog the motor to ~2,400 rpm and stall before the crossing, so
  selftest check 8 (>=1 crash) fails. Both are ENERGY problems, not stability problems.
- **Next concrete moves (T18, in order)**:
  1. Print a speed-vs-s profile for one lap with `tools/lobetest.mjs` (add a trace option) and
     do the energy budget: where do the ~90000 (cm/s)^2 of v^2 go (junction bends, lobe scrub,
     climb, hub)? Fix the biggest sink first. Candidates: `crrScale` 1.0 -> 0.5 (real axle
     friction is nearer Crr 0.01), `wallFriction` 0.10 -> 0.07, more `lobeBankDeg`, and the
     inbound nip: with 17 cm between paired nips the outbound nip must catch a car that the
     inbound nip has already re-accelerated; check the inbound nip actually engages (zones
     telemetry) and that `boostExtra`/`foamGap` let a slowing car be grabbed.
  2. `lineUpFive`: spin the motor up first (the real toy is switched on before cars are
     placed), and stagger the five drops by ~0.3 s so the flywheel recovers between launches;
     keep the "all five in the nips, then switch on -> motor bogs" case as a deliberate
     tired-battery demo, not the default.
  3. Re-run selftest (target 8/8), rebuild `dist/index.html`, publish as an Artifact
     (favicon car emoji), send Stewart the link. That is the YouTube-parity milestone.
  4. Then `docs/ROADMAP.md` Phase 3 (physics fidelity) and Phase 4 (HD build with Blender).
- Agents noted that several of them shared one Playwright browser and stole each other's tabs.
  Run browser-verifying agents sequentially, or give physics work the Node harness.

## How to resume (any model)
1. Read `CLAUDE.md`, `docs/SPEC.md` (s5 geometry, s6 interfaces), `docs/PLAN.md`, then
   the agent reports in `docs/agent-reports/`.
2. `git log --oneline` shows what landed. PLAN.md status is the source of truth.
3. Physics work (owner fable) may be done by Opus if Fable is unavailable. The fixed-step
   loop and every tunable live in `src/10-config.js`; do not hardcode numbers elsewhere.
4. After each task: run in the browser, check the console, commit with the task id,
   update PLAN.md and this file.

## How to test physics without the frame loop (paste in the browser console)
```js
HW.main.paused = true; const s = HW.sim, h = 1/240, car = s.cars[0];
s.reset(); s.setSwitch(true); for (let i = 0; i < 120; i++) s.step(h);   // spin up
car.spawnAtGate('N-out');                                                  // nose in the nip
for (let i = 0; i < 240*6; i++) { s.step(h); if (i % 24 === 0) console.log(
  car.s.toFixed(0), car.speed.toFixed(0), car.lateral.toFixed(2), (car.height||0).toFixed(2),
  car.frame.seg.meta.name, car.inBooster, car.lifted ? 'LIFTED' : '') }
// five cars: s.reset(); s.setSwitch(true); ...spin up...; s.lineUpFive(); step; s.crashes
```
Note: the Browser pane throttles requestAnimationFrame, so always step synchronously
like this when measuring; the live view runs in slow motion there.

## Lessons (each cost real debugging time; do not relearn them)
- Car local axes: +X right, +Y up, **−Z forward**. `(right, up, +Z)` is left-handed and
  `quatFromBasis` then returns a reflection: the collider looks fine but physics is garbage.
- `controller.setIndexForwardAxis` is a **setter property** in rapier 0.20
  (`vc.setIndexForwardAxis = 2`), not a method.
- Walls must be **solid boxes** (`roundCuboid`, chained along the path, inset 0.08 cm, rounded
  0.1 cm). A thin two-sided trimesh wedges any cuboid pressed into it (contacts on both
  faces fight, body freezes). Cars are `roundCuboid` too.
- **Never `setEnabled(false)` a vehicle body.** A body that sat disabled while the world
  stepped makes `updateVehicle` emit NaN on re-enable. Lifted cars are parked as kinematic
  bodies at y=300 instead (`lift()/drop()` in 42-vehicle.js).
- `suspTravel` must be < `suspRest` or the vehicle solver NaNs.
- Bend radius must be >= ~12 cm: a 7 cm car needs `width + L^2/(8R) < laneWidth`.
- The nip's sideways push must be small (0.2 of N) and applied low (`addForceAtPoint`
  0.5 cm below centre) or the car launches on two wheels and tumbles.
- The launch is flywheel-limited: motor + four foam wheels (25-40 g each). A 130-size
  motor cannot do it from 4 D cells; config uses 280-class constants.
- Standard track is 3.175 cm between walls; the instruction sheet shows two independent
  circuits (see PROMPT.md), not one continuous one.
- **Rapier trimesh floors NEED `TriMeshFlags.FIX_INTERNAL_EDGES`.** Without it a fast body catches
  on the internal edges between strip triangles: you get an impulse of hundreds of cm/s whose
  contact normal is the edge direction, and `contactPairsWith` shows nothing afterwards. This looks
  exactly like "the car randomly explodes" and cost most of T18a.
- **`world.lengthUnit` should stay 1 here, NOT 100.** It normalizes the solver tolerances; at 100
  the allowed linear error is 0.5 cm inside a 3.175 cm lane, so cars sink into the floor and the
  launch collapses to 85 cm/s. Measured: 1 best, 2-3 usable, >= 10 unusable.
- **Any sideways force on a car must act through the centre of mass.** Roll inertia is ~33 g.cm2;
  a 1 N nip push on a 0.15 cm lever arm spins the car up to 188 rad/s in 60 ms. `addForce` acts at
  the c.o.m.; `addForceAtPoint` at the body centre is already 0.35 cm above it (`comDrop`).
- **`setWheelMaxSuspensionForce(i, 1e9)` is a trap.** Rapier divides the suspension force by
  `dot(contactNormal, -rayDir)`; once a car rolls, that blows up and an uncapped wheel launches it.
- A wall run that stops (crossing, foam-wheel slot) leaves a square end cap ~0.44 cm outboard of
  the car. At 300 cm/s a car that drifts that far is destroyed by it. Wall runs now get a set-back
  lead-in at each end, and the lead-in must live INSIDE the run: anything built out in the crossing
  square sits on the other circuit's lane centreline.

## Assumptions to surface to Stewart
Hub 26 cm across, foam wheel radius derived 2.59 cm, straights 10 cm at 45 deg, bend
radius 15 cm, lobe radius derived 20.5 cm (footprint ~131 cm), lobe apex 9 cm, lobe wall
height 2.6 cm, 280-class motor, gear 6.5:1, foam nip ~5 N normal force, wall friction 0.10,
car masses 35-47 g. All ESTIMATE unless RESEARCH.md says MEASURED.

## Next up (in order)
See "Next concrete moves (T18)" above, then `docs/ROADMAP.md` section 10 (first hour) and Phase 3.
