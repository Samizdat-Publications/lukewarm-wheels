# HANDOFF — live project state

_Last updated: 2026-09-08 by Opus 5 (session 3). Update this block whenever you stop._

## Strategy
`docs/ROADMAP.md` is the director's brief: build targets (artifact vs HD), phases 2-7, the
Blender/Gemini/ElevenLabs pipeline, questions for Stewart, risks. Read it after this file.

---

## Where we are

**It runs, it renders, a lone car laps, and the set now has the real 2 rings + 2 sweeps shape.**
`node tools/serve.mjs` -> http://localhost:8765/ ; `node tools/build.mjs` -> `dist/index.html`
(170 KB, CSP-safe); `tools/selftest.html` -> **8/8 PASS** in real Chrome.

Shipped defaults: **loop tilt 40 deg, sweep tilt 16 deg, hubHalf 16, lobeRadius 16, laneOffset 2.5,
straightLen 1.0, 480 Hz.** Footprint 116 cm, ring apex 22.6 cm, sweep apex 9.7 cm.
Screenshot: `docs/screenshots/T18-shipped-40-16.png`.

Measured (20-run ensemble, `node tools/ens.mjs`): **mean 0.85 laps per 25 s, best 4, 0 % off-track.**
Selftest check 7 runs the whole fleet: **4 of 5 cars lap, best 5 laps, none leaves the track.**
Five-car pile-up: **3 crashes** (was 0-1).

**Not yet met:** `docs/REFERENCES.md` says a lone car circulates *indefinitely*. Ours still stalls
after 1-5 laps, and the five-car run ends with cars stalled. See "The blocker" below.

## The loop tilt, and why it stops at 40

The instruction sheet has the two rear lobes standing up as rings. The layout renders that
correctly at any tilt -- open
`index.html#cfg=%7B%22loopTiltDeg%22%3A48%2C%22sweepTiltDeg%22%3A16%7D` from a cold load and look.
Loop tilt against mean laps per 25 s, everything else at the shipped defaults:

| tilt | 30 | 36 | **40** | 44 | 48 |
|---|---|---|---|---|---|
| mean laps | 1.20 | 1.00 | **0.85** | 0.50 | 0.05 |
| off-track | 15 % | 10 % | **0 %** | 10 % | 0 % |

There is a **cliff between 44 and 48**: that is where the ring apex passes what the launch can
clear. At 48 the car crests at ~30 cm/s and rolls back down into the nip, gets relaunched, and
oscillates until it dies. 40 is shipped because it is the steepest tilt that still laps, it is the
only setting measured with no off-track excursions at all, and it reads unmistakably as 2+2.

