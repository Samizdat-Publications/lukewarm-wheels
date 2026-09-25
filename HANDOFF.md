# HANDOFF - live project state

_Last updated: 2026-09-24 by Opus 5.5 (v2 rebuild). Update this block whenever you stop._

## Where we are

**v2 works.** Cars lap indefinitely, loop upside down, crash at the `#`, fly off, and get carried
back to START by the hand. The old rigid-body-only build (v1, five sessions, never got a lone car
round reliably) is archived in `legacy/` with its own HANDOFF; do not revive its approach.

**Published:** https://claude.ai/artifact/2rG33qrywCsbFJwGKFvWqL (private to Stewart). Republish
from THIS conversation by passing `dist/artifact.html` to the Artifact tool again; from any other
conversation pass that URL as `url`. (v1 is still at the old link,
https://claude.ai/code/artifact/7426bcb0-d860-471f-9500-bab46b71017d, untouched.)

```
node tools/serve.mjs                 -> http://localhost:8765/          (dev, no build step)
node tools/build.mjs                 -> dist/index.html + dist/artifact.html (single file, ~380 KB)
node tools/simtest.mjs lone 20 0     -> one car, laps / speeds per region / energy (no browser)
node tools/simtest.mjs fleet 5 30    -> N cars with Rapier, per-second timeline
node tools/simtest.mjs crashlog 5 8  -> every crash/derail/recapture with car states
node tools/simtest.mjs phase 3 60    -> phase drift between cars (why crashes are "eventual")
node tools/simtest.mjs geom          -> track geometry summary
node tools/simtest.mjs solve         -> re-solve the lobe shapes (paste the q's into 10-config.js)
http://localhost:8765/tools/cars.html   -> car turntable (?car=2&close=1&view=side|q34|under)
http://localhost:8765/tools/audio.html  -> audio audition page with a fake race and level meter
```
`CFG='{"muWall":0.25}' node tools/simtest.mjs ...` overrides any config key.

Measured (2026-09-24, fresh batteries): lone car of each casting 1.11-1.21 s a lap, 16 laps in
20 s, no stalls or derails. 2 cars: 50 laps each per minute, no crash. 3 cars: ~10 crashes a
minute. 4: 8-50 (seed-dependent). 5: ~70 a minute. 152 fps at 1600x900 on the RTX 5070 Ti.

## The architecture, in one paragraph

A car in the channel is a mass constrained to the track: coordinates `s` (along), `d` (across,
walls at +-dmax), `h` (lift) in the banked track frame, integrated at 1920 Hz
(`41-cars.js` `trackDynamics.step`). Forces: gravity, the centripetal demand v^2*kappa, a floor
reaction that can only push, wall reactions that can only push, rolling resistance crr*N, wall
scrub muWall*N_wall, tyre side-slip, air drag and the foam nips. If the floor would have to
pull (too slow over a loop top) the car lifts; past `derailLift` it leaves. Leaving hands the car
to Rapier (`43-freebody.js`) with its exact pose and velocity; every car owns one Rapier body for
life, parked kinematic far below the world while on track. A free car that lands upright,
aligned and MOVING in a lane is recaptured (`45-sim.js tryRecapture`); one at rest is debris the
hand collects. Car-car: same stretch of track = 1D impulse along the lane (`bump`); anything
else = oriented-box SAT + rigid-body impulse (`42-collide.js`), and a hard hit derails.

## Files (load order = src/manifest.json)

| file | owns |
|---|---|
| `00-core` `10-config` `20-catalog` | namespace/math, every tunable (tagged [M]/[D]/[E]), the five castings |
| `30-track-path` | segments (line, B-spline, quintic Hermite), arc-length resampling, heartline banking, frame lookup |
| `31-track-layout` | V2791 layout: lanes, lobes (bending-energy solve), boosters, crossings, joints, hub boxes, supports |
| `40-power` | 4 D cells -> 380-class motor -> gear -> four foam wheels sharing one flywheel |
| `41-cars` `42-collide` `43-freebody` `45-sim` | on-track dynamics, SAT/impulses, Rapier world, the sim loop and car life cycle |
| `50`..`57` | renderer/post, room, track mesh + towers, car models, hub, car instances, cameras, fx + replay |
| `60-audio` `61-audio-assets` | synthesized motor/rolling + 10 ElevenLabs one-shots (base64, 96 KB) |
| `70-ui` `90-main` | HUD, tuning drawer, help; boot, frame loop, picking, auto quality |

## Decisions and why (do not re-litigate without new evidence)

- **Track-constrained dynamics, Rapier only for crashes.** It is how ride simulators work and it
  is exact for a car in contact with a smooth track. v1's losses were numerical (wall scrub, edge
  snags, wedging), which no coefficient could fix.
