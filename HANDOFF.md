# HANDOFF — live project state

_Last updated: 2026-09-08 by Opus 5 (session 2, T18 diagnosis). Update this block whenever you stop._

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

## T18 findings (2026-09-08, Opus 5 session 2) — READ BEFORE TOUCHING PHYSICS
Measured in **real Chrome** (Browser pane), stepping `HW.sim.step(1/240)` synchronously.
Everything below is data, not conjecture. Methodology: `HW.sim.create(cfg)` after each config
change (colliders bake friction/geometry at create time), spin motor 240 steps, `spawnAtGate('N-out')`.

### 1. The frame loop is NOT broken; `stepCount: 0` in the pane is an artifact
The Browser pane fully SUSPENDS requestAnimationFrame while hidden, so `HW.sim.stepCount`
stays 0 and `javascript_tool` times out on any rAF-waiting promise. This is not Stewart's bug.
Do not chase it. Always step synchronously (never trust the live view in the pane).

### 2. Stewart's "few inches" is the FIVE-CAR case, not the lone-car case
A lone car in real Chrome reaches **s = 342 cm** (two lobes) before stalling — not a few inches.
The lone-car stall and the five-car "few inches" are DIFFERENT failures. Five cars share one
flywheel and launch off a bogged motor; that is still the open `lineUpFive` item.

### 3. The lobe is NOT the energy sink. Steady-state decay is healthy.
Per-step `dv` on the real nip launch is **-0.1 to -0.8 cm/s** for most of the lap
(~24-190 cm/s2). That is the right order for a die-cast car. The old "lobe scrub eats the
car" theory is WRONG.

