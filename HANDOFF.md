# HANDOFF — live project state

_Last updated: 2026-09-11 by Opus 5 (session 5). Update this block whenever you stop._

## Strategy
`docs/progress/` is the dated build timeline — one image per milestone with what the sim could
do at that point. Add a frame whenever something visibly changes; the capture recipe is in its
README. Stewart wants this for an eventual GitHub page.

`docs/ROADMAP.md` is the director's brief: build targets (artifact vs HD), phases 2-7, the
Blender/Gemini/ElevenLabs pipeline, questions for Stewart, risks. Read it after this file.

---

## Where we are

`node tools/serve.mjs` -> http://localhost:8765/ ; `node tools/build.mjs` -> `dist/index.html`
(193 KB, CSP-safe) and `dist/artifact.html`; `tools/selftest.html` -> **8/8 PASS** in real Chrome.

**PUBLISHED:** https://claude.ai/code/artifact/7426bcb0-d860-471f-9500-bab46b71017d
(private to Stewart; republish by building and passing `dist/artifact.html` to the Artifact tool
with that URL).

**Read `## T23` below before anything else.** The lobes were flat ribbons lying in tilted planes,
which cannot corner at all, and that one assumption is what three sessions of coefficient work were
fighting. Fixing it roughly tripled everything.

Shipped defaults: **lobeBankDeg 30, rollBlendCm 8, lobeRadius 19, lobeWallHeight 4.5, loop tilt 40,
sweep tilt 16, rampPow 4, hubHalf 16, laneOffset 2.5, straightLen 1.0, 480 Hz, vehicleMode raycast,
boostYawDamp 40, motorR 0.6, cellRFresh 0.10, autoRecycle on.**
Footprint 134 cm, circuit 349 cm, ring apex 24.0 cm, sweep apex 10.3 cm, junction turn radius 25.9.
Screenshot: `docs/progress/10-2026-09-11-banked-loops.png`.

| measurement | session 4 | now |
|---|---|---|
| lone car, mean laps / 25 s (n=30, same batch) | 0.80 | **2.07** |
| lone car, best run | 4 laps | **11 laps** |
| runs that stall with zero laps | 47 % | 27 % |
| selftest fleet check, cars lapping in 20 s | 2 of 5, best 3 | **5 of 5, best 10, none off** |
| selftest five-car pile-up, crashes / 15 s | 5 | 6 - 13 |
| five cars / 30 s (`tools/pileup.mjs`) | 3.0 crashes, 6 laps, nothing still moving | **14.3 crashes, 15 laps, 0 lost off the table** |
| north ring: wheels off the ground | 23 - 47 % | **0 %** |
| north ring: drag | 0.23 - 0.76 g | **0.10 - 0.33 g** |

**Two things are now game affordances rather than physics, both documented in `10-config.js`:**
`autoRecycle` (a car stopped, flipped or off the side for `recycleAfter` seconds is put back into
the clearest free outbound nip) and the stronger motor (`motorR` 0.6, `cellRFresh` 0.10). Without
the first, the five-car game ends at the first crash whatever the physics does; without the second,
five loaded nips bog the motor below the surface speed a car needs to crest the ring, so the whole
set stalls. `tools/ens.mjs` forces `autoRecycle` off so its numbers stay comparable with every
earlier session, and so does selftest check 7.

**Still not met:** `docs/REFERENCES.md` says a lone car circulates *indefinitely*. The best runs now
do 11 laps in 25 s, but the mean is 2.07 because 27 % of runs still stall -- almost all of them in
the junction turn at s=20-40. That is T24 and it is the clearest next task in the project.

## T23: THE LOBE WAS NOT A LOOP. THIS IS THE ONE THAT MATTERED.

Read this before anything else in the file. It explains, and retires, most of what is below.

A lobe was built as **a flat circle tilted about its chord** -- the architecture comment in
`src/30-track-layout.js` said so outright: *"It is a wall-of-death ring, NOT a loop-the-loop: the
track surface normal is the (constant) plane normal, and the car is held on the circle by the outer
wall."* That single sentence cost three sessions, because it is geometrically impossible:

> For a circle lying in a plane, the centre of the circle is IN the plane. The direction the car
> must be pushed therefore lies in the plane. The surface normal is perpendicular to the plane.
> Dot product zero. **A flat ribbon lying in a tilted plane supplies exactly zero cornering force,
> at any tilt angle.**

So 100 % of the 2.5-5.7 g was handed to the side wall, and the car was not driving round the lobe,
it was being dragged round it on its side. Two measurements say so directly:

