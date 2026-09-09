# PLAN — task board

Status: `todo` | `doing` | `done` | `blocked`. Owner = which model should do it
(`fable` = physics/architecture, `opus` = delegate to an Opus subagent with a
self-contained prompt that quotes the relevant SPEC.md interface). Deps = task
ids that must be `done` first. Update this file whenever status changes.

| id  | task | owner | deps | status | notes |
|-----|------|-------|------|--------|-------|
| T01 | Research real set -> `docs/RESEARCH.md` | opus | - | done | docs/RESEARCH.md; instruction sheet rendered to docs/V2791-instructions.png |
| T02 | Verify CDN libs, `spike/loader.html`, `docs/DEPENDENCIES.md` | opus | - | done | three 0.185.1, rapier3d-compat 0.20.0 |
| T03 | `src/00-namespace.js`, `src/10-config.js`, `src/manifest.json`, `tools/serve.mjs` | fable | - | done | |
| T04 | `src/30-track-layout.js` lane path math, closure, milestones, boosters, gates | fable | T03 | done | two circuits, junction bends, tilted lobes |
| T05 | `src/31-track-mesh.js` ribbon geometry + separate floor/wall colliders | fable | T04 | done | solid rounded wall boxes |
| T06 | `src/40-electrical.js` battery + motor + gears | fable | T03 | done | 280-class motor constants |
| T07 | `src/41-booster.js` foam contact model + load torque feedback | fable | T04, T06 | done | |
| T08 | `src/42-vehicle.js` raycast vehicle + sled fallback + car API | fable | T03, T02 | done | kinematic park for lifted cars |
| T09 | `src/43-sim.js` world, fixed-step loop, events, crash detection | fable | T05-T08 | done | |
| T10 | `index.html` + `src/90-main.js` boot, minimal debug render so it runs | fable | T09, T02 | done | debug renderer + HUD in 90-main.js |
| T11 | `src/50-render-scene.js` lights, floor, track material, hub body, gear train x-ray, camera presets | opus | T10 | done | 5 presets, x-ray gear train, pickLane, crash sparks; docs/agent-reports/T11.md |
| T12 | `src/20-catalog.js` + `src/51-render-cars.js` five castings, liveries on canvas textures | opus | T03, T01 | done | wiki data confirmed via the Fandom **API** (docs/CATALOG-SOURCES.md); 421 tris/car; preview `tools/cars-preview.html`, shot `docs/screenshots/T12-cars.png`, report `docs/agent-reports/T12.md` |
| T13 | `src/60-ui.js` panel, switch, gauges, car placement, tuning drawer | opus | T10 | done | see docs/agent-reports/T13.md; screenshots docs/screenshots/T13-ui.png, T13-tuning.png |
| T14 | `tools/build.mjs` -> `dist/index.html` single file, CSP-safe | opus | T10 | done | 62.8 KB, 13 inlined scripts, 0 console errors; docs/agent-reports/T14-T17.md. Re-run after any src change |
| T15 | Showroom tab (turntable, close-ups, exploded view, collector cards) | opus | T12, T13 | todo | |
| T16 | Motor whine audio (WebAudio, pitch from rpm), optional | opus | T13 | todo | |
| T17 | `tools/selftest.html` automated checks from SPEC section 7 | opus | T10 | done | 8 checks, 7 PASS; only 8 fails: motor bogs 12291->2448 rpm under five nips so no car reaches the crossing (feeds T18). docs/agent-reports/T17-selftest-output.txt |
| T18a | **Lobe stability**: a car at 250-330 cm/s leaves the arc mid-lobe even when flat. See HANDOFF.md hypotheses | fable/opus | T10 | done | Fixed 2026-09-08. Cars no longer leave the track (max roll 20 deg, 0 off-track). 4 root causes: nip push below the c.o.m., floor trimesh without FIX_INTERNAL_EDGES, wall height keyed on `lift>0` + hard height step, crossing wall gap cut on the lane centre. Banked arcs implemented (SPEC 5.2). Report: docs/agent-reports/T18a.md. REMAINDER -> T18: cars now STALL (2 laps max, not 3); sled mode still flips; footprint drifted 131 -> 140 cm |
| T18 | Tune defaults against SPEC section 1 behaviours; record in HANDOFF | fable/opus | T18a, T11-T13 | doing | 2026-09-08/09. Lobes RE-DERIVED as tilted circles (SPEC s5.2/s5.4). Fixed: orphan wall stub, flare-box end caps, nip lateral slam (explains the old 400 cm/s cap), surface warp, suspension cap, floor tunnelling (floorSolid), and two harness bugs. Loop tilt raised 0 -> 40 deg, so the set now has the real 2 rings + 2 sweeps; 48 is blocked by a cliff at 44-48. Selftest 8/8 in real Chrome, check 7 is now a fleet test (4/5 lap). Five-car crashes 0 -> 3 via lineUpStagger. NOT DONE: a lone car must circulate indefinitely -- blocked on T20. |
| T18b | Judge every config on an ENSEMBLE, not one run | opus | - | done | `tools/chaos.mjs` shows a 0.02 mm start offset swings laps 0->1. New tools: ens, energy, diag (manifolds), audit, geom, chaos. |
| T20 | **Replace the vehicle model.** Rapier's raycast controller dissipates 0.21 g on a curve and 0.53 g against a wall, insensitive to every parameter it exposes (evidence: tools/attribute.mjs, HANDOFF "THE BLOCKER"). sled loses 0.045 g, which is right. src/44-wheel-model.js (vehicleMode 'wheels') is a started replacement; it is not yet stable. Blocks indefinite lapping, the five-car pile-up and the 48 deg ring. | fable | T18 | todo | |
| T19 | Publish: `dist/index.html` as Artifact and/or Cloudflare; README | opus | T14, T18 | todo | dist rebuilt 2026-09-08 (158 KB), verified in real Chrome: 5 laps, 0 console errors |

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
