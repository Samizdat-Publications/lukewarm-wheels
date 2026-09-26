# HANDOFF - live project state

_Last updated: 2026-09-26 by Opus 5.5 (the v1 ship night: Lukewarm Wheels, see "v1 release
2026-09-26" below). Update this block whenever you stop._

## v1 release 2026-09-26 (read this first)

Stewart (2026-09-25, going to bed): "finish development ... add whatever makes this a proper
v1 with enough content to ship, then ship it", a high-quality README, a landing page with
recordings like his VoidWing / antikythera / oil-dashboard pages, deployed live on Cloudflare,
and a funny parody name instead of Hot Wheels. Full permission for all of it. Done:

- **The name is Lukewarm Wheels** (parody). Set 1 shows as **Criss Cross Calamity**; its blurb
  and the README credit the real 2010 Criss Cross Crash / Mattel V2791 once, nominatively. The
  hub decal says LUKEWARM WHEELS. Keep "Hot Wheels" out of anything a player sees.
- **Live:** https://lukewarm-wheels.pages.dev (landing page) and https://lukewarm-wheels.pages.dev/play/
  (the sim). Cloudflare Pages project `lukewarm-wheels` (classic Pages, created once with
  `--force`; never pass `--force` again). Deploy: `npm run deploy` (= `node tools/site.mjs --deploy`).
- **GitHub:** public repo https://github.com/Samizdat-Publications/lukewarm-wheels (remote
  `origin`, published 2026-09-26 at Stewart's go-ahead). Its history was rewritten with
  git-filter-repo: no Mattel instruction scans (`docs/V2791-*`), no `docs/screenshots/`, no
  `dist/`; those stay on disk here, gitignored. The full unfiltered history is in the PRIVATE
  repo `hot-wheels-criss-cross-crash-sim` (remote `archive`, branches `main` and
  `archive/pre-public`). Never push to `archive` again: its history differs.
- **New in the game:** a title screen (`73-title.js`: opens on a bare link over the running set,
  Esc or the menu button brings it back; a card per set with a live thumbnail from
  `62-thumbs.js`, built by `tools/thumbs.mjs`), six **featured builder tracks**
  (`HW.builderCodec.FEATURED`, also in the builder's Featured menu), **27 trophies**
  (`75-trophies.js`, localStorage `hw.trophies`, toast + chime, cabinet on Y), **photo mode**
  (`76-photo.js`, P: HUD off, Freeze, Save PNG), closed rooms (near walls + ceiling as one-sided
  planes: low cameras used to see black), the builder camera keeps the track framed and the
  builder no longer shows the set's cars, the builder's letter keys no longer trigger game keys.
- **Footage pipeline:** `npm install` (Playwright + ffmpeg-static), then `npm run film [scene..]`
  (`tools/film.mjs`: virtual clock, 60 fps, into `media/raw/`, gitignored), `npm run media`
  (`tools/media.mjs`: site clips + posters, hero reel, README GIFs, stills, og image, progress
  thumbnails; the cut points are at the top of the file). The landing page is `site/`
  (index.html, site.css, site.js); `npm run site` builds `site-dist/` = site + `play/`.
- Physics unchanged all night: `node tools/regress.mjs` identical after every step.

## Where we are

**The engine is a platform with five sets and a builder.** A set is plain data
(`src/35-sets.js`), built by one generic builder into a graph of tracks. Pick one in the HUD's
top-left menu, or with `#s.<id>` in the URL; a builder track rides in `#t.<code>`.

| set (`#s.`) | what it shows |
|---|---|
| `crissCross` | the 2010 V2791, exactly as v2 had it (bit-identical through the Phase 1 refactor) |
| `dropJump` | the smallest proof: drop tower -> kicker -> free flight -> catch ramp -> finish |
| `loopLeap` | spring launcher, double loop, jump + funnel catch, 2-wheel booster, corkscrew, hammer, brake |
| `dragStrip` | "Race Day": 4-lane gravity drag strip, timing gate, why-it-won card, tuner, knockout |
| `kitchenGP` | "Kitchen Table Grand Prix": table, leg spiral, box tunnel, book jump, chair loop, boosted ramp; a challenge |
| `#t.<code>` | Track Builder tracks (Build button): pieces as letters, test-driven headless on every edit |

Stewart asked (2026-09-24) for all five roadmap phases, in order; all five are in. The force
overlay (Forces / O) works on every set. **Published:** https://claude.ai/artifact/2rG33qrywCsbFJwGKFvWqL
(private to Stewart), republished at the end of this session. To republish from another
conversation, pass that URL as `url` (read it first) with `dist/artifact.html`.

**Overnight 2026-09-25** (Stewart: "work overnight on anything remaining or that would polish it,
new features, full control"). Done, each its own commit:
- Jumps are scored (lip to first touch: airtime, distance, height, landed): speedometer line + best
  per set (localStorage `hw.jump.<set>`), BIG AIR / RECORD / WIPEOUT banners, Director jump cam in
  slow motion (one per 7 s), Replay frames the last jump, an air-rush sound, record chimes.
- Track Builder: a moulded splitter `Y` (the lane widens into two halves over 12 cm; a flipper,
  `Sim.guideSplit`, picks the branch as the car enters and steers it across; the branches start
  side by side and the car's lateral place carries over), `M` Merge back (a run joins the start of run 1; hand start only; same 60 cm / 60
  deg rule as closing), `X` hammer and `W` paddle-wheel pieces, launcher pull in the code (`L1`..`L9`).
- Showroom (`V` or the garage button, `74-showroom.js`): a casting on a plinth, its card, session
  stats and the tuner. The sim pauses; `main.step` hands the frame to `HW.showroom.frame`.
- Kitchen room (`51b-render-room.js`, `set.room: 'kitchen'`): walls, window, cabinets, splashback.
- Graphics fixes: shadows fit each set (`HW.render.fitShadows`; before, only +-58 cm round the
  origin cast any), the floor/rug no longer wash white under the rim light, the rug weave is a fine
  tiled normal map (it was a corrugated moire up close), open run ends get a tower, the chair loop
  hangs from the seat, the spiral is clipped to the table leg, better opening views for Kitchen,
  Race Day and Drop & Jump; top view fits any set.
- Free cars only count as "out of the world" outside the set's own bounds (the kitchen reaches
  z = 237 and the old +-160 cm box retrieved cars there instantly).
- Dev helpers on localhost only: `__run(secs)`, `await __shot(name)`, `__look(pos, target)`, and
  `HW.main.step(dt)` is the whole frame.

**The project moved** out of OneDrive on 2026-09-24: it lives at
`C:\Users\stewa\Documents\Claude\Projects\Hot Wheels Sim`, a junction to
`C:\Users\stewa\ClaudeProjects\Hot Wheels Sim`. Never work in the old OneDrive copy.

```
node tools/serve.mjs                    -> http://localhost:8765/   (#s.loopLeap, #t.LSSOSJ.SlSBSFK ...)
node tools/build.mjs                    -> dist/index.html + dist/artifact.html (~535 KB)
node tools/regress.mjs                  -> bit-exact fingerprints of 13 scenarios (~10 s); `save [names]` re-baselines
node tools/simtest.mjs geomset <set>    -> per piece: length, tightest radius, roll, height, plan position; furniture
node tools/simtest.mjs sweep <set> [lo hi step cars]  -> fire every casting from the launcher, classify outcomes
node tools/simtest.mjs auto <set> [secs cars]         -> the set running by itself; event counts, derail causes
node tools/simtest.mjs race [heats] [knockout]        -> Race Day heats + explanations (TUNE='{...}' to tune)
node tools/simtest.mjs code <code> [strength]         -> build a Track Builder code, test-drive all five
node tools/simtest.mjs challenge [set secs dropEvery] -> run a set's challenge
node tools/simtest.mjs runs|lone|fleet|crashlog|phase|geom|solve   (older modes, as before)
```

## The architecture, in one paragraph

A car in the channel is a mass constrained to the track: `s`, `d`, `h` on ITS track
(`car.track`), integrated at 1920 Hz (`41-cars.js`) with gravity, v^2*kappa, a floor and walls
that can only push, rolling resistance, wall scrub, side-slip, air drag, foam nips and brake
pads. A set is a graph of tracks (`33-track-build.js`): each closed or open, and an open end is
data: `stop` (a buffer), `fly` (a lip: the car rides on until its rear axle leaves, then becomes
a Rapier body with the pitch rate of pivoting off the edge), `{to}` (a link/merge) or `{split}`.
Leaving the channel hands the car to Rapier (`43-freebody.js`); a free car that lands upright and
moving in ANY track's lane is recaptured. Props (the V2791 hub, furniture) are built around the
tracks and placed from them. Hazards are huge-mass boxes against channel cars and kinematic
bodies against free cars (`44-stunts.js`). A sim can run on its own event bus (`HW.makeBus`).

## Files (load order = src/manifest.json)

| file | owns |
|---|---|
| `00-core` `10-config` `20-catalog` | namespace, bus, math/quaternions, generic tunables, the five castings |
| `30-track-path` | segments (line, B-spline, quintic Hermite, helix), resampling, closed/open paths, heartline banking, frames |
| `31-track-pieces` | generic pieces: straight, bend, pitch, join, loop, corkscrew, spiral; `fairJoin` |
| `32-v2791` | the Criss Cross hub as a prop + its `hubLane` / `lobe` pieces |
| `33-track-build` | set -> tracks, ends/links, widths, brakes, gates, joints, supports, buffers, view, warnings |
| `34-track-features` | booster (level or sloped), launcher, brake pieces; hazards; loop towers |
| `35-sets` | the five sets (data only) |
| `36-builder-codec` | Track Builder codes <-> sets; `testRun` (a silent headless test drive) |
| `37-furniture` | table, chair, books, cardboard box, mug, placed from the track |
| `40-power` `41-cars` `42-collide` `43-freebody` `44-stunts` `45-sim` | power train, on-track dynamics, SAT, Rapier, launcher + hazards, sim loop |
| `46-race` `47-challenge` | Race Day controller, why-it-won, tuner, knockout; a set's challenge + lap record |
| `50`..`59` | renderer, world (floor, rug) + `51b` room (kitchen), track mesh, car models, V2791 hub, cars, cameras, fx, stunt props + furniture, race hardware + force overlay |
| `60-audio` `61-audio-assets` | sound (stunt events have their own sounds) |
| `70-ui` `71-ui-race` `72-builder` `74-showroom` `90-main` | HUD, set picker, jump line; race/tuner/overlay/challenge panels; the Track Builder; the Showroom; boot and `main.step` |

## Decisions and why (do not re-litigate without new evidence)

- Everything from the v2 list still holds (track-constrained dynamics, quintic lobes, heartline
  bank, 380 motor, deliberate noise, the hand waits for a gap, recapture only moving cars,
  Neutral tone mapping, towers outside loops).
- **Phase 1 had to be bit-identical for Criss Cross, and was.** The regression hashes every
  car's state twice a second on fixed seeds; change the physics on purpose only with a re-saved
  baseline and the reason in the commit. Only one such change so far: the wheel colliders.
- **Free-body wheels are balls of r <= 0.32 inside the body width.** Full-radius balls reached
  past the channel walls, so every hand-off inside the channel started wedged.
- **Jumps ride the lip until the rear axle leaves**, then inherit the pivot's nose-down pitch
  rate. Handing off at the centre made the rear wheels hit the lip corner.
- **Loops/corkscrews/spirals are exact helices** with ease-in/out quintics matching curvature;
  loops bank for 450 cm/s unless a set names a speed, so a loop always inverts at the top.
- **A crest must satisfy v^2 < g R cos(theta)** for the fastest car that reaches it, or cars take
  off (the Kitchen ramp top is R 150 with only two boosters below it for this reason). The fair
  quintic's tightest point is ~2/3 of the nominal radius.
- **The launcher throws car + plunger** (k 5.5e5 dyne/cm, x <= 4 cm, 6 g plunger).
- **Race results are explained from energy ledgers**, not made up: the card names the loss that
  differs most between winner and runner-up and the car property behind it.
- **Builder circuits close only if the run really comes back** (60 cm, 60 deg); fair joins bound
  their handles (an unbounded far join ran to 1e16).
- **Furniture is placed from the track**, so moving pieces never leaves the table floating.
- **Sets choose by `#s.<id>` / `#t.<code>` and reload.** Artifacts only pass a bare `#token`.

## Ideas for next (none started)

- The kitchen book jump is a gentle 0.8 cm hop. A bigger one (lip -2, catch 18 cm further, the
  south run 18 cm shorter) worked but cost the set its zero-crash return loop; tune the merge first.
- Hand model (the hand that carries cars is only a glow ring); car models round two (the showroom
  shows the lofts up close: wheel arches, roof decals); a listening pass on audio.
- The other sets could get rooms too (`set.room`); Race Day would suit a hallway.

## Gotchas (each cost time)

- `npm install` of ffmpeg-static can leave a truncated `ffmpeg.exe` (21 MB, "Exec format error");
  delete it and run `node node_modules/ffmpeg-static/install.js` (the real one is 83 MB).
- `wrangler pages deploy` must get a path without spaces when run through `npx.cmd` with a shell:
  `tools/site.mjs` passes `site-dist` relative to the project.
- A running `python -m http.server` inside `site-dist/` locks it; `tools/site.mjs` cannot rebuild.
- The Playwright MCP browser may only write under the OneDrive project copy's `.playwright-mcp/`
  (it was started there); save screenshots there and copy them over, never work in that copy.
- Film scenes need a car-framing `__look(...)` (localhost only) or orbit autoRotate; the Director
  alone often cuts to blank walls. Playwright's bundled Chromium plays the site's H.264 fine.

- `node tools/regress.mjs save <name>` saves ONE scenario per call (a second name is ignored).
- `__shot('a/b.png')` becomes a dot-file `.._a_b.png` (the server sanitises names); save into
  docs/screenshots and move the file.
- The dev server occasionally resets a connection: a script fails to load and the page shows a
  boot error about `HW.pieces`. Reload.
- A near-black surface hides any shadow (2 % albedo): the showroom plinth had to go satin grey.

- The Browser pane suspends requestAnimationFrame while hidden and its screenshots lag. Step the
  sim by hand and render in-page, then POST the canvas to `/__shot` and Read the PNG
  (`docs/screenshots/`). Region zoom is not supported there.
- The Playwright MCP browser can be locked by another session ("Browser is already in use").
- Shell heredocs through the Bash tool break on an apostrophe even when quoted; write patch
  scripts with the Write tool into the scratchpad and run them.
- A stale `node tools/serve.mjs` from an earlier session may hold port 8765 serving the OLD
  OneDrive copy: check `curl localhost:8765/src/35-sets.js` before trusting it.
- Do not name a local `G` inside `trackDynamics.step`: `G` is gravity there.
- Test drives must use their own bus, or the page's audio and HUD hear them.
- r185 deprecated PCFSoftShadowMap; `window.THREE` exists only after `hw:libs-ready`.
- Keys: `ELEVENLABS_API_KEY` is in Stewart's environment; there is no Gemini key.

## Stewart (standing preferences)

Every command handed to him starts with the `cd` into the project folder. Physics AND graphics
both have to be excellent; he treats this as a game, not a demo. Never write an em dash anywhere.