- **Lobes are quintic-Hermite halves meeting at an apex, minimum bending energy.** Earlier tries
  (tilted circle + B-spline transitions) kinked to 2-3.5 cm radius where the flat hub lane met
  the climb. The solve is cached in `10-config.js` (`loop.q`, `sweep.q`); re-run `simtest solve`
  whenever `ux/yx/beta/Rt` or the hub dimensions change.
- **Bank = heartline rule at a design speed**, rate-limited to 7 deg/cm and diffused with the flat
  hub lanes held fixed (roll measured from a rotation-minimising frame, so it works where the
  track is vertical). The sweeps are capped at 62 deg of bank; the outer wall carries the rest,
  so cars slow in the sweeps, as on the toy.
- **The motor is a 380-class (0.8 ohm, heavier rotor).** With a 280 (1.4 ohm) a launch from rest
  dragged the foam from 410 to ~200 cm/s, the next car through a nip missed the loop, fell, and
  started a crash cascade: 40 crashes / 45 s with four cars against 4 with the stronger motor.
- **Noise is physical and deliberate.** Every track joint clacks (`jointLoss/Kick/Hop`), every car
  has its own wheel drag (`wheelSpread`), and every foam pass grips at a slightly different speed
  (`foamJitter`). Without these, the boosters phase-lock the cars and three cars NEVER crash (the
  gaps held to the millisecond for 30 laps). With them, crashes are "eventual", as reviewers say.
- **The hand waits for a gap** (`Sim.dropClear`): it predicts every crossing for one lap and
  drops only when the new car will not meet anyone, or after 2.5 s of waiting.
- **Recapture only moving cars.** Recapturing a car at rest parked obstacles in the `#` and every
  following car piled into them.
- **Tone mapping is Khronos Neutral, and GTAO is off.** ACES turned the track salmon; GTAO
  darkened the thin track to brown.
- **Support towers stand OUTSIDE the loops** and bracket to the channel. Attached at the lowest
  corner (v2 first try) they poked into the car's path at the inverted apex.
- **Aeroflash height is 1.5 cm** (was 1.35) so its 1 cm wheels fit under fenders.

## Next moves (Stewart's call; none are needed for the thing to work)

1. **Showroom tab** (v1 had one): turntable + collector card per casting. `tools/cars.html`
   already has the turntable, close-up and underside views; it needs a UI home.
2. **Gear-train x-ray** (v1 had one): hub cut-away with the idler and satellites turning at the
   right ratios. The idler is already modelled under the dome in `54-render-hub.js`.
3. **Car models, round two:** the lofts read well at game distance; close up the Aeroflash nose
   and the pickup cab could be sharper. `53-car-models.js` SHAPES table is the place.
4. **A hand** for retrieval (currently a warm glow ring under the carried car).
5. **Tired batteries demo:** set Battery charge to ~15 % in the drawer and watch cars start
   falling off the loop tops. A "drain faster" toggle (`cfg.drainScale`) exists but has no UI.
6. **HD build** (legacy ROADMAP): glTF from Blender, HDRI. Probably unnecessary now.

## Gotchas (each cost time)

- The Browser pane (Claude_Browser) suspends requestAnimationFrame while hidden: the live loop
  does not run there. Step the sim yourself (`for (...) HW.sim.step(1/1920)`) or use the
  Playwright MCP browser, which runs rAF and uses the real GPU.
- Shell heredocs through the Bash tool break on an apostrophe in the content; use Write/Edit.
- r185 deprecated PCFSoftShadowMap: use PCFShadowMap + `shadow.radius`.
- The car-model subagent stalled twice (600 s stream watchdog) and wrote nothing but
  `tools/cars.html`; the models were written in-session. If you delegate big generative files,
  ask for many small writes.
- `window.THREE`/`THREEX` exist only after `hw:libs-ready`; classic scripts must not touch them at
  load time.
- Keys: `ELEVENLABS_API_KEY` is in Stewart's environment. `tools/sfx/generate.mjs` reads it and
  never prints it. There is no Gemini key; nothing needs one.

## Stewart (standing preferences)

Every command handed to him starts with the `cd` into the project folder. Physics AND graphics
both have to be excellent; he treats this as a game, not a demo. Never write an em dash anywhere.
