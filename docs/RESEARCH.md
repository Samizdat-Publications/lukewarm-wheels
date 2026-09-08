# RESEARCH — Hot Wheels *Criss Cross Crash* (Mattel V2791, 2010) + 1999 5-Pack

Research pass for a physically grounded browser sim. Every figure is tagged:

- **[M] MEASURED** — stated by a cited source.
- **[D] DERIVED** — computed here from measured values; the arithmetic is shown.
- **[E] ESTIMATE** — my judgement, no source. Treat as a tunable parameter, not a fact.

Date of research: 2026-09-08.

---

## 1. Sources

### Fetched successfully

| URL | What it gave |
|---|---|
| `https://service.mattel.com//instruction_sheets/V2791-0920.pdf` | **The primary source.** Official Mattel instruction sheet for V2791, 1 page, 16.5" x 8.5", 2-color. Full text extracted (pypdf). Gives contents list (parts A–H, 4x each, + 4x track support), battery spec, switch location, assembly sequence, operating tips. Bitmap art is 1C+1C halftone separations and is not legible when extracted. |
| `https://m.service.mattel.com/us/Technical/productDetail?prodno=V2791&siteid=27` | Mattel service record: release 2010, discontinued 2012, ages 5+, "four intersecting crash zones", "over 16 feet of track", link to the instruction PDF above. |
| `https://www.southtexasdiecast.com/hwguide/5pack.html` | **The 5-pack roster.** Pack #21081 "Criss Cross Crash", listed under 1999, five cars named. |
| `https://www.pololu.com/file/0J11/fa_130ra.pdf` (mirror of `mabuchi-motor.co.jp/motorize/branch/motor/pdf/fa_130ra.pdf`) | Official Mabuchi FA-130RA datasheet: full performance table for three variants, physical dimensions, 17 g mass. Text extracted with pypdf. |
| `https://hotwheelscars.org/hot-wheels-car-dimensions/` | 1:64 car length/width/height/mass/wheelbase ranges. Secondary/aggregator quality, not a Mattel spec. |
| `https://toysgamesandstuff.com/hot-wheels-track-length-width-how-wide-long-are-they/` | Track width 1.5 in; straight lengths 9/12/20 in; curve lengths 6/12 in. No wall height. |

### Search-result summaries used (page not individually fetched)

| Source | What it gave |
|---|---|
| `https://data.energizer.com/pdfs/en95.pdf` (Energizer E95 D-cell datasheet) | 1.5 V nominal, internal resistance 150–300 mΩ fresh, ~20,500 mAh, 144 g, LR20/ANSI-13A. |
| `https://www.ebay.com/p/10027051715` + Hot Wheels Wiki text quoted in search results | Phrase **"eight-way booster propelling cars through four looping sections of track"**; parts enumeration "central launch platform, four curved ramps, four straight ramps, four pre-bent loops of track with brackets, four support towers, one car". |
| `https://www.target.com/p/...A-1006678926` | "Motorized Boosted **Figure-Eight** Raceway with 4 Crash Zones, 16+ Feet of Track, Car Feeder Ramp"; product dimensions 29.13 x 29.13 x 7.87 in, 4.56 lb. |
| `https://service.mattel.com/us/productDetail.aspx?prodno=DTN42&siteid=27` | Later (2016+) reissue of the same set; 4.5 lb; same "motorized booster, 4 D batteries" language. |
| `https://treasurevalleyantiques.com/products/1999-hot-wheels-criss-cross-crash-ford-gt-90-yellow-die-cast-toy-car-vehicle` | Confirms a **yellow** Ford GT-90 as a 1999 Criss Cross Crash pack car. |
| `https://product.mabuchi-motor.com/detail.html?id=9` / `id=10` | FA-130RA-2270 and -18100 spec confirmation. |

### Fetches that FAILED (noted, moved on)