- `tools/energy.mjs` reported the car with its **wheels off the ground 23-91 %** of each lobe, and
  the drag per bin tracked that number almost exactly (0.07 g where all four wheels were down,
  0.76-1.09 g where they were not).
- the new `tools/wall.mjs` coasts a car through the junction turn with the motor off and **every**
  dissipation term switched off -- tyre grip, rolling resistance, angular damping, linear damping,
  suspension damping, wall friction, chassis friction -- and still measures **0.33 g**. There is
  nothing left to turn off. A loss with nothing left to turn off is not friction; it is the cost of
  shoving a box round a corner with a wall.

That is why every friction sweep came back flat, why writing a whole replacement vehicle model
(T20) reproduced the same loss, and why every launch-energy lever (T22) made laps worse: they were
all downstream of a surface that cannot hold a car.

**The fix.** Along the arc, `right` is exactly the OUTWARD radial of the circle (write the tangent
and the plane normal in the plane's own basis and it falls out), so rolling the cross-section about
the tangent by `lobeBankDeg` turns the surface normal that many degrees toward the circle's CENTRE.
At 90 deg the lobe stops being a tilted racetrack and becomes a genuine **loop** -- the car rides
the inside of the ring and the FLOOR supplies v^2/R. That is how the instruction sheet draws it:
there is a car inverted at the apex of each rear ring (`docs/V2791-half0.png`, "TO PLAY").

**`lobeBankDeg` already existed and had been measured as catastrophic (T21). It was not the idea
that was wrong, it was the schedule.** Its blend eased the bank to ZERO at both joints, so the bank
was absent exactly at the arc entry where the car is at launch speed and the cornering demand is
highest, and full only near the apex where the car is slowest and a bank it cannot hold simply
drops it onto the inner wall. Now one schedule serves the whole lobe, both ramps carry it in by the
same construction as the arc (so every joint is continuous by construction, not by coincidence),
and the arc can ease from `lobeBankDeg` at the ends to `lobeBankApexDeg` at the apex because the
bank that holds a corner without the wall is atan(v^2/(R g)) and v runs ~250 cm/s at the ends
against ~100 at the apex.

What it bought, all n=20 unless stated, each batch containing its own baseline:

| config | mean laps | best | off % |
|---|---|---|---|
| shipped, bank 0 | 0.73 - 0.80 | 3 | 5 - 7 |
| bank 30 | 1.15 - 1.50 | 6 - 7 | 10 |
| bank 35 | 1.90 | 7 | 20 |
| bank 30, `lobeRadius` 19, `lobeWallHeight` 4.5 | **1.95** | **11** | 10 |

and in the energy profile the N-lobe went from **23-47 % wheels-off and 0.23-0.76 g** to
**0 % wheels-off and 0.10-0.33 g**. The car now drives round the ring.

Bank 60 and 90 are worse than 30 (0.15 and 0.00 laps): a full loop needs v^2 > g R sin(tilt)
everywhere and these cars are not fast enough to hold the inside of the barrel at the apex, so they
slide down it. 25-35 deg is the plateau at these speeds.

### Measured and rejected in T23 (do not re-try without new evidence)

- **Banking the JUNCTION TURN** (`turnBankDeg`, either sign, blends 6-16 cm). The bend between the
  hub gate and the lobe turns the OTHER way (`right` there points at the centre of the turn, not
  away from it), so the camber has to reverse inside ~19 cm, and the twist costs more than the bank
  saves. At `turnBlendCm` 6 it is fatal -- drag 5-14 g, cars stop at the gate. At a gentle 12-16 cm
  blend it is merely useless: junction-turn drag 0.651 g at bank 0 against 0.638 / 0.659 / 0.679 /
  0.929 at -10 / +10 / -20 / +20. Ensemble: 0.05 laps at turn 30, 0.00 at turn 45. The code is kept
  (`turnBankDeg` defaults to 0) because the measurement is worth being able to repeat.
- **`lobeRadius` 22** collapses (0.35 laps) even though 19 is the best value found. 18 and 20 are
  both worse than 19, so it is a genuine optimum and not a slope.

### What is left, and it is now a different problem

With the bank in, the lobes are cheap and **the junction turns are the whole remaining drag**:
0.61-0.67 g outbound, 0.74-1.01 g on the S-out ramp, 0.72 g on the S-in ramp, with the car up on
two wheels 23-39 % of the time there. They are flat ~20 cm bends taken at 330-360 cm/s, i.e. 5-6 g,
and banking them does not work (above). The lever that does work is their RADIUS, which is
`rt = (K*R - L - S sin b)/(1 - cos b)` -- so `lobeRadius` up, `laneOffset` down, `straightLen` down.
Raising `lobeRadius` used to be a losing trade because it lengthened an expensive lobe; now the
lobe is cheap, and 16 -> 19 is worth about 0.8 of a lap.

And the dominant failure mode has changed. At the shipped config **47 % of runs stall with zero
laps** and only 7 % leave the track, so the next win is in whatever stops a car dead, not in
off-track excursions. `tools/ens.mjs` now reports `stall%` and a tally of WHERE cars left.

---

## T21 (banked channel): also a negative result

The plan was to bank the lobe's cross-section into a groove so the wheels carry the corner instead
of the outer wall. It is implemented and correct now -- the bank eases from zero over `bankBlendCm`
of arc at each end (the first attempt shared the tilt's roll schedule, which left an 8.9 deg STEP in
the surface at the ramp -> arc joint; cars stopped dead there, coast s=172 -> s=49). And it does
help a COASTING car: reach 172 -> 213 cm.

It still makes laps worse: 0.75 -> 0.35 / 0.45 / 0.15 / 0.10 at bank 10 / 20 / 30 / 40 over a
20-run ensemble. **The reason is speed.** A bank only carries the corner while
`v^2/R > g(sin tilt + cos tilt * tan bank)`; at bank 30 that is v > 130 cm/s, and a car spends most
of the lobe slower than that, sliding down the bank onto the INNER wall and scrubbing there. It
buys a little at the top of the lobe and costs more at the bottom. `lobeBankDeg` stays 0.

Also ruled out: **surface warp is not the binding constraint.** Raising `suspTravel`, which raises
the warp a rigid car can follow from 2.49 to 3.87 deg/cm, makes laps worse (0.75 -> 0.30 at 0.7,
0.50 at 1.0), as does moving `rollBlendCm` either way. And `tools/audit.mjs` was measuring warp
wrong: it used the change in the frame's `up`, but `buildPath` orthogonalises up against the
tangent, so a ramp that merely CLIMBS rotates up by its slope and read as 3.42 deg/cm of "warp" on
a surface that is not twisting. It now measures `asin(right.y)`, the roll of the cross-section
about the tangent. Real figure at the shipped defaults: 2.12 deg/cm against a 2.49 limit.

## T22: THE PAIRED NIPS FIGHT EACH OTHER

This is the most useful thing found overnight, and it reframes the whole energy problem.

The four nips are not evenly spaced. Two sit in each hub **17 cm apart**, and then the car coasts
**131 cm** around a whole lobe. Run `node tools/energy.mjs` and look at the bins marked NIP:

```
   0   S-in-hub-N-out     135 -> 325    -4.57 g   NIP     <- accelerating, as intended
  10   S-in-hub-N-out     332 -> 320    +2.47 g   NIP     <- BRAKING, hard
  20   S-in-hub-N-out       3 ->  33    -3.15 g   NIP
```

The first nip launches the car to ~332 cm/s. The second, 17 cm later, **brakes it at 2.47 g**,
because the nip force is `Fmax * clamp((vFoam - vCar)/slipVel)` and by then the car is moving
faster than the foam surface, which has sagged under the load of the launch that just happened.
Both nips are driven off the same motor and gear train, so launching a car through one slows all
four.

**This is why every attempt to add launch energy backfires.** All measured over 20-run ensembles
against a base of 0.75 mean laps:

| lever | tried | result |
|---|---|---|
| nip squeeze | `foamGap` 1.7 / 1.5 | 0.35 / 0.45 |
| nip friction | `foamMu` 1.0 | 0.45 |
| nip stiffness | `foamK` 1.8e6 | 0.65 |
| nip contact length | `boostExtra` 2.2 | 0.45 |
| shorter coast | `boosterR` 11 / 13 | 0.50 / 0.30 |
| faster foam | `gearRatio` 4.5 / 3.5 | 0.30 / 0.30 |
| flywheel | `foamWheelMassG` 100 / 250 | 0.25 / 0.00 |
| stronger motor | `motorR` 0.6 | 0.50 |
| bank + stronger nip | `lobeBankDeg` 15-30 with `foamGap` 1.5-1.7 | 0.25 - 0.60 |
| wider junction turn | `lobeRadius` 19 / 22 (rt 20.5 -> 25.9 / 31.3) | 0.30 / 0.00 |
| tyre grip | `frictionSlip` 0.2 / 0.3 / 0.45 / 0.7 | 0.75 / 0.45 / 0.40 / 0.25 |
| softer nip saturation | `slipVel` 60 / 120 / 250 / 500 | 0.40 / 0.25 / 0.05 / 0.00 |
| tyre grip in OUR model | `vehicleMode: springs`, `wheelGrip` 0.8 / 1.5 | 0.00 / 0.00 |
| no wall height steps | `whAt` per box from the taller end, not the midpoint | 0.43 (tried and reverted) |

Every one of them RAISES the measured speeds at every probe point and LOWERS the laps. That
pattern is the result: **more launch speed is not the problem to solve.** A faster car simply
arrives at the second nip further above the foam surface and is braked harder.

`slipVel` deserves a note, because on paper it looked like the clean fix: it is the slip speed at
which the foam's friction saturates, so widening it should soften the second nip's braking (a car
52 cm/s over the foam would get 26 % of full braking instead of 100 %) while leaving the launch
alone (a stopped car is 434 cm/s under the foam, still saturated). It does the opposite -- `v@60`
falls 202 -> 184 -> 172 -> 157 -> 95 as it widens. The reason is that the motor SAGS during the
launch, so the foam speed collapses toward the car's and `dv` is small for most of the launch too.
A tight `slipVel` is what keeps the nip at full force while that happens. It is load-bearing at 30.

And a WEAKER launch is worse too -- `foamGap` 2.2 / 2.3 -> 0.10 / 0.00, `foamMu` 0.5 / 0.35 ->
0.35 / 0.00, `foamK` 0.7e6 / 0.5e6 -> 0.15 / 0.00. So the shipped nip sits at a genuine two-sided
MAXIMUM, not on a slope. **Do not re-tune the nip**; there is nothing there.

Why cornering is so expensive is now also measured. Attributing the junction turn alone
(`node tools/attribute.mjs '{"from":26,"to":52}'`): 0.79 g while the chassis rides the wall and
0.30 g with all four wheels down and no wall contact at all. Coulomb friction at `wallFriction`
0.05 against 3.5 g of cornering predicts only 0.175 g, so the wall is losing 4.5x what sliding
friction accounts for -- and it is insensitive to `wallFriction` across 0.005-0.3, so it is not
sliding friction. The 0.30 g with no wall contact is the tyres: `frictionSlip` 0.10 caps each wheel
at 0.1 g of lateral force against a 3.5 g demand, so **the car corners by skidding**, continuously,
guided by the wall. That is probably right for a die-cast car in a plastic channel; what it means
is that this layout asks the car to corner at 3.5 g and then charges it for doing so.

Two side notes worth keeping:
- `gearRatio` 4.5 and 3.5 produce numerically IDENTICAL results, which re-confirms that the launch
  is grip-limited and the drive train is not a lever on it.
- A heavier flywheel is worse because it takes longer to spin up than `lineUpLead` allows, so the
  first car is fed into a nip that has not reached speed.

**The 400 cm/s cap is explained.** Session 3 concluded it was "the launch speed with the nip slam
removed"; that was a guess and it was wrong. It is the MOTOR's torque limit. With `foamGap` 1.5 the
nip needs ~0.167 N.m at the foam wheel, i.e. 0.026 N.m at the motor, against a stall torque of
0.0129 N.m with this pack. The motor cannot hold the surface speed, so the car pins at ~400 no
matter what else changes -- which is exactly why 400 kept recurring across unrelated configs.

**So the remaining lever is DRAG, not launch.** The budget: 131 cm of coast at ~0.4 g eats
2*0.4*981*131 = 103,000 of the 109,000 (330 cm/s) the launch delivers, so the car arrives at ~78
cm/s. And the drag is not evenly spread -- `tools/energy.mjs` puts the junction turn at **0.58 g**
against the lobe's **0.33 g**. The junction turn is a 20.5 cm radius taken at ~330 cm/s, which is
5.4 g of cornering, all of it carried by the wall.

Widening it the obvious way does NOT work either: its radius is capped by the lateral budget
`K*R - L` in the lobe solve (SPEC s5.4), so the only way to widen it is a bigger `lobeRadius` --
and that lengthens the whole lobe, so the car has further to coast than the gentler turn saves.
`lobeRadius` 19 takes rt from 20.5 to 25.9 cm and the footprint from 116 to 134, and laps fall from
0.75 to 0.30; at 22 the footprint is 152 cm and nothing laps at all.

**So the honest position is that this layout is inherently marginal**, and the next real move is
probably not another coefficient. Either the drag model is still too pessimistic somewhere it has
not been isolated (the junction turn is the only stretch never measured on its own with a clean
coast -- `tools/coast.mjs` starting at s=26 with `foamK: 0` would do it), or the geometry itself is
wrong in a way that has not surfaced yet: the real set puts four nips on a ~300 cm circuit and
reviewers say cars circulate indefinitely, so if ours cannot, one of those two is off.

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

## The loop tilt (re-measured 2026-09-11 -- it barely matters now)

With the banked lobe, tilt is nearly free: 40 -> **2.30**, 36 -> 1.40, 32 -> 1.50, 28 -> 2.20,
24 -> 2.10 (n=30, `boostYawDamp` 40, same batch). All of that is inside the noise band, so **tilt is
now a LOOKS decision, not a physics one**, and 40 stays because it reads unmistakably as two rings
and two sweeps. The old table below is the flat-plane geometry and is kept only as history.

### The old table (flat-plane lobes, superseded)

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
  off-track %, median v at fixed s).
