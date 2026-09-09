// 43-sim.js — Rapier world, fixed-step physics loop, events and telemetry (SPEC s5.8).
(function (HW) {
  const V = HW.V;

  const sim = {
    world: null, track: null, mesh: null, elec: null, boost: null, cars: [], eventQueue: null,
    time: 0, stepCount: 0, crashes: 0, telemetry: null, ready: false, carsByCollider: new Map(),
    trackColliders: [],

    create(cfg = HW.config) {
      const R = window.RAPIER;
      if (sim.world) sim.destroy();
      sim.world = new R.World({ x: 0, y: -HW.units.G, z: 0 });
      sim.world.timestep = 1 / cfg.physicsHz;
      // THE units gotcha (docs/DEPENDENCIES.md #1). Rapier's solver tolerances are *normalized* against
      // `lengthUnit` = how many world units make one metre. We work in cm, so it must be 100. Left at the
      // default 1 the contact prediction distance is 0.02 CM and the allowed linear error 0.005 CM: a car
      // moving 1.4 cm per step buries a corner in a wall before a contact is ever predicted, and the solver
      // then ejects it with a several-hundred-cm/s impulse that shows up as no contact at all afterwards.
      sim.world.lengthUnit = cfg.lengthUnit;
      sim.world.numSolverIterations = cfg.solverIterations;
      sim.world.maxCcdSubsteps = cfg.ccdSubsteps;
      sim.eventQueue = new R.EventQueue(true);
      sim.track = HW.track.build(cfg);
      sim.mesh = HW.trackMesh.build(sim.track, cfg);
      sim.buildTrackColliders(cfg);
      sim.elec = HW.electrical.create(cfg, sim.track);
      sim.boost = HW.booster.create(sim.track, cfg);
      sim.cars = HW.catalog.map((entry) => HW.vehicle.create(sim.world, sim.track, entry, cfg));
      sim.carsByCollider.clear();
      for (const c of sim.cars) sim.carsByCollider.set(c.colliderHandle, c);
      sim.time = 0; sim.stepCount = 0; sim.crashes = 0; sim.ready = true;
      sim.snapshot();
      HW.bus.emit('sim-created', sim);
      return sim;
    },

    buildTrackColliders(cfg) {
      const R = window.RAPIER, w = sim.world, mesh = sim.mesh;
      const floorFriction = cfg.vehicleMode === 'sled' ? 0.02 : cfg.floorFriction;
      const add = (desc, kind) => { const c = w.createCollider(desc); c.userData = { kind }; sim.trackColliders.push(c); return c; };
      // FIX_INTERNAL_EDGES is not optional. Without it a car crossing this ribbon at 300 cm/s catches on
      // the internal edges between the 0.25 cm-long strip triangles: the solver reports a contact whose
      // normal is the EDGE direction (near-horizontal), fires a several-hundred-cm/s impulse, and leaves
      // no manifold behind. That ghost-collision kick was the thing throwing cars off the lobes.
      const tmFlags = R.TriMeshFlags.FIX_INTERNAL_EDGES | R.TriMeshFlags.MERGE_DUPLICATE_VERTICES;
      add(R.ColliderDesc.trimesh(mesh.floor.positions, mesh.floor.indices, tmFlags).setFriction(floorFriction).setRestitution(0.05), 'floor');
      // walls are solid boxes (a thin two-sided trimesh wedges a cuboid pressed into it: contacts on both faces fight)
      const wr = Math.min(cfg.wallRound, cfg.wallThick / 2 - 0.02);
      for (const b of mesh.wallBoxes) add(R.ColliderDesc.roundCuboid(b.half.x - wr, b.half.y - wr, b.half.z - wr, wr).setTranslation(b.center.x, b.center.y, b.center.z).setRotation(b.quat).setFriction(cfg.wallFriction).setRestitution(cfg.wallRestitution), b.tapered ? 'taper' : 'wall');
      for (const p of mesh.hub.plates) add(R.ColliderDesc.cuboid(p.half.x, p.half.y, p.half.z).setTranslation(p.center.x, p.center.y, p.center.z).setFriction(floorFriction), 'plate');
      // a big catch floor 30 cm below so cars that fly off do not fall forever
      add(R.ColliderDesc.cuboid(300, 1, 300).setTranslation(0, -31, 0).setFriction(0.6), 'ground');
    },

    setSwitch(on) { sim.elec.setSwitch(on); },
    toggleSwitch() { sim.elec.setSwitch(!sim.elec.state.on); },

    step(dt) {
      if (!sim.ready) return;
      const cars = sim.cars;
      for (const c of cars) c.preStep(dt);
      const omegaW = sim.elec.omegaWheel;
      const tau = sim.boost.apply(cars, omegaW, dt);
      sim.elec.step(dt, tau);
      sim.world.step(sim.eventQueue);
      for (const c of cars) c.postStep(dt);
      sim.drainEvents();
      sim.time += dt; sim.stepCount++;
      if (sim.stepCount % 12 === 0) { sim.snapshot(); HW.bus.emit('telemetry', sim.telemetry); }
    },

    drainEvents() {
      sim.eventQueue.drainCollisionEvents((h1, h2, started) => {
        if (!started) return;
        const a = sim.carsByCollider.get(h1), b = sim.carsByCollider.get(h2);
        if (a && b) {
          const va = a.body.linvel(), vb = b.body.linvel();
          const closing = Math.hypot(va.x - vb.x, va.y - vb.y, va.z - vb.z);
          if (closing > HW.config.crashSpeed) {
            sim.crashes++; a.crashCount++; b.crashCount++; a.crashed = b.crashed = true;
            const p = a.body.translation();
            HW.bus.emit('crash', { a, b, closing, at: { x: p.x, y: p.y, z: p.z }, time: sim.time, total: sim.crashes });
          }
        }
      });
    },

    snapshot() {
      sim.telemetry = {
        t: sim.time, crashes: sim.crashes, elec: sim.elec.telemetry(),
        cars: sim.cars.map((c) => c.telemetry()),
        zones: sim.boost.zones.map((z) => ({ name: z.name, engaged: z.engaged, F: z.lastF })),
      };
      return sim.telemetry;
    },

    reset() {
      for (const c of sim.cars) { c.lift(); c.laps = 0; c.crashCount = 0; c.stalled = false; }
      sim.elec.reset(); sim.time = 0; sim.stepCount = 0; sim.crashes = 0;
      sim.snapshot(); HW.bus.emit('reset', sim);
    },

    // Put the five cars into five booster nips (SPEC s5.8). Staggered slightly so they do not
    // all hit the crossing in the same instant.
    lineUpFive() {
      const gates = sim.track.lineUp;
      sim.cars.forEach((car, i) => { car.spawnAtGate(gates[i % gates.length], (i % 2) * 0.8); });
      HW.bus.emit('lineup', sim);
    },
    placeCar(car, path, s, lateral = 0) { car.placeAt(path, s, lateral); HW.bus.emit('placed', { car }); },
    nudgeStalled() { for (const c of sim.cars) if (!c.lifted && (c.stalled || c.speed < HW.config.stallSpeed)) c.nudge(); },

    destroy() {
      for (const c of sim.cars) c.destroy();
      sim.cars = []; sim.trackColliders = [];
      if (sim.world) sim.world.free();
      sim.world = null; sim.ready = false;
    },
  };
  HW.sim = sim;
})(window.HW);
