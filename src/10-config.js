// 10-config.js — every tunable number in one place. cgs unless the key says SI.
// Geometry grounded in docs/RESEARCH.md + the V2791 instruction sheet
// (docs/V2791-instructions.png). ESTIMATE where noted.
(function (HW) {
  const DEFAULTS = {
    // ---- simulation ---------------------------------------------------------
    physicsHz: 480,              // a car at 400 cm/s moves 0.83 cm per step here, against 0.36 cm of
                                 // free play each side of a 3.175 cm lane; at 240 Hz it is 1.7 cm and
                                 // the solver spends every step recovering penetration.
    maxSubsteps: 24,             // must cover physicsHz / worst frame rate (480 / 25 fps)
    lengthUnit: 1,               // Rapier world units per metre, used to normalize the solver tolerances
                                 // (prediction distance, allowed linear error). "We are in cm so it should
                                 // be 100" is WRONG here: 100 gives an allowed linear error of 0.5 cm in a
                                 // 3.175 cm lane, so cars sink into the floor and walls and cannot launch.
                                 // Measured: 1 is best, 2-3 usable, >=10 unusable.
    solverIterations: 8,
    ccdSubsteps: 4,
    vehicleMode: 'raycast',      // 'wheels' | 'raycast' | 'springs' | 'sled'
                                 // Rapier's controller loses 0.2 g on a curve and 0.5 g against a
                                 // wall no matter how it is configured (see 44-wheel-model.js for
                                 // the measurements), and that is what caps the loop tilt. 'wheels'
                                 // is our replacement and has the right energy budget but is NOT yet
                                 // stable -- 100 % of cars leave the track. 'sled' likewise. Until
                                 // one of them is finished, 'raycast' is the only usable model.

    // ---- track geometry (cm) -------------------------------------------------
    laneWidth: 3.175,            // MEASURED: 1.25 in running clearance
    wallHeight: 0.9,             // ESTIMATE 8-10 mm (hub lanes, straights)
    lobeWallHeight: 4.5,         // MUST exceed the tallest casting (2.4) + carClearance: at 20.5 cm radius and
                                 // 300 cm/s the lobe pulls ~4.5 g, the car rides the OUTER wall, and a wall
                                 // shorter than the car lets the top corner swing over it and the car tumbles out.
    wallThick: 0.3,
    floorThick: 0.4,
    floorSolid: true,            // collide against the floor SLAB (a closed floorThick prism) rather
                                 // than the bare top ribbon. A zero-thickness trimesh lets a car that
                                 // gets briefly airborne come down THROUGH the track.
    wallSegLen: 1.5,             // cm: length of each box collider along a wall run
    wallInset: 0.08,             // cm: wall collider faces sit this far outside the visual wall (anti-snag)
    wallRound: 0.1,              // cm: rounding radius of wall box colliders
    wallRampLen: 7.0,            // cm over which the wall height changes between the shallow hub lane and the
                                 // deep curve channel. A hard step leaves an end cap in the lane that spears cars.
    wallMinRun: 0.9,             // cm: wall runs shorter than this are deleted outright. Two openings that
                                 // nearly meet (the foam wheel slot and the crossing gap are 0.66 cm apart)
                                 // leave a sliver whose square end cap stands in the lane and stops a car
                                 // dead. Runs between this and 2*wallFlareLen are kept but RECESSED.
    wallFlareLen: 2.2,           // cm: flared lane mouth at each end of a wall run (crossing square, foam
    wallFlareDeg: 22,            // deg: wheel slot). Without it the square end cap of the wall that RESTARTS
                                 // after the crossing spears any car that drifted >0.44 cm off the lane centre.
    carRound: 0.15,              // cm: rounding radius of car chassis colliders
    hubHalf: 16.0,               // ESTIMATE: hub arm length from centre, so ~32 cm across. Stewart's
                                 // photos scale the red hub to 30-32 cm and this is also worth 0.4 of
                                 // a lap over the old 13.0: the extra straight between the nip and the
                                 // junction turn is where the car does its cornering, and moving the
                                 // turn outward is what makes a 40 deg ring reachable at all.
    laneOffset: 2.5,             // ESTIMATE: lane centreline distance from arm axis inside the hub
    boosterR: 8.5,               // ESTIMATE: foam wheel axis distance from hub centre
    foamGap: 2.0,                // free gap wheel-surface to far wall; cars are 2.2-2.6 wide

    // ---- lobes: four identical tilted rings (see the header of 30-track-layout.js) -----------
    // The instruction sheet's CONTENTS page lists 4 x one moulded ~270 deg arc and 4 x one
    // adjustable TRACK SUPPORT ladder, so all four lobes are the SAME PART and only the tilt
    // differs. A lobe is a flat circle tilted about the horizontal chord through its two ends;
    // everything else (junction radius, hub->chord gap, chord height, plan splay) is DERIVED
    // from lobeRadius + straightLen + the tilt, so the geometry cannot drift out of closure.
    lobeRadius: 14.0,            // radius of the moulded arc. Raised to 19 on 2026-09-11 and PUT BACK
                                 // on 2026-09-13, because the evidence for 19 was an n=30 sample on a
                                 // single set of start offsets ("0.8 of a lap better; 18 and 20 are
                                 // both worse and 22 collapses") and T24 then proved that exact class
                                 // of result unreliable -- a 1.6x "win" that survived being repeated
                                 // vanished on different offsets. Re-measured at n=120 across TWO
                                 // independent offset sets, R 16 is nominally BETTER, in both:
                                 //   R 19   1.37 / 1.43 mean laps, lap1% 63 / 52
                                 //   R 16   2.07 / 1.77 mean laps, lap1% 70 / 52
                                 // That is ~1.3 SE, so it does not prove 16 is better either. What it
                                 // does is remove the reason for 19. 16 is the value the instruction
                                 // sheet scales to, its 116 cm footprint matches the 105-110 cm in
                                 // Stewart's photos where 19 gave 134, and tools/apex.mjs says it also
                                 // crests better (worst car over the apex 52-84 cm/s against 12-31).
                                 // R does set the junction turn's radius (20.5 cm at 16 against 25.9
                                 // at 19) and that bend is expensive -- but T24 showed the junction
                                 // turn is not what decides whether a car laps.
                                 // 2026-09-13, T27: 14, paired with lobeSweepDeg 248. R and the
                                 // sweep both feed rt = (R sin(phi) - L - S sin b)/(1 - cos b), so
                                 // they have to be chosen together: the shorter sweep widens the
                                 // junction turn so much that R can come DOWN, which buys back the
                                 // footprint and the circuit length and lowers the apex as well.
                                 // ORIGINAL NOTE: radius of the moulded arc. Scaled off the instruction
                                 // sheet against the known 3.81 cm track width and cross-checked
                                 // against the ~105-110 cm assembled footprint from Stewart's photos.
                                 // Bend-radius floor is ~12 cm (a 7 cm car needs w + L^2/8R < lane).
    lobeSweepDeg: 248,           // how far round the moulded arc goes. Hard-coded at 270 until T27,
                                 // and the strongest lever the layout has on the JUNCTION TURN --
                                 // the stretch T22 measured as the most expensive on the circuit and
                                 // T26 watched cars leave the track in, at 5.3 g and the highest
                                 // speed of the lap. A shorter arc turns the lane through less, so
                                 // each junction bend turns through less, and
                                 // rt = (R sin(phi) - L - S sin b)/(1 - cos b) collapses fast:
                                 //   sweep  300   285   270   255   240   225
                                 //   beta  66.1  59.6  52.5  45.0  37.0  28.4  deg
                                 //   rt     7.7  12.9  20.5  32.3  53.4  98.1  cm
                                 // The apex barely moves across all of that (20.5 -> 20.6 cm), so
                                 // unlike every other geometry lever this one does NOT trade against
                                 // the crest -- which is what T27 was looking for. It is paid for in
                                 // footprint: hub -> chord gap 16.9 -> 23.6 -> 32.9 cm, though at 248
                                 // with lobeRadius 14 that comes back out again (121 cm against 116).
                                 // MEASURED at n=120 over two independent offset sets. Every
                                 // shorter-sweep config beat 270 in BOTH sets on mean laps -- six
                                 // paired comparisons, all the same direction, which is a sign test
                                 // at p = 0.016 and is the first structural result on this project to
                                 // survive the T24 trap. Which MEMBER of the family is best is not
                                 // resolvable: pooled lap1% is 61 (270/R16), 65.5 (248/R14),
                                 // 62.5 (240/R15), all inside ~1 SE of each other.
                                 // 248 with R 14 is chosen because it takes the junction turn from
                                 // 20.5 to 33.9 cm and the apex from 20.1 to 18.0 while leaving the
                                 // circuit (297 vs 300 cm) and footprint (121 vs 116) alone.
                                 // 240 with R 15 measures better still on mean laps (2.23 vs 1.60)
                                 // and on the five-car pile-up (21.9 crashes per 30 s against 19.3),
                                 // but costs 19 % footprint and 12 % circuit for it.
    loopArms: 'NE',              // which arms are steeply tilted rings. The sheet has the two rings
                                 // ADJACENT, so each circuit gets one ring and one shallow sweep.
    // TILT vs FIDELITY, measured (all mean laps per 25 s over a 20-run ensemble, hubHalf 16). The instruction sheet has the two rear lobes standing up as rings
    // and the two front ones low and wide, and the layout renders that correctly at 48/16 (open
    //   index.html#cfg=%7B%22loopTiltDeg%22%3A48%2C%22sweepTiltDeg%22%3A16%7D
    // and look). Loop tilt against laps, everything else at the shipped defaults:
    //     30 -> 1.20    36 -> 1.00    40 -> 0.85 (and 0 % off-track)    44 -> 0.50    48 -> 0.05
    // There is a CLIFF between 44 and 48: that is where the ring's apex passes what the launch can
    // clear, and cars crest it at ~30 cm/s and roll back down. What sets the cliff is the vehicle
    // model's parasitic loss, not the geometry -- see the measurements in 44-wheel-model.js.
    // 40 is shipped: it is the steepest tilt that still laps, it is the only setting measured with
    // NO off-track excursions at all, and it reads unmistakably as 2 rings + 2 sweeps (ring apex
    // 22 cm against sweep apex 10 cm). Drop to 30 for ~40 % more laps and a flatter-looking set.
    loopTiltDeg: 40,             // ESTIMATE: the rear "loops". A wall-of-death ring, not a loop-the-
                                 // loop: at 300 cm/s and R=16 the car pulls 5.7 g against 1 g, so it
                                 // rides the outer wall. Above ~65 deg a slowing car falls out - which
                                 // is exactly how the real toy fails, so keep it near the edge.
    sweepTiltDeg: 16,            // ESTIMATE: the front "sweeps". Gives a ~10.5 cm apex, matching the
                                 // 10-16 cm scaled off Stewart's eBay photos.
    straightLen: 1.0,            // ESTIMATE: the short A-H connector between the junction turn and
                                 // the arc. Raising it shrinks the derived junction radius.
    turnEaseFrac: 0,             // fraction of the JUNCTION TURN at each end over which its curvature
                                 // ramps in and out, instead of stepping. At 0 the turn is a plain
                                 // circular arc entered straight off the flat hub, so lateral
                                 // acceleration jumps from 0 to ~3 g inside one 0.25 cm sample --
                                 // the same defect `rampPow` fixed in the vertical plane. It is a
                                 // trade, not a free win: the same total turn inside the same
                                 // lateral budget means the eased middle must be TIGHTER, so the
                                 // minimum radius falls roughly as (1 - ease) and peak g rises by
                                 // the same factor. Closure is re-solved either way (SPEC s5.4
                                 // generalises from rt to the turn's length), so the geometry
                                 // cannot drift.
                                 // MEASURED AND REJECTED, 2026-09-12. Entry-only easing looked like
                                 // a clean win on the first n=60 sample -- 1.37 -> 1.83 -> 2.25 ->
                                 // 1.58 mean laps at ease 0 / 0.28 / 0.35 / 0.42, with the best run
                                 // doubling 8 -> 16 -- and it is NOISE. A second n=60 sample on a
                                 // DIFFERENT set of start offsets gives 1.43 against 1.50, and the
                                 // best run flips the other way (15 against 8). Pooled over all 120
                                 // runs it is 1.40 against 1.88, about 1.2 standard errors, and
                                 // under this project's own rule (only act on half-or-double) that
                                 // is not a result. It costs footprint 134 -> 144 cm and circuit
                                 // 349 -> 369 cm, so 0 it is.
                                 // tools/wall.mjs had already said the same thing about the energy:
                                 // 0.49-0.55 g through the turn across the whole sweep, SEM 0.02.
                                 // So the curvature STEP is real and it is not what kills cars.
                                 // BEWARE: the two n=60 batches that "confirmed" 2.25 used the same
                                 // 12 start offsets, so they were the same 60 runs re-run
                                 // deterministically. Reproducibility is not independence. Vary the
                                 // `backs` array, not just the batch.
                                 // SYMMETRIC easing is worse again above 0.10 (1.80 at 0.20, 1.43 at
                                 // 0.40) because it buys smoothness with a tighter middle.
    turnEaseOutFrac: 0,          // easement at the turn's far end; null = same as turnEaseFrac.
                                 // The two ends are different problems: the entry meets the flat hub
                                 // at launch speed, the exit meets a 1 cm straight and then the
                                 // lobe's own curvature the other way round, with the car slower.
                                 // Easing only the entry costs half the minimum-radius penalty --
                                 // in fact almost none of it: the turn just gets LONGER (minimum
                                 // radius 25.88 -> 25.47 cm at ease 0.35). Easing the exit as well
                                 // measures worse (1.77 against 3.13 at n=30).
    rampPow: 4.0,                // exponent of the ramp's height profile y = y0 * t^rampPow. At 2 the
                                 // vertical curvature is constant, so it STEPS from 0 to 2.4 g the
                                 // instant the car leaves the flat hub; at 3+ it starts at zero, and
                                 // the chord (and so the whole lobe) also sits lower.
    rollBlendCm: 8.0,            // cm of ARC (each end) that shares the roll-in with the ramp. This is
                                 // also how long the BANK takes to arrive, which is why it is now 8
                                 // and not 36: at 36 the lobe is unbanked for the first third of the
                                 // arc, which is exactly where the car is fastest and needs it most
                                 // (1.40 laps at 14 and at 20, against 1.15-1.50 at 8; and the old
                                 // 36 is what made T21's banking measure catastrophic). It does
                                 // violate the warp rule below -- tools/audit.mjs reports 3.8 deg/cm
                                 // against a 2.5 limit -- and the cars do not care, which is the
                                 // third independent result saying warp is not the binding
                                 // constraint. ORIGINAL NOTE: a rigid
                                 // car can only follow ~ suspTravel/(trackCm * wheelbase) of surface
                                 // warp -- about 2.6 deg/cm -- so the tilt needs ~17 cm per 45 deg and
                                 // the ramp alone is not long enough. The centreline still lies exactly
                                 // on the tilted circle; only the ribbon twists, as a real connector does.
    bankBlendCm: 30.0,           // cm of arc at each end over which the banked channel eases in from
                                 // flat. Must be generous: the bank is a twist on top of the tilt
                                 // roll, and the two together must stay under the ~2.5 deg/cm of
                                 // surface warp a rigid four-wheel car can follow.
    lobeBankDeg: 30,             // Rotation of the lobe's SURFACE about the tangent, toward the
                                 // circle's centre. This is the single most important number in the
                                 // layout, because a flat ribbon lying in a tilted plane cannot
                                 // corner AT ALL: the centre of the circle is in the plane, so the
                                 // direction the car must be pushed lies in the plane, and the
                                 // surface normal is perpendicular to it. Dot product zero. At
                                 // bank 0 every one of the 2.5-5.7 g is handed to the side wall,
                                 // which is why the measured drag in a curve is 0.3-1.1 g and is
                                 // insensitive to every friction coefficient (it is not friction;
                                 // it is a box being shoved round a corner by a wall).
                                 //   0 deg  = flat ribbon in a tilted plane (what a racetrack is)
                                 //  90 deg  = a genuine LOOP: the car rides the INSIDE of the ring
                                 //            and the FLOOR supplies v^2/R, as the instruction
                                 //            sheet shows (cars are drawn inverted at the apex).
                                 // In between is a cone -- a banked channel. At bank b the surface
                                 // holds the corner without the wall while v^2/R > g*(component of
                                 // gravity along the surface), and at the apex of a ring tilted by
                                 // `tilt` a full loop needs only v^2 > g*R*sin(tilt).
                                 // MEASURED, n=20-30, 25 s, each batch carrying its own baseline:
                                 //   bank  0  0.73-0.80 laps   bank 25  1.40   bank 30  1.10-1.50
                                 //   bank 35  1.90 (but 20 % off-track)        bank 60  0.15
                                 //   bank 90  0.00  -- a full loop needs v^2 > g R sin(tilt) all the
                                 //     way round and these cars cannot hold the inside of the barrel
                                 //     at the apex, so they slide down it. 25-35 is the plateau.
    lobeBankApexDeg: null,       // bank at the ARC's apex; null = same as lobeBankDeg (a plain cone).
                                 // The bank that holds a corner without the wall is atan(v^2/(R g)),
                                 // and v around a lobe runs ~250 cm/s at the ends down to ~100 at the
                                 // apex -- 76 deg against 27 deg. One angle cannot serve both, so the
                                 // arc eases from `lobeBankDeg` at the ends to this at the apex.
    turnBankDeg: 0,              // bank of the JUNCTION TURN, the ~20 cm radius bend between the hub
                                 // gate and the lobe. It is taken at the highest speed of the lap
                                 // (5.4 g) and measures 0.45-0.64 g of drag with every friction term
                                 // in the model turned OFF, which makes it the most expensive stretch
                                 // on the circuit. It bends the opposite way to the lobe, so the sign
                                 // is handled in the layout: this number is a positive magnitude.
    turnBlendCm: 6.0,            // cm from the hub gate over which the junction turn's bank eases in.
                                 // The gate itself must stay flat: it meets the hub's flat lane.
    lobeBankProfile: 'cone',     // 'cone' = constant bank over the whole arc (a true cone about the
                                 // circle axis: zero twist, and banked where the car is FASTEST).
                                 // 'centre' = the 2026-09-10 schedule that eased the bank to zero at
                                 // both joints; it measured monotonically worse and this is why.

    // ---- foam booster ---------------------------------------------------------
    foamK: 1.2e6,                // dyne/cm foam nip stiffness: ~5.4 N at 0.45 cm squeeze (ESTIMATE)
    foamMu: 0.7,                 // foam-on-paint friction
    slipVel: 30,                 // cm/s: slip speed at which foam friction saturates
    boostExtra: 1.2,             // cm: contact zone half-length beyond the car half-length
    boostPushFrac: 0.2,          // fraction of the nip normal force that shoves the car into the far wall
    boostPushY: 0.0,             // cm above the c.o.m. where the nip's sideways push acts. 0 = through the
                                 // c.o.m. = no roll couple. Anything below the c.o.m. spins the car up.
    boostLatDamp: 120,           // 1/s: lateral velocity damping inside the nip, per gram of car. The foam
                                 // is compliant and the far wall reacts the squeeze, so the car should
                                 // SETTLE against the wall, not be accelerated into it. Terminal lateral
                                 // speed in the nip is roughly push/(mass*boostLatDamp).
    boostYawDamp: 40,            // 1/s: yaw damping in the nip, same reasoning. The foam grips the
                                 // whole side of the casting, so a car cannot turn inside the nip.
                                 // It must leave straight: the crossing square is 8.8 cm with no
                                 // exit walks the car through the crossing gap. OFF by default: it
                                 // works (cars keep 40 % more speed at s=270) but the extra speed
                                 // then pushes them over the lobe wall -- 87 % leave the track vs 7 %.
                                 // RE-MEASURED 2026-09-11 and now ON: with a lobe that can actually
                                 // hold a fast car (T23) the extra speed is kept instead of thrown
                                 // away -- 2.30 mean laps against 1.87 with it off, n=30, and the
                                 // stall rate drops 30 % -> 20 %, because most stalls were cars that
                                 // left a nip crooked and died in the junction turn. This is the
                                 // second result this session that was rejected for the right reason
                                 // at the time and is simply wrong now.

    // ---- drive train (SI in, converted on read) -------------------------------
    cells: 4,
    cellV0Fresh: 1.60, cellV0Dead: 1.10,     // V open-circuit vs state of charge
    cellRFresh: 0.10, cellRDead: 0.80,       // ohm per cell. 0.22 is a mid-life D cell; 0.10 is a
                                             // fresh alkaline D, and the pack resistance is what
                                             // decides whether FIVE loaded nips stall the motor.
    battCapacityAh: 10.0,                    // effective at ~1 A drain
    battHealth: 1.0,                         // multiplies cell resistance (1 fresh, 3 tired)
    battUsedFrac: 0.0,                       // initial state of discharge 0..1
    // Motor: 280-class brushed DC (a 130 cannot drive four foam nips from 4 D cells). ESTIMATE.
    motorKe: 4.5e-3,                         // V.s/rad  -> no-load ~13,500 rpm at 6.4 V
    motorKt: 4.2e-3,                         // N.m/A   (slightly below Ke: brush/iron losses)
    motorR: 0.6,                             // ohm. Was 1.2. Nothing measures the real motor, and
                                             // the toy demonstrably drives four or five cars, while
                                             // at 1.2 ohm five loaded nips bogged it from 11,388 to
                                             // 5,687 rpm -- which drops the foam surface below the
                                             // ~220 cm/s a car needs just to crest the ring, so the
                                             // whole set stalls. Deliberate: 0.6 with a fresh pack
                                             // takes the five-car game from 3.0 crashes and nothing
                                             // moving to 13.8 crashes and cars still circulating,
                                             // and costs the LONE car nothing measurable
                                             // (2.07 laps against 2.30, inside the noise band).
    motorFric: 6.0e-4,                       // N.m coulomb friction (I0 ~ 0.15 A)
    motorB: 3.0e-8,                          // N.m.s viscous
    motorJ: 2.5e-7,                          // kg.m^2 rotor + pinion (ESTIMATE)
    gearRatio: 6.5,                          // motor turns per foam-wheel turn (ESTIMATE); sets the ~400 cm/s
                                             // no-load foam surface speed, i.e. the launch speed ceiling
    gearEff: 0.85,
    foamWheelMassG: 40,                      // per wheel incl. its gear, flywheel inertia (ESTIMATE, launch-limiting)

    // ---- cars ------------------------------------------------------------------
    comDrop: 0.35,               // cm: lower the centre of mass below the chassis centre
    carClearance: 0.3,           // cm: chassis floor above the track at static rest
    suspRest: 0.6,               // cm
    suspStiffness: 3500,         // Rapier units (force = k * compression * chassis mass); stiff like a real casting
    suspCompression: 10.0,
    suspRelaxation: 12.0,
    suspTravel: 0.45,            // cm (must stay below suspRest or Rapier NaNs)
    suspMaxForceMult: 10.0,       // per-wheel suspension force cap, in multiples of the car's STATIC per-wheel
                                 // load. Rapier/Bullet divide by dot(contactNormal, -rayDir); once a car rolls,
                                 // that term explodes and an uncapped wheel launches the car vertically.
    // ---- 'wheels': chassis on four low-friction feet, contacts solved by Rapier -----
    footRadius: 0.40,            // cm. Big enough to survive contact at 300 cm/s; the feet are then
                                 // moved inboard automatically so they stay inside the chassis width
                                 // and the WALLS are met by the body, not by a foot.
    footFrictionMult: 1.0,       // multiplies the casting's crr to get the foot friction

    // ---- 'springs': explicit raycast suspension (vehicleMode 'springs') ------------
    wheelStaticComp: 0.12,       // cm of suspension compression under the car's own static weight.
                                 // Sets the spring rate: k = m*g / (4 * wheelStaticComp), so every
                                 // casting sits at the same ride height whatever it weighs.
    wheelDampRatio: 0.5,         // fraction of critical damping on that spring
    wheelBumpStop: 6,            // how many times stiffer the wheel gets past suspTravel. A die-cast
                                 // car's wheel is rigid; this is where that shows up.
    wheelGrip: 0.35,             // lateral friction coefficient at the contact patch. This is the
                                 // ONLY lateral loss in the model, and it is exactly mu*N*slip.
    wheelLatRelax: 0.35,         // fraction of the lateral contact velocity cancelled per step.
                                 // 1.0 is a one-step constraint and is too stiff to apply as an
                                 // explicit force: it pumps the roll mode until the car flips.
    wheelRollInfluence: 0,       // where the lateral force acts: 0 = at the c.o.m. height (no roll
                                 // couple at all), 1 = at the contact patch. Same knob as Bullet's
                                 // rollInfluence, and it has to be 0 here. Measured with
                                 // tools/wheelprobe.mjs: at 0.15 the four wheel compressions
                                 // alternate left-right every step and grow from +-0.01 to +-0.2 cm
                                 // in 60 steps, the loads swing 0 to 7.6x static, and the car is
                                 // thrown 2.7 cm up onto the tops of the lobe walls. At 0 they sit
                                 // dead level at 0.120 cm and 1.0x static. The wall contact is a real
                                 // collider and still transfers load, and it carries most of the
                                 // cornering here anyway, so little is lost.

    frictionSlip: 0.10,          // Rapier wheel friction slip (vehicleMode 'raycast' only) ~ tyre grip coefficient. Hard plastic wheels on a
                                 // plastic track are SLIPPERY, and this number also caps the vehicle controller's
                                 // lateral scrub: at 0.35 the wheels held the car on the lobe radius and burned
                                 // 1.4 g of forward speed doing it (measured).
    sideFriction: 0.8,           // Rapier side friction stiffness 0..1
    crrScale: 1.0,               // multiplies each wheel type's Crr
    wallFriction: 0.05,          // plastic wall vs wheel hub / body side (the car rides this wall at 3-5 g)
    carFriction: 0.08,           // car chassis collider friction
    floorFriction: 0.15,         // track floor vs chassis (plastic on plastic); raycast wheels ignore it
    carRestitution: 0.15,
    wallRestitution: 0.1,
    linDamping: 0.02,
    angDamping: 1.5,

    // ---- events ------------------------------------------------------------------
    autoStart: true,             // switch the booster on and feed the cars in as soon as the page
                                 // loads. An empty track with the motor off shows nothing about what
                                 // the set does, and it is the state Stewart hit when he switched on
                                 // with five cars already in the nips and nothing moved.
    lineUpLead: 0.9,             // s of motor spin-up before the FIRST car is fed in
    lineUpStagger: 0.7,          // s between the five cars being fed into their nips. Dropping them
                                 // together bogs the motor from 11,388 to 1,687 rpm and nobody moves.
    crashSpeed: 60,              // cm/s closing speed that counts as a crash
    // ---- auto-recycle (a game affordance, not physics) --------------------------
    autoRecycle: true,           // put a car that has stopped, flipped or gone over the side back
                                 // into a free outbound nip. Without it the five-car game ends at
                                 // the first crash: 25 s of five cars finishes with 4.3 of them
                                 // stopped and nothing moving, however well a LONE car laps. A real
                                 // set gets played with; this is the hand that picks the car up.
    recycleAfter: 1.8,           // s a car must be stalled / off / lifted before it is recycled
    recycleLookCm: 60,           // cm of lane ahead of a nip that must be clear before a recycled
                                 // car is dropped into it. Without this the recycle feeds the queue.
    recycleStagger: 0.8,         // s between two recycles, so five of them never load the motor at
                                 // once -- the same reason lineUpStagger exists.
    stallSpeed: 2.0,             // cm/s
    stallTime: 0.6,              // s
    nudgeImpulse: 4000,          // g.cm/s

    // ---- render / ui ---------------------------------------------------------------
    shadows: true,
    showDebugPaths: false,
  };

  const config = Object.assign({}, DEFAULTS);
  Object.defineProperty(config, 'reset', { value: () => { for (const k in DEFAULTS) config[k] = DEFAULTS[k]; }, enumerable: false });
  Object.defineProperty(config, 'defaults', { value: DEFAULTS, enumerable: false });
  // Derived helpers (always computed from current values).
  Object.defineProperty(config, 'derived', {
    enumerable: false,
    value: () => {
      const foamWheelRadius = config.laneOffset + config.laneWidth / 2 - config.foamGap;
      const crossHalf = config.laneOffset + config.laneWidth / 2 + config.wallThick;
      return { curveRadius: config.lobeRadius, foamWheelRadius, crossHalf };
    },
  });
  HW.config = config;
})(window.HW);
