// 41-cars.js - car state and the on-track dynamics.
//
// While a car is in the channel it is a mass constrained to the track surface, with
// three coordinates in the track's moving frame: s (along the centreline), d (across the
// lane, walls at +-dmax) and h (lift off the running surface). Newton's second law is
// solved in that frame every substep: gravity, the centripetal demand v^2*kappa, the floor
// reaction (which can only push), the wall reactions (which can only push), rolling
// resistance mu_rr*N, wall scrub mu_w*N_wall, tyre side-slip mu_side*N, air drag and the
// foam nips. Nothing is scripted: a slow car at the top of a loop gets a negative floor
// reaction, lifts off (h grows), and if it rises past the walls it leaves the track and
// becomes a free rigid body (43-freebody.js) until it lands back in a lane or is picked up.
//
// This is the formulation a roller-coaster simulator uses. It is exact for a car in
// contact with a smooth track, and it cannot suffer the numerical wall-scrub and edge
// snagging that stalled every car in the rigid-body-only version (legacy/).
(function (HW) {
  const M = HW.math, G = HW.units.G;

  let nextId = 1;
  HW.Car = class Car {
    constructor(entry) {
      this.id = nextId++;
      this.entry = entry;
      this.name = entry.name;
      this.m = entry.massG;
      this.len = entry.lengthCm; this.wid = entry.widthCm; this.hgt = entry.heightCm;
      this.halfLen = entry.lengthCm / 2;
      this.cgH = entry.heightCm * entry.cgFrac;
      this.clear = 0.22;                                  // [E] ground clearance of the body box
      this.boxHalf = { x: entry.widthCm / 2, y: (entry.heightCm - this.clear) / 2, z: entry.lengthCm / 2 };
      this.boxCy = this.clear + this.boxHalf.y;           // box centre height above the running surface
      this.crr = entry.crr;
      this.crrMul = 1;                                    // this particular car's wheels (set by the sim)
      this.CdA = 0;                                       // set from config at sim init
      this.mode = 'parked';                               // parked | track | free | held | retrieving
      this.status = 'parked';                             // running | stalled | crashed | ...
      // on-track coordinates
      this.s = 0; this.v = 0; this.d = 0; this.vd = 0; this.h = 0; this.vh = 0;
      this.reversed = false;                              // car faces -T (it was put back backwards)
      // world pose (rendering, collisions)
      this.pos = { x: 0, y: -1000, z: 0 };
      this.quat = { x: 0, y: 0, z: 0, w: 1 };
      this.vel = { x: 0, y: 0, z: 0 };
      this.angVel = { x: 0, y: 0, z: 0 };
      this.wheelSpin = 0;
      // contact state (for audio, visuals, stats)
      this.Nf = 0; this.Nw = 0; this.wallSide = 0; this.inNip = null; this.airborne = false;
      this.frame = {};
      // bookkeeping
      this.laps = 0; this.lapStartT = null; this.lastLap = null; this.bestLap = null;
      this.topSpeed = 0; this.crashes = 0;
      this.stallT = 0; this.freeT = 0; this.restT = 0; this.noRecaptureT = 0;
      this.energy = { boost: 0, roll: 0, wall: 0, side: 0, air: 0, impact: 0 };
      this.nipJit = 1;
      this.retrieve = null;
    }
    get speed() { return this.mode === 'track' ? Math.abs(this.v) : Math.hypot(this.vel.x, this.vel.y, this.vel.z); }
  };

  // ---------------------------------------------------------------- track dynamics
  // One substep for one car in the channel. Returns the torque the car puts back on the
  // foam-wheel shaft (dyne.cm), so the power train can feel every launch.
  HW.trackDynamics = {
    step(car, h, sim) {
      const cfg = sim.cfg, L = sim.layout, path = L.path, f = car.frame, m = car.m;
      path.frame(car.s, f);
      const v = car.v, v2 = v * v;
      // gravity components in the track frame (g vector = (0,-G,0))
      const gT = -G * f.ty, gU = -G * f.uy, gR = -G * f.ry;
      const kU = f.kx * f.ux + f.ky * f.uy + f.kz * f.uz;
      const kR = f.kx * f.rx + f.ky * f.ry + f.kz * f.rz;

      // ---- normal direction: the floor can only push
      const aUneed = v2 * kU - gU;          // acceleration along U the floor must supply to hold the car
      let Nf = 0;
      if (car.h <= 0 && aUneed >= 0) { Nf = m * aUneed; car.h = 0; if (car.vh < 0) car.vh = 0; car.airborne = false; }
      else {
        car.airborne = true;
        car.vh += -aUneed * h;
        car.h += car.vh * h;
        if (car.h <= 0) {
          const hit = -car.vh;
          car.h = 0; car.vh = 0; car.airborne = false;
          if (hit > 8) { sim.emit('land', { car, speed: hit }); car.energy.impact += 0.5 * m * hit * hit; }
        }
      }

      // ---- foam nips on this car's lane
      const W = cfg.laneW, dmax = Math.max(0, (W - car.wid) / 2);
      let Fdrive = 0, Flat = 0, tauBack = 0, nip = null;
      for (const b of L.boosters) {
        const ds = M.loopDelta(car.s, b.s, path.length);
        if (Math.abs(ds) > car.halfLen + 3) continue;
        // right side of the car, measured from the lane centre along R; the wheel is on the right
        const side = car.d + car.wid / 2;
        const foamEdge = L.dims.p - L.foamR;                 // how far the foam reaches into the lane
        const d0 = side - foamEdge;
        if (d0 <= 0) continue;
        const ch = Math.sqrt(Math.max(0, d0 * (2 * L.foamR - d0)));   // half chord of the squeeze
        const lo = Math.max(ds - car.halfLen, -ch), hi = Math.min(ds + car.halfLen, ch);
        const ov = hi - lo;
        if (ov <= 0 || ch <= 0) continue;
        const N = cfg.foamK * d0 * (ov / (2 * ch));
        // a real foam tyre is not perfectly round or even: each pass grips at a slightly
        // different effective speed (drawn once per pass, below)
        const vFoam = sim.power.surfaceSpeed * (car.inNip === b ? car.nipJit : 1);
        const F = cfg.foamMu * N * M.clamp((vFoam - v) / cfg.slipVel, -1, 1);
        Fdrive += F;
        Flat += b.pushSign * N;
        // foam is lossy: damp the car's sideways motion while it is squeezed
        Flat += -2 * 0.5 * Math.sqrt(cfg.foamK * m) * car.vd * (ov / (2 * ch));
        tauBack += F * L.foamR;
        nip = b;
      }
      if (nip && car.inNip !== nip) { car.nipJit = 1 + cfg.foamJitter * (2 * sim.rng() - 1); sim.emit('nip', { car, booster: nip }); }
      car.inNip = nip;

      // ---- lateral: gravity-minus-centripetal, nip push, then tyres and walls
      const walls = !path.noWall[f.i] && car.h < cfg.wallH;
      let aLat = gR - v2 * kR + Flat / m;
      let Nw = 0, wallSide = 0;
      const atR = walls && car.d >= dmax - 1e-4, atL = walls && car.d <= -dmax + 1e-4;
      const tyre = cfg.muSide * Nf / m;                      // lateral friction capacity, as an acceleration
      if ((atR && aLat > 0) || (atL && aLat < 0)) {
        // pinned to a wall: tyres carry what they can, the wall carries the rest
        Nw = Math.max(0, m * (Math.abs(aLat) - tyre));
        wallSide = atR ? 1 : -1;
        car.vd = 0; aLat = 0;
      } else if (Nf > 0) {
        if (Math.abs(car.vd) < 0.5 && Math.abs(aLat) <= tyre) { car.vd = 0; aLat = 0; }
        else {
          const dir = car.vd !== 0 ? Math.sign(car.vd) : Math.sign(aLat);
          const before = car.vd;
          car.vd += (aLat - dir * tyre) * h;
          if (before !== 0 && Math.sign(car.vd) !== Math.sign(before)) car.vd = 0;
          car.energy.side += tyre * m * Math.abs(before) * h;
          aLat = 0;
        }
      } else {
        car.vd += aLat * h;
      }
      car.d += car.vd * h;
      if (walls) {
        if (car.d > dmax) { car.d = dmax; if (car.vd > 0) { hitWall(car, car.vd, 1, sim); car.vd *= -cfg.wallRest; } }
        else if (car.d < -dmax) { car.d = -dmax; if (car.vd < 0) { hitWall(car, -car.vd, -1, sim); car.vd *= -cfg.wallRest; } }
      }

      // ---- along the track
      const Fair = 0.5 * cfg.airRho * car.CdA * v2;
      const muRR = car.crr * car.crrMul * cfg.crrScale;
      const fric = muRR * Nf + cfg.muWall * Nw;              // Coulomb, opposes motion
      const Fext = m * gT + Fdrive;
      let a;
      if (Math.abs(v) < 0.3 && Math.abs(Fext) <= fric) { a = -v / h; }   // sticks
      else {
        const dir = Math.abs(v) >= 0.3 ? Math.sign(v) : Math.sign(Fext);
        a = (Fext - dir * (fric + Fair)) / m;
      }
      let vNew = v + a * h;
      car.v = vNew;
      const sOld = car.s;
      car.s = car.s + vNew * h;
      if (car.s >= path.length) car.s -= path.length;
      else if (car.s < 0) car.s += path.length;
      // bookkeeping
      const av = Math.abs(v);
      car.energy.roll += muRR * Nf * av * h;
      car.energy.wall += cfg.muWall * Nw * av * h;
      car.energy.air += Fair * av * h;
      car.energy.boost += Fdrive * v * h;
      car.Nf = Nf; car.Nw = Nw; car.wallSide = wallSide;
      // track joints between sOld and the new s: a small random clack
      const J = L.joints;
      for (let k = 0; k < J.length; k++) {
        const js = J[k];
        const crossed = vNew >= 0 ? (sOld < js && car.s >= js) || (car.s < sOld && (sOld < js || car.s >= js))
                                  : (car.s < js && sOld >= js) || (car.s > sOld && (sOld >= js || car.s < js));
        if (!crossed) continue;
        const r = sim.rng, sp = Math.abs(car.v);
        const loss = cfg.jointLoss * (0.4 + 1.2 * r());
        car.v *= 1 - loss;
        car.vd += (r() - 0.5) * 2 * cfg.jointKick;
        if (car.h <= 0 && sp > 60) { car.vh += r() * cfg.jointHop; car.h = 1e-4; }
        car.energy.impact += 0.5 * m * sp * sp * (1 - (1 - loss) * (1 - loss));
        if (sp > 30) sim.emit('joint', { car, speed: sp });
      }
      // laps: a forward wrap past s=0 counts, unless it only undoes an earlier backward wrap
      if (car.s < sOld - path.length / 2) { if (car.lapDebt > 0) car.lapDebt--; else lap(car, sim); }
      else if (car.s > sOld + path.length / 2) car.lapDebt = (car.lapDebt || 0) + 1;
      car.wheelSpin += v / car.entry.wheelRadiusCm * h;
      if (car.h > cfg.derailLift) return { tau: tauBack, derail: 'lift' };
      if (path.noWall[f.i] && Math.abs(car.d) > W / 2 + 0.6) return { tau: tauBack, derail: 'drift' };
      return { tau: tauBack, derail: null };
    },

    // world pose from the track coordinates (car origin = running surface, centre of wheelbase)
    pose(car, path) {
      const f = path.frame(car.s, car.frame);
      const rx = f.rx, ry = f.ry, rz = f.rz, ux = f.ux, uy = f.uy, uz = f.uz;
      let tx = f.tx, ty = f.ty, tz = f.tz;
      car.pos.x = f.px + rx * car.d + ux * car.h;
      car.pos.y = f.py + ry * car.d + uy * car.h;
      car.pos.z = f.pz + rz * car.d + uz * car.h;
      // velocity (world): along T plus lateral and lift rates
      car.vel.x = tx * car.v + rx * car.vd + ux * car.vh;
      car.vel.y = ty * car.v + ry * car.vd + uy * car.vh;
      car.vel.z = tz * car.v + rz * car.vd + uz * car.vh;
      // angular velocity of the moving frame: w = v * (T x kappa) + twist*T  (twist ignored, small)
      car.angVel.x = car.v * (ty * f.kz - tz * f.ky);
      car.angVel.y = car.v * (tz * f.kx - tx * f.kz);
      car.angVel.z = car.v * (tx * f.ky - ty * f.kx);
      // orientation: columns (right, up, back). Forward is T (or -T when reversed).
      const sg = car.reversed ? -1 : 1;
      HW.Q.fromBasis({ x: rx * sg, y: ry * sg, z: rz * sg }, { x: ux, y: uy, z: uz }, { x: -tx * sg, y: -ty * sg, z: -tz * sg }, car.quat);
    },
  };

  function hitWall(car, speed, side, sim) {
    if (speed > 5) sim.emit('wall', { car, speed, side });
    car.energy.impact += 0.5 * car.m * speed * speed * (1 - sim.cfg.wallRest * sim.cfg.wallRest);
  }
  function lap(car, sim) {
    const t = sim.time;
    if (car.lapStartT != null) {
      car.lastLap = t - car.lapStartT;
      if (car.bestLap == null || car.lastLap < car.bestLap) car.bestLap = car.lastLap;
    }
    car.lapStartT = t;
    car.laps++;
    sim.emit('lap', { car, time: car.lastLap });
  }
})(window.HW);
