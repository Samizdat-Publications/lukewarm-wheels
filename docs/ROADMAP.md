# ROADMAP - from one set to a track platform

> **Status 2026-09-24: all five phases are built** (commits `9cd845a`..`91ae210`). What each
> phase became is in `HANDOFF.md` and `docs/progress/README.md` (frames 14-18); the plan below is
> kept as it was written, for the record. Differences from the plan: Criss Cross is set #1 and
> bit-identical; "Loop & Leap" uses a spring launcher (the drop tower is its own set, Drop & Jump)
> and a swinging hammer; the Kitchen set loops under a chair rather than around a chair leg, and
> one boosted ramp (boosters on the slope) brings cars back to the table.

_Written 2026-09-24 at the end of the v2 session. Read `HANDOFF.md` first; this is the plan for
what comes after. Stewart's brief for this phase: new tracks, borrowed from Hot Wheels or
invented, "totally up to you"._

## The idea in one line

v2 has an engine most toy-track sims do not: a car follows the track exactly while it is in it,
becomes a real tumbling rigid body the instant it leaves (crash, fall, JUMP), and is recaptured if
it lands back in a lane. Jumps, gaps, splits and hazards are exactly what that is good at, and
none of it is Criss-Cross-Crash-specific except `31-track-layout.js`. So: turn the engine into a
platform where a track set is data, then build sets that show it off.

## Phase 1 - Engine to platform (do this first; everything else depends on it)

Goal: a track set is a data file, not code. Criss Cross Crash becomes set #1 and must look and
behave exactly as it does now (regression: `node tools/simtest.mjs lone 20 N` for all five cars,
`fleet 3 60` on seeds 3 and 4, and the progress-archive screenshots).

- **Set format.** Something like:
  ```js
  HW.sets.crissCross = {
    name: 'Criss Cross Crash', floor: 'rug',
    pieces: [ { type: 'straight', id: 'laneC', len: 29, ... },
              { type: 'lobe', id: 'NW', apex: {...}, bank: 'heartline' }, ... ],
    loops: [['laneC', 'NW', 'laneA', 'NE', ...]],     // closed circuits (the graph, below)
    boosters: [...], supports: 'auto', props: [{ kind: 'hub-v2791', at: [0, 0, 0] }],
    start: { piece: 'laneC', at: 2.6 },
  };
  ```
  `31-track-layout.js` becomes a builder that reads it; the hub is a prop.
- **Track graph, not one loop.** Today `path` is a single closed curve and `s` is global. Real
  sets branch: splitters (a car goes left or right), merges, dead ends into a catch net, and
  finish gates. Model it as segments with explicit connections; a car carries (segment, s).
  Crossings stay what they are now (two segments that intersect in space).
- **Generic supports**: towers under any segment above a height threshold, placed so they never
  enter a car's swept volume (the lesson from the loop towers).
- **Keep**: units, the heartline banking, the quintic joins (G2 everywhere), the Rapier hand-off.

## Phase 2 - Stunt Pack (the showpiece: jumps are where this engine is unique)

Borrow from Hot Wheels' stunt sets (Loop & Launch, Double Loop Dare, Stunt Kicker), and new
mechanics, each a piece type:

- **Gravity drop tower** (the classic start: a tall steep ramp, pull the gate) and a **spring
  launcher** (a plunger with a strength slider, energy = 1/2 k x^2 into the car).
- **Jump ramp + catch ramp.** The car leaves the lip as a free body (already works: derail with
  cause 'jump'), flies, and lands in a funnel-shaped catch piece that guides it back into the
  channel (recapture already works; make the catch piece forgiving with wide flared walls).
  Score airtime and distance.
- **Corkscrew**: the track rolls 360 deg about its own tangent while running straight or curving.
  A roll-schedule override instead of the heartline rule; the car stays pinned by speed.
- **Hazards**: kinematic Rapier bodies that knock cars out of the channel (a swinging hammer, a
  rotating paddle, a chomping gate). The on-track/free-body contact code already handles a
  kinematic obstacle hitting an on-track car; it needs a kinematic-body case.
- **Set #2 "Loop & Leap"**: drop tower -> double loop -> jump gap -> corkscrew -> finish gate,
  with a booster return lane so it runs by itself.

Definition of done: a car launched at the right strength lands the jump most of the time, a weak
one falls short into the gap and tumbles (realistically), a strong one overshoots; all three are
visible and replayable.

## Phase 3 - Race Day (turns the physics into a game)

- **Set #3: 4-lane gravity drag strip** (Hot Wheels drag race / Pinewood Derby): a steep start
  hill, a long straight, a timing gate with lane lights at the finish. Race the five castings.
  Their differences are real in the model (mass, wheel drag crr, frontal area, width), so the
  results are explainable, and a stats card says WHY a car won.
- **Car tuner**: weight (add a coin), wheel type, and a custom paint job from the procedural car
  generator in `53-car-models.js`.
- **Tournament**: bracket knockouts, best times kept in localStorage.
- **Physics overlays** (a toggle): force arrows (floor, wall, booster), a g-meter, an energy bar,
  speed-coloured trails. It is the cheapest way to make the "modelled, not faked" claim visible.

## Phase 4 - Track Builder (the sandbox)

Snap-together pieces on a grid, the way the real Track Builder system works: straight, curves
(45/90/180), banked curve, loop, corkscrew, booster, launcher, jump + catch, splitter, crossing,
finish gate. Live checks: open ends glow red, G2 joins are automatic (quintic joins between
pieces), supports appear by themselves. Save and share as a compact code: artifacts only pass a
bare `#token` (letters, digits, `.` `_` `~` `-`), so encode the piece list in that alphabet.

## Phase 5 - Our own set: "Kitchen Table Grand Prix"

An original mega-set that uses the room we already render: the start gate is on a kitchen table,
the track drops off the edge in a spiral down a table leg, crosses the rug through a cardboard-box
tunnel, jumps the gap between two stacks of books, loops around a chair leg, and a booster sends
it back up a ramp to the table. Props are simple geometry (table, chair, books, a mug, a box).
Every mechanic from phases 2-4 in one continuous run, with a challenge mode (get five cars round
without losing one; beat a lap time).

## Also worth doing (smaller)

- Showroom tab (turntable + collector cards; `tools/cars.html` is most of it) and the gear-train
  x-ray from v1.
- A proper hand model for the retrieve animation.
- Car models, round two (sharper Aeroflash nose and pickup cab).
- Sound: a listening pass by ear on `tools/audio.html` (levels were set by measurement only).

## Recommended order

1 -> 2 -> 3 -> 4 -> 5. Phase 1 is plumbing but makes every later set cheap. If only one more
session happens, do Phase 1 with Phase 2's jump ramp + catch ramp as its proof: a second tiny set
that is just drop tower -> jump -> catch -> finish would demonstrate the platform works.
