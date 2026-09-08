# Criss Cross Crash simulation — design spec

Date: 2026-09-08. Author: Fable 5.1. Status: approved-by-default (Stewart asked
for plan + build without a review round; override anything here by editing it).

## 1. Goal
A single-page browser simulation of the 2010 Hot Wheels Criss Cross Crash set
(Mattel V2791) running the 1999 Criss Cross Crash five-pack. It must:
- model the drive train (4 D cells -> brushed DC motor -> gear train -> four foam
  booster wheels) so that load, battery sag and rpm are emergent, not scripted;
- model cars as rigid bodies with rolling wheels, guided by track walls, with
  rolling resistance, wall scrub, mass per casting, banked/raised curves;
- reproduce the real behaviour: five cars launched together pile up in the
  crash zone within seconds; a lone car laps reliably; cars occasionally stall
  short of a booster; a wider casting gets a harder shove;
- expose the physics: gauges (battery V, motor A, rpm, wheel surface speed,
  per-car speed at 1:64 scale), a tuning drawer (friction, foam stiffness,
  motor constants, gear ratio, battery health), and an x-ray view of the gear
  train spinning at the correct ratios;
- have a Showroom: turntable, close-ups, exploded view, collector card per casting;
- run at 60 fps on a laptop, ship as one HTML file with CDN-only externals so
  it can also be published as a Claude Artifact (strict CSP).

## 2. Non-goals
No multiplayer, no track editor, no photoreal materials, no downloaded assets
(all geometry procedural, liveries drawn on canvas textures). Sound is optional.

## 3. Stack
Three.js (ES module from jsdelivr) + `@dimforge/rapier3d-compat` (ES module
with inlined wasm) + vanilla JS/CSS. No bundler. Exact versions/URLs in
`docs/DEPENDENCIES.md`. Rapier `DynamicRayCastVehicleController` for cars,
with a "sled" fallback (cuboid body on a low-friction floor) behind a config flag.

## 4. Units and frame
cgs: cm, g, s, dyne, dyne.cm. g = 981 cm/s^2. Y up, +X east, +Z south, hub
centre at origin. Fixed physics step 1/240 s with an accumulator; render at RAF.

## 5. The set, as modelled

### 5.1 Hub (V2791)
A plus-shaped red plastic hub. Each arm carries **two lanes** side by side,
separated only by a thin divider, with a **foam wheel** standing between them
near the arm's outer end and protruding into both lanes. A single motor drives
one satellite gear; a central idler couples all four satellites so all four
foam wheels spin the **same direction** (seen from above). Consequence: on
each arm one lane is pushed *inbound* and the other *outbound*, and the four
inbound + four outbound lanes make a `#` in the middle with **four crossing
points**. This is the "eight-way booster".

With all wheels spinning counter-clockwise (from above):

| Arm | West lane (N/S arms) / North lane (E/W arms) | East lane / South lane |
|-----|-----------------|-----------------|
| N   | southbound, inbound  | northbound, outbound |
| S   | southbound, outbound | northbound, inbound  |
| E   | westbound, inbound   | eastbound, outbound  |
| W   | westbound, outbound  | eastbound, inbound   |

So the N-S lanes are at x = -L (southbound) and x = +L (northbound); the E-W
lanes at z = -L (westbound) and z = +L (eastbound), where L = `laneOffset`.
Crossing points at (+-L, +-L). Inside the crossing square (half-size
`crossHalf`) there are **no walls**: cars cross each other's lanes freely.

### 5.2 Curves ("tilted loops")
Four 270-degree right-hand curves, one per quadrant, each linking the outbound
lane of one arm to the inbound lane of the next arm clockwise:

S-out (west lane, heading S) -> SW curve -> W-in (south lane, heading E)
-> through hub -> E-out (south lane, heading E) -> SE curve -> S-in (east lane, heading N)
-> through hub -> N-out (east lane, heading N) -> NE curve -> E-in (north lane, heading W)
-> through hub -> W-out (north lane, heading W) -> NW curve -> N-in (west lane, heading S)
-> through hub -> S-out.

**One continuous circuit** through all four curves and all four crossing
points. Each curve is banked (up to `bankMaxDeg`) and rises to `curveLift` cm
at its midpoint (the "tilt"), returning to floor level at each end.

Geometry closes exactly when `curveRadius = hubHalf + straightLen - laneOffset`
(derived in 5.4). Defaults: hubHalf 14.5, straightLen 20, laneOffset 2.75 ->
curveRadius 31.75; footprint about 2*(laneOffset + 2*curveRadius) = 133 cm
square. RESEARCH.md may revise these; only `src/10-config.js` changes.

