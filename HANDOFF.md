# HANDOFF — live project state

_Last updated: 2026-09-09 by Opus 5 (session 4). Update this block whenever you stop._

## Strategy
`docs/ROADMAP.md` is the director's brief: build targets (artifact vs HD), phases 2-7, the
Blender/Gemini/ElevenLabs pipeline, questions for Stewart, risks. Read it after this file.

---

## Where we are

`node tools/serve.mjs` -> http://localhost:8765/ ; `node tools/build.mjs` -> `dist/index.html`
(175 KB, CSP-safe); `tools/selftest.html` -> **8/8 PASS** in real Chrome.

Shipped defaults: **loop tilt 40 deg, sweep tilt 16 deg, rampPow 4, hubHalf 16, lobeRadius 16,
laneOffset 2.5, straightLen 1.0, 480 Hz, vehicleMode raycast.** Footprint 116 cm, ring apex
20.1 cm, sweep apex 8.6 cm. Screenshot: `docs/screenshots/T20-shipped-40-16-pow4.png`.

- Lone car, 20-run ensemble over 25 s: **mean 0.75 laps, best 3, 5 % off-track.**
- Selftest fleet check: **2 of 5 cars lap in 20 s, best 3, none leaves the track.**
- Five-car pile-up: **10 crashes in 15 s**, 4 of 5 cars lapping (was 0-1 crashes two sessions ago).

**Still not met:** `docs/REFERENCES.md` says a lone car circulates *indefinitely*. Ours does 1-3
laps. And the loop tilt is 40 deg where the real set is ~48.

## CORRECTION: the blocker is NOT the vehicle model

The previous handoff said Rapier's raycast vehicle controller was dissipating the energy and that
replacing it would unlock everything. **That was wrong**, and it is worth knowing why before anyone
spends another session on it.

`src/44-wheel-model.js` now contains a complete, working replacement (`vehicleMode: 'springs'`):
four explicit raycast wheels, a spring/damper along the contact normal, and a lateral force capped
at `wheelGrip * N` so the only energy it can remove is mu*N*slip. It is stable (0 % off-track on a
flat lobe) and it loses **the same as Rapier's**: 0.62 g against a wall and 0.32 g clean, versus
Rapier's 0.64 and 0.23. Writing our own physics reproduced the loss, so the loss is physics, not a
library defect.

`node tools/coast.mjs` settles it. It coasts a car with the motor off (and the nip disabled -- see
the gotchas) and measures the deceleration directly:

| where | drag |
|---|---|
| flat straight, normal settings | **0.026 g** -- exactly the casting's rolling resistance (crr 0.022) |
| ramp and lobe, normal settings | 0.53 - 1.05 g |
| ramp and lobe, every tyre term off (`wheelGrip` 0, damping ~0, `crrScale` 0) | 0.19 - 0.62 g |

So: **the straight is perfect and the curves are expensive, with no tyre model involved at all.**
What is left in a curve is the WALL. A car cornering at 4-6 g has to be held by something, the
geometry gives it only a wall, and scrubbing along it at that load costs 0.2-0.6 g. Our own model
pays it too.

**What would actually unblock a steeper ring** is therefore to stop the wall carrying the corner:
- a genuinely BANKED CHANNEL on the lobe -- a moulded groove whose cross-section is banked, so the
  wheels take the load. `lobeBankDeg` is NOT this: it rolls the cross-section of an otherwise
  planar surface and measures far worse (coast distance 190 cm -> 70 cm at 20 deg, 50 cm at 35).
  The real moulded curve is a banked channel; modelling it needs the lobe SURFACE to be banked,
  not a twist applied on top of a flat one.
- or simply less cornering load: a bigger `lobeRadius` helps measurably (coast 190 -> 220 cm at
  R 26) at the cost of footprint.

## The loop tilt

The layout renders any tilt correctly -- open
`index.html#cfg=%7B%22loopTiltDeg%22%3A48%2C%22sweepTiltDeg%22%3A16%7D` from a cold load and look.
Mean laps against tilt, everything else at the shipped defaults:

| sample | 40 | 44 | 46 | 48 |
|---|---|---|---|---|
| n=30, 20 s | **0.53** | 0.33 | -- | -- |
| n=20, 25 s | **0.75** | 0.95 | 0.40 | 0.15 |

40 and 44 swap places between n=20 and n=30, so treat them as equal; 46 and above are genuinely
worse. 40 is shipped because it is where the selftest fleet check passes. Above ~44 the ring's apex
passes what the launch can clear and cars crest at ~30 cm/s and roll back down.

## Fixed this session

