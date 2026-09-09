# REFERENCES — observed behaviour of the real Criss Cross Crash

Grounding document for T18. Everything the physics tuning is judged against goes here.

**Evidence tags — every line carries one. Nothing here is untagged.**

| tag | means |
|-----|-------|
| `[MEASURED]` | A number read directly off a manufacturer document, or counted from a parts list / assembly diagram. |
| `[OBSERVED]` | Seen or heard by this session in a video, a video still, or a product photo. |
| `[REPORTED]` | A human asserted it (reviewer, customer review, marketing copy). Not verified. |
| `[ESTIMATE]` | Inferred. Used sparingly and flagged. **Never treat as data.** |

**Headline caveat.** No lap time exists in this document, because no source gave one and this
session could not play video (see Sources). Do not let an `[ESTIMATE]` from `docs/RESEARCH.md`
migrate into this file and acquire authority it has not earned.

**Second caveat — two different toys.** The two YouTube videos show the **modern blue/orange
set** (DTN42 / FDF25 lineage, the currently-shipping mould). Our target is the **2010 V2791**
(red/orange hub). Where they agree, it is noted. Where only one is evidenced, the set is named.

---

## Sources

| URL / file | What it is | Content obtained? |
|---|---|---|
| `https://www.youtube.com/watch?v=VILmpR2Xwww` | "Hot Wheels Criss Cross Crash Motorized Set Review", Adam's Faves, 41 s, Aug 2024. Modern set. | **Partial.** Auto-caption transcript retrieved in full (~170 words, pure review patter, zero numbers). **Video itself could not be played** — see below. Four HD stills recovered. |
| `https://www.youtube.com/watch?v=vRY5e9nQZv0` | "Great Crash Fun: Hot Wheels Criss Cross Crash", Multiplayer Racing / kidtoy studio, 2:47, Feb 2024. Modern set, unboxing + run + slow-mo. | **Partial.** Auto-caption transcript retrieved in full (~450 words, qualitative only). **Video itself could not be played.** Four HD stills recovered, incl. a clear shot of the retail box art. |
| `https://i.ytimg.com/vi/<id>/maxres{default,1,2,3}.jpg` | YouTube's auto-sampled HD stills at ~25 / 50 / 75 % of each video, 1280×720. | **Yes.** This is where every `[OBSERVED]` geometry fact below comes from. |
| `docs/V2791-instructions.pdf` (local, already in repo) | **Mattel's own instruction sheet for V2791**, sheet code `V2791-0920`. CONTENTS, ASSEMBLY step 1–2, TO PLAY diagram, OPERATING TIPS. | **Yes.** Strongest evidence in this document and the only source that is unambiguously *our* set. |
| `https://shopsavvy.com/reviews-tldr/hot-wheels-criss-cross-crash-set` | Aggregated customer-review summary. | **Yes.** Source of most `[REPORTED]` behaviour lines. |
| `https://www.walmart.com/reviews/product/101471130` | Walmart customer reviews. | **No** — bot-check wall. |
| `https://hotwheels.fandom.com/wiki/Criss_Cross_Crash` | Hot Wheels Wiki. | **No** — HTTP 402. (Its text is already quoted second-hand in `docs/RESEARCH.md`.) |
| YouTube comments, video 1 (3 comments) | — | **Yes**, 2 of 3 fetched. One is load-bearing (see Behaviour targets). |

**Why the videos could not be played.** Browser navigation to `youtube.com` was denied in this
environment, `youtube.com/embed/...` returned **Error 153** (embedding disabled), and downloading
the video files is outside what this session may do without the user's explicit go-ahead. So:
transcripts + stills only. **No frame-by-frame timing was possible.** Anyone who can play these
two videos can close most of the Open questions below in about ten minutes.

---

## Behaviour targets

These are what the sim must reproduce. Ordered by how load-bearing they are for T18.

### The single most important target

