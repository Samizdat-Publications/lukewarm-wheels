// 57-fx.js - crash effects and the instant replay.
// Effects: a comic impact star and a ground shockwave where two cars hit; both scale with
// the closing speed. Replay: the sim keeps the last 12 s of car poses at 60 Hz
// (Sim.snapshot); a replay pauses the sim and plays the last few seconds back at half or
// quarter speed through the director's cameras, centred on the most recent crash.
(function (HW) {
  const FX = (HW.fx = {
    bursts: [],
    init(scene) {
      const T = window.THREE;
      const star = HW.tex.canvas(256, 256), x = star.getContext('2d');
      x.translate(128, 128);
      const g = x.createRadialGradient(0, 0, 4, 0, 0, 120);
      g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.25, 'rgba(255,220,120,0.9)'); g.addColorStop(1, 'rgba(255,120,30,0)');
      x.fillStyle = g;
      x.beginPath();
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2, r = i % 2 ? 46 : 122;
        x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      x.closePath(); x.fill();
      const ring = HW.tex.canvas(256, 256), y = ring.getContext('2d');
      const rg = y.createRadialGradient(128, 128, 60, 128, 128, 126);
      rg.addColorStop(0, 'rgba(255,230,180,0)'); rg.addColorStop(0.8, 'rgba(255,230,180,0.55)'); rg.addColorStop(1, 'rgba(255,230,180,0)');
      y.fillStyle = rg; y.fillRect(0, 0, 256, 256);
      FX.starMat = new T.SpriteMaterial({ map: HW.tex.three(star), transparent: true, depthWrite: false, blending: T.AdditiveBlending });
      FX.ringMat = new T.MeshBasicMaterial({ map: HW.tex.three(ring), transparent: true, depthWrite: false, blending: T.AdditiveBlending });
      FX.scene = scene;
      HW.bus.on('crash', (e) => FX.burst(e.pos, e.speed));
    },
    burst(pos, speed) {
      const T = window.THREE;
      if (!FX.starMat || FX.bursts.length > 12) return;
      const k = Math.min(1.6, speed / 400);
      const s = new T.Sprite(FX.starMat.clone());
      s.position.set(pos.x, pos.y + 1, pos.z);
      s.material.rotation = Math.random() * 6.28;
      const r = new T.Mesh(new T.PlaneGeometry(1, 1), FX.ringMat.clone());
      r.rotation.x = -Math.PI / 2;
      r.position.set(pos.x, Math.max(0.05, pos.y - 1.2), pos.z);
      FX.scene.add(s, r);
      FX.bursts.push({ s, r, t: 0, k });
    },
    update(dt) {
      for (let i = FX.bursts.length - 1; i >= 0; i--) {
        const b = FX.bursts[i];
        b.t += dt;
        const u = b.t / 0.45;
        b.s.scale.setScalar((2 + 9 * Math.min(1, u * 2.2)) * b.k);
        b.s.material.opacity = Math.max(0, 1 - u);
        b.r.scale.setScalar((3 + 26 * u) * b.k);
        b.r.material.opacity = Math.max(0, 0.9 - u);
        if (u >= 1) { FX.scene.remove(b.s, b.r); b.s.material.dispose(); b.r.material.dispose(); b.r.geometry.dispose(); FX.bursts.splice(i, 1); }
      }
    },
  });

  // ---------------------------------------------------------------- replay
  const RP = (HW.replay = {
    active: false,
    lastCrash: null,
    init() {
      HW.bus.on('crash', (e) => { if (e.speed > 120) RP.lastCrash = { t: e.t, pos: { ...e.pos }, r: 22 }; });
      // a jump replays round the middle of its flight, framed wide enough for the whole arc
      HW.bus.on('jump', (e) => { if (e.air > 0.1) RP.lastCrash = { t: e.t0 + e.air, pos: { x: (e.p0.x + e.p1.x) / 2, y: Math.max(e.p0.y, e.p1.y), z: (e.p0.z + e.p1.z) / 2 }, r: Math.max(26, e.dist * 0.9) }; });
    },
    available(sim) { return sim.record.buf.length > 90; },
    start(sim, secs = 5, speed = 0.4) {
      if (RP.active || !RP.available(sim)) return;
      const buf = sim.record.buf;
      const end = buf[buf.length - 1].t;
      // centre on the last crash if it is recent enough, otherwise the last few seconds
      let t1 = end;
      if (RP.lastCrash && end - RP.lastCrash.t < 10) t1 = Math.min(end, RP.lastCrash.t + 1.6);
      const t0 = Math.max(buf[0].t, t1 - secs);
      RP.frames = buf.filter((f) => f.t >= t0 && f.t <= t1);
      RP.t = t0; RP.t0 = t0; RP.t1 = t1; RP.speed = speed; RP.active = true;
      RP.saved = { mode: HW.cam.mode, car: HW.cam.car, crashCam: HW.cam.crashCam };
      HW.main.paused = true;
      HW.cam.crashCam = false;
      RP.focus = RP.lastCrash && RP.lastCrash.t >= t0 ? RP.lastCrash.pos : null;
      RP.focusR = RP.focus ? RP.lastCrash.r || 22 : 60;
      HW.cam.startBlend();
      HW.bus.emit('replay', { on: true });
    },
    stop() {
      if (!RP.active) return;
      RP.active = false;
      HW.main.paused = false;
      // put every car back where the paused sim really has it
      const sim = HW.sim;
      for (const car of sim.cars) {
        if (car.mode === 'track') HW.trackDynamics.pose(car, car.track || sim.layout.path);
        else if (car.mode === 'free' && sim.fb) HW.freebody.read(sim.fb, car);
        else if (car.mode === 'parked') car.pos.y = -1000;
      }
      HW.cam.crashCam = RP.saved.crashCam;
      HW.cam.setMode(RP.saved.mode, RP.saved.car);
      HW.bus.emit('replay', { on: false });
    },
    // write the interpolated frame into the cars' poses (the sim is paused; its next step
    // recomputes every pose from its own state, so nothing needs restoring)
    update(dt, sim) {
      if (!RP.active) return;
      RP.t += dt * RP.speed;
      if (RP.t >= RP.t1) { RP.stop(); return; }
      const F = RP.frames;
      let i = 0; while (i < F.length - 2 && F[i + 1].t < RP.t) i++;
      const a = F[i], b = F[Math.min(i + 1, F.length - 1)];
      const u = b.t > a.t ? HW.math.clamp((RP.t - a.t) / (b.t - a.t), 0, 1) : 0;
      sim.cars.forEach((car, k) => {
        const A = a.cars[k], B = b.cars[k];
        car._replayVisible = A[8] > 0;
        car.pos.x = A[0] + (B[0] - A[0]) * u; car.pos.y = A[1] + (B[1] - A[1]) * u; car.pos.z = A[2] + (B[2] - A[2]) * u;
        HW.Q.slerp({ x: A[3], y: A[4], z: A[5], w: A[6] }, { x: B[3], y: B[4], z: B[5], w: B[6] }, u, car.quat);
        car._replaySpin = A[7] + (B[7] - A[7]) * u;
      });
      sim.power.state.wheelAngle = a.foam + (b.foam - a.foam) * u;
    },
    // camera for the replay: a slow arc around the crash (or the hub), low and close
    camera(dt) {
      const T = window.THREE;
      const p = RP.focus || { x: 0, y: 5, z: 0 };
      const age = RP.t - RP.t0;
      const a = 0.6 + age * 0.35;
      const r = RP.focusR || 60;
      return { pos: new T.Vector3(p.x + Math.sin(a) * r, p.y + (RP.focus ? 4 + r * 0.25 : 30), p.z + Math.cos(a) * r), look: new T.Vector3(p.x, p.y + 1, p.z), up: new T.Vector3(0, 1, 0), fov: 36, near: 0.2 };
    },
  });
})(window.HW);
