# HANDOFF — live project state

_Last updated: 2026-09-08 evening by Fable 5.1 (session 1). Update this block whenever you stop._

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
- **ONE OPEN PHYSICS BUG (T18a, critical path)**: a car entering a lobe arc at 250-330 cm/s
  leaves the track around mid-arc (s ~ 90 on circuit NS, arc runs s=48..147). It happens
  even with `lobeLift = 0` (flat, unbanked arc), so lift/bank are not the cause. Trace from
  session 1 (lift 9, blend 0.35): by s=67 the car was 4 cm above the lane, 9 cm to the
  INSIDE (left) of the left-hand turn and tumbling (roll 30-150 deg), no wheel contact,
  no wall contact impulse. Hypotheses, in order: (1) the raycast vehicle's side-friction
  impulse (bilateral, clamped by frictionSlip*suspension force) fights the wall contact
  at 4 g and pops the car up; test with `vehicleMode: 'sled'` and with
  `sideFriction: 0.1`; (2) chord-box wall joints (every 1.5 cm, 4 deg kinks) deliver
  impulsive kicks at 300 cm/s; test with `wallSegLen: 0.5` and/or `wallRound: 0.14`;
  (3) the car rolls over the wall because the wall reaction acts below its centre of
  mass; test with `comDrop: 0.6` and a taller `lobeWallHeight`; (4) speed threshold:
  lower `foamK` to 6e5 (exit ~200 cm/s) and find the speed at which the arc is survivable.
  Repro script is in "How to test" below.
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

## Assumptions to surface to Stewart
Hub 26 cm across, foam wheel radius derived 2.59 cm, straights 10 cm at 45 deg, bend
radius 15 cm, lobe radius derived 20.5 cm (footprint ~131 cm), lobe apex 9 cm, lobe wall
height 2.6 cm, 280-class motor, gear 6.5:1, foam nip ~5 N normal force, wall friction 0.10,
car masses 35-47 g. All ESTIMATE unless RESEARCH.md says MEASURED.

## Next up (in order)
1. T18a lobe stability (Opus agent launched; if no report, do it first, nothing else matters
   until a lone car laps reliably).
2. Integrate T11/T12/T13 (renderer, cars, UI) once their reports exist: remove the debug
   renderer fallback only after `HW.render` works.
3. T14 build -> `dist/index.html`, T17 selftest, then T18 tuning against SPEC s1 behaviours,
   T15 showroom, T19 publish (artifact + README).