- **All `hotwheels.fandom.com` pages returned HTTP 402** (`/wiki/Criss_Cross_Crash`, `/wiki/Criss_Cross_Crash_5-Pack`, `?action=raw`, and `api.php?action=parse`). The Fandom wiki is the single biggest remaining gap — it holds the per-car variation table (wheels, base, window, interior) that section 5 is missing. **Retry from a browser.**
- `https://hotwheelsbr.com/1999_5pack/Packs_1999.htm` — DNS timeout.
- `https://www.amazon.com/Hot-Wheels-Criss-Cross-Crash/dp/B00383PO48` — HTTP 500.
- `https://manuals.plus/m/4e10f...` — HTTP 403.
- Instruction-sheet raster art: extracted as 5 PNGs from the PDF but 4 of them are noise-like halftone separation plates and the 5th is the battery-door screw icon. **The exploded parts diagram is vector/halftone and did not survive extraction — it needs to be viewed in a PDF renderer.** The PDF is cached locally at
  `C:\Users\stewa\.claude\projects\C--Users-stewa-OneDrive-Documents-Claude-Projects-Hot-Wheels-Sim\6d3d5827-39c1-4fbd-85e3-a5112ba00c92\tool-results\webfetch-1788895392085-setrik.pdf`
  and can be re-downloaded any time from the Mattel URL above. **Open it and look at it before finalising track geometry.**

---

## 2. Track layout

### Hard facts from the instruction sheet and Mattel

- **Contents [M]** (instruction sheet, "CONTENTS" panel): eight distinct track parts lettered **A, B, C, D, E, F, G, H**, each supplied **4x**; plus **4x TRACK SUPPORT**; plus the motorized hub; plus 1 car. → **32 track pieces + 4 supports [D]** (8 types x 4).
- Parts are physically embossed with their letters: *"Refer to letters on parts and contents page to help with assembly."* **[M]**
- Assembly is two steps **[M]**: (1) *"Attach each part at connector locations as shown"* with three **SNAP!** callouts; (2) *"Connect track supports to back of track connectors as shown. Slide track in as shown."*
- The hub carries a **"START HERE"** marking and an **"ADJUSTABLE"** callout **[M]** — the latter is almost certainly the car-feeder ramp, which other listings call a "car feeder ramp".
- **Four intersecting crash zones** **[M]** (Mattel service page).
- **"more than 16 feet of track"** = **4.88 m [D]** (16 ft x 0.3048). Per loop: 4.88 / 4 = **1.22 m [D]**, if the four quadrants are equal (they are, by the 4x parts symmetry).
- Operating tips **[M]**: *"TO STABILIZE SET: On carpet, use books. On smooth floor, tape base to surface."* and *"Adjust track side walls at each connection point"*. Both imply a light, easily-shifted assembly and imperfect joints — a real source of derailments worth modelling.
- **"NOT FOR USE WITH SOME HOT WHEELS VEHICLES"** **[M]** — i.e. oversize / rubber-tyre castings jam the booster nip.

### Footprint

- **29.13 x 29.13 x 7.87 in = 74.0 x 74.0 x 20.0 cm [M/E]** — measured figure from the Target listing for the current reissue, which is the same tooling lineage; **treat as [M] for the reissue, [E] for V2791 specifically** (the 2010 box art shows the same square footprint). Assembled mass ≈ **4.56 lb = 2.07 kg [M]** (includes packaging; excludes 4 D cells at 144 g each = 576 g).
- Square footprint + 4-fold parts symmetry ⇒ the assembled set is **4-fold rotationally symmetric about the hub** **[D]**.
- Hub half-width to loop apex ≈ 74/2 = **37 cm [D]**; subtracting a ~7 cm hub half-width, the outer loops have an effective radius of roughly **25–30 cm [E]**.
- Track height above the table at the loop apex: the 7.87 in (20 cm) box depth is packaging; the **track supports** are single-height, so the elevated sections are likely **~10–15 cm [E]** above the base.

