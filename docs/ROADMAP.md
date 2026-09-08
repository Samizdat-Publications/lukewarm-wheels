# ROADMAP — director's brief for the Opus 5 session(s)

Written 2026-09-08 by Fable 5.1 at the end of its budget. This is the plan for the rest
of the project. `HANDOFF.md` is the live state; this file is the strategy. Read both.
Stewart's stated core needs: **excellent physics AND high graphical fidelity.** Both are
non-negotiable; neither is done yet. Treat this as a game, not a demo.

## 0. Ground rules for the Opus session
- You are the director now. Think before building: for each phase, write the plan into
  `docs/PLAN.md` as tasks with owners, then delegate the parallelisable, well-specified
  tasks to subagents (Opus for anything with judgement, Sonnet for mechanical work), and
  keep the integration and the physics judgement calls yourself.
- Every claim of "works" must come from a synchronous 240 Hz stepped run in the browser
  (HANDOFF.md "How to test") or from `tools/selftest.html`. The Browser pane throttles
  rAF; never judge physics from the live view there.
- Keep the two continuity files current: `HANDOFF.md` (state, lessons, next up) and
  `docs/PLAN.md` (task board). Commit after every task with the task id.
- Ask Stewart for real-world inputs when they would change the design (section 8). He
  is technical and will supply photos, measurements, API keys, and Blender if asked.

## 1. Two build targets (decide this first, it shapes everything)
The Artifact CSP (scripts only from jsdelivr/cdnjs, no fetch, no external images, 16 MB
page limit) is hostile to high fidelity: every texture, model and sound must be inlined
as base64. A glTF car with 2K PBR textures is 3-6 MB; five cars plus a hub plus an HDRI
will not fit. So ship two targets from one code base:

