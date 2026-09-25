// 44-stunts.js - the moving stunt parts: the spring LAUNCHER and the HAZARDS.
//
// Launcher: a car at rest against the plunger is held, the plunger is pulled back x and
// let go. The spring's energy 1/2 k x^2 goes into the car AND the plunger that pushes it,
// so v = x sqrt(k / (m_car + m_plunger)): a heavier casting leaves slower, as it should.
//
// Hazards: a box that moves on a fixed rule (a pendulum hammer, a turning paddle). Against
// a car in the channel it is a body of enormous mass: the same SAT + impulse as a car-car
// crash (42-collide.js), and a hard hit knocks the car out of the lane. Against a free car
// it is a kinematic Rapier body, driven one physics step ahead.
(function (HW) {
  const V = HW.V, PV = HW.pieces.vec;

  function hazardPose(hz, t, out) {
    const w = 2 * Math.PI / hz.period;
    const th = hz.spin ? hz.spin * t + hz.phase : hz.swing * Math.sin(w * t + hz.phase);
    const om = hz.spin ? hz.spin : hz.swing * w * Math.cos(w * t + hz.phase);
    const a0 = hz.axis, a1 = PV.rot(hz.arm0, a0, th), a2 = PV.cross(a0, a1);
    const c = PV.add(hz.pivot, PV.sc(a1, hz.armLen));
    out = out || { c: {}, a: [{}, {}, {}], e: hz.half };
    out.c.x = c[0]; out.c.y = c[1]; out.c.z = c[2];
    [a0, a1, a2].forEach((v, k) => { out.a[k].x = v[0]; out.a[k].y = v[1]; out.a[k].z = v[2]; });
    out.e = hz.half;
    out.th = th; out.om = om;
    // velocity of the box centre, and its spin
    const r = PV.sc(a1, hz.armLen), vc = PV.sc(PV.cross(a0, r), om);
    out.v = { x: vc[0], y: vc[1], z: vc[2] }; out.w = { x: a0[0] * om, y: a0[1] * om, z: a0[2] * om };
    out.q = HW.Q.fromBasis(out.a[0], out.a[1], out.a[2]);
    return out;
  }

  HW.stunts = {
    hazardPose,

    create(sim) {
      const L = sim.layout;
      for (const hz of L.hazards) {
        hz.box = hazardPose(hz, 0);
        if (!sim.fb) continue;
        const R = sim.fb.R, b = hz.box;
        hz.body = sim.fb.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(b.c.x, b.c.y, b.c.z).setRotation(b.q));
        sim.fb.world.createCollider(R.ColliderDesc.cuboid(hz.half[0], hz.half[1], hz.half[2]).setFriction(0.4).setRestitution(0.4)
          .setCollisionGroups(((0x0001 & 0xffff) << 16) | 0x0002), hz.body);
      }
      for (const ln of L.launchers) { ln.car = null; ln.holdT = 0; ln.pull = 0; ln.last = null; }
    },

    // per substep: move the hazards, strike cars in the channel, work the launchers
    step(sim, h) {
      const L = sim.layout;
      for (const hz of L.hazards) {
        hazardPose(hz, sim.time, hz.box);
        for (const car of sim.cars) if (car.mode === 'track') strike(sim, car, hz);
      }
      for (const ln of L.launchers) launcherStep(sim, ln, h);
    },

    // before a Rapier step of dt: where the hazards will be at its end
    drive(sim, dt) {
      for (const hz of sim.layout.hazards) {
        if (!hz.body) continue;
        const b = hazardPose(hz, sim.time + dt);
        hz.body.setNextKinematicTranslation(b.c); hz.body.setNextKinematicRotation(b.q);
      }
    },
    // keep the kinematic bodies in place while Rapier is not stepping
    park(sim) {
      for (const hz of sim.layout.hazards) if (hz.body) { hz.body.setTranslation(hz.box.c, false); hz.body.setRotation(hz.box.q, false); }
    },

    fire(sim, ln, strength) {
      const car = ln.car;
      if (!car || car.mode !== 'track' || car.track !== ln.track) return null;
      const s = strength != null ? strength : ln.vary ? (ln.varyMin || 0.5) + ((ln.varyMax || 1) - (ln.varyMin || 0.5)) * sim.rng() : ln.strength;
      const x = ln.travel * s, v = x * Math.sqrt(ln.k / (car.m + ln.plungerG));
      car.v = v; car.s = ln.s; car.stallT = 0; car.status = 'running';
      car.lapStartT = sim.time;
      ln.last = { t: sim.time, strength: s, v, car };
      ln.car = null; ln.holdT = 0; ln.fired = sim.time;
      sim.emit('launch', { car, strength: s, speed: v });
      return ln.last;
    },
  };

  function launcherStep(sim, ln, h) {
    let car = null;
    for (const c of sim.cars) if (c.mode === 'track' && c.track === ln.track && Math.abs(c.s - ln.s) < 3 && Math.abs(c.v) < 4) { car = c; break; }
    if (!car) { ln.car = null; ln.holdT = 0; ln.pull = Math.max(0, ln.pull - h * 60); return; }
    if (ln.car !== car) { ln.car = car; ln.holdT = 0; }
    // the plunger holds the car still while it is pulled back
    car.v = 0; car.s = ln.s; car.stallT = 0;
    ln.holdT += h;
    ln.pull = Math.min(ln.travel * (ln.vary ? 0.8 : ln.strength), ln.holdT * 12);
    if (ln.auto && ln.holdT > (ln.wait || 0.7)) HW.stunts.fire(sim, ln);
  }

  // a hazard against a car in the channel
  function strike(sim, car, hz) {
    const b = hz.box;
    const dx = car.pos.x - b.c.x, dy = car.pos.y - b.c.y, dz = car.pos.z - b.c.z;
    const reach = car.halfLen + hz.half[0] + hz.half[1] + hz.half[2];
    if (dx * dx + dy * dy + dz * dz > reach * reach) return;
    const A = HW.collide.obb(car, sim._obbH);
    sim._obbH = A;
    const hit = HW.collide.sat(A, b);
    if (!hit) return;
    const p = HW.collide.contactPoint(A, b);
    const bc = { m: car.m, box: A, v: V.clone(car.vel), w: V.clone(car.angVel) };
    const bh = { m: hz.mass, box: b, v: V.clone(b.v), w: V.clone(b.w) };
    const res = HW.collide.impulse(bc, bh, p, hit.n, 0.4, 0.3);
    const f = car.frame, sep = V.scale(hit.n, -(hit.depth + 0.03));
    const dv = V.sub(bc.v, car.vel);
    const dLat = dv.x * f.rx + dv.y * f.ry + dv.z * f.rz, dUp = dv.x * f.ux + dv.y * f.uy + dv.z * f.uz;
    if (res.jn > 0 && (Math.abs(dLat) > 30 || dUp > 25 || res.closing > 60)) {
      car.pos = V.add(car.pos, sep); car.vel = bc.v; car.angVel = bc.w;
      sim.derail(car, 'hazard');
      if (sim.fb) HW.freebody.setVel(sim.fb, car, bc.v, bc.w);
      sim.emit('whack', { car, hazard: hz, speed: res.closing, pos: V.clone(p) });
    } else {
      // a glancing touch: slowed or nudged along the lane
      car.v += dv.x * f.tx + dv.y * f.ty + dv.z * f.tz;
      car.vd += dLat;
      car.s = car.track.wrap(car.s + (sep.x * f.tx + sep.y * f.ty + sep.z * f.tz));
    }
  }
})(window.HW);
