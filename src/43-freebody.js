// 43-freebody.js - the Rapier world, used only for cars that have LEFT the channel:
// crashed, thrown, fallen off a loop, or dropped by the user. The static world (floor,
// track channel, hub moulding, supports) is built from the same layout the renderer
// draws. Foam wheels are kinematic cylinders spinning at the power train's speed, so a
// crashed car that touches one is flung by friction, as it would be.
//
// Every car owns one Rapier body for its whole life. While the car is on the track the
// body is kinematic, parked far below the world with collisions off (the Rapier docs
// warn against toggling enabled on bodies that the world keeps stepping; parking is the
// robust equivalent). On a derail it becomes dynamic at the car's exact pose/velocity.
(function (HW) {
  const V = HW.V;
  const GROUP_WORLD = 0x0001, GROUP_CAR = 0x0002;
  const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);

  HW.freebody = {
    create(R, layout, cfg) {
      const world = new R.World({ x: 0, y: -HW.units.G, z: 0 });
      world.timestep = 1 / cfg.physHz;
      // cgs: lengths are ~cm, so keep the default length unit (the legacy notes: 100 sank cars)
      try { world.lengthUnit = 1; } catch (e) { /* older builds */ }
      const api = { R, world, bodies: new Map(), byCollider: new Map(), statics: [], foam: [], wheelRay: new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }),
        events: new R.EventQueue(true) };
      buildStatic(api, layout, cfg);
      return api;
    },
  };

  function fixedBox(api, cx, cy, cz, hx, hy, hz, q, opts = {}) {
    const R = api.R;
    const d = (opts.round ? R.ColliderDesc.roundCuboid(Math.max(0.01, hx - opts.round), Math.max(0.01, hy - opts.round), Math.max(0.01, hz - opts.round), opts.round) : R.ColliderDesc.cuboid(hx, hy, hz))
      .setTranslation(cx, cy, cz)
      .setFriction(opts.friction == null ? 0.35 : opts.friction)
      .setRestitution(opts.rest == null ? 0.2 : opts.rest)
      .setCollisionGroups(groups(GROUP_WORLD, GROUP_CAR));
    if (q) d.setRotation(q);
    const c = api.world.createCollider(d);
    api.statics.push(c);
    return c;
  }

  function buildStatic(api, L, cfg) {
    const R = api.R, { W, wallT, wallH, floorT } = L.dims;
    // floor
    fixedBox(api, 0, -2, 0, 400, 2, 400, null, { friction: 0.55, rest: 0.15 });

    // --- track channel along every drawn piece: floor slabs + two walls per ~1.2 cm
    const f = {};
    for (const ch of L.channels) {
      const path = ch.track;
      const n = Math.ceil((ch.s1 - ch.s0) / 1.2), step = (ch.s1 - ch.s0) / n;
      for (let k = 0; k < n; k++) {
        const s = ch.s0 + (k + 0.5) * step;
        path.frame(s, f);
        const q = HW.Q.fromBasis({ x: f.rx, y: f.ry, z: f.rz }, { x: f.ux, y: f.uy, z: f.uz }, { x: -f.tx, y: -f.ty, z: -f.tz });
        const hz = step * 0.56;
        const at = (dr, du) => [f.px + f.rx * dr + f.ux * du, f.py + f.ry * dr + f.uy * du, f.pz + f.rz * dr + f.uz * du];
        let c = at(0, -floorT / 2);
        const Ws = path.widthAt ? path.widthAt(s) : W;
        fixedBox(api, c[0], c[1], c[2], Ws / 2 + wallT, floorT / 2, hz, q, { friction: 0.3 });
        for (const sg of [-1, 1]) {
          c = at(sg * (Ws / 2 + wallT / 2), (wallH - floorT) / 2);
          fixedBox(api, c[0], c[1], c[2], wallT / 2, (wallH + floorT) / 2, hz, q, { friction: 0.25 });
        }
      }
    }

    // --- hub moulding (boxes shared with the renderer, see layout.hub)
    if (L.hub) {
      const hub = L.hub, armW = hub.armW, { Lh, h0 } = L.dims;
      fixedBox(api, 0, h0 / 2 - 0.01, 0, armW, h0 / 2, Lh, null, { friction: 0.3 });
      fixedBox(api, 0, h0 / 2 - 0.01, 0, Lh, h0 / 2, armW, null, { friction: 0.3 });
      for (const b of [...hub.walls, hub.island, ...hub.housings, hub.battery]) {
        fixedBox(api, b.c[0], b.c[1], b.c[2], b.h[0], b.h[1], b.h[2], null, { friction: b.kind === 'wall' ? 0.25 : 0.4 });
      }
    }
    const fr = L.foamR;

    // foam wheels: kinematic cylinders (axis = world Y), spun every step by the sim
    for (const w of L.wheels) {
      // a booster on a slope turns about the track's up; the hub's four turn about the vertical
      const ax = w.axis || [0, 1, 0];
      const desc = R.RigidBodyDesc.kinematicVelocityBased().setTranslation(w.pos[0] + ax[0] * 0.7, w.pos[1] + ax[1] * 0.7, w.pos[2] + ax[2] * 0.7);
      if (w.axis) desc.setRotation(HW.Q.fromTo({ x: 0, y: 1, z: 0 }, { x: ax[0], y: ax[1], z: ax[2] }));
      const b = api.world.createRigidBody(desc);
      api.world.createCollider(R.ColliderDesc.cylinder(0.65, fr).setFriction(1.1).setRestitution(0.05)
        .setCollisionGroups(groups(GROUP_WORLD, GROUP_CAR)), b);
      api.foam.push(b); b.spinSign = w.spin || 1; b.axis = ax;
    }

    // loop support towers and sweep blocks (layout.supports)
    for (const sp of L.supports) {
      if (sp.top > 0.2) fixedBox(api, sp.x, sp.top / 2, sp.z, sp.half, sp.top / 2, sp.half, null, { friction: 0.4 });
    }
    // end buffers on open runs, and any solid props a set places (books, a box, a table)
    for (const b of L.solids || []) fixedBox(api, b.c[0], b.c[1], b.c[2], b.h[0], b.h[1], b.h[2], b.q || null, { friction: b.friction == null ? 0.4 : b.friction, rest: b.rest });
  }

  // ---------------------------------------------------------------- per-car bodies
  HW.freebody.addCar = function (api, car) {
    const R = api.R;
    const park = { x: car.id * 20, y: -500, z: 0 };
    const body = api.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(park.x, park.y, park.z)
      .setCcdEnabled(true).setLinearDamping(0.02).setAngularDamping(0.15));
    const e = car.entry, bh = car.boxHalf, rr = 0.14;
    const box = R.ColliderDesc.roundCuboid(bh.x - rr, bh.y - rr, bh.z - rr, rr)
      .setTranslation(0, car.boxCy, 0)
      .setFriction(0.3).setRestitution(0.3)
      .setMassProperties(car.m, { x: 0, y: car.cgH - car.boxCy, z: 0 },
        { x: car.m / 3 * (bh.y * bh.y + bh.z * bh.z), y: car.m / 3 * (bh.x * bh.x + bh.z * bh.z), z: car.m / 3 * (bh.x * bh.x + bh.y * bh.y) },
        { x: 0, y: 0, z: 0, w: 1 })
      .setCollisionGroups(0);
    const colliders = [api.world.createCollider(box, body)];
    // report hard contacts (floor, track, other cars) so the audio can clatter
    colliders[0].setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS);
    colliders[0].setContactForceEventThreshold(car.m * HW.units.G * 6);
    api.byCollider.set(colliders[0].handle, car);
    // Wheels are low-friction balls touching the running surface. A ball of the full wheel
    // radius at +-track/2 would reach past the body and past the channel walls (1.57-1.70 cm
    // from the centreline against a 1.59 cm half-lane), so every hand-off made inside the
    // channel would start wedged into both walls. Keep each ball inside the body's width.
    const rb = Math.min(e.wheelRadiusCm, 0.32), tx = Math.min(e.trackCm / 2, e.widthCm / 2 - rb - 0.02), wz = e.wheelbaseCm / 2;
    const wheels = [];
    for (const [x, z] of [[-tx, -wz], [tx, -wz], [-tx, wz], [tx, wz]]) {
      const wd = R.ColliderDesc.ball(rb).setTranslation(x, rb, z).setFriction(0.04).setRestitution(0.2)
        .setDensity(0.0001).setCollisionGroups(0);
      colliders.push(api.world.createCollider(wd, body));
      wheels.push({ x, y: rb, z, r: rb });
    }
    api.bodies.set(car, { body, colliders, wheels, park, active: false });
  };

  // a tuned car (coins taped under it) is heavier: keep the rigid body's mass in step
  HW.freebody.setMass = function (api, car) {
    const rec = api.bodies.get(car);
    if (!rec) return;
    const bh = car.boxHalf;
    try {
      rec.colliders[0].setMassProperties(car.m, { x: 0, y: car.cgH - car.boxCy, z: 0 },
        { x: car.m / 3 * (bh.y * bh.y + bh.z * bh.z), y: car.m / 3 * (bh.x * bh.x + bh.z * bh.z), z: car.m / 3 * (bh.x * bh.x + bh.y * bh.y) }, { x: 0, y: 0, z: 0, w: 1 });
    } catch (e) { /* older Rapier: the mass set at creation stands */ }
  };

  // derail: make the body dynamic at the car's current pose and velocity
  HW.freebody.activate = function (api, car) {
    const R = api.R, rec = api.bodies.get(car);
    const b = rec.body;
    b.setBodyType(R.RigidBodyType.Dynamic, true);
    b.setTranslation(car.pos, true);
    b.setRotation(car.quat, true);
    b.setLinvel(car.vel, true);
    b.setAngvel(car.angVel, true);
    for (const c of rec.colliders) c.setCollisionGroups(groups(GROUP_CAR, GROUP_WORLD | GROUP_CAR));
    rec.active = true;
  };

  HW.freebody.deactivate = function (api, car) {
    const R = api.R, rec = api.bodies.get(car);
    const b = rec.body;
    for (const c of rec.colliders) c.setCollisionGroups(0);
    b.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, false); b.setAngvel({ x: 0, y: 0, z: 0 }, false);
    b.setTranslation(rec.park, false);
    rec.active = false;
  };

  // copy pose/velocity from Rapier into the car
  HW.freebody.read = function (api, car) {
    const b = api.bodies.get(car).body;
    const t = b.translation(), q = b.rotation(), v = b.linvel(), w = b.angvel();
    car.pos.x = t.x; car.pos.y = t.y; car.pos.z = t.z;
    car.quat.x = q.x; car.quat.y = q.y; car.quat.z = q.z; car.quat.w = q.w;
    car.vel.x = v.x; car.vel.y = v.y; car.vel.z = v.z;
    car.angVel.x = w.x; car.angVel.y = w.y; car.angVel.z = w.z;
  };

  HW.freebody.setVel = function (api, car, v, w) {
    const b = api.bodies.get(car).body;
    b.setLinvel(v, true); b.setAngvel(w, true);
  };

  // die-cast wheels roll along the car but resist sliding sideways: apply that anisotropy
  // to free cars whose wheels touch something (Rapier friction is isotropic).
  HW.freebody.tyres = function (api, car, dt, muSide) {
    const rec = api.bodies.get(car), b = rec.body;
    const q = b.rotation(), t = b.translation();
    const up = HW.Q.rotate(q, { x: 0, y: 1, z: 0 }), right = HW.Q.rotate(q, { x: 1, y: 0, z: 0 });
    if (up.y < 0.3) return 0;                                // on its side or roof: no rolling
    const lv = b.linvel(), av = b.angvel();
    let touching = 0;
    for (const w of rec.wheels) {
      const wp = HW.Q.rotate(q, w);
      const origin = { x: t.x + wp.x, y: t.y + wp.y, z: t.z + wp.z };
      api.wheelRay.origin = origin; api.wheelRay.dir = { x: -up.x, y: -up.y, z: -up.z };
      const hit = api.world.castRay(api.wheelRay, w.r + 0.12, true, undefined, groups(GROUP_CAR, GROUP_WORLD), undefined, b);
      if (!hit) continue;
      touching++;
      const r = { x: wp.x, y: wp.y, z: wp.z };
      const vc = V.add(lv, V.cross(av, r));
      const vLat = V.dot(vc, right);
      // impulse that would cancel this wheel's share of the sideways slip, capped by friction
      const jMax = muSide * (car.m / 4) * HW.units.G * up.y * dt;
      const j = Math.max(-jMax, Math.min(jMax, -vLat * car.m / 4));
      b.applyImpulseAtPoint({ x: right.x * j, y: right.y * j, z: right.z * j }, { x: t.x + wp.x, y: t.y + wp.y, z: t.z + wp.z }, true);
    }
    return touching;
  };

  // step the world and report contact-force events as { car, force } (force in dyne)
  HW.freebody.stepWorld = function (api, dt) {
    api.world.timestep = dt;
    api.world.step(api.events);
    const out = [];
    api.events.drainContactForceEvents((ev) => {
      const car = api.byCollider.get(ev.collider1()) || api.byCollider.get(ev.collider2());
      if (car) out.push({ car, force: ev.totalForceMagnitude() });
    });
    return out;
  };

  HW.freebody.spinFoam = function (api, omegaW) {
    // all four wheels turn clockwise seen from above: negative angular velocity about +Y
    for (const b of api.foam) { const w = -omegaW * b.spinSign, a = b.axis; b.setAngvel({ x: a[0] * w, y: a[1] * w, z: a[2] * w }, true); }
  };
})(window.HW);
