# The build prompt (improved)

This is the prompt we are answering. It is the YouTube author's brief, reverse-engineered
from his result summary and improved with what the research turned up. Paste it into a fresh
session together with `docs/RESEARCH.md`, `docs/V2791-instructions.png` and
`docs/DEPENDENCIES.md` and you have everything the original author had, plus the parts he
got wrong.

---

Build a browser simulation of the 2010 Hot Wheels **Criss Cross Crash** track set (Mattel
item **V2791**) running the 1999 **Criss Cross Crash 5-Pack** (pack #21081: Porsche 959,
Aeroflash, Ford GT-90 in yellow, Chevy Stocker, Chevy 1500). Three.js + Rapier
(`@dimforge/rapier3d-compat`, wasm inlined), no bundler, one HTML file with CDN-only
externals so it can be published as a Claude Artifact under its strict CSP.

**Ground it in the real set, not in guesses.** The official instruction sheet
(service.mattel.com, V2791-0920) shows the layout: a plus-shaped red hub with four
booster modules; from each module two straight pieces leave at about ±45° and are joined
by a large ~270° curved piece that is **tilted up onto a track support** at its far end.
So each arm has its own lobe, lanes run straight through the hub, and there are **two
independent closed circuits** (north–south and east–west) that cross in the middle at
**four crash points**. It is *not* one continuous circuit through all four loops. The
hub takes **4 × D cells** and has a plain on/off slide switch. Standard Hot Wheels track
is **31.75 mm between the walls** (1.25 in), not 2 in; 1:64 cars are 57–89 mm long,
28–32 mm wide, 25–50 g.

**Model the physics, don't script it:**
- Battery pack with open-circuit voltage and internal resistance that depend on state of
  charge → brushed DC motor (back-EMF, torque constant, resistance, friction) → gear
  train → four foam booster wheels sharing one shaft train (so every launch loads the
  same motor and flywheel). More cars in the boosters must mean more current, lower
  rpm, and weaker launches, visible on gauges.
- Boosters as a **geometric squeeze**: the foam wheel sits between the two lanes of an
  arm and protrudes into both; a car is pressed against the far wall with a normal force
  proportional to how much wider it is than the free gap, and driven by foam friction
  saturating with slip. Wider castings get a harder shove. Launches are flywheel-driven:
  the wheel bogs down as a car passes and the motor recovers between cars.
- Cars as rigid bodies with four rolling wheels (raycast vehicle), per-wheel-type
  rolling resistance, realistic plastic-on-plastic wall friction (~0.1), masses per
  casting, centre of mass low, rounded corners. Walls steer the car; there is no
  steering input.
- Banked, lifted curves (the lobe is a circle in a tilted plane, so it climbs, banks at
  the apex, and descends), rigid car–car collisions in the crossing, crash detection with
  closing-speed threshold, stall detection, lap counting.
- Units: cgs internally (cm, g, s, dyne). 240 Hz fixed step.

**Must reproduce the real behaviour:** five cars launched together pile up in the crash
zone within seconds; a lone car laps reliably; a car occasionally stalls short of a
booster or flies off a curve; "Nudge" un-sticks a stalled car; the motor bogs when you
switch on with cars sitting in the nips.

**UI:** big booster switch, Line up all five, Reset, Nudge, click a lane to place a car
facing the lane's direction, click a car to lift it. Gauges: battery V, motor A, motor
rpm, foam-wheel surface speed, selected car's speed and 1:64 scale speed, crashes, laps.
A tuning drawer exposing friction, foam stiffness, motor constants, gear ratio and
battery health, live. Camera presets including an x-ray "Gear train" view of the hub
mechanism spinning at the right ratios. A Showroom tab with turntable, wheel and
underside close-ups, an exploded view, and a collector card per casting (name, year,
wheel code, base, tint, mass).

**Say what is estimated.** Hub dimensions, motor class, foam stiffness, curve lift and
wall heights are engineering estimates unless a source gives them; list them.

---

## What the original author got wrong (from the research)
- Track width 5.1 cm → it is 3.175 cm inside. Every scale relationship changes.
- "One continuous circuit through four tilted loops" → two independent circuits; each
  lobe returns to its own arm. Cars on the N–S circuit only ever meet E–W cars at the
  four crossing points.
- A 130-size motor at 4.4:1 cannot drive four foam nips from four D cells; the numbers
  only work with a 280-class motor (or a much higher ratio and a heavy flywheel).

## Traps we hit building it (so you don't)
See `HANDOFF.md` "Lessons". Short version: right-handed car basis (−Z forward), wall
colliders as solid rounded boxes not a thin trimesh, bend radius ≥ 12 cm or a 7 cm car
wedges, never `setEnabled(false)` a vehicle body in rapier 0.20, suspension travel below
rest length, and apply the nip's sideways push low on the body or the car launches on two
wheels.