### 5.3 Lane cross-section
Inner width `laneWidth` 5.1 cm, wall height `wallHeight` 1.2 cm, wall
thickness 0.3 cm, floor thickness 0.3 cm. Floor and walls are **separate
colliders** (floor friction is low for sled mode; walls use `wallFriction`).

### 5.4 Lane path construction (src/30-track-layout.js)
A lane path is a list of segments; each yields `sample(s)` by arc length ->
`{p, t, n, up, bank, kind, seg}` where t = tangent, n = right-hand normal
(horizontal), up = banked up vector. Segment kinds: `straight(p0, p1)` and
`arc(center, r, a0, sweep, lift, bankMax)`. The circuit is built once from
config as ONE closed path with named milestones (`S-out`, `SW-curve`, `W-in`,
...) plus metadata: crossing points, booster zones (arm, lane, centre s,
along-lane half extent, wheel-side sign), and the four "start gates".

Derivation of the closure: the outbound west lane of the S arm is at x = -L
and ends at z = hubHalf + straightLen = D. A right-hand 270-degree arc of
radius R centred at (-L - R, D) ends at (-L - R, D - R) heading +X. The W
arm's inbound south lane is at z = +L and starts at x = -D. Equate:
D - R = L and -L - R = -D  =>  R = D - L.

### 5.5 Booster contact model (src/41-booster.js)
The foam wheel is **not** a collider. For each car whose chassis centre lies
within a booster zone (|s - s0| < `boostHalfLen`), compute:
- `foamGap` (config, 2.0 cm) = free distance between the wheel surface and the
  far wall; `squeeze = max(0, carWidth - foamGap)` (wider castings squeeze more);
- normal force `N = foamK * squeeze` (dyne); tangential capacity `Fmax = foamMu * N`;
- wheel surface speed `vw = omegaWheel * wheelRadius` along the lane tangent
  (the lane direction already encodes inbound/outbound);
- slip `dv = vw - v_car.t`; `F = Fmax * clamp(dv / slipVel, -1, 1)` applied at
  the centre of mass along t; also push the car toward the far wall with N so it
  hugs the wall (this is what keeps real cars tracking straight through a booster);
- load torque fed back to the drive train: `tau_load += F * wheelRadius`
  (summed over all cars and wheels, dyne.cm).

### 5.6 Electrical / drive train (src/40-electrical.js)
State: `omegaM` (motor rad/s), `Q` (charge used, C), `switchOn`.
Per step (dt):
- Battery: four alkaline D cells in series. Open-circuit `V0(Q)` falls
  linearly 1.55 -> 1.10 V per cell over `battCapacityC`; internal resistance
  `r(Q)` rises 0.15 -> 0.50 ohm per cell, scaled by `battHealth`.
- Motor (brushed DC): `I = (n*V0 - Ke*omegaM) / (Rm + n*r)` when on, else 0;
  `tauM = Kt*I - tauFric*sign(omegaM) - b*omegaM`.
- Gear: ratio `G` (motor:wheel), efficiency `eta`. Reflected load on the motor
  shaft: `tauLoadM = tauLoadW / (G*eta)`. Effective inertia `Jeff = Jm + 4*Jw/G^2`.
- `omegaM += (tauM - tauLoadM)/Jeff * dt` (clamped >= 0); `omegaWheel = omegaM / G`.
- Telemetry: V (terminal), I, rpmMotor, rpmWheel, surface speed cm/s, Pin, Pout.
Constants are stored in SI in config and converted to cgs on read
(1 N.m = 1e7 dyne.cm, 1 kg.m^2 = 1e7 g.cm^2).

### 5.7 Cars (src/42-vehicle.js)
Each car: dynamic rigid body with a cuboid chassis collider (length, width,
height, mass from the catalog; centre of mass lowered by `comDrop`) and a
`DynamicRayCastVehicleController` with four wheels (wheelbase, track, wheel
radius per wheel type). Suspension: very stiff, short rest length. No engine
force, no steering: the walls steer. Per-step forces: rolling resistance
`F = -crr(wheelType) * m * g * t_hat` when moving, side friction from the
controller. Sled fallback: same body, no controller, floor friction = crr.
Car API: `spawn(milestoneName)`, `placeAt(s, lateral)`, `lift()`, `drop()`,
`nudge(impulse)`, `telemetry()` -> {speed, s, lateral, stalled, laps, crashed}.
Stalled = |v| < 2 cm/s for 0.5 s while not inside a booster zone.

