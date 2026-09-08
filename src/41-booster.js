// 41-booster.js — foam wheel nip model (SPEC s5.5). The wheel is not a collider;
// a car whose chassis overlaps the nip gets a friction force along the lane and a
// normal push toward the far wall; the reaction torque loads the drive train.
(function (HW) {
  const V = HW.V, M = HW.math;

  HW.booster = {
    create(track, cfg = HW.config) {
      const zones = track.boosters.map((z) => Object.assign({ engaged: null, lastF: 0 }, z));
      const api = {
        zones,
        // signed distance along the path from zone.s to car.s, wrapped to [-L/2, L/2]
        along(zone, car) {
          const L = zone.path.length;
          let d = car.s - zone.s; d -= Math.round(d / L) * L; return d;
        },
        // Returns total load torque on the wheels in dyne.cm. Marks car.inBooster.
        apply(cars, omegaWheel, dt) {
          let tau = 0;
          for (const z of zones) { z.engaged = null; z.lastF = 0; }
          for (const car of cars) {
            car.inBooster = null;
            if (car.lifted || !car.path || !car.frame) continue;
            for (const z of zones) {
              if (z.path !== car.path) continue;
              const d = api.along(z, car);
              const reach = car.halfLen + cfg.boostExtra;
              if (Math.abs(d) > reach) continue;
              // lateral gate: the car must be roughly in-lane and near the wheel's height
              if (Math.abs(car.lateral) > cfg.laneWidth) continue;
              const squeeze = Math.max(0, car.entry.widthCm - cfg.foamGap);
              if (squeeze <= 0) continue;
              // contact patch fraction: full when the chassis centre is over the wheel, tapering at the ends
              const overlap = M.clamp((reach - Math.abs(d)) / Math.min(reach, car.halfLen), 0, 1);
              const N = cfg.foamK * squeeze * overlap;                  // dyne
              const Fmax = cfg.foamMu * N;
              const t = car.frame.t;
              const v = car.body.linvel();
              const vCar = v.x * t.x + v.y * t.y + v.z * t.z;
              const vW = omegaWheel * z.wheelRadius;                    // cm/s along +t
              const dv = vW - vCar;
              const F = Fmax * M.clamp(dv / cfg.slipVel, -1, 1);
              car.body.addForce({ x: t.x * F, y: t.y * F, z: t.z * F }, true);
              // Push toward the far wall (wheelSide -1 = wheel on the left -> push right).
              // MUST act through the centre of mass (boostPushY = 0). The real foam nip touches
              // the whole side of the casting and the far wall pushes straight back, so the pair
              // is a near-zero couple. Applying it BELOW the c.o.m. (an earlier bug) spins the car
              // about its roll axis at hundreds of rad/s inside the nip and throws it off the track.
              const r = car.frame.right, u = car.frame.up, push = -z.wheelSide * N * cfg.boostPushFrac;
              const Fp = { x: r.x * push, y: r.y * push, z: r.z * push };
              if (cfg.boostPushY === 0) {
                car.body.addForce(Fp, true);                       // addForce acts at the centre of mass
              } else {
                const c0 = car.body.worldCom();
                car.body.addForceAtPoint(Fp, { x: c0.x + u.x * cfg.boostPushY, y: c0.y + u.y * cfg.boostPushY, z: c0.z + u.z * cfg.boostPushY }, true);
              }
              tau += F * z.wheelRadius;
              car.inBooster = z.name; z.engaged = car.id; z.lastF = F;
              break;
            }
          }
          return tau;
        },
      };
      return api;
    },
  };
})(window.HW);