### 4. Ruled out by ablation (each measured, each made ~no difference to v@s=85)
`floorFriction` (0 is bit-identical to baseline — the chassis is NOT dragging),
`wallFriction`, `carFriction`, `crrScale`, `linDamping`, `angDamping`, suspension damping,
`frictionSlip` (1.0 is WORSE: 88; 0.02 ~ baseline), `wallRestitution` (0.0 / 0.1 / 0.9 all
within noise), `wallSegLen` (0.5 / 1.5 / 3.0 within noise). A loss insensitive to every
coefficient is STRUCTURAL, not dissipative. `latMax` stays 0.47 cm, so the car rides the
wall steadily and does NOT pinball.
- Corollary: `crrScale` 1.0 -> 0.5 (old HANDOFF candidate #1) is worth ~2%. Crr 0.022 gives
  only 21 cm/s2 against a measured ~500. Drop that idea.
- Corollary: `lobeBankDeg` 35 is CATASTROPHIC (car dies at s=85). More bank is not the fix.

### 5. The real sink: discrete slam events at geometry transitions
Energy leaves in a few large steps, not continuously. They correlate exactly with the
per-wheel contact flags dropping wheels (`0101`, `1010`, `0111` = airborne on two wheels).
Biggest: **s = 72 -> 79, v 222 -> 150 cm/s**, at the N-lobe entry where bank + lift ramp in.
The transitions are too abrupt for a rigid four-wheel car: it is launched, then slams.

### 6. Confirmed improvement (not yet landed)
`lobeBlend: 0.5 -> 1.0` gives **v@s=140: 93 -> 135 cm/s**, peak launch 316 -> 400, airborne
time 2% -> 1%. Right mechanism, real gain. Still `laps: 0`, so it is progress, not a fix.

### 7. The geometry is FRAGILE — these values put the car off the track
`lobeBlend 0.8`, `lobeLift 1.0`, `lobeLift 0` each make the car leave the track and get
parked by the `lift()` safety (shows up as `airPct 99` + `maxS` 75-116). Only particular
(blend, lift) pairs are stable. Sweep both together, never one alone, and always check
`car.offTrack` / whether `lift()` fired before believing a number.

### 8. Instrumentation gotchas that cost time here
- Do NOT inject speed with `body.setLinvel` to make a "coast test". The raycast wheels start
  at zero spin and the tyre model burns ~8 g decelerating the car to spin them up, which
  looks exactly like a catastrophic geometry defect. Measure on the real nip launch.
- Raycast wheels are RAYS: they never appear in `world.contactPairsWith`. Wheel forces are
  invisible to a contact query. Use `car.wheelState(k).contact` for the four wheels.
- `maxS` is a bad metric: it flips between 170 / 190 / 342 on whether the inbound nip happens
  to catch the car (a threshold). Use **v at a fixed s** (s=85, s=140) as the signal.
- The inbound nip DOES engage correctly (s=178: 14 -> 211 cm/s). Old open question, answered.
- The nip drives the car through **chassis friction**: `carFriction=0` or `wallFriction=0`
  kills the launch at s=170. Do not zero those "to isolate rolling losses".
- `lobeLift` is **2.0 cm** in config, not the 9 cm still listed in "Assumptions". 9 cm was
  already found unclimbable and cut. Fix that assumptions line.

### 9. THE LAUNCH IS GRIP-LIMITED, NOT SPEED-LIMITED (biggest finding of the session)
Sweeping the drivetrain changes the foam surface speed and does **nothing** to the car:

| gearRatio | foam surface speed | car peak |
|---|---|---|
| 6.5 (current) | 537 cm/s | **316** |
| 4.5 | 745 | **316** |
| 3.5 | 861 | **316** |
| 2.5 | 902 | **316** |

Launch speed is decoupled from the drive train. The nip can only push with mu*N over its
contact length, and the car leaves the zone long before surface speed matters. This is
physically correct for a real booster, and it means:
- `gearRatio`, `motorKe/Kt`, `cells`, `foamWheelMassG` are **NOT** levers on launch speed.
  Every attempt to fix the energy shortfall by "spinning the wheels faster" is wasted work.
- The real levers are `foamK` (nip normal force), `foamMu`, and `boostExtra` (contact length).
  Sweeping those moves peak launch 316 -> 400 cm/s.
- Watch for a second apparent cap at exactly **400 cm/s**; it recurs across unrelated configs
  and has not been explained. Find it before tuning further.

### 10. First completed lap
`lobeLift 6, lobeBlend 1.0, foamK 2.4e6, foamMu 1.2, boostExtra 3.0` -> **laps: 1**
(the only lap achieved all session). It then goes `offTrack`. So: enough energy to lap is
now demonstrated; the remaining problem is stability at the higher speed, not energy.

### 11. `lobeBlend: 1.0` fixes the off-track instability
The earlier "cars leave the track" cases (reported as `airPct 99`, which is really the
`lift()` safety parking a departed car) do **not** occur at `lobeBlend 1.0`. Set it there
before sweeping anything else. `lobeBankDeg 30` also helps once `lobeLift` is large
(min speed on lobe 98 -> 147 at lift 10); `lobeBankDeg 35` at lift 2 is still catastrophic.

### 12. The circuit constraint that actually decides everything
The nips are the ONLY energy input. A car must coast from one nip to the next or it can
never lap. Current coast range peaks at `maxS` ~342 and the next nip is ~20 cm further on.
Any tuning must be judged on "does it reach the next nip", not on speed at a point.
`maxS` alone is still a bad metric (it is a threshold on nip capture) - report `laps`.

### 13. REAL-SET GEOMETRY FROM STEWART'S PHOTOS (2026-09-08) - the model is wrong
Stewart supplied four eBay listing photos (overhead x2, eye-level side, hub close-up). No
ruler in frame, so everything below is scaled off the known track width (3.81 cm outer /
3.175 cm lane) and is ESTIMATE, but the qualitative finding is certain:

- **The four lobes are TALL, INCLINED TEARDROP LOOPS, not near-flat banked turns.** Every
  lobe rises well off the floor. The two rear lobes stand up nearly vertical, supported at
  their apex by a thin blue post; the two front lobes are propped high at their outer ends
  by tall blue ladder supports. Apex height scales to roughly **10-16 cm** above the hub.
  `lobeLift: 2.0` is therefore about a **10x underestimate** and `lobeBankDeg: 15` badly
  understates how far the car leans.
- **A climb is a reservoir, not a loss.** The old HANDOFF note ("9 cm costs 8800 cm2/s2 per
  lobe and the car cannot make the apex") treated the lift as pure dissipation. It is paid
  going up and returned coming down; it only costs if the car stalls before the apex.
  Flattening the lobes removed the gravity swoop AND left the car in a long flat scrubbing
  turn. Re-model the lobe as a real inclined loop.
- Footprint scales to roughly **105-110 cm** (config derives 131) and the red hub to roughly
  **30-32 cm** across (config assumes 26). Both worth re-deriving from the photos properly.
- The hub close-up shows the four booster modules and the black foam wheels in their slots.
  Foam wheel diameter looks smaller than the derived 2.59 cm **radius**. Re-measure against
  the track width in that photo before trusting `foamWheelRadius`.
- Caution: at the real apex height the current model starves (min speed on lobe falls to
  ~96-98 and the car cannot get home). Raising `lobeLift` to reality REQUIRES the stronger
  nip from item 9 first. Change them together, never separately.

### 14. Video references (not yet watched - do this first next session)
- Set running, short: https://www.youtube.com/watch?v=VILmpR2Xwww  (Stewart: "probably all you need")
- Longer, more detail: https://www.youtube.com/watch?v=vRY5e9nQZv0
Pull one lap time, how long five cars last before the pile-up, and whether cars ride the
outer wall on the loops. Those numbers are what Phase 3 tuning should target.

### 15. WHICH SET, AND THE 2+2 ARCHITECTURE (2026-09-08, decided with Stewart)
Stewart also sent photos of the **newer** set (blue/orange, Mattel **FDF25** "Criss Cross Crash",
~2018+, sold with extra attachments). **Decision: stay on the ORANGE OG V2791.** Reasons: all
existing SPEC/RESEARCH grounding and the 1999 five-pack car choice target V2791; FDF25 has MORE
parts to model (launch ramp, crash zones, attachments), not fewer; and Stewart owns neither, so
the newer set buys no accuracy. Log FDF25 as a possible Phase 6+ upgrade.

**But the FDF25 product photography is much clearer than the eBay shots and the two sets share
architecture, so use it as reference.** It shows the thing the model gets wrong at the
ARCHITECTURE level, not the parameter level:

> **The four lobes are NOT identical. It is TWO near-vertical LOOPS + TWO wide ELEVATED SWEEPS.**

On FDF25 the two rear lobes are unmistakable full vertical loops standing on a single centre
post; the two front lobes are big sweeping curves carried out and around on tall legs. Re-reading
the orange V2791 photos with that in mind shows the same 2+2: the two rear lobes stand up as
loops (which is exactly why they read as small round circles in the overhead shots while the two
front ones read as wide teardrops on ladder supports).

`src/30-track-layout.js` builds **four identical banked 270 deg curves**. That is wrong. Before
any more tuning, re-derive the layout as 2 loops + 2 sweeps. This also probably explains why no
single (`lobeLift`, `lobeBankDeg`) pair ever worked: one geometry is being asked to be both a
vertical loop and a flat sweep at once.

Consequence for item 13: the "apex 10-16 cm" estimate applies to the SWEEPS. The LOOPS are a
different shape entirely (a car goes up and over inverted, held by centripetal force), and their
height is set by loop diameter, which scales off the track width in the FDF25 photos.

### 16. Next moves (supersedes the old list)
1. Watch the two videos; time a lap; write `docs/REFERENCES.md`.
1b. RE-DERIVE THE LAYOUT AS 2 VERTICAL LOOPS + 2 ELEVATED SWEEPS (item 15). Do this before
    any further tuning; the current 4-identical-lobes layout cannot be tuned into correctness.
2. Re-model the lobe as a tall inclined loop from the photos (item 13). Export a config-driven
   profile so geometry cannot drift from `10-config.js`.
3. Sweep `foamK`/`foamMu`/`boostExtra` jointly with `lobeLift`/`lobeBlend`. Judge on `laps`
   over 60 s AND `offTrack` never firing. Land the winner.
4. Explain the 400 cm/s cap.
5. Then `lineUpFive` (motor already spinning, stagger drops) = Stewart's actual bug report.
6. Then selftest 8/8, rebuild dist, publish artifact.

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
radius 15 cm, lobe radius derived 20.5 cm (footprint ~131 cm), lobe apex 2.0 cm (config lobeLift; the 9 cm guess was cut as unclimbable), lobe wall
height 2.6 cm, 280-class motor, gear 6.5:1, foam nip ~5 N normal force, wall friction 0.10,
car masses 35-47 g. All ESTIMATE unless RESEARCH.md says MEASURED.

## Next up (in order)
See "Next concrete moves (T18)" above, then `docs/ROADMAP.md` section 10 (first hour) and Phase 3.