- **KNOW THE NOISE BAND BEFORE BELIEVING ANYTHING.** The shipped default config, measured seven
  times across one night at n=20 to n=30, returned mean laps of
  **0.43, 0.55, 0.60, 0.75, 0.75, 0.75, 0.90**. That is the same config each time. So a difference
  of 0.2 laps means NOTHING even at n=30, and the only results worth acting on are the ones that
  move it by half or double it. Several apparently promising leads this session were that band.
  Re-measure the baseline inside every batch and compare within the batch, never across batches.
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
| `tools/wall.mjs` | WHY is a curve expensive? A deterministic coast over ONE named stretch for several configs at once, reporting drag, contact fraction, impulse and lateral RMS. The ensemble cannot resolve anything under half a lap; this can, because the motor is off and the start state is identical |
| `tools/pileup.mjs` | is it FUN? five cars through `lineUpFive`, reporting crashes, laps, how many are still moving, and how far the motor bogged. A config that laps beautifully alone and bogs to a standstill with five is not the one to ship |
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

- ~~**Banking the lobe channel on top of the plane tilt** (`lobeBankDeg` 10/20): 93 % off the
  track at 20 deg. It twists a surface that is otherwise exactly planar. Leave it at 0.~~
  **WRONG, and it was the whole blocker -- see T23.** The surface was not "otherwise exactly
  planar" in any useful sense: a plane cannot corner. What was wrong was the SCHEDULE, which eased
  the bank to zero at both joints. `lobeBankDeg` is now 30 and is the single biggest win in the
  project's history.