### The hypothesis — verdict

> *"The hub is a plus shape; each arm carries two lanes, one on each side of a foam wheel; all four foam wheels spin the same direction from a single motor via a central idler gear; so one lane per arm runs inbound and one outbound, the four inbound/outbound lanes form a # in the middle, and four 270-degree curves link outbound lane of one arm to inbound lane of the next arm giving one continuous circuit."*

**CONFIRMED**

1. **Four-fold symmetric hub with four arms.** [M] — 4x of every part; square footprint; "four looping sections of track".
2. **Two lanes per arm / eight lanes at the hub.** [M-ish] — the set is repeatedly described as an **"eight-way booster"**. 8 lanes / 4 arms = 2 lanes per arm. This is the strongest single piece of evidence for the hypothesis.
3. **Four crash points in the middle.** [M] — Mattel says "four intersecting crash zones".
4. **The four central paths form a `#`.** [D] — four straight paths, 4-fold symmetric, producing exactly four pairwise intersections, is geometrically the `#` (two pairs of parallel chords). Any other 4-fold arrangement of four straight paths gives either 1 crossing (all through the centre) or 4 crossings (the `#`). Four crash zones ⇒ `#`. This is a sound derivation, not a fetched fact.
5. **Single motor driving all boosters.** [D] — one battery compartment, one on/off switch, one hub moulding; four independent motors would be absurd at this price point. Mechanism (idler gear vs. long shaft vs. belt) is **not confirmed**.

**NOT CONFIRMED / STILL OPEN**

6. **"270-degree curves link arm N's outbound to arm N+1's inbound, giving ONE continuous circuit."** Unverified, and there is a competing topology that fits the evidence equally well:
   - **Topology A (single circuit, the hypothesis):** out on arm N, 270° around, back in on arm N+1. One closed loop threading all four arms. A car laps the whole set.
   - **Topology B (four independent circuits):** each track crosses the centre in a straight chord (in one side, out the opposite side), then loops 360° around the outside back to itself. Four separate closed loops, offset from centre, overlapping as a `#`. Each still uses 2 of the 8 booster lanes, so the "eight-way booster" evidence does **not** discriminate.
   - **Which is better supported:** Topology B. The word **"figure-eight"** in the Target/Walmart copy and the phrase *"four looping sections"* both read as four self-contained loops rather than one grand circuit; and the marketing pitch — "put multiple cars on and watch them crash" — works because independent loops let cars accumulate in each lane. Also, a booster wheel sitting between an inbound and an outbound lane pushes the two lanes in *opposite* directions, which serves either topology.
   - **Resolve this by looking at the instruction-sheet diagram.** Do not build the sim on either until you have.
7. **Banked / tilted curves.** **No source found.** Not mentioned in the instruction sheet text, Mattel copy, or any listing. Photographic evidence (box art) is the way to settle it. Physically, a 1.22 m loop at ~3 m/s implies a lateral acceleration of v²/r ≈ 9/0.28 ≈ **32 m/s² ≈ 3.3 g [D]** — well beyond what an unbanked wall can hold with a light car, so **some banking is near-certain [E]**; Hot Wheels curve pieces of this era are moulded with a raised outer wall/partial bank rather than a true flat-plus-camber bank.
8. **Elevation.** "Track supports" (4x) + "elevated" in the wiki description ⇒ the outer loops are raised relative to the hub, so gravity assists on the return. Height unquantified **[E]**.
9. **Where the crash points sit.** [D] Four `#` intersections, one per quadrant diagonal, all inside the hub footprint, at roughly ±(lane offset) from the centre in x and y. If the lane pitch at the hub is *p*, the four crossings sit at (±p/2, ±p/2). Lane pitch is unmeasured; with a 38 mm outer track width, **p ≈ 45–55 mm [E]**, putting the four crash points on a square roughly **5 cm on a side [E]**.

### Suggested sim parameterisation (all [E], all tunable)