1. **The torque accumulator was never reset.** `car.preStep` called `body.resetForces(true)` but not
   `body.resetTorques(true)`, and Rapier keeps the two separately. Every torque from
   `addForceAtPoint` therefore stayed on the body forever. Nothing noticed while the only forces
   were `addForce` (no torque) and Rapier's controller (which applies impulses, not forces) -- it
   made our own wheel model diverge within a few hundred steps and throw every car off the track.
   It also silently affected the nip whenever `boostPushY != 0`.
2. **`rampPow`.** The ramp's height was `y0 * t^2`, whose vertical curvature is CONSTANT -- so it
   stepped from nothing to 2.4 g the instant a car left the flat hub, and every vehicle model rang
   on it. At `rampPow` 4 the curvature starts at zero and builds, and the chord sits lower (y0
   scales as 1/pow) so the whole lobe is easier to climb. This took the five-car pile-up from
   2-3 crashes to **10**.
3. **`wheelRollInfluence` must be 0** in the springs model. At 0.15 the four wheel compressions
   alternate left-right every step and grow from +-0.01 to +-0.2 cm in 60 steps, loads swing 0 to
   7.6x static, and the car is thrown onto the tops of the lobe walls. `tools/wheelprobe.mjs`
   shows it happening.
4. **Damp on the contact-point velocity, not on d(comp)/dt.** A finite difference of compression
   looks smooth until the wheel meets something abrupt, then jumps 0.12 -> 0.45 in one step and
   the damper alone demands 14x the static load.

## Gotchas found the hard way

- **The nip BRAKES a coasting car when the motor is off.** vW - vCar is negative, so the foam
  drags. Any coast test must set `foamK: 0` or start well away from a nip; the first version of
  `tools/coast.mjs` drove straight into a stationary foam wheel and read 7.9 g of "drag".
- `vehicleMode 'wheels'` (a chassis on four low-friction feet, contacts left to the solver) is
  stable but very lossy: small feet snag on the floor trimesh at 300 cm/s (-191 cm/s in a single
  step, with no chassis manifold at all because the hit was on a foot). Larger feet have to move
  inboard to keep the walls meeting the body, which costs roll stability. Not recommended.
- `vehicleMode 'sled'` loses only 0.045 g but a sliding box tips at 2.4 g and the lobe pulls 5.9,
  so 100 % of cars leave the track.

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
| `tools/coast.mjs` | how much drag, really? coasts a car with the motor off; deterministic. Set `foamK: 0` or the nip brakes it |
| `tools/attribute.mjs` | splits the per-step loss by what was true that step: on a wall, wheels up, airborne, clean |
| `tools/wheelprobe.mjs` | per-wheel compression and load, step by step (vehicleMode springs) |
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

1. **Bank the lobe channel properly.** This is the one change that would let the ring stand up:
   make the lobe CROSS-SECTION a banked groove so the wheels take the corner, instead of a flat
   plane where the wall takes it. Do NOT do it with `lobeBankDeg` -- that rolls the cross-section
   of an otherwise planar surface and measures much worse. The surface itself has to be banked.
   Measure with `node tools/coast.mjs` (deterministic, far less noisy than laps) and confirm with
   `node tools/ens.mjs`.
2. **Then raise `loopTiltDeg` towards 48** and re-run the tilt table above.
3. **Then indefinite lapping and the five-car pile-up**, which should follow from (1).
4. Publish `dist/index.html` as an Artifact (car emoji favicon) and send Stewart the link.
5. Then `docs/ROADMAP.md` Phase 3 (physics fidelity) and Phase 4 (HD build with Blender).

**Residual, low priority:** `tools/audit.mjs` reports 48 exposed wall end caps at reach -0.69,
i.e. 0.69 cm outside the lane edge, at the hub gates. They do not respond to `wallSegLen` or
`wallRampLen` and no car has been observed hitting one, but a car leaving a nip does drift ~0.6 cm.

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
| lobe tilt | 40 / 16 deg | the real set is ~48 / ~16; see the tilt table |
| footprint | 116 cm | photos scale to 105-110 |
| ring apex | 20.1 cm, sweep 8.6 cm | photos scale the SWEEP apex to 10-16 cm |
| lobe wall height | 3.4 cm | must exceed the tallest casting (2.3) |
| motor | 280-class, gear 6.5:1 | a 130 cannot drive four foam nips from 4 D cells |
| foam nip | ~5.4 N normal | `foamK` 1.2e6 dyne/cm at 0.45 cm squeeze |
| car masses | 35-47 g | from `docs/CATALOG-SOURCES.md` |
