# HANDOFF — live project state

_Last updated: 2026-09-08 by Fable 5.1 (session 1). Update this block whenever you stop._

## Where we are
- **Phase:** 1 — foundation. Docs written, physics core being written by Fable.
- **Two Opus research agents were launched** by session 1 and write:
  `docs/RESEARCH.md` (real-set facts) and `docs/DEPENDENCIES.md` + `spike/loader.html`
  (verified CDN URLs, Rapier API). If those files exist, the agents finished.
  If they don't, re-run those two tasks from `docs/PLAN.md` (T01, T02) with Opus.
- Nothing runs in the browser yet until T02 + T10 (main/boot) are done.

## How to resume (any model)
1. Read `CLAUDE.md`, then `docs/SPEC.md`, then `docs/PLAN.md`.
2. `git log --oneline` shows which tasks landed. `docs/PLAN.md` status column is
   the source of truth; fix it if git disagrees.
3. Pick the lowest-numbered task that is `todo` and whose deps are `done`.
   Tasks marked **owner: opus** should be delegated to an Opus subagent with a
   self-contained prompt (include the interface section from SPEC.md they need).
   Tasks marked **owner: fable** are physics/architecture; an Opus session may
   do them too if Fable is unavailable — just be careful and test in-browser.
4. After each task: run it in the browser (`node tools/serve.mjs`, open
   http://localhost:8765/), check console for errors, commit, update PLAN.md
   status and this file.

## Known decisions / assumptions (override if RESEARCH.md contradicts)
See `docs/SPEC.md §Assumptions`. The geometry constants in `src/10-config.js`
are estimates scaled from photos; RESEARCH.md may refine them.

## Next up
- Fable: T03 namespace/config, T04 track layout math, T05 track mesh+colliders,
  T06 electrical model, T07 booster model, T08 vehicle, T09 sim loop, T10 boot.
- Opus (parallel, after T03): T11 render scene, T12 car meshes/liveries,
  T13 UI panel + gauges + tuning drawer, T14 build script, T15 showroom,
  T16 camera presets + gear-train x-ray view.
