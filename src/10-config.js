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
    wallHeight: 0.9,             // ESTIMATE 8-10 mm
    wallThick: 0.3,
    floorThick: 0.4,
    hubHalf: 13.0,               // ESTIMATE: hub arm length from centre (~26 cm across)
    laneOffset: 3.0,             // ESTIMATE: lane centreline distance from arm axis inside the hub
    boosterR: 8.5,               // ESTIMATE: foam wheel axis distance from hub centre
    foamGap: 2.0,                // free gap wheel-surface to far wall; cars are 2.2-2.6 wide
    splayDeg: 45,                // straights leave the hub at +-45 deg (instruction sheet)
    straightLen: 14.0,           // ESTIMATE: pieces A-H
    lobeLift: 11.0,              // ESTIMATE: apex height on the track support
    lobeBlend: 0.12,             // fraction of arc used to ease lift/bank in and out
    // curveRadius is DERIVED: (laneOffset + straightLen*sin(splay)) / cos(splay)

    // ---- foam booster ---------------------------------------------------------
    foamK: 2.0e6,                // dyne/cm normal stiffness of the foam nip (ESTIMATE)
    foamMu: 0.7,                 // foam-on-paint friction
    slipVel: 30,                 // cm/s: slip speed at which foam friction saturates
    boostExtra: 1.2,             // cm: contact zone half-length beyond the car half-length

    // ---- drive train (SI in, converted on read) -------------------------------
    cells: 4,
    cellV0Fresh: 1.60, cellV0Dead: 1.10,     // V open-circuit vs state of charge
    cellRFresh: 0.22, cellRDead: 0.80,       // ohm per cell
    battCapacityAh: 10.0,                    // effective at ~1 A drain
    battHealth: 1.0,                         // multiplies cell resistance (1 fresh, 3 tired)
    battUsedFrac: 0.0,                       // initial state of discharge 0..1
    motorKe: 3.6e-3,                         // V.s/rad  (6 V-class 130 winding, ESTIMATE)
    motorKt: 3.2e-3,                         // N.m/A   (lower than Ke: brush/iron losses)
    motorR: 2.2,                             // ohm
    motorFric: 4.5e-4,                       // N.m coulomb friction (I0 ~ 0.14 A)
    motorB: 2.0e-8,                          // N.m.s viscous
    motorJ: 4.0e-8,                          // kg.m^2 rotor
    gearRatio: 8.5,                          // motor turns per foam-wheel turn
    gearEff: 0.85,
    foamWheelMassG: 12,                      // per wheel, for inertia (ESTIMATE)

    // ---- cars ------------------------------------------------------------------
    comDrop: 0.35,               // cm: lower the centre of mass below the chassis centre
    suspRest: 0.45,              // cm
    suspStiffness: 1800,         // Rapier units (force = k * compression * chassis mass)
    suspCompression: 6.0,
    suspRelaxation: 8.0,
    suspTravel: 0.4,             // cm
    frictionSlip: 3.0,           // Rapier wheel friction slip
    sideFriction: 0.6,           // Rapier side friction stiffness 0..1
    crrScale: 1.0,               // multiplies each wheel type's Crr
    wallFriction: 0.25,
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
      const curveRadius = (config.laneOffset + config.straightLen * Math.sin(b)) / Math.cos(b);
      const foamWheelRadius = config.laneOffset + config.laneWidth / 2 - config.foamGap;
      const crossHalf = config.laneOffset + config.laneWidth / 2 + config.wallThick;
      return { curveRadius, foamWheelRadius, crossHalf, splay: b };
    },
  });
  HW.config = config;
})(window.HW);