Two things bought that headroom and both are also more faithful:
- **`hubHalf` 13 -> 16** (the hub is ~32 cm across, which is what Stewart's photos scale to). Worth
  0.4 of a lap on its own: the junction turn moves outward, so the car does its cornering further
  from the nip.
- **`straightLen` 3 -> 1.** At high tilt the derived junction radius collapses (14.2 cm at 48 deg,
  an 11 g corner at 400 cm/s) because the short connector eats the lateral budget. Shortening it
  puts the radius back to 20.5.

## THE BLOCKER: the vehicle model, not the geometry

`tools/attribute.mjs` splits the per-step energy loss by what was true that step. On a flat 16 cm
lobe, fleet-averaged over 20 runs, with Rapier's `DynamicRayCastVehicleController`:

| when | drag | share |
|---|---|---|
| chassis riding a wall | **0.53 g** | 52-64 % |
| all four wheels down, NO wall contact | **0.21 g** | 29-43 % |
| on an essentially straight track (R = 260) | **0.076 g** | -- |

Rolling resistance is only 0.022 g, so most of that is parasitic. **And none of it responds to
anything**: measured, unchanged within noise, across `frictionSlip` 0.005-1.0, `sideFriction`
0-0.8, `suspMaxForceMult` 1.5-40, suspension damping 0.5-40, suspension stiffness 800-20000,
`crrScale` 0, `wallFriction` 0.005-0.3, `carFriction`, `floorFriction`, restitution 0-0.95,
`laneWidth` 3.175-4.0, `wallInset`, `wallSegLen`, `wallRound`, and `physicsHz` 240-1920.
A loss insensitive to every coefficient is not friction.

For scale: `vehicleMode: 'sled'` (a plain box sliding on the floor) loses **0.045 g** total, which
is the physically right answer. That is a 5-10x difference, and it is exactly the margin the 48 deg
ring needs.

**So the next real task is a vehicle model we control.** `src/44-wheel-model.js` is a start
(`vehicleMode: 'wheels'`): four explicit raycast wheels, a spring/damper along the contact normal,
and a lateral force capped at `wheelGrip * N` so the only energy it removes is mu*N*slip. It is
NOT finished -- 100 % of cars still leave the track. Two bugs are already fixed in it (a damping
term that spanned two steps and fired cars 10 cm into the air; a one-step lateral constraint that
pumped the roll mode) and the remaining failure is understood: the car goes briefly airborne at the
lobe entry, all four rays then miss because the suspension only has `wheelStaticComp` of droop, and
it comes down through the track. `sled` fails differently -- a sliding box tips at 2.4 g and the
lobe pulls 5.9.

Also landed while chasing this: **`floorSolid`** makes the floor collider the closed
`floorThick`-deep slab instead of the bare top ribbon. A zero-thickness trimesh lets a car that
gets briefly airborne come down *through* the track (measured: h 1.34 -> 0.64 -> 0.01 -> -1.94 in
four samples). Worth 13 points of off-track rate on a flat lobe.

## METHODOLOGY — read this before you measure anything

**A single run tells you NOTHING.** `node tools/chaos.mjs` demonstrates it: a **0.02 mm**
change of start position swings v@60 from 78 to 210 cm/s and laps from 0 to 1. Every
conclusion in the old HANDOFF that rested on one run should be treated as unproven.

- Judge configs on `node tools/ens.mjs` (5 castings x N start offsets; reports mean laps,
  off-track %, median v at fixed s). n=15 still has about +-0.15 laps of noise; use n=20
  for a close call.
- `endS` / `maxS` are thresholds on whether a nip happens to catch the car. Never use them.
- Results are reproducible **within a process sequence** but not across differently ordered
  batches: Rapier's WASM heap state depends on how many worlds were created before. Put the
  baseline in every batch and compare within the batch.

## The tools (each answers a question that cost a session before)

| tool | question |
|---|---|
| `tools/ens.mjs` | does this config lap? (ensemble; the only trustworthy verdict) |
| `tools/energy.mjs` | WHERE does the energy go? bins a lap by distance, reports drag in g with gravity removed, fleet-averaged |
| `tools/diag.mjs` | what hit the car? prints contact **MANIFOLDS** (normal + impulse), so a wheel-model loss is distinguishable from a collider hit |
| `tools/audit.mjs` | static geometry audit: exposed wall end caps, wall gaps, surface warp vs what a rigid car can follow |
| `tools/geom.mjs` | the derived lobe geometry + a height/lean/curvature profile |
| `tools/chaos.mjs` | how much of my result is noise? |
| `tools/lobetest.mjs` | one run (`run()`, `five()`); the others build on it |
| `tools/imgzoom.html` | pixel-zoom the instruction sheet / photos in the browser |

Rapier for the headless harness is vendored at `tools/vendor/rapier.mjs` (gitignored).
If it is missing: `node tools/fetch-rapier.mjs`.

---

## Defects found and fixed this session (do not reintroduce)

1. **Orphan wall stub.** The foam wheel slot ended at z=-5.55 and the crossing gap began at
   z=-4.89, leaving a **6 mm island** of wall between them, too short to carry a lead-in:
   a spike with two square end caps standing in the lane. A car leaving the inbound nip at
   156 cm/s hit that cap head-on (normal 0.98 along the lane, J192) and **stopped dead**.
   This is why every flat-track run used to die at s=136 regardless of launch energy.

2. **The flare box was the same bug wearing a hat.** Bolting a separate angled "flare" box
   onto each end of a run just moved the problem: the flare's own end face met the normal
   boxes at 22 degrees and cars hit THAT (J799, -125 cm/s in one step, normal 0.93 along
   the lane). Now there is **one primitive**: every wall box is built from two points on the
   inner face line, and that line moves outward over `wallFlareLen` at each end of a run, so
   consecutive boxes share a face by construction. `tools/audit.mjs` reports **0** exposed
   caps (was 416).

3. **The nip slam, and the unexplained 400 cm/s cap.** `boostPushFrac` applied an unopposed
   2.5 g sideways for the whole time in the nip; the car left with 40-60 cm/s of lateral
   velocity, slammed the far wall, went up on two wheels, and the vehicle controller's side
   friction dumped the forward speed. Foam is compliant and the far wall reacts the squeeze,
   so the car should SETTLE against the wall: `boostLatDamp` adds lateral damping in the nip.
   Launch peak 316 -> 370-400 cm/s. **The old "400 cm/s cap" was simply the launch speed
   with the slam removed.** That open question is closed.

4. **Surface warp.** 45 degrees of roll in the 17 cm ramp unloaded the front wheels and the
   car rode one wheel into the wall. A rigid four-wheel car can only follow about
   `suspTravel / (trackCm * wheelbaseCm)` = 2.6 deg/cm. `rollBlendCm` shares the roll-in with
   the first part of the arc (the centreline still lies exactly on the tilted circle; only
   the ribbon twists, as a real connector does). `tools/audit.mjs` now reports 0.85 deg/cm.

5. **`suspMaxForceMult` 3.0 was too tight** -- 40 % of cars off the track against 13 % at 10.

6. **Harness bug that invalidated every `physicsHz` experiment:** lobetest/diag/energy
   hard-coded `h = 1/240` while the world's own timestep followed `cfg.physicsHz`, so the sim
   silently ran at the wrong speed. Fixed. With it fixed, drag is nearly Hz-independent;
   480 Hz is a small real gain and is the new default (a car at 400 cm/s moves 0.83 cm per
   step against 0.36 cm of free play each side of a 3.175 cm lane).

## Things measured and REJECTED (do not re-try without new evidence)

- **Banking the lobe channel on top of the plane tilt** (`lobeBankDeg` 10/20): 93 % off the
  track at 20 deg. It twists a surface that is otherwise exactly planar. Leave it at 0.
- **Nip yaw damping** (`boostYawDamp`): it works -- cars keep ~40 % more speed at s=270 --
  but the extra speed then puts 87 % of them off the track (vs 7 %). Off by default. Only
  turn it on together with whatever finally makes the lobe hold a fast car.
- **Opening the whole `#` crossing square.** The real opening is only as wide as the lane
  that crosses (~3.8 cm), not the 8.8 cm square; widening it made cars wander out
  (off 7 % -> 40 %). The 1.2 cm wall island at the dead centre is the tip of the arm's
  central housing and is physically real.
- **Every friction coefficient.** Junction-turn drag is 0.6-1.0 g whether `wallFriction` is
  0.01 or 0.15, and is equally insensitive to `frictionSlip`, `sideFriction`, `crrScale`,
  `floorFriction`, restitution, `wallSegLen` and `wallRound`. A loss insensitive to every
  coefficient is STRUCTURAL. (This confirms the old HANDOFF's item 4 on the new geometry.)
- **Taller `lobeWallHeight`** (4.5, 6.0) does not rescue a faster car.

---

## Next moves, in order

1. **Finish `src/44-wheel-model.js`** (or something like it). This is the one thing standing between
   the sim and everything else: a lone car that circulates indefinitely, the five-car pile-up, and
   the photo-faithful 48 deg ring all fall out of it. The remaining bug is stated above. Give the
   suspension real droop (raise `wheelStaticComp` AND `suspRest` together so the rays keep finding
   the ground), and work out what lifts the car at the ramp -> lobe joint in the first place.
   Judge it with `node tools/ens.mjs` and `node tools/attribute.mjs`, never one run.
2. **Then raise `loopTiltDeg` to ~48** and re-run the tilt table above. That is the fidelity
   milestone: it is what the set actually looks like.
3. **Then the five-car pile-up.** `lineUpFive` now feeds cars in `lineUpStagger` apart (0.7 s)
   instead of dropping all five at once, which took crashes from 0-1 to 3; the UI button also
   switches the motor on first. But cars still stall rather than circulating.
4. Publish `dist/index.html` as an Artifact (car emoji favicon) and send Stewart the link.
5. Then `docs/ROADMAP.md` Phase 3 (physics fidelity) and Phase 4 (HD build with Blender).

**Residual, low priority:** `tools/audit.mjs` reports 48 exposed wall end caps at reach -0.69,
i.e. 0.69 cm outside the lane edge, at the hub gates. They do not respond to `wallSegLen` or
`wallRampLen` and no car has been observed hitting one, but a car leaving a nip does drift ~0.6 cm,
so they are worth a look if unexplained losses show up near the gates.

## Known UX gap Stewart hit (still open)
He switched the booster on with all five cars lined up and nothing moved. Required:
"Line up all five" auto-starts the motor and staggers the drops ~0.3 s apart; a toast
"Turn the booster on first" when a car is dropped into a nip with the motor off; a "Launch"
button that drops the selected car into the nearest outbound nip; a three-line "How to
play" box at the top of the panel. The motor-first order is now the documented one, but
the staggering and the UI affordances are not built.

---

## Stewart's answers (2026-09-08) — these override ROADMAP section 8
1. **Real set:** he does NOT own one. Mattel **V2791** "Criss Cross Crash" (2010); cars are
   the 1999 5-pack **#21081**. The instruction sheet in `docs/` is the best source we have and
   is better than the eBay photos -- use `tools/imgzoom.html` on it before searching the web.
   Decision: stay on the orange V2791; the newer FDF25 has MORE parts to model, not fewer.
2. **Blender 5.1 is installed.** Headless: `blender -b -P tools/blender/<script>.py`.
3. **API keys (Gemini, ElevenLabs):** the next session must write step-by-step terminal
   commands that put the keys into `.env` (gitignored) without a key ever appearing in chat
   (Stewart types the value himself, e.g. `Set-Content -Path .env`), plus a
   `tools/env-check.mjs` that prints only whether each key is present.
   **Every command given to Stewart must begin with**
   `cd "C:/Users/stewa/OneDrive/Documents/Claude/Projects/Hot Wheels Sim"`.
4. **Machine:** ROG Zephyrus G16 (GU605CR), Core Ultra 9 285H, 32 GB, RTX 5070 Ti Laptop
   12 GB + Arc 140T, Win 11 Home 25H2, ~200 GB free. When measuring fps make sure Chrome
   runs on the NVIDIA GPU (Windows Graphics settings, High performance).
5. **Priority:** artifact first, then HD build.

## How to resume (any model)
1. Read `CLAUDE.md`, then `docs/SPEC.md` s5 (geometry) and s6 (interfaces), then
   `docs/REFERENCES.md` (what the real toy does), then `docs/PLAN.md`.
2. `git log --oneline` shows what landed; PLAN.md status is the source of truth.
3. All tunables live in `src/10-config.js`. Never hardcode a physical constant elsewhere.
4. Measure with the ensemble, not with one run. See METHODOLOGY above.
5. After each task: run the selftest in a real browser, rebuild dist, commit with the task
   id, update PLAN.md and this file.

## How to test physics in the browser console
```js
HW.main.paused = true;
const s = HW.sim, h = 1 / HW.config.physicsHz, car = s.cars[0];
s.reset(); s.setSwitch(true); for (let i = 0; i < Math.round(1/h); i++) s.step(h);  // spin up
car.spawnAtGate('N-out');
for (let i = 0; i < Math.round(12/h); i++) s.step(h);
({ laps: car.laps, s: car.s, v: car.speed, off: car.offTrack });
```
The Browser pane fully **suspends requestAnimationFrame while hidden**, so `HW.sim.stepCount`
stays 0 and any rAF-waiting promise times out. That is not a bug in the sim. Always step
synchronously like this when measuring; never trust the live view in the pane.

## Lessons (each cost real debugging time; do not relearn them)
- Car local axes: +X right, +Y up, **-Z forward**. `(right, up, +Z)` is left-handed and
  `quatFromBasis` then returns a reflection: the collider looks fine but physics is garbage.
- `controller.setIndexForwardAxis` is a **setter property** in rapier 0.20, not a method.
- Walls must be **solid boxes** (`roundCuboid`, chained, inset 0.08 cm, rounded 0.1 cm). A
  thin two-sided trimesh wedges any cuboid pressed into it.
- **Never `setEnabled(false)` a vehicle body.** A body that sat disabled while the world
  stepped makes `updateVehicle` emit NaN on re-enable. Lifted cars are parked as kinematic
  bodies at y=300 instead.
- `suspTravel` must be < `suspRest` or the vehicle solver NaNs.
- The nip's sideways push must act **through the centre of mass** (`boostPushY = 0`). Roll
  inertia is ~33 g.cm2; a 1 N push on a 0.15 cm lever arm spins the car to 188 rad/s in 60 ms.
- **`setWheelMaxSuspensionForce(i, 1e9)` is a trap.** Rapier divides the suspension force by
  `dot(contactNormal, -rayDir)`; once a car rolls that blows up. Cap it (`suspMaxForceMult`).
- **Rapier trimesh floors NEED `TriMeshFlags.FIX_INTERNAL_EDGES`.** Without it a fast body
  catches on the internal edges between strip triangles and is thrown off with no manifold left
  behind. This looks exactly like "the car randomly explodes".
- **`world.lengthUnit` should stay 1 here, NOT 100.** At 100 the allowed linear error is
  0.5 cm inside a 3.175 cm lane and cars sink into the floor.
- **Raycast wheels are RAYS**: they never appear in `contactPairsWith`. A big `dv` with no
  manifold is the tyre model, not a collider. Use `car.wheelState(k).contact`.
- Do NOT inject speed with `body.setLinvel` for a "coast test": the wheels start at zero spin
  and the tyre model burns ~8 g spinning them up. Measure on the real nip launch.
- The nip drives the car through **chassis friction**: `carFriction = 0` or `wallFriction = 0`
  kills the inbound catch. Do not zero those "to isolate rolling losses".
- Bend radius must be >= ~12 cm: a 7 cm car needs `width + L^2/(8R) < laneWidth`.
- The launch is **grip-limited, not speed-limited**. Sweeping `gearRatio` 6.5 -> 2.5 changes
  the foam surface speed 537 -> 902 cm/s and does nothing to the car. `gearRatio`, `motorKe/Kt`,
  `cells` and `foamWheelMassG` are NOT levers on launch speed. The levers are `foamK`, `foamMu`
  and `boostExtra`.
- Standard track is 3.175 cm between walls; the instruction sheet shows two independent
  circuits, not one continuous one.

## Assumptions to surface to Stewart (all ESTIMATE unless RESEARCH.md says MEASURED)
| what | value | note |
|---|---|---|
| hub half-length | 16.0 cm (32 across) | matches the photo scaling, and worth 0.4 laps |
| lane offset | 2.5 cm | was 3.0; 2.5 buys a 21 cm junction radius instead of 14 |
| foam wheel radius | 2.09 cm (derived) | photos suggest smaller than the old 2.59; this agrees |
| lobe radius | 16.0 cm | scaled off the sheet against the 3.81 cm track width |
| lobe tilt | 40 / 16 deg | the real set is ~48 / ~16; 48 is blocked, see the tilt table |
| footprint | 116 cm | photos scale to 105-110 |
| ring apex | 22.6 cm, sweep 9.7 cm | photos scale the SWEEP apex to 10-16 cm |
| lobe wall height | 3.4 cm | must exceed the tallest casting (2.3) |
| motor | 280-class, gear 6.5:1 | a 130 cannot drive four foam nips from 4 D cells |
| foam nip | ~5.4 N normal | `foamK` 1.2e6 dyne/cm at 0.45 cm squeeze |
| car masses | 35-47 g | from `docs/CATALOG-SOURCES.md` |