- ~~**Nip yaw damping** (`boostYawDamp`): it works -- cars keep ~40 % more speed at s=270 --
  but the extra speed then puts 87 % of them off the track (vs 7 %). Off by default.~~ The last
  sentence of that entry said *"only turn it on together with whatever finally makes the lobe hold
  a fast car"*, and T23 is that thing. Re-measured 2026-09-11: **2.30 mean laps against 1.87** with
  it off, stalls 30 % -> 20 %. It is ON at 40 now.
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

1. **T24 -- the junction turn.** It is the last expensive stretch (0.5-0.6 g against the lobe's
   0.10-0.33) and it is where 27 % of runs stop dead. It is a ~26 cm flat bend entered from a
   straight, so the lateral acceleration STEPS from 0 to 5.4 g in one sample. That is exactly the
   bug `rampPow` fixed in the vertical plane -- where removing a 2.4 g curvature step took the
   five-car pile-up from 2-3 crashes to 10 -- and nobody has tried the same thing in plan view.
   **Give the junction turn an easement** (curvature ramping in and out, a clothoid rather than an
   arc), re-solving `rt` numerically so the closure in SPEC s5.4 still holds exactly. Banking it
   does not work and the radius is nearly maxed (see T23's rejected list).
2. **T25 -- the five-car jam.** With five cars they end up queued in that same junction turn, so (1)
   should largely fix it. `recycleLookCm` already stops the recycler feeding the queue.
3. Then `docs/ROADMAP.md` Phase 3 (physics fidelity) and Phase 4 (HD build with Blender).

**Residual, low priority:** `tools/audit.mjs` reports 48 exposed wall end caps at reach -0.69,
i.e. 0.69 cm outside the lane edge, at the hub gates. They do not respond to `wallSegLen` or
`wallRampLen` and no car has been observed hitting one, but a car leaving a nip does drift ~0.6 cm.

## Known UX gap Stewart hit (mostly closed)
He switched the booster on with all five cars lined up and nothing moved -- five nips loaded at
once bog the motor from 11,388 rpm to 1,687. DONE: the page opens running (`autoStart`); "Line up
all five" switches the booster on first and then feeds cars in one at a time (`lineUpLead` of
spin-up, then `lineUpStagger` apart); the hint line now leads with the correct order. STILL OPEN:
a "Launch" button that drops the selected car into the nearest outbound nip, and a toast when a car
is dropped into a nip with the motor off.

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
