# Criss Cross Crash - a simulation

A browser simulation of the 2010 Hot Wheels **Criss Cross Crash** set (Mattel V2791) running the
1999 Criss Cross Crash five-pack (#21081): Porsche 959, Aeroflash, Ford GT-90, Chevy Stocker and
Chevy 1500. A red motorised hub drives four foam booster wheels; one continuous circuit runs
through two tall loops, two low banked sweeps and a `#` crossing with four crash points.

![Over the top](docs/progress/13-2026-09-24-v2-over-the-top.png)

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

`fleet`, `crashlog`, `phase`, `geom` and `solve` are the other modes; see `HANDOFF.md`.

## Playing

Space switches the booster; **Add car** drops the next casting in at START; **Line up all 5** is
the pile-up. Click a car to follow it. Cameras: Orbit, Chase, Onboard (it goes upside down
through the loops), Top, and Director, which cuts between shots and to a slow-motion crash cam.
**Replay** plays the last crash back. The tuning drawer exposes battery charge, motor, foam grip
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