```
hub_footprint       0.14 m square
lane_pitch p        0.050 m
crash_points        (±0.025, ±0.025) m
loop_path_length    1.22 m each [D]
loop_outer_radius   0.28 m
loop_apex_height    0.12 m above hub deck
track_inner_width   0.0318 m [M]
bank_angle_max      25–35 deg on the tight curve
```

---

## 3. Hub / booster mechanism

**Confirmed from the instruction sheet [M]:**

- **Batteries: 4 x "D" (LR20) alkaline, not included.** Stated twice, verbatim: *"Requires 4 'D' (LR20) alkaline batteries (not included)."* → **the 4x D-cell hypothesis is CONFIRMED.**
- **Battery door:** *"Press in tab on battery door and pull upward to open front of compartment. Insert 4 'D' size alkaline batteries as shown. Close cover."* Removal: *"Push fingers through holes on bottom to remove batteries."* So the compartment is on the **front face** of the hub, with finger holes through the **bottom** — i.e. the cells lie in the base, which is also the set's ballast.
- **Switch:** an **ON/OFF slide switch**, labelled `ON OFF`, called out on the hub with a leader line. Two positions only — **no speed control [M]**.
- *"For longer life use only alkaline batteries."*

**Not confirmed — no source found:**

- **Motor type.** Nothing in the instruction sheet or service page. A single small brushed can motor is near-certain **[E]**; FA-130 class (Ø20.1 x 25.0 mm) is the standard part for this application **[E]**. See §6 for numbers.
- **Gear train.** Unverified **[E]**. A single motor pinion into a train of spur gears, with the four booster-wheel shafts geared off a common ring or idler chain, is the obvious low-cost solution. Note: if all four wheels must spin the **same** direction (as the hypothesis says), that constrains the gear count between adjacent wheels to be even; if they alternate, odd. This matters for which lane of each arm is inbound.
- **Foam vs rubber wheels.** **Unverified.** Every Mattel booster of this era I am aware of uses a compliant open-cell/EVA foam nip wheel, and eBay parts listings for this set are titled "Powered Launcher" without material detail. Call it **foam [E]**.
- **Wheel diameter.** No source. **[E] 25–35 mm.** For the sim, what matters is the **surface speed of the nip**, not the diameter alone (see §6 derivation).
- **Number of nip wheels.** The prompt says four. The "eight-way booster" phrasing is consistent with **4 wheels each straddling 2 lanes [E]** or **8 smaller wheels [E]**. Unresolved.
- **Exploded parts diagram.** Present in the PDF; not extractable as text and the raster layers came out as halftone noise. **Open the PDF visually.**

---

## 4. Standard Hot Wheels track and car dimensions

### Track

| Quantity | Value | Tag | Source |
|---|---|---|---|
| Outer width (wall to wall, outside) | **1.5 in = 38.1 mm** | [M] | toysgamesandstuff.com |
| **Inner clearance (running width)** | **1.25 in = 31.75 mm** | [M] | search summary of toysgamesandstuff / hotwheelscars.org; both state 1.25 in as the clearance and note cars wider than this scrape and derail |
| Wall height | **~8–10 mm** | [E] | **No source found.** Estimated from the 38.1/31.75 mm difference (3.2 mm per wall) and photos. |
| Track wall thickness | **~1.2–1.6 mm** | [E] | No source. Injection-moulded PP/PE. |
| Standard straight lengths | 9 in, 12 in, 20 in (229 / 305 / 508 mm) | [M] | toysgamesandstuff.com |
| Standard curve piece lengths | 6 in and 12 in of arc (152 / 305 mm) | [M] | toysgamesandstuff.com |
| Material | flexible polypropylene / polyethylene, orange | [E] | No datasheet. |