### 5.8 Sim loop and events (src/43-sim.js)
`HW.sim.create()` builds the Rapier world (gravity -981 Y), track colliders,
booster zones, cars. `HW.sim.step(dt)` = electrical -> boosters -> car forces
-> `world.step(eventQueue)` -> drain contact events -> crash detection
(car-car contact with closing speed > `crashSpeed`, or a car leaving the track
envelope) -> lap counting -> telemetry snapshot. Also `reset()`,
`lineUpFive()` (staggered spacing so they launch cleanly), `setSwitch(on)`.
`HW.bus` (tiny pub/sub) carries `crash`, `stall`, `lap`, `libs-ready`,
`telemetry` events to the UI/renderer.

### 5.9 Rendering (src/50-render-scene.js, src/51-render-cars.js)
Scene: warm indoor floor plane, soft key + fill lights, shadow map, orange track
ribbons built from the same lane samples as the colliders (31-track-mesh.js
returns both), red hub body, translucent hub (x-ray) with an animated gear
train (pinion, idler, four satellites, four foam wheels) rotating at the real
ratios from electrical telemetry. Cars: procedural low-poly bodies (box +
cabin wedge + wheels), liveries via canvas textures, metallic paint, window
tint, base colour from the catalog. Camera presets: Overview, Crash zone,
Chase (follow selected car), Booster close-up, Gear train x-ray.

### 5.10 UI (src/60-ui.js)
Left panel: Booster switch (big toggle), Line up all five, Reset, Nudge
(selected car), car picker (five chips; click a lane to place facing the lane
direction, click a car to lift). Gauges: battery V, motor A, motor rpm, wheel
surface speed, selected car scale speed (cm/s * 64 -> km/h), crash counter,
laps. Tuning drawer: sliders bound to `HW.config` with live re-apply (cheap
ones) or "rebuild" (geometry). Showroom tab: turntable, wheel and underside
close-ups, exploded view, collector card per casting.

## 6. Interfaces (the contract between files)
```
HW.config            // 10-config.js: flat object of tunables; HW.config.reset()
HW.bus               // 00-namespace.js: on(evt,fn), off(evt,fn), emit(evt,data)
HW.units             // 00-namespace.js: G, NmToDyneCm, kgm2ToGcm2, rpmToRad, radToRpm
HW.catalog           // 20-catalog.js: [{id,name,year,color,wheelCode,base,tint,interior,
                     //   massG,lengthCm,widthCm,heightCm,wheelbaseCm,trackCm,wheelRadiusCm,crr,livery}]
HW.track.build(cfg)  // 30-track-layout.js: -> track {path, milestones, crossings, boosters, gates, bounds}
track.path.length; track.path.sample(s) -> {p,t,n,up,bank,kind,seg}
track.path.project(p) -> {s, lateral, dist}     // nearest arc length (coarse table + refine)
HW.trackMesh.build(track, cfg) // 31: -> {floor:{verts,indices}, walls:{verts,indices}, hub:{...}}
HW.electrical.create(cfg) // 40: {step(dt, loadTorqueDyneCm), setSwitch(on), telemetry(), reset()}
HW.booster.create(track, cfg) // 41: {zones, apply(cars, omegaWheel, dt) -> loadTorqueDyneCm}
HW.vehicle.create(world, track, entry, cfg) // 42: car object (5.7)
HW.sim               // 43: create(), step(dt), reset(), lineUpFive(), setSwitch(on), cars, telemetry, track, world
HW.render            // 50: init(canvas), update(dt, telemetry), setCamera(name), xray(bool), pickLane(ndc)
HW.renderCars        // 51: buildMesh(entry) -> THREE.Group; sync(car)
HW.ui                // 60: init()
HW.main              // 90: boot (waits for hw:libs-ready), RAF loop with accumulator
```

## 7. Testing
- `spike/loader.html` proves the CDN loads.
- `tools/selftest.html` (T17): checks run in the page and printed: path closes
  (|start - end| < 0.01 cm), curve-radius formula holds, every booster zone
  lies on a lane, electrical no-load rpm within 5 % of datasheet, a lone car
  placed at S-out completes a lap within 15 s.
- Manual: five-car pile-up within ~10 s; nudge un-sticks a stalled car; gauges
  move when cars enter boosters.

## 8. Assumptions to surface to Stewart
Car masses 40-47 g, motor constants FA-130-class, foam stiffness, curve lift
5 cm and bank 20 degrees, hub scaled from photos (~29 cm across, foam wheel
diameter 6.6 cm), lane offset 2.75 cm, straight 20 cm. Tampos are reconstructions.