| Target | What | Assets | Where |
|---|---|---|---|
| `dist/index.html` | artifact-safe single file | procedural geometry, canvas textures, small base64 audio, ≤ 12 MB | Claude Artifact (the YouTube comparison) |
| `dist-hd/` | full-fidelity site | glTF (meshopt/Draco via three addons from jsdelivr), KTX2/WebP textures, HDRI, audio files, loaded by URL | Cloudflare Pages (Stewart's usual host) |

Implement as an asset abstraction in a new `src/15-assets.js`: `HW.assets.get(name)`
returns a promise of a geometry/texture/audio buffer; the artifact build resolves from an
inlined base64 manifest, the HD build from `assets/…` URLs. Renderer and audio code never
know which. `tools/build.mjs` gets a `--hd` flag. Do this before Phase 4 starts.

## 2. Phase 2 — make it a working toy (current; finish first)
Definition of done: a lone car laps NS and EW reliably for 60 s; five cars produce a
pile-up at the crossing within ~10 s; stalls happen occasionally and Nudge fixes them;
no NaN, no fall-through, no car leaves the table unless it visibly flips over a wall;
`tools/selftest.html` all PASS; 60 fps with the T11 renderer; the T13 UI controls
everything; `dist/index.html` runs as an artifact.
Steps:
1. Integrate the five agent reports in `docs/agent-reports/` (T18a, T11, T12, T13,
   T14+T17). Resolve interface mismatches (renderer ↔ cars ↔ UI). Remove the debug
   renderer fallback in `90-main.js` only when `HW.render` is solid.
2. If T18a (lobe stability) is not solved, it is the only priority. Method: instrument,
   isolate (flat arc, sled mode, wall segment length, side friction, COM height), fix the
   mechanism, then re-tune launch speed. Do not paper over it with speed limits.
3. Tuning pass against real references (Phase 3 §1 below gives the references) so the
   five-car chaos looks like the real toy.
4. Publish `dist/index.html` as an artifact (Artifact tool, favicon 🏎️) and give Stewart the
   link. This is the milestone that matches the YouTube demo.

## 3. Phase 3 — physics fidelity (the "excellent physics" half)
1. **References.** Use the YouTube MCP tools (search "Criss Cross Crash" 2010, V2791,
   review/unboxing videos; `youtube_video_transcript` and descriptions) to extract:
   time for one lap of a lobe, how long five cars last before the pile-up, how often cars
   stall or derail, whether cars ride the outer wall on the tilted loops, how the motor
   sounds under load. Write `docs/REFERENCES.md` with timestamps. If Stewart can film or
   photograph a real set (or buy one, ~$40 used), everything gets better: ask.
2. **Booster model v2.** Replace the single point-force nip with a contact patch: foam
   wheel as a soft cylinder (penalty contact against the car's side, compression-dependent
   normal force, Coulomb friction with velocity-dependent slip), so the car is grabbed by
   its nose first and released tail last, and skewed cars get a yaw torque (real boosters
   straighten or spin cars). Keep the drive-train coupling.
3. **Wheel model v2.** Real Hot Wheels wheels are free-rolling on wire axles: replace the
   Rapier raycast controller's tyre model (`frictionSlip`, `sideFriction`) with explicit
   per-wheel forces: axle Coulomb friction torque (dominant), lateral scrub as
   Coulomb friction at the contact patch, and no suspension (rigid, with a tiny compliance
   for stability). Compare against the raycast controller in a scripted test (same
   launch, compare lap time, exit speeds, off-track rate). Keep whichever matches the
   references. This is the deepest piece of remaining physics work; give it to yourself,
   not a subagent.
4. **Battery over time.** Make the pack visibly sag over a 10-minute session and let
   `battHealth`/`battUsedFrac` in the tuning drawer produce the "tired batteries" look
   (weaker launches, more stalls) — a real behaviour of this toy.
5. **Crash realism.** Cars in the real crossing hit at 3 m/s and can flip, ride over each
   other, land on their roofs and stay there. Check restitution (0.15 chassis, 0.1 walls
   is about right for die-cast on plastic), add a roof-landing "dead car" state, make
   Nudge push from behind along the lane, and let a lifted car return to the tray.
6. **Per-casting character.** Masses, widths and wheel types should produce visible
   differences (the Chevy 1500 tips, the Aeroflash is fastest, the GT-90 gets the hardest
   shove). Verify with a scripted "each car alone for 30 s" run and record stats in
   `docs/TUNING.md`.
7. **Selftest v2.** Extend `tools/selftest.html` with lap-time bands and off-track rate
   thresholds derived from the references, so regressions are caught.

## 4. Phase 4 — graphical fidelity (the "looks like the real thing" half)
Stack decision: **stay on Three.js.** Godot would mean rewriting the physics and losing
the artifact target; Three.js r185 with PBR, post-processing (`three/addons` EffectComposer,
SSAO, bloom, SMAA from jsdelivr) and glTF is enough for photoreal toys on a table.
Blender is the asset tool. Adobe Mixamo is for humanoid animation and only becomes
relevant if you add a hand placing cars (nice-to-have, Phase 6).

1. **Blender pipeline (headless, scriptable).** Ask Stewart to install Blender (or confirm
   it is installed) and run it headless: `blender -b -P tools/blender/build_assets.py`.
   Write Python that builds each asset procedurally from the same numbers in
   `src/10-config.js` (export the config to JSON first so geometry cannot drift):
   - Track pieces: extrude the real 38.1 mm profile (31.75 inner, 8-10 mm walls with the
     lip) along the lane paths; the tilted lobe pieces as deep channels; bevel edges.
   - Hub V2791: red plus-shaped body with four booster modules, battery door, ON/OFF
     slide switch, foam wheels with the slot, connector tabs; model from
     `docs/V2791-instructions.png` and photos (eBay listings have dozens; fetch them).
   - Track supports and connector clips.
   - Five castings: low-poly (3-6k tris each) bodies from reference photos, separate base,
     window glass, interior, wheels by type (5SP/5DOT/3SP/SB rims). Tampos as decal
     textures: generate with Gemini image API from written descriptions of the real
     liveries (`docs/CATALOG-SOURCES.md`), then clean up; keep them recognisable rather
     than exact (trademarks are fine for a personal project).
   - Export glTF with meshopt compression; bake AO into vertex colours or a small texture.
2. **Materials and lighting.** Orange track: slightly translucent polypropylene (SSS-ish
   look via `MeshPhysicalMaterial` transmission 0 but sheen/clearcoat 0.3); red hub:
   ABS with clearcoat; die-cast paint: metallic flake (clearcoat + normal noise), glass
   with tint; a kitchen-table or carpet ground with an HDRI room environment (Poly Haven
   HDRIs are CC0; embed a 1K version for the artifact, 4K for HD). Contact shadows under
   cars, soft directional shadow.
3. **Cinematics.** Chase camera with smoothing and slight lag; automatic slow-motion
   replay on a crash (record the last 1.5 s of body poses at 240 Hz into a ring buffer,
   replay at 0.2x with a different camera, then resume); a "photo mode" with DOF.
4. **Effects, restrained.** No sparks (plastic toys don't spark). Do: subtle dust puff on
   a hard crash, camera shake, foam-wheel motion blur via a spinning texture, motor-heat
   nothing. Fidelity comes from materials, lighting and motion, not particles.
5. **Performance budget.** 60 fps on Stewart's machine with all five cars, shadows, SSAO,
   bloom. Measure with the Chrome DevTools MCP performance trace; keep draw calls < 150.
6. **Artifact fallback.** The procedural cars/track from T11/T12 stay as the artifact
   target's assets; make them share the materials so both targets look related.

## 5. Phase 5 — sound
- Motor: synthesised (WebAudio oscillators + noise, pitch from `rpmMotor`, load buzz from
  current) — synthesis beats samples because it tracks the physics continuously.
- Foam-wheel hiss, plastic clacks (car on wall), die-cast crash clinks, the slide switch:
  generate 6-10 short samples with the ElevenLabs Sound Effects API (Stewart has keys;
  ask for the key, keep it out of the repo, store in `.env` which is gitignored). Trim,
  normalise, encode as small MP3/OGG; base64 into the artifact (target < 600 kB total),
  URL-loaded in HD.
- Spatialise with `PannerNode` from car positions; cap simultaneous clacks.

## 6. Phase 6 — showroom and polish
Turntable with HDRI, wheel/underside close-ups, exploded view (base, body, glass,
interior, wheels animate apart), collector card per casting (data from
`HW.renderCars.collectorCard`), gear-train explainer (x-ray with labels and live rpm),
a "How the booster works" cutaway with the nip squeeze visualised. Optional: a hand
placing cars (Mixamo hand rig, or a simple procedural hand), a Gemini-written
"track-side commentator" line on each crash (gated behind a toggle; must degrade to
nothing when offline).

## 7. Phase 7 — ship
- `dist/index.html` published as an Artifact (private link for Stewart); `dist-hd/` on
  Cloudflare Pages from a private GitHub repo (do not go public: Hot Wheels/Mattel marks).
- README with the sources, the assumptions table, and the "what the YouTube demo got
  wrong" section from PROMPT.md.
- A 60-second screen recording of the five-car pile-up for Stewart to share.

## 8. Questions for Stewart (ask early; each changes the plan)
1. Do you own or can you get the real set? Even phone photos with a ruler in frame would
   fix the hub dimensions, foam wheel size, wall heights and lobe apex height.
2. Is Blender installed? Which version? Headless Python is the intended pipeline.
3. API keys: Gemini (image generation for tampos/textures), ElevenLabs (sound effects).
   Put them in `.env`; never commit them.
4. Target machine for 60 fps (GPU)? Determines the HD budget.
5. Priority order between the artifact milestone (matches the YouTube demo) and the HD
   build (goes further). Default: artifact first, then HD.

## 9. Risks and how to handle them
- **Rapier's raycast vehicle is the wrong tool for die-cast cars** (it is a car-game tyre
  model). If Phase 3.3 shows it fights the walls, switch to explicit wheel forces or the
  sled mode with a rolling-resistance force; the rest of the code does not care.
- **Chord-box walls** kick cars at speed. Alternatives: fewer, longer boxes with rounded
  ends; a convex-decomposed wall from Blender; or a heightfield-like custom shape.
- **Artifact size.** Keep procedural assets for the artifact; measure `dist/index.html`
  after every asset addition.
- **Trademarks.** Personal, private project; keep repos private.
- **Scope creep.** Phase 2 done and published before any Blender work starts.

## 10. Suggested first hour for the Opus session
1. Read HANDOFF.md, PLAN.md, the five agent reports. Run `node tools/serve.mjs`, open the
   page, run `tools/selftest.html`. Write down what is green and what is not.
2. If T18a is open: own it. Two hours max on instrumented isolation before trying the
   sled/explicit-force alternative.
3. Integrate renderer + cars + UI; commit; build; publish the artifact; send Stewart the
   link and the five questions above.
4. Then Phase 3.