> **CONTRADICTION with the brief.** The task statement assumed *"orange track width (inside wall to wall, commonly ~5.1 cm / 2 inch)"*. **That is wrong.** Hot Wheels track is **1.5 in / 38.1 mm outer** and **1.25 in / 31.75 mm inner**. 2 inches is not a Hot Wheels dimension. Use 31.75 mm as the lane width in the sim.

### 1:64 cars

| Quantity | Value | Tag | Source |
|---|---|---|---|
| Length | 2.25–3.5 in = **57–89 mm**; ~66 mm is the classic "3-inch" nominal | [M] | hotwheelscars.org; hwcollectorsnews lists the Ford GT-90 as **66 mm** |
| Width | up to 1.25 in = **31.75 mm** (clearance-limited); typical 28–32 mm | [M] | hotwheelscars.org |
| Height | 0.6–1.2 in = **15–30 mm** (low racers <15 mm, standard 19–25 mm, trucks >30 mm) | [M] | hotwheelscars.org |
| **Mass** | **25–50 g**, with metal-base cars **36–40 g** | [M] | hotwheelscars.org |
| Wheelbase | 1.75–2.0 in = **44.5–50.8 mm** | [M] | hotwheelscars.org |
| Track (axle width) | ~26–29 mm | [E] | No source. |
| CG height | ~8–11 mm above the track surface | [E] | No source; derived from body height and the metal body / plastic base mass split. |

### Wheel diameters by type — **NO SOURCE FOUND**, all [E]

Searches did not surface a dimensional table for 5SP / 5DOT / 3SP / SB. Working estimates:

| Wheel code | Description | Est. OD | Tag |
|---|---|---|---|
| 5SP | 5-spoke, the era-standard | **9.5–10.5 mm** | [E] |
| 5DOT | 5-dot / "5 hole", small | **9.0–10.0 mm** | [E] |
| 3SP | 3-spoke | **9.5–10.5 mm** | [E] |
| SB | Saw Blade, larger/aggressive | **11–13 mm** | [E] |
| Tyre width | 5–7 mm | [E] |
| Wheel + axle mass (each) | 0.6–1.0 g | [E] |

Axles are bare steel wire in a plain plastic bearing — no bearings, no lubricant.

### Rolling resistance / speeds — **WEAK. Treat as sim parameters.**

No science-fair or physics write-up with usable coefficients was retrieved in budget. All [E]:

- **Coefficient of rolling resistance, hard plastic wheel on plastic track: Crr ≈ 0.015–0.035 [E].** Dominated by axle friction (wire in plastic hole), not tyre deformation, so it behaves more like a constant retarding torque than a true Crr — model it as `F = mu_a * N + b*v` with `mu_a ≈ 0.02` and a small viscous term.
- **Aerodynamic drag is negligible** at these speeds/scales: `Cd*A ≈ 0.35 * 6e-4 m² = 2.1e-4 m²`; at 3 m/s, `F = 0.5*1.2*2.1e-4*9 ≈ 1.1 mN` versus rolling losses of ~8 mN on a 40 g car. **[D]** — worth 12% at most; include only for polish.
- **Booster exit speed: 2.5–4.0 m/s [E]** for a fresh-battery Mattel booster. Anchor: a full 1.22 m loop in ~0.5 s is what the toy visibly does, which is 2.4 m/s average. Scale note: 3 m/s at 1:64 is a scale speed of ~690 km/h, which is why the toy looks frantic.
- **Wall friction (car scrubbing the outer wall in a curve): mu ≈ 0.2–0.3 [E]** plastic-on-plastic.

---

## 5. The 1999 Criss Cross Crash 5-Pack

**Pack number 21081 [M]** — southtexasdiecast.com Hot Wheels Guide, 5 Packs / Gift Packs. Listed under 1999. The five castings:

| # | Casting | Colour / notes | Tag |
|---|---|---|---|
| 1 | **Porsche 959** | not recorded | [M] casting only |
| 2 | **Aeroflash** | not recorded | [M] casting only |
| 3 | **Ford GT-90** | **yellow** | [M] casting; [M] colour via treasurevalleyantiques listing "1999 Hot Wheels Criss Cross Crash Ford GT-90 Yellow" |
| 4 | **Chevy Stocker** | not recorded (a Pinterest listing titled "Hot Wheels CHEVY STOCKER - Criss Cross Crash 5-Pack 1999" corroborates membership) | [M] casting only |
| 5 | **Chevy 1500** | not recorded | [M] casting only |

**Missing, because Fandom returned 402 on every attempt:** tampos/liveries, **wheel types**, base type and colour, window tint, interior colour, and the per-car variation table. These live at
`https://hotwheels.fandom.com/wiki/Criss_Cross_Crash_5-Pack` and on the five individual casting pages
(`/wiki/Porsche_959`, `/wiki/Aeroflash`, `/wiki/Ford_GT-90`, `/wiki/Chevy_Stocker`, `/wiki/Chevy_1500`).
**Fetch these from a browser — it is a 5-minute job and it closes the whole section.**

**Note:** there is also a **Criss Cross Crash 5-Pack (2010)**, a separate Fandom page, matching the V2791 era. The brief pairs the 1999 cars with the 2010 track, which is a deliberate anachronism — fine, but the 2010 pack exists if period-correct cars are wanted.

### Physical dimensions/masses for the five cars — **[E], no source**

| Casting | Est. length | Est. mass | Notes |
|---|---|---|---|
| Ford GT-90 | **66 mm [M]** (hwcollectorsnews) | 38 g [E] | Wide, low supercar; good roll. |
| Porsche 959 | 64 mm [E] | 40 g [E] | Classic 1987 Larry Wood casting, metal body + metal base on some runs (heavier, ~45 g). |
| Chevy Stocker | 68 mm [E] | 42 g [E] | NASCAR-style body, plastic base. |
| Chevy 1500 | 72 mm [E] | 45 g [E] | Pickup — tallest CG, most rollover-prone. |
| Aeroflash | 70 mm [E] | 35 g [E] | Low fantasy racer, plastic base — likely the lightest and fastest. |

**Physics-usable mass range: 35–50 g [M-range], default 40 g [E].** A 25% mass spread across the five cars is a real and worthwhile differentiator in the sim: heavier cars carry more momentum through a crash but lose more to axle friction and are harder for the booster nip to accelerate.

---

## 6. FA-130-class motor and D-cell parameters

### Mabuchi FA-130RA — official datasheet table [M]

Source: `https://www.pololu.com/file/0J11/fa_130ra.pdf` (mirror of the Mabuchi PDF). Text extracted verbatim:

| Model | Op. range (V) | Nominal | No-load speed (r/min) | No-load current (A) | Max-eff speed | Max-eff current | Max-eff torque | Max-eff output | Stall torque | Stall current |
|---|---|---|---|---|---|---|---|---|---|---|
| **FA-130RA-2270** | 1.5–3.0 | 1.5 V | **9,100** | **0.20** | 6,990 | 0.66 | 0.59 mN·m (6.0 g·cm) | 0.43 W | **2.55 mN·m (26 g·cm)** | **2.20 A** |
| **FA-130RA-18100** | 1.5–3.0 | 3.0 V | **12,300** | **0.15** | 9,710 | 0.56 | 0.74 mN·m (7.6 g·cm) | 0.76 W | **3.53 mN·m (36 g·cm)** | **2.10 A** |
| FA-130RA-14150 | 1.5–4.5 | 3.0 V | 8,300 | 0.11 | 6,150 | 0.31 | 0.55 mN·m (5.6 g·cm) | 0.35 W | 2.11 mN·m (22 g·cm) | 0.90 A |

Physical [M]: body **Ø20.1 mm x 25.0 mm** (38.0 mm overall incl. shaft), shaft **Ø2.0 mm**, mounting holes on 12.3 mm centres, **mass 17 g**, metal brushes, rated output 0.2–2.5 W, listed application "Toys and Models: Motorized Toy".

