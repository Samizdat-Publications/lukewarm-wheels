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
| T18 | Tune defaults against SPEC section 1 behaviours; record in HANDOFF | fable/opus | T18a, T11-T13 | doing | 2026-09-08/09. Lobes RE-DERIVED as tilted circles (SPEC s5.2/s5.4). Fixed: orphan wall stub, flare-box end caps, nip lateral slam, surface warp, suspension cap, floor tunnelling, the torque-reset bug, and two harness bugs. Loop tilt 0 -> 40 deg, so the set has the real 2 rings + 2 sweeps. `rampPow` removed a 2.4 g curvature step at the hub joint and took the five-car pile-up from 2-3 crashes to 10. Selftest 8/8 in real Chrome. NOT DONE: a lone car must circulate indefinitely -- blocked on T21. |
| T18b | Judge every config on an ENSEMBLE, not one run | opus | - | done | `tools/chaos.mjs` shows a 0.02 mm start offset swings laps 0->1. New tools: ens, energy, diag (manifolds), audit, geom, chaos. |
| T20 | Replace the vehicle model | fable/opus | T18 | done (negative result) | 2026-09-09. src/44-wheel-model.js is now a complete, stable replacement (`vehicleMode: 'springs'`) -- and it loses the SAME as Rapier's (0.62/0.32 g vs 0.64/0.23), which DISPROVES the theory that the controller was the blocker. tools/coast.mjs measures 0.026 g on a straight (= rolling resistance, correct) and 0.2-1.0 g in curves with every tyre term off. The cost is cornering against a WALL. Also fixed a real bug: preStep never called resetTorques, so torques from addForceAtPoint accumulated forever. See T21. |
| T21 | Bank the lobe channel | fable/opus | T20 | done (negative result) | 2026-09-10. Implemented correctly (bank eases from zero over bankBlendCm at each joint; sharing the tilt's roll schedule left an 8.9 deg surface STEP that stopped cars dead). It helps a COASTING car (172 -> 213 cm) and HURTS laps (0.75 -> 0.10 at bank 40), because a bank only carries the corner above v^2/R > g(sin tilt + cos tilt tan bank) -- v > 130 cm/s at bank 30 -- and cars are slower than that for most of the lobe, so they slide down onto the inner wall. lobeBankDeg stays 0. Also ruled out: warp is not the constraint (more suspTravel makes laps worse). Fixed tools/audit.mjs, which was measuring warp as the change in `up` and so read a climbing ramp as a twisting one. |
| T22 | **Close the lap energy budget.** Three hypotheses are now dead (vehicle model, warp, banking). What is left is arithmetic: nips are PAIRED, so a car coasts ~131 cm around a whole lobe, leaves a nip at ~330 cm/s and arrives at ~78. Attack both terms: shorten the coast (boosterR outward) and raise the grip-limited launch (foamK / foamMu / boostExtra / foamGap). See HANDOFF "Next moves". | fable | T21 | todo | |
| T19 | Publish: `dist/index.html` as Artifact and/or Cloudflare; README | opus | T14, T18 | done | 2026-09-10. https://claude.ai/code/artifact/7426bcb0-d860-471f-9500-bab46b71017d (private). tools/build.mjs also emits dist/artifact.html (no document wrapper). NOT verified live -- the browser tool cannot sign in to claude.ai -- so the page carries a visible message if the CDN or WebAssembly is blocked there. README still todo. |

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