- **A lone car circulates indefinitely.** `[REPORTED]` ×2, both videos, independently:
  v1 — *"you can play with it for a really long time just watch one car go for a really long
  time"*; v2 — *"with just one car that came with it it won't be as much fun"* (i.e. one car runs
  fine, it just never has anything to hit). `[OBSERVED]` v1 transcript: *"they just keep going
  around and around in circles"*.
  → **The sim currently stalls a lone car after ~2 laps. That is the defect.** There is no
  evidence anywhere of a real car running out of energy and stopping on the track.

### Crashes

- **Crashes happen at the central crossing, not on the lobes.** `[OBSERVED]` v2 transcript:
  *"they will crash into each other in one of the middle points"*; *"a few different crash Zone
  points here where the cars can meet each other"*. `[REPORTED]` marketing: "four intersecting
  crash zones". (One Amazon bundle listing says "5 Crash Zones" — inconsistent with everything
  else; disregard.)
- **Crashes are occasional, not immediate.** `[OBSERVED]` both transcripts use *"eventually"*:
  v1 *"eventually you get some car crashes"*; v2 *"eventually they will crash into each other"*.
  → Cars run for a meaningful number of laps between collisions. **No source gives a rate.**
- **Crashes are violent.** `[REPORTED]` v2: *"they crash really really hard"*. The reviewer cuts
  to slow motion at 2:00 specifically because full speed is too fast to see.
- **Cars do leave the track.** `[REPORTED]`: *"Cars ultimately crash and fly off the track, though
  they don't fly like missiles and shouldn't cause property damage"*; and separately *"reports of
  cars consistently falling off the track, leading to disappointment"*.
  → Fly-off is real, is a *consequence of collisions*, and is mild in magnitude. **No source
  attributes fly-off to the loops or to cornering.**
  ⚠ Cars are visible lying on the floor beside the set in several stills, but both videos are
  unboxings — **that is not evidence of fly-off** and is not counted here.

### Multiple cars

- **Three to four cars at once is normal play.** `[REPORTED]` *"Cars zip around the track quickly,
  sometimes three or four at a time"*; `[OBSERVED]` v1 transcript *"put two or three cars in"*.
  → Five simultaneous cars is at or past the top of the observed range. A five-car line-up that
  bogs the motor may be *realistic*; it should not be the default demo.
- **Many cars at once does degrade behaviour.** `[REPORTED]` *"The design can make it difficult for
  multiple cars to navigate the track simultaneously"*. This is the closest thing found to
  evidence of load-induced slowdown — it is not specific about the mechanism.

### Motor, power, speed

- **4 × D (LR20) alkaline cells.** `[MEASURED]` Mattel CONTENTS panel: *"Requires 4 'D' (LR20)
  alkaline batteries (not included)"*. Instruction sheet adds *"For longer life use only alkaline
  batteries."*
- **ON/OFF slide switch only — no speed control.** `[MEASURED]` instruction sheet, "ON/OFF SWITCH"
  callout with OFF↔ON positions.
- **Battery condition visibly drives performance.** `[REPORTED]` *"battery quality affects
  performance"*; *"weak motors make it difficult for cars to complete the track"*.
  → Supports modelling battery sag as a first-class effect, and supports a "tired battery" demo.
- **Loud.** `[OBSERVED]` v2 transcript: *"quite a bit like a loud vacuum cleaner"*; v1: *"it is a
  little bit loud"*. Relevant to T16 audio, not to physics.
- **Cars are fast.** `[OBSERVED]` v2 transcript: *"it will go really really fast around this
  track"*. No number. This is the entire speed evidence base.

### Car compatibility and setup — relevant to the T18 slam-event diagnosis

- **Not every casting works.** `[MEASURED]` instruction sheet prints, under the TO PLAY diagram:
  **"NOT FOR USE WITH SOME HOT WHEELS® VEHICLES."** `[REPORTED]` *"lighter and slimmer cars
  perform best"*.