### Derived electrical model [D]

Using the **-18100 (3 V nominal)** row, which is the closer match for a 4-cell toy:

- **Terminal resistance:** `R = V/I_stall = 3.0 / 2.10 = 1.43 Ω` **[D]**
- **Torque constant from stall:** `kt = T_stall / I_stall = 3.53e-3 / 2.10 = 1.68e-3 N·m/A` **[D]**
- **Back-EMF constant from no-load:** `ke = (V - I_0*R) / ω_0`, with `ω_0 = 12,300 rpm = 1288 rad/s`:
  `ke = (3.0 - 0.15*1.43) / 1288 = 2.786 / 1288 = 2.16e-3 V·s/rad` **[D]**
- **Note the inconsistency:** `ke` (2.16e-3) and `kt` (1.68e-3) should be equal in SI for an ideal motor. They differ by 29%, which is normal for a cheap brushed can motor — brush drop and iron/friction losses are folded into the datasheet endpoints. For a sim, **use `kt = ke = 1.9e-3` and add a constant friction torque `T_f ≈ 0.25 mN·m` [D]**; that reproduces both endpoints within ~10%.
- Same treatment for the **-2270 (1.5 V)** row: `R = 1.5/2.20 = 0.68 Ω`, `kt = 2.55e-3/2.20 = 1.16e-3`, `ke = (1.5 - 0.2*0.68)/952.9 = 1.43e-3 V·s/rad`. **[D]**

### Extrapolation to a 4-cell (6 V) pack [D + caveat]

4 x LR20 in series = **6.0 V nominal**, ~6.4 V fresh open-circuit **[D]**. That is **double** the FA-130RA's rated maximum. Two possibilities, and **neither is confirmed**:

- **(a)** The toy uses a higher-voltage 130-size variant (RE-140/RF-300 class, or an FA-130 wound for 6 V). Search results noted 3–12 V variants with 4,500–5,000 rpm at 3 V and 6,500–7,500 rpm at 6 V — i.e. a much slower, higher-torque winding. **[M, low-confidence source]**
- **(b)** The cells are wired **2S2P** (2 series x 2 parallel = 3 V at double capacity), which is common in D-cell toys precisely to run a 3 V motor for a long time. **Open question — resolve by opening the hub or reading the battery-compartment polarity diagram in the PDF.**

If you assume **6 V into a -18100 winding [D]**: `ω_0 = (6.0 - I_0*R)/ke ≈ 6.0/2.16e-3 ≈ 2,780 rad/s ≈ 26,500 rpm` no-load, `I_stall = 6.0/1.43 = 4.2 A`, `T_stall = 7.06 mN·m`. That current draw would sag the pack hard (see below) and cook the motor — another argument for (a) or (b).

**Booster nip surface speed [D]:** with a plausible **60:1 reduction [E]** and a **30 mm [E]** foam wheel, a 26,500 rpm no-load motor gives `26,500/60 = 442 rpm` at the wheel = `46.3 rad/s` = `46.3 * 0.015 = 0.69 m/s`. That is far too slow for the observed toy behaviour, so the real reduction is more like **8:1–15:1 [E]**, giving **2.8–5.2 m/s nip speed** — which brackets the 2.5–4.0 m/s estimated car speed nicely. **Model the booster as a velocity source with slip:** the nip drives the car toward `v_nip` with a force proportional to `(v_nip - v_car)`, saturating at the foam/car friction limit, and `v_nip` itself sags with battery state.

### Alkaline D cell (LR20 / ANSI-13A) [M]

Source: Energizer E95 datasheet.

