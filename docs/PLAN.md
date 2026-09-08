# PLAN — task board

Status: `todo` | `doing` | `done` | `blocked`. Owner = which model should do it
(`fable` = physics/architecture, `opus` = delegate to an Opus subagent with a
self-contained prompt that quotes the relevant SPEC.md interface). Deps = task
ids that must be `done` first. Update this file whenever status changes.

| id  | task | owner | deps | status | notes |
|-----|------|-------|------|--------|-------|
| T01 | Research real set -> `docs/RESEARCH.md` | opus | - | doing | launched by session 1 |
| T02 | Verify CDN libs, `spike/loader.html`, `docs/DEPENDENCIES.md` | opus | - | done | three 0.185.1, rapier3d-compat 0.20.0 |
| T03 | `src/00-namespace.js`, `src/10-config.js`, `src/manifest.json`, `tools/serve.mjs` | fable | - | doing | |
| T04 | `src/30-track-layout.js` lane path math, closure, milestones, boosters, gates | fable | T03 | todo | |
| T05 | `src/31-track-mesh.js` ribbon geometry + separate floor/wall colliders | fable | T04 | todo | |
| T06 | `src/40-electrical.js` battery + motor + gears | fable | T03 | todo | |
| T07 | `src/41-booster.js` foam contact model + load torque feedback | fable | T04, T06 | todo | |
| T08 | `src/42-vehicle.js` raycast vehicle + sled fallback + car API | fable | T03, T02 | todo | |
| T09 | `src/43-sim.js` world, fixed-step loop, events, crash detection | fable | T05-T08 | todo | |
| T10 | `index.html` + `src/90-main.js` boot, minimal debug render so it runs | fable | T09, T02 | todo | |
| T11 | `src/50-render-scene.js` lights, floor, track material, hub body, gear train x-ray, camera presets | opus | T10 | todo | |
| T12 | `src/20-catalog.js` + `src/51-render-cars.js` five castings, liveries on canvas textures | opus | T03, T01 | todo | can start after T03; a placeholder catalog ships with T03 |
| T13 | `src/60-ui.js` panel, switch, gauges, car placement, tuning drawer | opus | T10 | todo | |
| T14 | `tools/build.mjs` -> `dist/index.html` single file, CSP-safe | opus | T10 | todo | |
| T15 | Showroom tab (turntable, close-ups, exploded view, collector cards) | opus | T12, T13 | todo | |
| T16 | Motor whine audio (WebAudio, pitch from rpm), optional | opus | T13 | todo | |
| T17 | `tools/selftest.html` automated checks from SPEC section 7 | opus | T10 | todo | |
| T18 | Tune defaults against SPEC section 1 behaviours; record in HANDOFF | fable | T11-T13 | todo | Opus may do this if Fable is out |
| T19 | Publish: `dist/index.html` as Artifact and/or Cloudflare; README | opus | T14, T18 | todo | |

## Delegation prompt template (for Opus subagents)
Paste into the Agent prompt, filling the blanks:

```
You are implementing task <id> of the Hot Wheels Criss Cross Crash simulation at
C:\Users\stewa\OneDrive\Documents\Claude\Projects\Hot Wheels Sim (Windows, no bundler).
Read CLAUDE.md, docs/SPEC.md (especially section <n> and section 6 Interfaces),
docs/DEPENDENCIES.md, and the existing files in src/. Conventions: cgs units, Y up,
+X east, +Z south, plain classic scripts as IIFEs adding to window.HW, all tunables in
HW.config, files under ~400 lines. Write ONLY these files: <list>. Do not modify other
files except src/manifest.json (add your file in load order) and docs/PLAN.md (set your
status). Test in the browser: `node tools/serve.mjs` then open http://localhost:8765/
with the Browser tools, check the console for errors, take a screenshot. Report a
10-line summary: what you built, what you verified, anything left undone.
```
