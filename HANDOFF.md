# HANDOFF - live project state

_Last updated: 2026-09-24 by Opus 5.5 (roadmap phases 1-2 done, 3-5 in progress). Update this
block whenever you stop._

## Where we are

**The engine is a platform now.** A track set is plain data (`src/35-sets.js`), built by a
generic builder into a graph of tracks. Three sets, picked in the HUD or with `#s.<id>`:

| set | what it shows |
|---|---|
| `crissCross` | the 2010 V2791, exactly as v2 had it (bit-identical in `tools/regress.mjs`) |
| `dropJump` | the smallest proof: drop tower -> kicker -> free flight -> catch ramp -> finish |
| `loopLeap` | spring launcher, double loop, jump + funnel catch, 2-wheel booster, corkscrew, swinging hammer, finish, brake run-out |

Stewart asked (2026-09-24) for all five roadmap phases, in order. Phases 1 and 2 are done;
3 (Race Day), 4 (Track Builder) and 5 (Kitchen Table GP) are next: see `docs/ROADMAP.md`.

**Published:** https://claude.ai/artifact/2rG33qrywCsbFJwGKFvWqL (private to Stewart), still at
the v2 build until republished. Republish from THIS conversation by passing `dist/artifact.html`
to the Artifact tool; from any other conversation pass that URL as `url`.

**The project moved** out of OneDrive on 2026-09-24: it lives at
`C:\Users\stewa\Documents\Claude\Projects\Hot Wheels Sim`, which is a junction to
`C:\Users\stewa\ClaudeProjects\Hot Wheels Sim`. Never work in the old OneDrive copy.

```
node tools/serve.mjs                    -> http://localhost:8765/   (#s.loopLeap etc.)
node tools/build.mjs                    -> dist/index.html + dist/artifact.html
node tools/regress.mjs                  -> bit-exact fingerprints of 11 scenarios (4 s); `save` re-baselines
node tools/simtest.mjs geomset <set>    -> per-piece length, tightest radius, roll, height; curvature steps
node tools/simtest.mjs sweep <set> [lo hi step cars] -> fire each casting from the launcher, classify outcomes
node tools/simtest.mjs auto <set> [secs cars]        -> the set running by itself; event counts
node tools/simtest.mjs runs <set> [n]   -> drop every casting down an open set
node tools/simtest.mjs lone|fleet|crashlog|phase|geom|solve   (Criss Cross tools, as before)
```

## The architecture, in one paragraph

A car in the channel is a mass constrained to the track: coordinates `s`, `d`, `h` on ITS
track (`car.track`), integrated at 1920 Hz (`41-cars.js`). Forces: gravity, v^2*kappa, a floor
and walls that can only push, rolling resistance, wall scrub, side-slip, air drag, foam nips,
brake pads. A set is a graph of tracks (`33-track-build.js`): each is closed (a circuit) or open,
and an open end is data: `stop` (a buffer), `fly` (a lip: the car rides on until its rear axle
leaves, then becomes a Rapier body with the pitch rate of pivoting off the edge), `{to}` (a
link/merge) or `{split}`. Leaving the channel hands the car to Rapier (`43-freebody.js`); a free
car that lands upright and moving in ANY track's lane is recaptured. Hazards are huge-mass
boxes against channel cars and kinematic bodies against free cars (`44-stunts.js`).

## Files (load order = src/manifest.json)

| file | owns |
|---|---|
| `00-core` `10-config` `20-catalog` | namespace/math, generic tunables, the five castings |
| `30-track-path` | segments (line, B-spline, quintic Hermite, helix), resampling, closed/open paths, heartline banking, frames |
| `31-track-pieces` | generic pieces: straight, bend, pitch, join, loop, corkscrew, spiral; `fairJoin` |
| `32-v2791` | the Criss Cross hub as a prop + its `hubLane` / `lobe` pieces |
| `33-track-build` | set -> tracks, ends/links, widths, brakes, gates, joints, supports, buffers, view |
| `34-track-features` | booster, launcher, brake pieces; hazards; loop towers |
| `35-sets` | the sets (data only) |
| `40-power` `41-cars` `42-collide` `43-freebody` `44-stunts` `45-sim` | power train, on-track dynamics, SAT, Rapier, launcher + hazards, sim loop |
| `50`..`58` | renderer, room, track mesh + towers, car models, V2791 hub, cars, cameras, fx, stunt props |
| `60-audio` `61-audio-assets` `70-ui` `90-main` | sound, HUD (set picker, launcher panel), boot |

## Decisions and why (do not re-litigate without new evidence)

- Everything from the v2 list still holds (track-constrained dynamics, quintic lobes,
  heartline bank, 380 motor, deliberate noise, the hand waits for a gap, recapture only moving
  cars, Neutral tone mapping, towers outside loops).
- **Phase 1 had to be bit-identical for Criss Cross**, and was: the regression hashes every
  car's state twice a second on fixed seeds. Two later changes were meant to alter the physics
  and re-saved the baseline with the reason in the commit: wheel colliders (below) and nothing else.
- **Free-body wheels are balls of r <= 0.32 inside the body width.** Full-radius balls at
  +-track/2 reached past the channel walls, so any hand-off inside the channel started wedged
  (a car leaving a lip lost 45 % of its speed and spun at 45 rad/s). 5-car crash rate went 68 ->
  55 a minute, same character.
- **Jumps ride the lip until the rear axle leaves.** Handing off when the centre passed the
  edge made the rear wheels hit the lip corner (a discrete-contact kick that flipped the Stocker
  every time). Open tracks extend straight past their ends for this.
- **Loops/corkscrews/spirals are exact helices** with clothoid-like quintic ease-in/out that
  match position, tangent and curvature. Circles with straight joins would step the normal force.
- **A flat sample never inherits a bank flip.** The old "never let U flip" guard latched an
  inverted frame onto every straight after a loop.
- **The launcher throws car + plunger**: v = x sqrt(k/(m + m_p)), k = 5.5e5 dyne/cm, x <= 4 cm,
  m_p = 6 g. That is why a light car leaves faster and why castings differ at the jump.
- **Loop & Leap is tuned by sweep**, not by hand: see the commit message of e1a80a1 for the
  outcome bands. Re-run `simtest sweep loopLeap` after touching its geometry.
- **Sets choose by `#s.<id>` and reload.** Artifacts only pass a bare `#token` (letters, digits,
  `. _ ~ -`), so `=` is not allowed; Phase 4 codes will use `#t.<code>`.

## Gotchas (each cost time)

- The Browser pane suspends requestAnimationFrame while hidden, and its screenshots lag. To
  look at a set: define `__shot` / `__run` in the page (see this session: step the sim by hand,
  render, POST the canvas to `/__shot`, then Read the PNG in `docs/screenshots/`).
- The Playwright MCP browser can be locked by another session ("Browser is already in use").
- Shell heredocs through the Bash tool break on an apostrophe even when quoted; write patch
  scripts with the Write tool into the scratchpad and run them.
- A stale `node tools/serve.mjs` from an earlier session may hold port 8765 serving the OLD
  OneDrive copy: check `curl localhost:8765/src/35-sets.js` before trusting it.
- Do not name a local `G` inside `trackDynamics.step`: `G` is gravity there.
- r185 deprecated PCFSoftShadowMap; `window.THREE` exists only after `hw:libs-ready`.
- Keys: `ELEVENLABS_API_KEY` is in Stewart's environment; there is no Gemini key.

## Stewart (standing preferences)

Every command handed to him starts with the `cd` into the project folder. Physics AND graphics
both have to be excellent; he treats this as a game, not a demo. Never write an em dash anywhere.