| Quantity | Value | Tag |
|---|---|---|
| Nominal voltage | **1.5 V** | [M] |
| Open-circuit, fresh | 1.6–1.65 V | [E] |
| **Internal resistance, fresh** | **150–300 mΩ** | [M] |
| Internal resistance, ~half discharged | 400–700 mΩ | [E] |
| Internal resistance, near end of life | >1 Ω | [E] |
| **Capacity** | **~20,500 mAh** (low-drain rating; at a 1 A toy-motor draw expect **8,000–12,000 mAh [E]**) | [M] |
| Mass | **144 g** each; 4-cell pack **576 g [D]** | [M] |
| Chemistry / temp range | Zn/MnO₂, −18 °C to 55 °C | [M] |

**Pack model [D]:** `V_pack(t) = 4 * V_cell(SoC) − I * (4 * R_int)`. Fresh: `R_pack = 4 * 0.225 = 0.9 Ω`, which is **comparable to the motor's own 1.43 Ω** — so the pack is a first-order part of the dynamics, not a stiff supply. At a 1.5 A running draw the fresh pack sags `1.5 * 0.9 = 1.35 V`, i.e. **~21% of nominal [D]**. Half-flat cells (`R_pack ≈ 2 Ω`) sag `3 V` — the booster visibly slows down. **This is a genuinely fun thing to simulate:** the set gets slower over a play session, and cars stop clearing the crash zone.

**Runtime [D]:** at ~1.0 A average with an effective 10,000 mAh, ~10 hours of continuous running. The set is not battery-limited in any single play session.

---

## 7. Open questions and contradictions

1. **[BLOCKER] The track topology — one continuous circuit vs four independent loops.** Section 2, item 6. The "figure-eight" and "four looping sections" language leans toward four independent loops; the hypothesis says one circuit. **Resolve by opening the V2791 instruction PDF and looking at the assembly diagram.** Everything about lap logic, car spacing, and collision frequency depends on this.
2. **[BLOCKER] Are the curves banked?** No source either way. Physics says they must be somewhat (3.3 g lateral at plausible speeds), but "moulded raised outer wall" and "true bank" are different things to model. Box art / the instruction diagram will settle it.
3. **Track width: the brief said ~5.1 cm / 2 in. That is wrong.** Sources agree on **1.5 in / 38.1 mm outer, 1.25 in / 31.75 mm inner**. Fix this in the sim before anything else — it changes every scale relationship.
4. **4x D at 6 V vs a 3 V-rated motor.** The instruction sheet is unambiguous that there are 4 D cells; it does not say how they are wired. 2S2P (3 V, double capacity) is as likely as 4S (6 V). Section 6.
5. **Motor identity is entirely unverified.** FA-130 is an educated guess based on the size class and Mabuchi's own "motorized toy" application note. No teardown, no parts listing, no service bulletin found.
6. **Foam vs rubber nip wheels — unverified.** Also unknown: 4 wheels or 8, and their diameter.
7. **Gear-train direction.** Whether adjacent booster wheels co-rotate or counter-rotate determines which lane of each arm is inbound. Not documented anywhere found.
8. **5-pack year: 1999 vs 1998.** southtexasdiecast lists pack #21081 under 1999; some eBay listings for #21081 say 1998. Probably a 1998 tooling/copyright date on a 1999-released pack — the usual Hot Wheels ambiguity. Low stakes.
9. **The 1999 5-pack's per-car detail (wheels, base, window, interior) is entirely missing** because Fandom returned HTTP 402 on all four attempts. Section 5.
10. **No rolling-resistance or speed measurements were found.** Every number in §4's dynamics block is an estimate. If a real figure matters, the cheap experiment is: roll a car down a known-angle straight track section and time it over a fixed distance — 10 minutes with the real toy, and Stewart owns the track.
11. **Assembled footprint (29.13 in square) comes from a current-reissue listing, not from V2791's own packaging.** Same tooling lineage, so very likely identical, but not proven for the 2010 SKU.
12. **The Mattel service page and the wiki disagree on scale of contents**: Mattel says the set includes **1 car**; some bundle listings say 5 or 10. The 1-car figure is the V2791 base SKU; the multi-car versions are retailer bundles.
