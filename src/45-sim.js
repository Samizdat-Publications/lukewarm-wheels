// 45-sim.js - the simulation: fixed-step loop, car life cycle, collisions, events.
//
// Life cycle of a car:
//   parked -> (launch: a hand drops it at START HERE) -> track
//   track  -> (hard hit, lift-off, drift out of lane) -> free (Rapier rigid body)
//   free   -> (lands upright and aligned in a lane) -> track
//   free   -> (lies still, or leaves the table) -> retrieving -> track at START HERE
// Substeps run at cfg.substepHz for the on-track cars and the power train; Rapier steps at
// cfg.physHz only while at least one car is free.
(function (HW) {
  const V = HW.V, M = HW.math, Q = HW.Q;

  HW.Sim = class Sim {
    constructor({ cfg = HW.config, layout = null, RAPIER = null, catalog = HW.catalog } = {}) {
      this.cfg = cfg;
      this.layout = layout || HW.layout.build(cfg);
      this.power = HW.power.create(cfg, this.layout.foamR);
      this.time = 0;
      this.cars = [];
      this.events = [];
      this.crashCount = 0;
      this.fb = RAPIER ? HW.freebody.create(RAPIER, this.layout, cfg) : null;
      this.sub = 0;
      this.acc = 0;
      this.queue = [];                           // cars waiting to be dropped at START HERE
      this.record = { buf: [], every: 1 / 60, t: 0, max: 60 * 12 };
      this._obbA = null; this._obbB = null;
      this.rng = HW.rng(cfg.seed == null ? (Date.now() & 0xffff) : cfg.seed);
      for (const e of catalog) this.addCar(e);
    }

    emit(type, data) {
      data = data || {};
      data.t = this.time;
      this.events.push({ type, ...data });
      if (this.events.length > 400) this.events.splice(0, 100);
      HW.bus.emit(type, data);
    }

    addCar(entry) {
      const car = new HW.Car(entry);
      car.CdA = this.cfg.airCd * entry.widthCm * (entry.heightCm - car.clear);
      // no two real cars roll alike: axle burrs, a bent axle, a hair on a wheel
      car.crrMul = HW.math.clamp(1 + this.cfg.wheelSpread * this.rng.gauss(), 0.8, 1.25);
      this.cars.push(car);
      if (this.fb) HW.freebody.addCar(this.fb, car);
      return car;
    }

    // ------------------------------------------------------------ placing cars
    placeOnTrack(car, s, v = 0, d = 0, reversed = false) {
      if (car.mode === 'free' && this.fb) HW.freebody.deactivate(this.fb, car);
      car.mode = 'track'; car.status = 'running';
      car.s = M.wrap(s, this.layout.path.length); car.v = v; car.d = d; car.vd = 0; car.h = 0; car.vh = 0;
      car.reversed = reversed; car.stallT = 0; car.retrieve = null; car.inNip = null;
      HW.trackDynamics.pose(car, this.layout.path);
      if (car.lapStartT == null) car.lapStartT = this.time;
    }

    park(car) {
      if (car.mode === 'free' && this.fb) HW.freebody.deactivate(this.fb, car);
      car.mode = 'parked'; car.status = 'parked'; car.retrieve = null;
      car.pos.y = -1000;
      this.queue = this.queue.filter((q) => q.car !== car);
    }

    // a hand brings the car in from above and drops it into START HERE
    launch(car, fromPos) {
      if (car.mode === 'retrieving' || this.queue.some((q) => q.car === car)) return;
      if (car.mode === 'free' && this.fb) HW.freebody.deactivate(this.fb, car);
      const start = fromPos || { x: -6, y: 45, z: 55 };
      car.mode = 'retrieving'; car.status = 'incoming';
      car.retrieve = { t: 0, dur: 1.1, p0: V.clone(fromPos ? car.pos : start), q0: { ...car.quat }, wait: 0 };
      if (!fromPos) { car.pos = V.clone(start); car.quat = Q.fromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI * 0.8); car.retrieve.q0 = { ...car.quat }; }
    }

    lineUpAll(stagger = 0.55) {
      this.power.setSwitch(true);
      let k = 0;
      for (const car of this.cars) {
        if (car.mode === 'parked' && !this.queue.some((q) => q.car === car)) this.queue.push({ car, at: this.time + 0.35 + stagger * k++ });
      }
    }

    nudge(car) {
      const list = car ? [car] : this.cars.filter((c) => c.mode === 'track' && Math.abs(c.v) < 25);
      for (const c of list) if (c.mode === 'track') { c.v += 130; c.stallT = 0; c.status = 'running'; this.emit('nudge', { car: c }); }
    }

    reset() {
      for (const car of this.cars) {
        this.park(car);
        car.laps = 0; car.lapStartT = null; car.lastLap = null; car.bestLap = null; car.crashes = 0; car.topSpeed = 0; car.lapDebt = 0;
        for (const k in car.energy) car.energy[k] = 0;
      }
      this.queue = []; this.crashCount = 0; this.events = []; this.record.buf = [];
      this.power.reset();
    }

    // ------------------------------------------------------------ main loop
    update(dt) {
      dt = Math.min(dt, 1 / 15) * this.cfg.timeScale;
      this.acc += dt;
      const h = 1 / this.cfg.substepHz;
      let n = 0;
      while (this.acc >= h && n < 4000) { this.step(h); this.acc -= h; n++; }
    }

    step(h) {
      const cfg = this.cfg, L = this.layout, path = L.path;
      // queued launches
      if (this.queue.length) {
        const ready = this.queue.filter((q) => q.at <= this.time);
        for (const q of ready) { this.queue.splice(this.queue.indexOf(q), 1); this.launch(q.car); }
      }
      // on-track cars
      let tau = 0;
      for (const car of this.cars) {
        if (car.mode !== 'track') continue;
        const r = HW.trackDynamics.step(car, h, this);
        tau += r.tau;
        HW.trackDynamics.pose(car, path);
        if (r.derail) this.derail(car, r.derail);
        else this.watchStall(car, h);
      }
      this.power.step(h, tau);
      // retrievals / launches in flight
      for (const car of this.cars) if (car.mode === 'retrieving') this.advanceRetrieve(car, h);
      // car-car contacts
      this.contacts();
      // rigid bodies
      this.sub++;
      const ratio = Math.max(1, Math.round(cfg.substepHz / cfg.physHz));
      if (this.sub % ratio === 0) this.physStep(h * ratio);
      // replay buffer
      this.record.t += h;
      if (this.record.t >= this.record.every) { this.record.t -= this.record.every; this.snapshot(); }
      this.time += h;
    }

    watchStall(car, h) {
      const cfg = this.cfg;
      const sp = Math.abs(car.v);
      if (sp > car.topSpeed) car.topSpeed = sp;
      if (sp < 3 && !car.inNip) {
        car.stallT += h;
        if (car.stallT > cfg.stallTime && car.status !== 'stalled') { car.status = 'stalled'; this.emit('stall', { car }); }
        if (cfg.autoNudge && car.stallT > cfg.stallTime + 0.8) this.nudge(car);
      } else if (sp > 8) {
        car.stallT = 0;
        if (car.status === 'stalled' || car.status === 'crashed') car.status = 'running';
      }
    }

    // ------------------------------------------------------------ leaving the track
    derail(car, cause) {
      car.mode = 'free'; car.status = 'crashed';
      car.freeT = 0; car.restT = 0; car.noRecaptureT = this.cfg.recaptureDelay;
      car.inNip = null; car.Nf = 0; car.Nw = 0;
      if (this.fb) HW.freebody.activate(this.fb, car);
      this.emit('derail', { car, cause });
    }

    physStep(dt) {
      const fb = this.fb, cfg = this.cfg;
      const free = this.cars.filter((c) => c.mode === 'free');
      if (!fb) {
        // headless without Rapier: a derailed car is simply picked up after a moment
        for (const car of free) { car.freeT += dt; if (car.freeT > 0.5) this.startRetrieve(car); }
        return;
      }
      HW.freebody.spinFoam(fb, this.power.omegaW);
      if (!free.length) return;
      for (const car of free) HW.freebody.tyres(fb, car, dt, cfg.muSide);
      const hits = HW.freebody.stepWorld(fb, dt);
      if (hits.length) {
        this._impactT = this._impactT || new Map();
        for (const h of hits) {
          const last = this._impactT.get(h.car) || -1;
          if (this.time - last > 0.06) { this._impactT.set(h.car, this.time); this.emit('impact', { car: h.car, force: h.force, pos: V.clone(h.car.pos) }); }
        }
      }
      for (const car of free) {
        HW.freebody.read(fb, car);
        car.freeT += dt; car.noRecaptureT -= dt;
        const sp = Math.hypot(car.vel.x, car.vel.y, car.vel.z), wr = Math.hypot(car.angVel.x, car.angVel.y, car.angVel.z);
        if (sp < 4 && wr < 1.2) car.restT += dt; else car.restT = 0;
        const out = car.pos.y < -20 || Math.abs(car.pos.x) > 160 || Math.abs(car.pos.z) > 160;
        if (car.noRecaptureT <= 0 && this.tryRecapture(car)) continue;
        if (out || (cfg.autoRetrieve && car.restT > cfg.retrieveDelay) || car.freeT > 14) this.startRetrieve(car);
      }
    }

    tryRecapture(car) {
      const path = this.layout.path, cfg = this.cfg;
      const up = Q.rotate(car.quat, { x: 0, y: 1, z: 0 }), fwd = Q.rotate(car.quat, { x: 0, y: 0, z: -1 });
      // probe at the running-surface point under the car
      const nr = path.nearest(car.pos.x, car.pos.y, car.pos.z);
      if (!nr || nr.dist > 4) return false;
      const f = path.frame(nr.s, {});
      const dx = car.pos.x - f.px, dy = car.pos.y - f.py, dz = car.pos.z - f.pz;
      const d = dx * f.rx + dy * f.ry + dz * f.rz, hn = dx * f.ux + dy * f.uy + dz * f.uz;
      const dmax = (cfg.laneW - car.wid) / 2;
      if (Math.abs(d) > dmax + 0.45 || hn < -0.35 || hn > 0.6) return false;
      if (up.x * f.ux + up.y * f.uy + up.z * f.uz < 0.9) return false;
      const al = fwd.x * f.tx + fwd.y * f.ty + fwd.z * f.tz;
      if (Math.abs(al) < 0.9) return false;
      if (Math.hypot(car.angVel.x, car.angVel.y, car.angVel.z) > 9) return false;
      const vT = car.vel.x * f.tx + car.vel.y * f.ty + car.vel.z * f.tz;
      const vR = car.vel.x * f.rx + car.vel.y * f.ry + car.vel.z * f.rz;
      const vU = car.vel.x * f.ux + car.vel.y * f.uy + car.vel.z * f.uz;
      if (Math.abs(vR) > 80 || vU > 60) return false;
      // A car that has come to rest in a lane is debris, not a runner: leave it to the hand.
      // (Recapturing it stationary parks an obstacle in the # for the next car to hit.)
      if (Math.abs(vT) < 25 && !(this.power.state.on && this.nipAt(nr.s))) return false;
      // the floor must actually hold it here at this speed (not the underside of a loop top)
      const kU = f.kx * f.ux + f.ky * f.uy + f.kz * f.uz;
      if (vT * vT * kU + HW.units.G * f.uy < -50) return false;
      if (this.fb) HW.freebody.deactivate(this.fb, car);
      car.mode = 'track'; car.status = 'running';
      car.s = nr.s; car.v = vT; car.d = M.clamp(d, -dmax, dmax); car.vd = vR;
      car.h = Math.max(0, hn); car.vh = car.h > 0 ? vU : 0;
      car.reversed = al < 0; car.stallT = 0;
      HW.trackDynamics.pose(car, path);
      this.emit('recapture', { car });
      return true;
    }

    // is s inside a booster's reach?
    nipAt(s) {
      const L = this.layout;
      return L.boosters.some((b) => Math.abs(M.loopDelta(s, b.s, L.path.length)) < 4.5);
    }

    // Would a car launched from START HERE now meet anyone at a crossing during its first lap?
    // Every car is assumed to hold its average lap speed; a launched car takes ~40 ms to get
    // up to speed. A kid watching the set times the drop the same way.
    dropClear(car) {
      const L = this.layout, P = L.path, len = P.length, win = 0.075;
      const vNew = 360, tNew = (s) => 0.04 + M.wrap(s - L.startS, len) / vNew;
      for (const c of this.cars) {
        if (c === car || c.mode !== 'track') continue;
        if (Math.abs(M.loopDelta(c.s, L.startS, len)) < 10) return false;
        // average lap speed; before a first lap, the typical one (instantaneous speed swings 30 % round a loop)
        const vc = c.lastLap ? len / c.lastLap : len / 1.17;
        if (c.v < 40) continue;                                  // stopped cars are handled by the zone check
        for (const x of L.crossings) {
          for (let k = 0; k < 2; k++) {
            const tn = tNew(x.s[k]);                               // new car through this crossing on lane k
            let tc = M.wrap(x.s[1 - k] - c.s, len) / vc;           // other car through it on the other lane
            for (let lap = 0; lap < 2; lap++, tc += len / vc) if (Math.abs(tc - tn) < win) return false;
          }
        }
      }
      return true;
    }

    startRetrieve(car) {
      if (car.mode === 'free' && this.fb) HW.freebody.deactivate(this.fb, car);
      car.mode = 'retrieving'; car.status = 'retrieving';
      car.retrieve = { t: 0, dur: 1.25, p0: V.clone(car.pos), q0: { ...car.quat }, wait: 0 };
      this.emit('retrieve', { car });
    }

    // a smooth hand-carry: lift, arc over to START HERE, turn to face the lane, set down
    advanceRetrieve(car, h) {
      const L = this.layout, path = L.path, r = car.retrieve;
      const f = path.frame(L.startS, {});
      const target = { x: f.px, y: f.py, z: f.pz };
      const qT = Q.fromBasis({ x: f.rx, y: f.ry, z: f.rz }, { x: f.ux, y: f.uy, z: f.uz }, { x: -f.tx, y: -f.ty, z: -f.tz });
      r.t += h;
      const u = M.clamp(r.t / r.dur, 0, 1);
      const e = u * u * (3 - 2 * u);
      const lift = 16;
      const p1 = { x: r.p0.x, y: Math.max(r.p0.y, target.y) + lift, z: r.p0.z };
      const p2 = { x: target.x, y: target.y + lift, z: target.z };
      // cubic Bezier p0 -> p1 -> p2 -> target
      const a = 1 - e;
      car.pos.x = a * a * a * r.p0.x + 3 * a * a * e * p1.x + 3 * a * e * e * p2.x + e * e * e * target.x;
      car.pos.y = a * a * a * r.p0.y + 3 * a * a * e * p1.y + 3 * a * e * e * p2.y + e * e * e * target.y;
      car.pos.z = a * a * a * r.p0.z + 3 * a * a * e * p1.z + 3 * a * e * e * p2.z + e * e * e * target.z;
      Q.slerp(r.q0, qT, M.smoothstep(0.15, 0.85, u), car.quat);
      car.vel.x = car.vel.y = car.vel.z = 0;
      if (u >= 1) {
        // wait until the drop zone is clear, hovering just above it
        const zoneFree = !this.cars.some((c) => c !== car && c.mode === 'track' && Math.abs(M.loopDelta(c.s, L.startS, path.length)) < 9);
        const clear = zoneFree && (r.wait > 2.5 || this.dropClear(car));
        if (clear) { this.placeOnTrack(car, L.startS, 0, 0, false); this.emit('dropped', { car, waited: r.wait }); }
        else { car.pos.y = target.y + 3 + Math.sin(this.time * 6) * 0.4; r.wait += h; }
      }
    }

    // ------------------------------------------------------------ car-car contact
    contacts() {
      const cars = this.cars, n = cars.length, path = this.layout.path, cfg = this.cfg;
      for (let i = 0; i < n; i++) {
        const A = cars[i];
        if (A.mode !== 'track' && A.mode !== 'free') continue;
        for (let j = i + 1; j < n; j++) {
          const B = cars[j];
          if (B.mode !== 'track' && B.mode !== 'free') continue;
          if (A.mode === 'free' && B.mode === 'free') continue;          // Rapier handles these
          const dx = A.pos.x - B.pos.x, dy = A.pos.y - B.pos.y, dz = A.pos.z - B.pos.z;
          const reach = (A.len + B.len) / 2 + 0.5;
          if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
          if (A.mode === 'track' && B.mode === 'track') {
            const ds = M.loopDelta(B.s, A.s, path.length);
            if (Math.abs(ds) < (A.len + B.len) / 2 + 0.05 && Math.abs(ds) < 12) { this.bump(A, B, ds); continue; }
          }
          this._obbA = HW.collide.obb(A, this._obbA); this._obbB = HW.collide.obb(B, this._obbB);
          const hit = HW.collide.sat(this._obbA, this._obbB);
          if (hit) this.crash(A, B, hit);
        }
      }
    }

    // same lane: a one-dimensional collision along the track
    bump(A, B, ds) {
      // ds = s_B - s_A: B ahead if ds > 0
      const [rear, front] = ds > 0 ? [A, B] : [B, A];
      const overlap = (A.len + B.len) / 2 - Math.abs(ds);
      const closing = rear.v - front.v;
      if (closing > 0) {
        const e = this.cfg.carRest, mr = rear.m, mf = front.m;
        const J = (1 + e) * mr * mf / (mr + mf) * closing;
        rear.v -= J / mr; front.v += J / mf;
        // the rear car's nose rides up the front car's tail a little: a hard hit hops it
        rear.vh += 0.12 * closing * (0.7 + 0.6 * this.rng());
        if (rear.h <= 0) rear.h = 1e-4;
        const lost = 0.5 * mr * mf / (mr + mf) * closing * closing * (1 - e * e);
        rear.energy.impact += lost / 2; front.energy.impact += lost / 2;
        if (closing > 25) this.emit('bump', { a: rear, b: front, speed: closing, pos: V.lerp(rear.pos, front.pos, 0.5) });
      }
      if (overlap > 0) {
        const L = this.layout.path.length, w = rear.m / (rear.m + front.m);
        rear.s = M.wrap(rear.s - overlap * (1 - w), L); front.s = M.wrap(front.s + overlap * w, L);
      }
    }

    // anything else: a rigid-body impulse between two boxes; hard hits derail
    crash(A, B, hit) {
      const cfg = this.cfg;
      const bodyOf = (c, box) => ({ m: c.m, box, v: V.clone(c.vel), w: V.clone(c.angVel) });
      const bA = bodyOf(A, this._obbA), bB = bodyOf(B, this._obbB);
      const p = HW.collide.contactPoint(this._obbA, this._obbB);
      const res = HW.collide.impulse(bA, bB, p, hit.n, cfg.carRest, cfg.carMu);
      if (res.jn <= 0) return;
      const hard = res.closing > 60;
      const apply = (car, b, sign) => {
        // push apart along the normal by the penetration, heavier car moves less
        const share = (car === A ? B.m : A.m) / (A.m + B.m);
        const sep = V.scale(hit.n, sign * (hit.depth * share + 0.02));
        if (car.mode === 'free') {
          car.pos = V.add(car.pos, sep);
          if (this.fb) {
            const rb = this.fb.bodies.get(car).body;
            rb.setTranslation(car.pos, true);
            HW.freebody.setVel(this.fb, car, b.v, b.w);
          }
          car.vel = b.v; car.angVel = b.w;
          return;
        }
        // on the track: decide whether this knocks it out of the channel
        const f = car.frame;
        const dv = V.sub(b.v, car.vel), dw = V.sub(b.w, car.angVel);
        const dLat = dv.x * f.rx + dv.y * f.ry + dv.z * f.rz, dUp = dv.x * f.ux + dv.y * f.uy + dv.z * f.uz;
        const out = Math.abs(dLat) > 35 || dUp > 30 || V.len(dw) > 5 || hard;
        if (out) {
          car.pos = V.add(car.pos, sep);
          car.vel = b.v; car.angVel = b.w;
          this.derail(car, 'hit');
          if (this.fb) HW.freebody.setVel(this.fb, car, b.v, b.w);
        } else {
          car.v += dv.x * f.tx + dv.y * f.ty + dv.z * f.tz;
          car.vd += dLat; car.vh += Math.max(0, dUp);
          if (car.vh > 0 && car.h <= 0) car.h = 1e-4;
          car.s = M.wrap(car.s + (sep.x * f.tx + sep.y * f.ty + sep.z * f.tz), this.layout.path.length);
        }
      };
      apply(A, bA, -1); apply(B, bB, 1);
      if (res.closing > 25) {
        if (hard) { A.crashes++; B.crashes++; this.crashCount++; }
        const key = A.id < B.id ? A.id * 100 + B.id : B.id * 100 + A.id;
        this._lastHit = this._lastHit || new Map();
        if (hard || !(this.time - (this._lastHit.get(key) || -1) < 0.12)) {
          this._lastHit.set(key, this.time);
          this.emit(hard ? 'crash' : 'bump', { a: A, b: B, pos: p, speed: res.closing, impulse: res.jn });
        }
      }
    }

    // ------------------------------------------------------------ replay buffer
    snapshot() {
      const R = this.record;
      const cars = this.cars.map((c) => [c.pos.x, c.pos.y, c.pos.z, c.quat.x, c.quat.y, c.quat.z, c.quat.w, c.wheelSpin, c.mode === 'parked' ? 0 : 1]);
      R.buf.push({ t: this.time, cars, foam: this.power.state.wheelAngle, on: this.power.state.on });
      if (R.buf.length > R.max) R.buf.shift();
    }

    // ------------------------------------------------------------ queries
    carsOnTrack() { return this.cars.filter((c) => c.mode === 'track'); }
    setSwitch(on) { this.power.setSwitch(on); }
  };
})(window.HW);
