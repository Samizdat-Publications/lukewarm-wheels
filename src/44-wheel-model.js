// 44-wheel-model.js — our own raycast wheel model (vehicleMode 'wheels', the default).
//
// WHY THIS EXISTS. Rapier's DynamicRayCastVehicleController dissipates specific energy at a rate
// that nothing it exposes can change. Measured with tools/attribute.mjs on a flat 16 cm lobe,
// fleet-averaged over 20 runs, split by what was true each step:
//     all four wheels down, no wall contact ... 0.21 g
//     chassis riding a wall ................... 0.53 g
//     on an essentially straight track ........ 0.076 g   (rolling resistance is only 0.022)
// and those numbers move by less than the run-to-run noise when frictionSlip is swept 0.005..1.0,
// sideFriction 0..0.8, the suspension force cap 1.5..40, suspension damping 0.5..40, restitution
// 0..0.95, the timestep 240..1920 Hz, or the lane width. A loss insensitive to every coefficient is
// not friction. For comparison, 'sled' mode -- a plain box sliding on the floor -- loses 0.045 g,
// which is the physically right answer (crr is 0.022), but a sliding box tips at 2.4 g and the lobe
// pulls 5.9, so 100 % of sled cars leave the track.
//
// So: keep the chassis collider for wall contacts (that part works), and replace the controller
// with four explicit raycast wheels whose only losses are ones we write down.
//
// THE MODEL, per wheel, once per step:
//   1. cast a ray from the suspension hard point along the chassis's -up, length suspRest + wheelR;
//   2. compression = (suspRest + wheelR) - hit distance, clamped to [0, suspTravel];
//   3. spring force Fs = k*compression + c*d(compression)/dt along the CONTACT NORMAL, capped at
//      suspMaxForceMult * mg/4 and never negative (a wheel cannot pull);
//   4. lateral friction: the force that would cancel this wheel's share of the lateral contact
//      velocity in one step, capped at wheelGrip * Fs -- so the energy it removes is exactly
//      mu*N*slip and nothing else.
// Rolling resistance is NOT applied here: 42-vehicle.js already applies it once at the chassis.
//
// k is derived from the car's own mass so every casting sits at the same ride height:
// k = m*g / (4 * wheelStaticComp).
(function (HW) {
  const V = HW.V, M = HW.math, U = HW.units;

  HW.wheelModel = {
    step(car, world, cfg, dt) {
      const R = window.RAPIER, body = car.body, m = car.entry.massG;
      const pos = body.translation(), q = body.rotation();
      const up = M.applyQuat(q, { x: 0, y: 1, z: 0 });
      const right = M.applyQuat(q, { x: 1, y: 0, z: 0 });
      const down = V.scale(up, -1);
      const linv = body.linvel(), angv = body.angvel();
      const com = body.worldCom();
      const reach = cfg.suspRest + car.wheelR;
      const k = m * U.G / (4 * Math.max(0.01, cfg.wheelStaticComp));
      const cDamp = cfg.wheelDampRatio * 2 * Math.sqrt(k * m / 4);
      const capF = cfg.suspMaxForceMult * m * U.G / 4;

      for (let i = 0; i < 4; i++) {
        const w = car.wheels[i];
        const hp = V.add(pos, M.applyQuat(q, car.hardPts[i]));
        const ray = new R.Ray(hp, down);
        const hit = world.castRayAndGetNormal(ray, reach, true, undefined, undefined, undefined, body);
        if (!hit) { w.contact = false; w.comp = 0; w.load = 0; continue; }
        const toi = hit.timeOfImpact !== undefined ? hit.timeOfImpact : hit.toi;
        let comp = reach - toi;
        if (comp <= 0) { w.contact = false; w.comp = 0; w.load = 0; continue; }
        comp = Math.min(comp, cfg.suspTravel);
        const n = hit.normal;
        // A ray that grazes a wall face returns a near-horizontal normal; that is a wall contact,
        // not a wheel contact, and treating it as suspension fires the car sideways.
        if (V.dot(n, up) < 0.25) { w.contact = false; w.comp = 0; w.load = 0; continue; }

        // NB: rate must span ONE step. Using a prevComp that lagged two steps doubled the damping
        // term and fired cars 10 cm into the air off a flat track.
        const rate = w.contact ? (comp - w.comp) / dt : 0;
        let Fs = k * comp + cDamp * rate;
        Fs = M.clamp(Fs, 0, capF);
        w.contact = true; w.comp = comp; w.load = Fs;

        // contact point, and the chassis velocity there
        const cp = V.addScaled(hp, down, toi);
        const r = V.sub(cp, com);
        const vp = V.add(linv, V.cross(angv, r));

        body.addForceAtPoint({ x: n.x * Fs, y: n.y * Fs, z: n.z * Fs }, cp, true);

        // Lateral friction, capped at mu * N.
        // Two details are load-bearing, both learned the hard way (the roll mode diverged in 30
        // steps and the car climbed off a flat track under 1.9 g of net lift):
        //  - RELAXATION. Cancelling the whole lateral contact velocity in one step is a very stiff
        //    explicit constraint. Rapier applies its equivalent as a solver impulse, which is
        //    implicit and stable; an explicit force of the same size pumps the roll oscillation.
        //  - ROLL INFLUENCE (the same trick Bullet uses). Applying the force at the contact patch,
        //    a whole car-height below the centre of mass, couples cornering straight into roll.
        //    Sliding the application point up toward the c.o.m. keeps the force and drops most of
        //    the couple. 0 = act through the c.o.m. height, 1 = act at the contact patch.
        let lat = V.sub(right, V.scale(n, V.dot(right, n)));
        const ll = V.len(lat);
        if (ll > 1e-6) {
          lat = V.scale(lat, 1 / ll);
          const vLat = V.dot(vp, lat);
          const need = -cfg.wheelLatRelax * m * vLat / (4 * dt);   // this wheel's share
          const maxF = cfg.wheelGrip * Fs;
          const F = M.clamp(need, -maxF, maxF);
          const dh = V.dot(V.sub(com, cp), up) * (1 - cfg.wheelRollInfluence);
          const fp = V.addScaled(cp, up, dh);
          body.addForceAtPoint({ x: lat.x * F, y: lat.y * F, z: lat.z * F }, fp, true);
        }
      }
    },
  };
})(window.HW);
