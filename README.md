# Hot Wheels Sim - five track sets on one engine

A browser simulation of Hot Wheels track, built around the 2010 **Criss Cross Crash** set (Mattel
V2791) and the 1999 Criss Cross Crash five-pack (#21081): Porsche 959, Aeroflash, Ford GT-90,
Chevy Stocker and Chevy 1500. What started as one set is now a platform: every set is plain data
built by one engine, and there are five of them, plus a builder for your own.

| set | what it is |
|---|---|
| **Criss Cross Crash** | the real V2791: a motorised hub, two tall loops, two banked sweeps, a `#` crossing |
| **Drop & Jump** | the smallest proof: drop tower, kicker, free flight, catch ramp |
| **Loop & Leap** | spring launcher, double loop, jump, two-wheel booster, corkscrew, swinging hammer |
| **Race Day** | a four-lane gravity drag strip with a timing gate, a tuner and knockouts, and a card that says why the winner won |
| **Kitchen Table Grand Prix** | our own: off a kitchen table, down a table leg, through a box, over the books, under a chair and back up |
| **Track Builder** | snap pieces together, test-drive them, share the track as a link (`#t.<code>`) |

![The Kitchen Table Grand Prix](docs/progress/17-2026-09-24-kitchen-table-gp.png)

## What is simulated

- **The power train.** Four D cells with internal resistance that rises as they drain, a brushed
  DC motor with back-EMF, a gear train, and four foam wheels on one flywheel. Every launch loads
  the same motor, so several cars in the nips at once bog it, and the gauges show it.
- **The boosters.** Each foam wheel sits between two lanes and pinches passing cars against the
  far wall: a squeeze force from how much wider the car is than the gap, and a drive force from
  foam friction that saturates with slip. Wider castings get a harder shove. Eight pushes a lap.
- **The cars on the track.** Each car is a mass constrained to the banked track surface:
  gravity, the centripetal demand of every curve, a floor that can only push, walls that can only
  push, rolling resistance per wheel type, wall scrub, tyre side-slip and air drag. Nothing is
  scripted. Too slow over a loop top and the floor stops pushing: the car falls off.
- **Crashes.** At the crossing, cars collide as rigid boxes with restitution and friction. A hard
  hit throws them out of the channel into a full rigid-body simulation (Rapier), where they
  tumble until they land upright in a lane and carry on, or lie still until a hand carries them
  back to START.
- **The track.** Each lobe is shaped for minimum bending energy, the fairest curve through its
  apex, and banked by the rule roller-coaster designers use: lean the track into the force a car
  at design speed needs. The rear lobes come out as true loops that cars ride upside down.
- **Jumps and stunts.** A car leaving a lip rides on until its rear axle leaves the edge, then
  flies as a free rigid body with the pitch rate it got from pivoting off it, and is caught only
  if it lands upright and moving. Loops, corkscrews and spirals are exact helices eased in by
  curves that match their curvature. The spring launcher throws the car and its plunger together,
  so light castings leave faster. Hazards hit cars as bodies of enormous mass.
- **Racing.** On the drag strip gravity is the only drive, so the castings' wheels, mass and
  frontal area decide it, and every car keeps an energy ledger that explains the result.
- **Imperfection.** Track joints clack, every car's wheels drag a little differently, and worn
  foam grips each pass at a slightly different speed. Without that, the boosters lock the cars in
  step and they never meet. With it, crashes come "eventually", the way reviewers describe the
  real set.

## Running it

No install, no build step for development:

```bash
node tools/serve.mjs
```

Then open http://localhost:8765/. For a single self-contained file (CDN-only externals, safe to
publish as a Claude Artifact):

```bash
node tools/build.mjs
```

Headless physics checks, no browser needed:

```bash
node tools/simtest.mjs lone 20 0
```

`fleet`, `crashlog`, `phase`, `geom`, `solve`, `geomset`, `sweep`, `auto`, `race`, `code` and
`challenge` are the other modes; see `HANDOFF.md`. `node tools/regress.mjs` checks that the physics
still reproduces its saved fingerprints bit for bit.

## Playing

Pick a set in the top-left menu. Space switches the booster; **Add car** drops the next casting
in at START; **Line up all 5** is the pile-up; **Forces** shows the forces on each car. On Loop &
Leap, **Fire** (F) shoots the launcher (random strength, or set your own). On Race Day, **Race!**
(G) runs a heat, **Knockout** a tournament, **Tuner** adds coins, swaps wheels and repaints. On
the Kitchen Table Grand Prix, **Challenge** asks you to get all five round three times without
losing one. **Build** opens the Track Builder (splitters, merges, hazards, a launcher strength in
the code). **Showroom** (V) puts one car at a time on a turning plinth with its card, its session
and the tuner. Every jump is scored (airtime and distance, the set's best kept). Click a car to
follow it. Cameras: Orbit, Chase, Onboard (it goes upside down through the loops), Top, and
Director, which cuts between shots and to slow-motion crash and jump cams. **Replay** plays the
last crash or jump back. The tuning drawer exposes battery charge, motor, foam grip
and squeeze, wall friction, rolling resistance, track-joint roughness and time scale, live.

## How it is put together

Plain scripts in `src/`, each adding to `window.HW`, loaded in the order of `src/manifest.json`;
Three.js r185 and Rapier 0.20 come from jsDelivr. Units are centimetres, grams and seconds.
`HANDOFF.md` is the living state of the project, including every design decision and why;
`docs/progress/` is the build told as a story, one frame per milestone. The first version, which
tried to run everything as free rigid bodies, is kept in `legacy/`.

## Honesty about the numbers

The track width (31.75 mm), the four D cells and the topology come from Mattel's instruction
sheet; the car colours, tampos and wheels from the Hot Wheels Wiki. Car masses, motor constants,
foam stiffness, wall friction and the lobe shapes are engineering estimates, tagged `[E]` in
`src/10-config.js`.

## Credits

Built with [Claude Code](https://claude.com/claude-code). Sound effects partly generated with
ElevenLabs. Hot Wheels and Criss Cross Crash are trademarks of Mattel; this is an unaffiliated
simulation built for the fun of modelling it.