- **Mattel itself blames mis-aligned side walls at joints.** `[MEASURED]` instruction sheet,
  OPERATING TIPS: *"Adjust track side walls at each connection point as shown."* — with a diagram
  showing arrows pinching the two ribbons' side walls into alignment.
  → **This is the real toy's version of the exact failure T18 is chasing** ("slam events at
  geometry transitions"). On the real set, a step or lip in the side wall at a joint is the known
  cause of cars catching. It is worth making the sim's wall geometry continuous at joints for the
  same reason, rather than treating it as a sim artefact.
- **Set must be stabilised.** `[MEASURED]` instruction sheet, STABILIZE SET: on carpet, prop the
  base; on a smooth floor, tape the base to the surface. `[REPORTED]` *"Blue support beams reduce
  track stability, recommended to be avoided for optimal performance"* — i.e. the tall loop
  supports wobble in use.
- **Joints pop apart.** `[REPORTED]` YouTube comment, video 1: *"Setting up is the hardest thing
  ever. Mine just does not stick."*

### Loading

- **There is one designated loading point.** `[MEASURED]` the TO PLAY diagram labels a single spot
  on the hub **"START HERE"**, with a leader line to a lane entry. `[OBSERVED]` v1 transcript:
  *"here's the loading zone for where you set your car down"*.
  → Matches the T13 UX gap in HANDOFF: the real toy has *one* obvious place to drop a car, not
  "click anywhere on the track".
- **One car ships with the set.** `[MEASURED]` CONTENTS panel shows a single car. (Our five-car
  line-up is Stewart's choice, not the set's contents.)

---

## Geometry observations

### Verdict: 2 near-vertical loops + 2 low, near-flat sweeps. Confirmed, on both sets.

- `[MEASURED]` **V2791 ASSEMBLY step 2** (Mattel, our exact set) is decisive. It shows the
  assembled set from above with all four arcs in place:
  - the **two rear arcs stand tall as upright circles**, each carried by one **"TRACK SUPPORT"**
    post rising from a flat foot to the arc;
  - the **two front arcs lie low and flattened**, each propped by a small **stepped ramp support**
    slid in from outside. They are drawn as squashed ovals, not circles.
- `[MEASURED]` **V2791 TO PLAY diagram** shows the same arrangement: two tall circles on posts at
  the rear, two wide low ovals at the front.
- `[OBSERVED]` **Modern set, both videos, four independent stills** (v1 `maxres3`; v2
  `maxresdefault`, `maxres2`, `maxres3`): two tall arcs stand near-vertical at the rear on tall
  blue support legs; the two front tracks **lie on the floor**, wide and flat, on short orange
  pillars. Unmistakable in every frame.

→ **The old model of "four banked 270° lobes" is wrong.** The recent commit
`cd61ec2` is right.

### The loops

- `[MEASURED]` They are true circular arcs standing in a near-vertical plane, held at the top by a
  single post. The plane leans slightly — the arcs are not perfectly upright in any image.
- `[OBSERVED]` **The car is inverted at the apex.** The retail box art, filmed close-up in v2
  `maxres1`, shows a car on the **inside (concave) face** of the orange loop at the top, roof
  pointing down into the loop. This is a conventional loop-the-loop.
- ⚠ **Conflicting evidence, stated honestly:** the V2791 *line drawing* renders the car at the
  crest **upright, on top of the arc**, in both the TO PLAY and the loop close-up. Judgement: the
  line art is an illustrative simplification (it also draws a car on the outer face partway down
  the loop, which is physically impossible), and the box art plus the real channel geometry win.
  **But this has not been confirmed on moving video.** If the sim's loops behave badly, revisit
  this before assuming the physics is at fault.

### The sweeps

- `[OBSERVED]` Wide, low, essentially flat curves. **The car does not invert; it leans on the
  outer wall.** Consistent with the request's description — with one correction:
