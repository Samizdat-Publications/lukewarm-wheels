// 10-config.js — every tunable number in one place. cgs unless the key says SI.
// Geometry grounded in docs/RESEARCH.md + the V2791 instruction sheet
// (docs/V2791-instructions.png). ESTIMATE where noted.
(function (HW) {
  const DEFAULTS = {
    // ---- simulation ---------------------------------------------------------
    physicsHz: 240,
    maxSubsteps: 8,
    vehicleMode: 'raycast',      // 'raycast' | 'sled'

    // ---- track geometry (cm) -------------------------------------------------
    laneWidth: 3.175,            // MEASURED: 1.25 in running clearance
    wallHeight: 0.9,             // ESTIMATE 8-10 mm (hub lanes, straights)
    lobeWallHeight: 2.6,         // ESTIMATE: the tilted curve pieces are deep channels; cars ride the wall at 3-4 g
    wallThick: 0.3,
    floorThick: 0.4,
    wallSegLen: 1.5,             // cm: length of each box collider along a wall run
    wallInset: 0.08,             // cm: wall collider faces sit this far outside the visual wall (anti-snag)
    wallRound: 0.1,              // cm: rounding radius of wall box colliders
    carRound: 0.15,              // cm: rounding radius of car chassis colliders
    hubHalf: 13.0,               // ESTIMATE: hub arm length from centre (~26 cm across)
    laneOffset: 3.0,             // ESTIMATE: lane centreline distance from arm axis inside the hub
    boosterR: 8.5,               // ESTIMATE: foam wheel axis distance from hub centre
    foamGap: 2.0,                // free gap wheel-surface to far wall; cars are 2.2-2.6 wide
    splayDeg: 45,                // straights leave the hub at +-45 deg (instruction sheet)
    straightLen: 10.0,           // ESTIMATE: pieces A-H (straight part)
    junctionRadius: 15.0,        // bend radius hub lane -> splayed straight. MUST be >= ~12: a 7 cm car
                                 // needs width + L^2/(8R) < laneWidth or it wedges between the walls
    lobeLift: 9.0,               // ESTIMATE: apex height on the track support
    lobeBlend: 0.5,              // fraction of arc used to ease lift/bank in and out (gentle: rigid cars twist)
    // curveRadius is DERIVED: (laneOffset + junctionRadius*(1-cos(splay)) + straightLen*sin(splay)) / cos(splay)

    // ---- foam booster ---------------------------------------------------------
    foamK: 1.2e6,                // dyne/cm foam nip stiffness: ~5.4 N at 0.45 cm squeeze (ESTIMATE)
    foamMu: 0.7,                 // foam-on-paint friction
    slipVel: 30,                 // cm/s: slip speed at which foam friction saturates
    boostExtra: 1.2,             // cm: contact zone half-length beyond the car half-length
    boostPushFrac: 0.2,          // fraction of the nip normal force that shoves the car into the far wall

    // ---- drive train (SI in, converted on read) -------------------------------
    cells: 4,
    cellV0Fresh: 1.60, cellV0Dead: 1.10,     // V open-circuit vs state of charge
    cellRFresh: 0.22, cellRDead: 0.80,       // ohm per cell
    battCapacityAh: 10.0,                    // effective at ~1 A drain
    battHealth: 1.0,                         // multiplies cell resistance (1 fresh, 3 tired)
    battUsedFrac: 0.0,                       // initial state of discharge 0..1
    // Motor: 280-class brushed DC (a 130 cannot drive four foam nips from 4 D cells). ESTIMATE.
    motorKe: 4.5e-3,                         // V.s/rad  -> no-load ~13,500 rpm at 6.4 V
    motorKt: 4.2e-3,                         // N.m/A   (slightly below Ke: brush/iron losses)
    motorR: 1.2,                             // ohm     -> stall ~3 A with the pack, ~140 g.cm
    motorFric: 6.0e-4,                       // N.m coulomb friction (I0 ~ 0.15 A)
    motorB: 3.0e-8,                          // N.m.s viscous
    motorJ: 2.5e-7,                          // kg.m^2 rotor + pinion (ESTIMATE)
    gearRatio: 6.5,                          // motor turns per foam-wheel turn (ESTIMATE)
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
    frictionSlip: 0.35,          // Rapier wheel friction slip ~ tyre grip coefficient (hard plastic on plastic)
    sideFriction: 0.8,           // Rapier side friction stiffness 0..1
    crrScale: 1.0,               // multiplies each wheel type's Crr
    wallFriction: 0.10,          // plastic wall vs wheel hub / body side
    carFriction: 0.08,           // car chassis collider friction
    floorFriction: 0.15,         // track floor vs chassis (plastic on plastic); raycast wheels ignore it
    carRestitution: 0.15,
    wallRestitution: 0.1,
    linDamping: 0.02,
    angDamping: 0.5,

    // ---- events ------------------------------------------------------------------
    crashSpeed: 60,              // cm/s closing speed that counts as a crash
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
      const b = HW.units.degToRad(config.splayDeg);
      const curveRadius = (config.laneOffset + config.junctionRadius * (1 - Math.cos(b)) + config.straightLen * Math.sin(b)) / Math.cos(b);
      const foamWheelRadius = config.laneOffset + config.laneWidth / 2 - config.foamGap;
      const crossHalf = config.laneOffset + config.laneWidth / 2 + config.wallThick;
      return { curveRadius, foamWheelRadius, crossHalf, splay: b };
    },
  });
  HW.config = config;
})(window.HW);
