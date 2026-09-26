# Lukewarm Wheels (the Hot Wheels Criss Cross Crash sim) - simulation project

**READ `HANDOFF.md` FIRST.** It is the live state of this project: what is built, the design
decisions and why, what is next, and the gotchas. Update it at the end of every work block (and
before context runs low). Any session must be able to resume from `HANDOFF.md` alone.

## What this is
**Shipped as v1 "Lukewarm Wheels" on 2026-09-26** (a parody name: keep "Hot Wheels" out of
anything a player sees; set 1 is "Criss Cross Calamity"). Live: https://lukewarm-wheels.pages.dev
(landing) and /play/ (the sim). Public repo: `Samizdat-Publications/lukewarm-wheels` (remote `origin`, filtered history); the
full history is in the private `hot-wheels-criss-cross-crash-sim` (remote `archive`). Deploy with `npm run deploy`;
footage with `npm run film` + `npm run media` (see HANDOFF "v1 release").

A browser simulation (Three.js r185 + Rapier 0.20, no bundler) of Hot Wheels track: since
2026-09-24 a platform where every set is data (`src/35-sets.js`: Criss Cross Crash, Drop & Jump,
Loop & Leap, Race Day, Kitchen Table Grand Prix) plus a Track Builder. It began as the 2010 Hot Wheels
**Criss Cross Crash** set (Mattel V2791: red motorised hub, four foam booster wheels, two tall
loops, two low banked sweeps, a `#` crossing with four crash points) running the 1999 Criss Cross
Crash five-pack. v2 (2026-09-24): cars are constrained to the banked track while in the channel
and become Rapier rigid bodies only when they crash or fall; battery -> motor -> gear train ->
foam wheels -> cars is modelled throughout. v1 (all rigid bodies) is archived in `legacy/`.

Grounding facts: `docs/RESEARCH.md`, `docs/REFERENCES.md`, the instruction sheet
`docs/V2791-instructions.png`, car data `docs/CATALOG-SOURCES.md`. CDN URLs and Rapier notes:
`docs/DEPENDENCIES.md`. The original brief: `PROMPT.md`.

## Tools on this machine (per Stewart)
Blender 5.1 (`"C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b -P script.py`),
Godot (not used: this stays on Three.js so it publishes as one artifact), Mixamo. The
`ELEVENLABS_API_KEY` environment variable is set (`tools/sfx/generate.mjs` uses it and never
prints it). There is no Gemini key and nothing needs one. Keys never go in the repo or in prompts.

## Progress archive (keep it up)
`docs/progress/` is a dated, curated timeline of the build: one image per milestone, oldest
first, with what the sim could actually DO at that point, so the project can be shown as a story
later (a GitHub page, a README). **Add a frame whenever something visibly changes.** Take it with
the Playwright MCP browser at 1600x900 (real GPU, runs rAF) straight into `docs/progress/`.
Working shots go in `docs/screenshots/`.

## Conventions
- **Units: cgs.** cm, g, s, dyne, dyne.cm. Gravity 981 cm/s^2. SI motor constants are converted
  at the boundary in `40-power.js`.
- **Coordinates:** Y up, +X east, +Z south (north = -Z), hub centre at the origin. Car-local
  axes: +X right, +Y up, **-Z forward**. Build rotations from (right, up, back) with
  `HW.Q.fromBasis`; (right, up, forward) is left-handed and gives a reflection.
- **No bundler, no build step for dev.** `index.html` has an importmap and one module script that
  loads three.js, its addons and Rapier, sets `window.THREE`, `window.THREEX`, `window.RAPIER`,
  and fires `hw:libs-ready`. Everything else is a classic script adding to `window.HW`, in the
  order of `src/manifest.json`; those scripts must not touch THREE at load time.
  `node tools/build.mjs` inlines them into `dist/index.html` and `dist/artifact.html`.
- **Dev server:** `node tools/serve.mjs` -> http://localhost:8765/
- **Physics checks:** `node tools/simtest.mjs <mode>` loads `src/00`..`49` in Node (Rapier from
  `tools/vendor/rapier.mjs`; `node tools/fetch-rapier.mjs`); modes are listed in HANDOFF.
  Judge multi-car behaviour on several seeds (`CFG='{"seed":N}'`), never one run.
- **Regression:** `node tools/regress.mjs` must say "all scenarios identical" before any commit
  that is not MEANT to change the physics; if it is, re-save (`save <names>`) and say why.
- Each `src/*.js` is an IIFE `(function(HW){ ... })(window.HW)`.
- All tunables live in `src/10-config.js` (`HW.config`), tagged [M] measured, [D] derived,
  [E] estimate. The tuning drawer binds to it.
- Keep files under ~400 lines where practical (`53-car-models.js`, `60-audio.js`, `45-sim.js` and
  `30-track-path.js` are the known exceptions; split them if they grow).
- A new set is data in `35-sets.js`; a new piece type goes in `31-track-pieces.js` or
  `34-track-features.js`; furniture/props are placed from the track, not by hand.
- Commit after each meaningful step with a descriptive message; push `origin` when a step is
  done. `docs/screenshots/`, `dist/`, `docs/V2791-*` and `media/raw/` are gitignored on purpose.
- **Never write an em dash** (Stewart's global rule): commas, colons or spaced hyphens instead.