- `[OBSERVED]` **They are not elevated.** On the modern set the front sweeps run at **floor
  level, below the hub deck**: the outbound track visibly *descends* from the hub on a short
  pillar to reach them, and the car must climb back up to re-enter the hub. `docs/RESEARCH.md`'s
  `loop_apex_height 0.12 m above hub deck` is wrong for the front pair — the gradient runs the
  other way. This matters for the T18 energy budget: **the front lobes are a descend-then-climb,
  not a climb-then-descend.**
- `[OBSERVED]` The ribbon carries a raised outer lip. Whether that constitutes real banking or
  just a moulded wall could not be resolved from these stills.

### All four arcs are the same part

- `[MEASURED]` CONTENTS panel lists **one** pre-bent arc moulding at **"4 x"**. There is no
  separate "loop piece" and "curve piece".
  → **The loops and the sweeps have identical arc radius and identical cross-section. They differ
  only in mounting attitude.** Strong constraint: the sim should build all four lobes from one
  arc primitive and vary only the mount.

### Rest of the parts list

`[MEASURED]` from CONTENTS (V2791): 4 × pre-bent arc · 4 × TRACK SUPPORT (tall post) · 4 × small
wedge support · 4 × straight track `A C E G` · 4 × straight track `B D F H` · hub assembly with
lettered connectors `A`–`H` · 1 × car · 4 × D cells (not included). Age 5+.

`[OBSERVED]` The instruction art draws **four spoked foam wheels** in the hub, one per arm —
consistent with the `[REPORTED]` marketing phrase *"eight-way booster"* (4 wheels × 2 lanes each).

### Reviewer language warning

`[REPORTED]` v1 calls the set *"four loops"* and says *"you can easily remove any of the loops"*.
Video-2 marketing copy says *"hairpin turns"*. **Reviewers and marketing use "loop" for all four
lobes.** The wiki phrase *"four looping sections of track"* quoted in `docs/RESEARCH.md` is the
same loose usage and is **not** evidence for four vertical loops. Do not re-derive four loops from
that phrase.

---

## Open questions

Ranked by value to T18. Each has the cheapest experiment that would close it.

1. **Lap time. Not determined — no source states one, and no video could be played.**
   This is the single biggest hole in this document. *Closing it:* play either video, pick a
   distinctive car, step frames (`,` / `.` on YouTube) between two successive passes of the same
   landmark. v2 is the better candidate — it has a sustained running segment around 1:19–2:11 plus
   a slow-motion cut at ~2:00–2:11 which gives a second, independent read. **Ten minutes of work
   for the single number the whole energy budget is tuned against.**
2. **Crash rate.** "Eventually" is all we have. *Closing it:* count crossings-without-contact per
   crash over the v2 running segment, at a stated car count.
3. **Does the motor audibly bog as cars enter the boosters?** Not determined — no audio was
   available to this session. The transcript's "loud vacuum cleaner" is a constant-noise remark,
   not a load remark. *Closing it:* listen to v2 1:19–2:11 for pitch drop as each car enters.
4. **Does a car accelerate lap over lap, or reach steady speed?** Not determined.
   *Closing it:* same frame-stepping pass as (1) — compare lap 1 vs lap 4.
5. **Do cars ride the outer wall on the sweeps, and how hard?** Geometry says they must lean out;
   no still shows a car mid-sweep. *Closing it:* the slow-motion cut in v2.
6. **Is the car genuinely inverted at the loop apex?** Box art says yes, V2791 line art says no
   (see Geometry). *Closing it:* one frame of a car at the top of a loop, from any video.
7. **Loop diameter and loop apex height, in real units.** Not measured here; deliberately not
   estimated. *Closing it:* photogrammetry against the 38.1 mm standard track width or a 34 mm-
   diameter D cell, on a still where the reference and the loop are close to co-planar.
8. **How many cars before it jams?** `[REPORTED]` "three or four at a time" is play advice, not a
   limit. Not determined.
9. **Banking on the front sweeps:** moulded raised lip only, or a real banked floor? Not resolved.
