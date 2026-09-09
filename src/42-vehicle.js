// 42-vehicle.js — a Hot Wheels car as a Rapier rigid body with a raycast vehicle
// controller (or a low-friction sled). Local axes: +X right, +Y up, -Z forward (three.js
// convention; the basis (right, up, -forward) is right-handed, so quaternions are valid).
(function (HW) {
  const V = HW.V, M = HW.math, U = HW.units;
  let nextId = 1;

  HW.vehicle = {
    create(world, track, entry, cfg = HW.config) {
      const R = window.RAPIER;
      const hx = entry.widthCm / 2, hy = entry.heightCm / 2, hz = entry.lengthCm / 2;
      const m = entry.massG;
      // box inertia (g.cm^2) about the chassis centre
      const Ixx = m / 12 * (entry.heightCm ** 2 + entry.lengthCm ** 2);
      const Iyy = m / 12 * (entry.widthCm ** 2 + entry.lengthCm ** 2);
      const Izz = m / 12 * (entry.widthCm ** 2 + entry.heightCm ** 2);
      const body = world.createRigidBody(
        R.RigidBodyDesc.dynamic().setTranslation(0, 50, 0).setCcdEnabled(true)
          .setLinearDamping(cfg.linDamping).setAngularDamping(cfg.angDamping).setCanSleep(false)
      );
      // Three vehicle models. 'wheels' is ours (see HW.wheelModel below) and is the default:
      // Rapier's own raycast controller dissipates 0.2 g of specific energy on a curve with all
      // four wheels down and no wall contact, and 0.5 g while riding a wall, and NOTHING exposed
      // by it changes that (frictionSlip, sideFriction, suspension force cap, damping all measured
      // -- see tools/attribute.mjs). 'sled' has the right energy budget (0.045 g) but a sliding box
      // tips at 2.4 g and the lobe pulls 5.9. 'raycast' is kept for comparison.
      const MODES = { sled: 1, raycast: 1, springs: 1, wheels: 1 };
      const mode = MODES[cfg.vehicleMode] ? cfg.vehicleMode : 'wheels';
      const raycast = mode === 'raycast';
      const ownWheels = mode === 'springs';
      const feet = mode === 'wheels';
      const rr = Math.min(cfg.carRound, hy * 0.4);
      const colDesc = R.ColliderDesc.roundCuboid(hx - rr, hy - rr, hz - rr, rr) // rounded corners: castings are, and it stops snagging
        .setMassProperties(m, { x: 0, y: -cfg.comDrop, z: 0 }, { x: Ixx, y: Iyy, z: Izz }, { x: 0, y: 0, z: 0, w: 1 })
        .setFriction(mode === 'sled' ? entry.crr * cfg.crrScale : cfg.carFriction).setRestitution(cfg.carRestitution)
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
      const collider = world.createCollider(colDesc, body);

      let controller = null;
      const wheelR = entry.wheelRadiusCm;
      // Wheel hard point height (chassis-local). At static compression the hard point sits
      // wheelR + (rest - comp) above the floor, and we want the chassis floor 0.15 cm clear.
      const CLEAR = cfg.carClearance;
      const staticComp = cfg.vehicleMode === 'raycast' ? U.G / (4 * cfg.suspStiffness) : cfg.wheelStaticComp;
      const connY = (wheelR + cfg.suspRest - staticComp) - (hy + CLEAR);
      if (raycast) {
        controller = world.createVehicleController(body);
        controller.setIndexForwardAxis = 2; // accessor, not a method (rapier 0.20 quirk): local Z is the forward axis
        const pts = [[-1, -1], [1, -1], [-1, 1], [1, 1]]; // (x sign, z sign): FL, FR, RL, RR; front = -Z
        pts.forEach(([sx, sz], i) => {
          controller.addWheel({ x: sx * entry.trackCm / 2, y: connY, z: sz * entry.wheelbaseCm / 2 }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, cfg.suspRest, wheelR);
          controller.setWheelSuspensionStiffness(i, cfg.suspStiffness);
          controller.setWheelSuspensionCompression(i, cfg.suspCompression);
          controller.setWheelSuspensionRelaxation(i, cfg.suspRelaxation);
          controller.setWheelMaxSuspensionTravel(i, cfg.suspTravel);
          // Cap the suspension force. Rapier (like Bullet) scales it by 1/dot(contactNormal, -rayDir);
          // when a car rolls that factor blows up and an uncapped wheel fires the car into the air.
          controller.setWheelMaxSuspensionForce(i, cfg.suspMaxForceMult * m * U.G / 4);
          controller.setWheelFrictionSlip(i, cfg.frictionSlip);
          controller.setWheelSideFrictionStiffness(i, cfg.sideFriction);
        });
      }

      // 'wheels' mode: four small low-friction FEET at the wheel contact patches, and that is the
      // whole model. No suspension: a die-cast car has none, and Rapier's solver handles the four
      // contacts implicitly, which is stable where an explicit spring is not (see 44-wheel-model.js
      // for what an explicit one costs). The feet are narrower than the chassis so the WALLS are
      // met by the body, not by the feet -- a wall force at foot height, below the centre of mass,
      // tips the car outward over the wall. Their friction is the casting's own rolling resistance,
      // so a free-rolling wheel is what it is: a contact that barely resists motion.
      // Big enough not to catch: a 0.15 cm ball moves 4 of its own radii per step at 300 cm/s and
      // snags on the floor trimesh (measured: -191 cm/s in one step, with no chassis manifold at
      // all because the hit was on a foot). Kept INBOARD of the chassis so the walls are met by the
      // body: a wall force at foot height is below the centre of mass and tips the car out over the
      // wall, where a wall force at body height leans it onto its outer feet, which is stable.
      const footR = Math.min(cfg.footRadius, wheelR);
      const footX = Math.min(entry.trackCm / 2, hx - footR - 0.05);
      const footY = -(hy + cfg.carClearance - footR);
      const footColliders = [];
      if (feet) {
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const fd = R.ColliderDesc.ball(footR)
            .setTranslation(sx * footX, footY, sz * entry.wheelbaseCm / 2)
            .setFriction(entry.crr * cfg.crrScale * cfg.footFrictionMult)
            .setRestitution(0)
            .setMass(0);           // the chassis collider already carries the whole mass and inertia
          footColliders.push(world.createCollider(fd, body));
        }
      }

      // Hard points for our own wheel model, chassis-local. Same layout as the raycast one:
      // index 0..3 = front-left, front-right, rear-left, rear-right; front is -Z.
      const hardPts = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({
        x: sx * entry.trackCm / 2, y: connY, z: sz * entry.wheelbaseCm / 2,
      }));
      const wheels = hardPts.map(() => ({ contact: false, comp: 0, load: 0 }));

      const car = {
        id: nextId++, entry, body, collider, controller, colliderHandle: collider.handle,
        mode, hardPts, wheels,
        halfLen: hz, halfW: hx, halfH: hy, wheelR,
        path: null, s: 0, lateral: 0, frame: null, speed: 0, fwdSpeed: 0,
        laps: 0, stalled: false, stallTimer: 0, crashed: false, offTrack: false, inBooster: null,
        lifted: true, crashCount: 0, lastLapT: 0,
        pos: { x: 0, y: 50, z: 0 }, quat: { x: 0, y: 0, z: 0, w: 1 },

        placeAt(path, s, lateral = 0) {
          const f = path.sample(s);
          const p = V.addScaled(V.addScaled(f.p, f.right, lateral), f.up, hy + cfg.carClearance); // wheels exactly at static rest
          const q = M.quatFromBasis(f.right, f.up, V.scale(f.t, -1)); // local -Z = lane tangent
          car.drop();
          body.setTranslation(p, true); body.setRotation(q, true);
          body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          car.path = path; car.s = f.s; car.lateral = lateral; car.frame = f;
          car.stalled = false; car.stallTimer = 0; car.offTrack = false; car.crashed = false;
          car.postStep();
        },
        // Put the car at a booster gate: nose just inside the nip so a running (or starting) wheel
        // pulls it in without stalling the motor. `back` adds extra distance before the nip.
        spawnAtGate(gateName, back = 0) {
          const g = track.gates[gateName]; if (!g) throw new Error('no gate ' + gateName);
          const noseIn = 0.6;
          car.placeAt(g.path, g.s - (hz + cfg.boostExtra - noseIn) - back, 0);
          car.gate = gateName;
        },
        // Lifted cars are parked far above the table as kinematic bodies. (Do NOT use
        // setEnabled(false): a body that sat disabled while the world stepped makes the
        // vehicle controller emit NaN velocities on re-enable in rapier 0.20.)
        lift() {
          car.lifted = true; car.inBooster = null;
          body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
          body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          body.setTranslation({ x: 200 + car.id * 20, y: 300, z: 0 }, true);
        },
        drop() {
          car.lifted = false;
          body.setBodyType(R.RigidBodyType.Dynamic, true);
          body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        },
        nudge(scale = 1) {
          if (car.lifted || !car.frame) return;
          const t = car.frame.t, J = cfg.nudgeImpulse * scale;
          body.applyImpulse({ x: t.x * J, y: t.y * J, z: t.z * J }, true);
          car.stalled = false; car.stallTimer = 0;
        },
        // called before world.step: forces + suspension
        preStep(dt) {
          if (car.lifted) return;
          // BOTH accumulators. Rapier keeps force and torque separately, and addForceAtPoint adds
          // to both -- so resetting only the force leaves every step's torque on the body forever.
          // Nothing noticed while the only forces were addForce (no torque) and Rapier's own
          // vehicle controller (impulses, not forces); it made our own wheel model diverge in a
          // few hundred steps and throw every car off the track.
          body.resetForces(true); body.resetTorques(true);
          const p = body.translation(); car.pos = p;
          if (car.path) {
            const pr = car.path.project(p, car.s);
            car.frame = pr.frame; car.lateral = pr.lateral; car.height = pr.height; car.dist = pr.dist;
            // lap detection: s wrapped from high to low while moving forward
            const prev = car.s; car.s = pr.s;
            if (prev > car.path.length * 0.8 && car.s < car.path.length * 0.2 && car.fwdSpeed > 5) {
              car.laps++; HW.bus.emit('lap', { car, laps: car.laps });
            }
            if (pr.dist > 10 || p.y < -10) { if (!car.offTrack) HW.bus.emit('offtrack', { car }); car.offTrack = true; }
            if (p.y < -6) { car.lift(); return; } // fell off the table: back to the tray
          }
          const v = body.linvel(); const sp = Math.hypot(v.x, v.y, v.z); car.speed = sp;
          car.fwdSpeed = car.frame ? v.x * car.frame.t.x + v.y * car.frame.t.y + v.z * car.frame.t.z : sp;
          // rolling resistance: constant retarding force opposing motion (axle friction dominated)
          if (sp > 0.3) {
            const F = entry.crr * cfg.crrScale * m * U.G;
            body.addForce({ x: -v.x / sp * F, y: -v.y / sp * F, z: -v.z / sp * F }, true);
          }
          if (controller) controller.updateVehicle(dt);
          else if (ownWheels) HW.wheelModel.step(car, world, cfg, dt);
        },
        // called after world.step: bookkeeping
        postStep(dt = 0) {
          if (car.lifted) return;
          car.pos = body.translation(); car.quat = body.rotation();
          if (dt > 0) {
            if (!car.inBooster && car.speed < cfg.stallSpeed && !car.offTrack) {
              car.stallTimer += dt;
              if (!car.stalled && car.stallTimer > cfg.stallTime) { car.stalled = true; HW.bus.emit('stall', { car }); }
            } else { car.stallTimer = 0; if (car.stalled && car.speed > cfg.stallSpeed * 3) car.stalled = false; }
          }
        },
        wheelState(i) {
          if (controller) return { rot: controller.wheelRotation(i) || 0, len: controller.wheelSuspensionLength(i), contact: controller.wheelIsInContact(i) };
          if (feet) {
            // no suspension to report; "contact" means this foot is on something
            let touching = false;
            world.contactPairsWith(footColliders[i], () => { touching = true; });
            return { rot: 0, len: 0, contact: touching };
          }
          if (!ownWheels) return null;
          const w = wheels[i];
          return { rot: 0, len: cfg.suspRest - w.comp, contact: w.contact, load: w.load };
        },
        telemetry() {
          return { id: car.id, name: entry.name, speed: car.speed, fwdSpeed: car.fwdSpeed, scaleKmh: U.cmsToScaleKmh(car.speed),
            s: car.s, lateral: car.lateral, laps: car.laps, stalled: car.stalled, crashed: car.crashed, crashCount: car.crashCount,
            inBooster: car.inBooster, lifted: car.lifted, offTrack: car.offTrack, circuit: car.path ? car.path.name : null };
        },
        destroy() { if (controller) controller.free(); world.removeRigidBody(body); },
      };
      body.userData = { carId: car.id };
      car.lift();
      return car;
    },
  };
})(window.HW);
