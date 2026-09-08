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

## Stewart's answers (2026-09-08) — these override ROADMAP section 8
1. **Real set:** he does NOT own one. Get dimensions from the web. The set is Mattel **V2791**
   "Criss Cross Crash" (2010, discontinued 2012); the cars are the 1999 5-pack **#21081**.
   Search eBay / Worthpoint / Mercari listings and YouTube reviews for photos with rulers or
   known-size objects (a D cell is 34 x 61 mm, a 1:64 car ~66 mm, standard track 38.1 mm
   wide) and scale from those. Stewart will fetch specific photos if told exactly which
   listing or angle is needed.
2. **Blender 5.1 is installed.** Use it headless: `blender -b -P tools/blender/<script>.py`.
   Find the exe with `where blender` or under `C:/Program Files/Blender Foundation/Blender 5.1/`.
3. **API keys (Gemini, ElevenLabs):** the next session must write step-by-step terminal
   commands that put the keys into `.env` (gitignored) without a key ever appearing in chat
   or in a prompt (Stewart types the value himself, e.g. with `Set-Content -Path .env`),
   plus a `tools/env-check.mjs` that prints only whether each key is present.
   **Every command given to Stewart must begin with**
   `cd "C:/Users/stewa/OneDrive/Documents/Claude/Projects/Hot Wheels Sim"` (or be a
   one-liner that includes it) so he never has to type the path.
4. **Machine:** ROG Zephyrus G16 (GU605CR), Intel Core Ultra 9 285H, 32 GB RAM, NVIDIA RTX
   5070 Ti Laptop 12 GB plus Intel Arc 140T iGPU, Windows 11 Home 25H2 (build 26200.9278),
   954 GB SSD with about 200 GB free. Plenty for the HD build. When measuring fps make sure
   Chrome runs on the NVIDIA GPU (Windows Graphics settings, High performance).
5. **Priority:** artifact first, then HD build.

## Known UX gap Stewart hit (fix early in T18 / T13 follow-up)
He switched the booster on with all five cars lined up, and also placed cars elsewhere on
the track, and nothing moved. Causes: (a) with five cars sitting in the nips the motor
starts under full load and bogs to ~2,400 rpm, so launches are feeble and cars stall within
a few cm; the real-toy order is **switch ON first, let the rpm gauge settle, then Line up
or drop cars one at a time** (keys 1-5, or double-click a car chip); (b) a car placed
mid-track has nothing pushing it (only boosters push and the track is flat), so placement
should default to a booster gate or the hint should say so; (c) the T18 energy shortfall.
Required changes: "Line up all five" auto-starts the motor and staggers the drops ~0.3 s
apart; a toast "Turn the booster on first" when a car is dropped into a nip with the motor
off; a "Launch" button that drops the selected car into the nearest outbound nip; a
three-line "How to play" box at the top of the panel. Verify with `tools/lobetest.mjs`
five-car mode, then in a real browser (not the pane), before calling it done.

## Stewart's real-browser observation (2026-09-08, after the fixes above) — FIRST THING TO REPRODUCE
With the booster on first and then Line up (correct order), in real Chrome on the RTX
laptop: every car travels only "a few inches", hits a wall and stops. His overview
screenshot showed motor 12,894 rpm no-load, foam surface 537 cm/s, 2 crashes logged
(Chevy Stocker hit Chevy 1500 at 65 and 85 cm/s), and all five stalled within the hub or
the first splay. This differs from the headless harness (lone car laps twice), so the next
session must reproduce in a real browser, not only in `tools/lobetest.mjs`:
- Suspects: (1) the real frame loop: `maxSubsteps` clamp in `90-main.js` resets the
  accumulator when a frame is slow (`acc = 0`), which does not change per-step physics but
  check that `HW.sim.step` is being called at all at 240 Hz in his browser (log
  `HW.sim.stepCount` over one second); (2) the wall geometry at the lobe entrance: his
  chase-camera screenshot shows the walls forming a **pinched, pointed fold** where the
  0.9 cm hub/splay walls meet the 2.6 cm lobe walls (the `wallRampLen` ramp and the
  "set-back lead-ins" added in T18a). A car pressed against the outer wall there may be
  catching that fold. Inspect `mesh.wallBoxes` around the out-splay -> lobe transition
  (s ≈ 38-52 on NS) and the visual mesh; make the height ramp long and smooth, and make sure
  no box end face points back along the lane; (3) the five-car run shares one flywheel:
  even with the motor on first, five near-simultaneous launches drop rpm hard; stagger.
- Also visible in his screenshot: the hub is drawn as a red cross with four grey foam
  wheels but no housings between lanes, and the track ribbons look stepped/faceted on the
  lobes (the 0.25 cm samples give a visible polygon). Cosmetic; Phase 4 territory.
- He confirms the general look is good ("it looks great"). Priority stays: make cars lap.

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
