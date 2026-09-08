# Hot Wheels Criss Cross Crash — simulation project

**READ `HANDOFF.md` FIRST.** It is the live state of this project: what is built,
what is in flight, what is next, and which model should do it. Update it at the
end of every work block (and before context runs low). Any session — Fable,
Opus, Sonnet — must be able to resume from `HANDOFF.md` alone.

## What this is
A browser simulation (Three.js + Rapier, no bundler) of the 2010 Hot Wheels
**Criss Cross Crash** set (Mattel V2791: red motorized hub, four foam booster
wheels, four banked 270° curves, a `#` crossing with four crash points) running
the 1999 Criss Cross Crash five-pack of cars. Physics is modelled, not faked:
battery → DC motor → gear train → foam wheels → cars, with rolling resistance,
wall scrub, banked curves, rigid collisions and crash detection.

Full design: `docs/SPEC.md`. Grounding facts: `docs/RESEARCH.md`.
Verified CDN URLs + Rapier API notes: `docs/DEPENDENCIES.md`.
Task board with owners and status: `docs/PLAN.md`.
The improved build prompt (what we are answering): `PROMPT.md`.

## Budget rules (why the docs are so explicit)
Stewart is near his weekly Fable 5.1 cap. Fable does architecture, physics
core and hard debugging only. Everything else (rendering polish, UI, car
liveries, showroom, build tooling, research) goes to **Opus subagents**
(`Agent` tool, `model: "opus"`) with self-contained prompts. When Fable runs
out, Stewart opens a new **Opus 5** session in this folder; that session reads
`HANDOFF.md` and continues from the task board.

## Conventions
- **Units: cgs.** Lengths in cm, mass in g, time in s, force in dyne, torque in
  dyne·cm. Gravity = 981 cm/s². Convert SI motor constants at the boundary.
- **Coordinates:** Y up. +X = east, +Z = south (so north = −Z). Hub centre at
  origin. Looking down with north at the top of the screen, +X is right.
  Car-local axes: +X right, +Y up, **−Z forward** (three.js convention). Never
  build a basis with +Z forward: (right, up, +Z) is left-handed and the
  quaternion becomes a reflection (this bit us on day 1).
- **No bundler, no build step for dev.** `index.html` loads an importmap +
  one `<script type="module">` that imports THREE / OrbitControls / RAPIER,
  awaits `RAPIER.init()`, sets `window.THREE / RAPIER / OrbitControls`, and
  fires `hw:libs-ready`. Everything else is a plain classic script that adds to
  the `window.HW` namespace, listed in load order in `src/manifest.json`.
  `node tools/build.mjs` inlines them into `dist/index.html` (single file,
  CDN-only externals, artifact-CSP safe).
- **Dev server:** `node tools/serve.mjs` → http://localhost:8765/
- Each `src/*.js` file is an IIFE: `(function(HW){ ... })(window.HW)`. It
  exposes exactly what `docs/SPEC.md §Interfaces` says, nothing else.
- All tunable numbers live in `src/10-config.js` (`HW.config`). Never hardcode
  a physical constant elsewhere. The UI tuning drawer binds to `HW.config`.
- Keep files under ~400 lines. Split before they grow past that.
- No git remote yet; commit locally after each task with a message that names
  the PLAN task id (e.g. `T07: booster contact model`).
