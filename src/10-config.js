// 10-config.js - every tunable number lives here. Units: cm, g, s, dyne (cgs).
// Tags: [M] measured / sourced, [D] derived from sourced numbers, [E] engineering estimate.
// The UI tuning drawer binds to HW.config; HW.config.reset() restores these defaults.
(function (HW) {
  const DEFAULTS = {
    // ------------------------------------------------------------ track geometry
    laneW: 3.175,        // [M] inside width of standard Hot Wheels track (1.25 in)
    wallT: 0.16,         // [E] wall thickness
    wallH: 0.95,         // [E] wall height above the running surface
    floorT: 0.2,         // [E] track floor thickness
    hubLane: 3.0,        // [E] lane centreline offset from the hub axes (lanes 6 cm apart)
    hubHalf: 14.5,       // [E] hub arm half-length: lanes leave the hub at +-14.5 cm
    deckH: 4.5,          // [E] height of the hub lane deck above the floor
    nipGap: 2.0,         // [E] gap between foam surface and far wall; a car narrower than this is not driven
    boosterAt: 7.7,      // [E] booster wheel centre, distance from the hub centre along its arm
    // lobes: each is two quintic-Hermite halves meeting at an apex (see 31-track-layout.js)
    // q = the solved handle lengths (node tools/simtest.mjs solve); delete q to re-solve at load
    loop:  { ux: 30, yx: 26.0, beta: 70, Rt: 11, floorY: 0.8, q: [27.4072, 13.233, 163.4464, -319.8317] },  // rear pair: tall loops, inverted at the apex
    sweep: { ux: 34, yx: 2.0, beta: 0, Rt: 14, floorY: 1.5, q: [23.628, 16.5105, 48.7158, -170.9126] },     // front pair: low banked sweeps near the floor
    bankVRef: 380,       // [E] design speed (cm/s) at the lobe entry for the heartline bank
    bankLossG: 0.06,     // [E] assumed mean drag (g) along a lobe when estimating the design speed
    sweepMaxBank: 62,    // [E] bank cap on the front sweeps (deg); the rest is carried by the outer wall
    bankSmoothCm: 2.5,   // [E] Gaussian sigma for smoothing the roll schedule (limits twist rate)
    sampleDs: 0.2,       // path sample spacing

    // ------------------------------------------------------------ cars on the track
    crrScale: 1.0,       // multiplies each casting's rolling-resistance coefficient
    muWall: 0.18,        // [E] die-cast / plastic sliding on the plastic wall
    muSide: 0.30,        // [E] tyre side-slip friction (plastic wheel on plastic track)
    airRho: 1.2e-3,      // [M] g/cm^3
    airCd: 0.45,         // [E] 1:64 car drag coefficient
    wallRest: 0.25,      // [E] restitution of a car hitting a side wall
    derailLift: 0.75,    // [E] cm the car may rise off the running surface before it leaves the channel
    substepHz: 1920,     // on-track integrator rate (4 x physHz)
    jointLoss: 0.004,    // [E] mean fraction of speed lost crossing a track joint
    jointKick: 10,       // [E] cm/s max sideways twitch at a joint
    jointHop: 5,         // [E] cm/s max hop at a joint
    wheelSpread: 0.07,   // [E] car-to-car spread (sd) in rolling resistance
    seed: null,          // RNG seed; null = different every load

    // ------------------------------------------------------------ booster nip
    foamK: 1.2e6,        // [E] dyne/cm of squeeze (a 0.45 cm squeeze -> 5.4 N)
    foamMu: 0.9,         // [E] foam on painted die-cast
    slipVel: 20,         // [E] cm/s slip at which foam friction saturates
    foamJitter: 0.03,    // [E] +- fraction: an uneven foam tyre grips each pass at a slightly different speed

    // ------------------------------------------------------------ power train
    cells: 4,            // [M] 4 x D (LR20) alkaline
    cellV0Fresh: 1.58,   // [M] open-circuit volts, fresh alkaline D
    cellV0Dead: 1.05,
    cellRFresh: 0.08,    // [M/E] ohm, fresh D at ~2 A
    cellRDead: 0.60,
    battCapacityAh: 12,  // [M/E] usable at ~1-2 A
    charge: 1.0,         // state of charge 0..1 (tuning drawer: "tired batteries")
    drainScale: 1,       // multiplies the drain so a session can show sag (UI option)
    motorR: 0.8,         // [E] 380-class can motor, ohm (a 280 bogs so hard on a launch that the next car misses the loop)
    motorK: 0.0036,      // [E] V.s/rad = N.m/A
    motorFric: 0.0006,   // [E] N.m coulomb friction
    motorB: 1.0e-7,      // [E] N.m.s/rad viscous
    motorJ: 1.2e-6,      // [E] kg.m^2 rotor (380-class); geared up 10x it is most of the flywheel
    gearRatio: 10.3,     // [E] motor : foam wheel
    gearEff: 0.85,       // [E]
    foamWheelMassG: 8,   // [E] each of four
    trainJ: 2.0e-6,      // [E] kg.m^2 idler + satellites at the wheel shaft

    // ------------------------------------------------------------ crashes / free bodies
    carRest: 0.35,       // [E] car-car restitution (die-cast)
    carMu: 0.3,          // [E] car-car friction
    physHz: 480,         // free-body (Rapier) rate
    recaptureDelay: 0.12,
    retrieveDelay: 0.8,  // s a crashed car lies still before the hand picks it up
    autoRetrieve: true,
    autoNudge: true,
    stallTime: 2.0,

    // ------------------------------------------------------------ sim
    timeScale: 1,
    autoStart: true,
  };

  const cfg = (HW.config = JSON.parse(JSON.stringify(DEFAULTS)));
  cfg.defaults = DEFAULTS;
  cfg.reset = function () {
    const d = JSON.parse(JSON.stringify(DEFAULTS));
    for (const k of Object.keys(d)) cfg[k] = d[k];
  };
  Object.defineProperty(cfg, 'reset', { enumerable: false });
  Object.defineProperty(cfg, 'defaults', { enumerable: false });
})(window.HW);
