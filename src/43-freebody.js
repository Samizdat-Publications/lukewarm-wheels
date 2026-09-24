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
      const api = { R, world, bodies: new Map(), statics: [], foam: [], wheelRay: new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }) };
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
    const R = api.R, path = L.path, { p, Lh, h0, W, wallT, wallH, floorT } = L.dims;
    // floor
    fixedBox(api, 0, -2, 0, 400, 2, 400, null, { friction: 0.55, rest: 0.15 });

    // --- track channel along every lobe: floor slabs + two walls per ~1.2 cm
    const f = {};
    for (const name in L.lobes) {
      const lobe = L.lobes[name];
      const n = Math.ceil((lobe.s1 - lobe.s0) / 1.2), step = (lobe.s1 - lobe.s0) / n;
      for (let k = 0; k < n; k++) {
        const s = lobe.s0 + (k + 0.5) * step;
        path.frame(s, f);
        const q = HW.Q.fromBasis({ x: f.rx, y: f.ry, z: f.rz }, { x: f.ux, y: f.uy, z: f.uz }, { x: -f.tx, y: -f.ty, z: -f.tz });
        const hz = step * 0.56;
        const at = (dr, du) => [f.px + f.rx * dr + f.ux * du, f.py + f.ry * dr + f.uy * du, f.pz + f.rz * dr + f.uz * du];
        let c = at(0, -floorT / 2);
        fixedBox(api, c[0], c[1], c[2], W / 2 + wallT, floorT / 2, hz, q, { friction: 0.3 });
        for (const sg of [-1, 1]) {
          c = at(sg * (W / 2 + wallT / 2), (wallH - floorT) / 2);
          fixedBox(api, c[0], c[1], c[2], wallT / 2, (wallH + floorT) / 2, hz, q, { friction: 0.25 });
        }
      }
    }

    // --- hub moulding: a plus-shaped deck with lane walls, a centre island, housings
    const armW = p + W / 2 + wallT + 0.6;                 // half width of an arm
    fixedBox(api, 0, h0 / 2 - 0.01, 0, armW, h0 / 2, Lh, null, { friction: 0.3 });
    fixedBox(api, 0, h0 / 2 - 0.01, 0, Lh, h0 / 2, armW, null, { friction: 0.3 });
    const gapHalf = W / 2 + wallT, bAt = cfg.boosterAt, fr = L.foamR;
    // walls along a lane at lateral offset `off` from its centreline, skipping [a,b] intervals
    const laneWalls = (ln, off, skips) => {
      const Ln = L.lanes[ln], dir = Ln.dir, a = Ln.from;
      const right = [-dir[2], 0, dir[0]];                   // T x U for a horizontal lane
      let cuts = [[-Lh, Lh]];
      for (const [s0, s1] of skips) {
        const next = [];
        for (const [u0, u1] of cuts) {
          if (s1 <= u0 || s0 >= u1) { next.push([u0, u1]); continue; }
          if (s0 > u0) next.push([u0, s0]);
          if (s1 < u1) next.push([s1, u1]);
        }
        cuts = next;
      }
      const cx0 = a[0] + dir[0] * Lh, cz0 = a[2] + dir[2] * Lh;  // lane midpoint (hub centre line)
      for (const [u0, u1] of cuts) {
        if (u1 - u0 < 0.3) continue;
        const um = (u0 + u1) / 2, half = (u1 - u0) / 2;
        const x = cx0 + dir[0] * um + right[0] * off, z = cz0 + dir[2] * um + right[2] * off;
        const hx = dir[0] !== 0 ? half : wallT / 2, hz = dir[2] !== 0 ? half : wallT / 2;
        fixedBox(api, x, h0 + (wallH + 0.3) / 2 - 0.3, z, hx, (wallH + 0.3) / 2, hz, null, { friction: 0.25 });
      }
    };
    // crossings are at lane coordinate +-p; boosters at +-bAt on the RIGHT (inner) wall
    for (const ln of ['C', 'A', 'D', 'B']) {
      const cross = [[-p - gapHalf, -p + gapHalf], [p - gapHalf, p + gapHalf]];
      laneWalls(ln, -(W / 2 + wallT / 2), cross);                                   // left / outer wall
      laneWalls(ln, W / 2 + wallT / 2, cross.concat([[-bAt - fr, -bAt + fr], [bAt - fr, bAt + fr]]));  // right / inner
    }
    // centre island (idler housing) and the four booster housings' covers
    const isl = p - W / 2 - wallT;
    fixedBox(api, 0, h0 + 0.9, 0, isl, 0.9, isl, null);
    for (const w of L.wheels) {
      fixedBox(api, w.pos[0], h0 + 1.9, w.pos[2], w.pos[0] === 0 ? isl : fr + 0.4, 0.35, w.pos[2] === 0 ? isl : fr + 0.4, null);
    }
    // battery / motor box in the north-east quadrant
    fixedBox(api, armW + 5.2, 3.6, -(armW + 5.2), 5.0, 3.6, 5.0, null, { friction: 0.4 });

    // foam wheels: kinematic cylinders (axis = world Y), spun every step by the sim
    for (const w of L.wheels) {
      const b = api.world.createRigidBody(R.RigidBodyDesc.kinematicVelocityBased().setTranslation(w.pos[0], h0 + 0.7, w.pos[2]));
      api.world.createCollider(R.ColliderDesc.cylinder(0.65, fr).setFriction(1.1).setRestitution(0.05)
        .setCollisionGroups(groups(GROUP_WORLD, GROUP_CAR)), b);
      api.foam.push(b);
    }

    // loop support posts (vertical boxes under each loop's apex) and sweep blocks
    L.supports = [];
    for (const name in L.lobes) {
      const lobe = L.lobes[name];
      const best = (lobe.s0 + lobe.s1) / 2;                  // the apex: the two halves are mirror images
      path.frame(best, f);
      const by = f.py;
      if (lobe.kind === 'loop') {
        // the post stands just outside the apex, on the side away from the hub
        const out = V.norm({ x: f.px, y: 0, z: f.pz });
        const bx = f.px + out.x * 2.2, bz = f.pz + out.z * 2.2, top = by + 0.8;
        fixedBox(api, bx, top / 2, bz, 0.55, top / 2, 0.55, null);
        L.supports.push({ lobe: name, kind: 'post', x: bx, z: bz, top, apexS: best });
      } else {
        // the sweep's far end rests on a stepped block
        const lowest = by;
        L.supports.push({ lobe: name, kind: 'block', x: f.px, z: f.pz, top: Math.max(0.2, f.py - floorT), apexS: best });
        if (lowest - floorT > 0.3) fixedBox(api, f.px, (f.py - floorT) / 2, f.pz, 1.6, (f.py - floorT) / 2, 1.6, null);
      }
    }
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
    const rw = e.wheelRadiusCm, tx = e.trackCm / 2, wz = e.wheelbaseCm / 2;
    const wheels = [];
    for (const [x, z] of [[-tx, -wz], [tx, -wz], [-tx, wz], [tx, wz]]) {
      const wd = R.ColliderDesc.ball(rw).setTranslation(x, rw, z).setFriction(0.04).setRestitution(0.2)
        .setDensity(0.0001).setCollisionGroups(0);
      colliders.push(api.world.createCollider(wd, body));
      wheels.push({ x, y: rw, z });
    }
    api.bodies.set(car, { body, colliders, wheels, park, active: false });
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
      const hit = api.world.castRay(api.wheelRay, car.entry.wheelRadiusCm + 0.12, true, undefined, groups(GROUP_CAR, GROUP_WORLD), undefined, b);
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

  HW.freebody.spinFoam = function (api, omegaW) {
    // all four wheels turn clockwise seen from above: negative angular velocity about +Y
    for (const b of api.foam) b.setAngvel({ x: 0, y: -omegaW, z: 0 }, true);
  };
})(window.HW);
