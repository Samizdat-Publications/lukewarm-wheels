# HANDOFF — live project state

_Last updated: 2026-09-08 late by Opus 5 (T18a). Update this block whenever you stop._

## Strategy
`docs/ROADMAP.md` is the director's brief for the Opus 5 session: build targets
(artifact vs HD), phases 2-7, the Blender/Gemini/ElevenLabs pipeline, questions for
Stewart, risks, and the suggested first hour. Read it after this file.

## Where we are (read this first)
- **Phase 1 foundation is DONE and runs in the browser**: `node tools/serve.mjs`, open
  http://localhost:8765/. Debug renderer + text HUD. Keys: Space = booster switch,
  L = line up five, R = reset, N = nudge stalled, 1-5 = drop a car at its gate.
- Physics core (Fable): track geometry from the real instruction sheet, lane meshes and
  solid wall colliders, battery/motor/gear model, foam nip model, raycast-vehicle cars,
  crash/stall/lap events, telemetry bus. Committed in git (local repo, no remote).
- **Verified working**: launch from a nip at ~300 cm/s (real toy: 250-400), motor bogs when
  loaded, cars survive the hub crossing and the 15 cm junction bends, five-car line-up
  produces crashes at the `#` crossing, a car completed a lap once (Chevy 1500, before the
  wall-height change).
- **T18a is FIXED (2026-09-08, Opus 5): cars no longer leave the track.** A lone car now runs the
  whole circuit -- both 270 deg lobes, both junction turns, both crossings -- with a max roll of
  20 deg and `offTrack` false, and it laps (lap 1 at 2.67 s, lap 2 at 6.74 s in the headless
  harness). Four separate defects, all firing in the first 0.4 s of a launch: the nip's side push
  acted BELOW the c.o.m. and spun the car to 188 rad/s inside the nip; the floor trimesh had no
  `FIX_INTERNAL_EDGES` so 0.25 cm strip triangles fired ghost impulses of hundreds of cm/s with no
  manifold; the lobe wall height was keyed on `lift > 0` (so every "flat arc" test silently used
  0.9 cm walls, shorter than the car) and stepped instead of ramping; and the crossing wall gap was
  cut from the lane CENTRE, leaving a 9.8 cm hole with square end caps that speared cars. Banked
  arcs (SPEC 5.2 `bankMaxDeg`) are now implemented. Full write-up, measurements and the exact
  verification snippets: `docs/agent-reports/T18a.md`.
- **REMAINING (now T18): cars STALL.** The lone car makes ~2 laps and then stops, usually in the
  17 cm dead zone between the two nips on one hub straight or a few cm short of a nip; it is about
  10 % short on energy. `lineUpFive` therefore produces 0 crashes (nothing falls off the table).
  `vehicleMode: 'sled'` still flips out of a lobe. Footprint drifted 131 -> 140 cm because
  `junctionRadius` went 15 -> 25 (curveRadius is still 20.46). `lobeLift` is now 2 cm, not 9.
- **Headless physics harness (new, use this instead of the browser):** `node tools/sweep.mjs '{...}'`,
  `node tools/grid.mjs` (GRID/BASE env vars), and `tools/lobetest.mjs` (`run()`, `five()`). It loads
  `rapier3d-compat` straight from a local copy of the CDN module and runs the real `HW.sim` with no
  renderer -- ~1 s per 20 s of simulated time, deterministic, and it cannot be stolen by another
  agent's browser tab. Set `RAPIER_MJS` to a local `rapier.mjs` if the default path is gone.
- Opus agents were launched by session 1 for T11, T12, T13, T14+T17 and T18a. Each writes
  `docs/agent-reports/<task>.md` when done. If those reports exist, read them; if a task
  has no report, assume it did not finish and re-run it from `docs/PLAN.md`.

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
1. T18 energy tuning: a lone car must lap indefinitely (it currently stalls after ~2 laps) and
   `lineUpFive` must produce crashes at the `#` again. Start from
   `docs/agent-reports/T18a.md` "Remaining issues" and use the headless harness.
2. Integrate T11/T12/T13 (renderer, cars, UI) once their reports exist: remove the debug
   renderer fallback only after `HW.render` works.
3. T14 build -> `dist/index.html`, T17 selftest, then T18 tuning against SPEC s1 behaviours,
   T15 showroom, T19 publish (artifact + README).
