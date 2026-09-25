// 56-camera.js - camera director.
//   orbit    free orbit around the set (default)
//   chase    lazy follow behind a car, always above the floor
//   onboard  bumper cam: rides the car, upside down through the loops
//   top      plan view, like the instruction sheet's diagram
//   director cuts between wide orbits, chases, a loop cam, a crossing cam and onboard,
//            and cuts to a slow-motion crash cam when two cars hit hard
// Mode changes blend over ~0.7 s instead of cutting, except the crash cam, which cuts.
(function (HW) {
  const V = HW.V, M = HW.math;
  // In portrait the horizontal field shrinks; widen the vertical one so the set still fits.
  const fit = (fov) => {
    const a = (HW.render && HW.render.camera && HW.render.camera.aspect) || 1.6;
    if (a >= 1.25) return fov;
    const k = Math.min(2.2, Math.pow(1.25 / a, 0.85));
    return 2 * Math.atan(Math.tan(fov * Math.PI / 360) * k) * 180 / Math.PI;
  };
  const C = (HW.cam = {
    mode: 'orbit', car: null, crashCam: true,
    init(camera, dom) {
      const T = window.THREE, X = window.THREEX;
      C.camera = camera;
      C.controls = new X.OrbitControls(camera, dom);
      C.controls.target.set(0, 6, 4);
      C.controls.enableDamping = true; C.controls.dampingFactor = 0.08;
      C.controls.minDistance = 12; C.controls.maxDistance = 320;
      C.controls.maxPolarAngle = Math.PI * 0.49;
      C.controls.zoomSpeed = 0.9;
      C.blend = null;
      C.tmp = { p: new T.Vector3(), q: new T.Quaternion(), m: new T.Matrix4(), look: new T.Vector3(), up: new T.Vector3(0, 1, 0) };
      C.chase = { pos: null, dir: new T.Vector3(0, 0, -1) };
      C.dir = { shot: null, t: 0, len: 0, idx: 0 };
      C.crash = null;
      HW.bus.on('crash', (e) => C.onCrash(e));
    },

    setMode(mode, car) {
      if (car !== undefined) C.car = car;
      if (mode === C.mode && car === undefined) return;
      C.startBlend();
      C.mode = mode;
      C.controls.enabled = mode === 'orbit';
      if (mode === 'orbit') {
        // orbit around wherever we were looking
        const fwd = new window.THREE.Vector3(0, 0, -1).applyQuaternion(C.camera.quaternion);
        C.controls.target.copy(C.camera.position).addScaledVector(fwd, 60);
        C.controls.target.y = M.clamp(C.controls.target.y, 2, 20);
        C.controls.target.x = M.clamp(C.controls.target.x, -40, 40); C.controls.target.z = M.clamp(C.controls.target.z, -40, 40);
      }
      if (mode === 'director') { C.dir.shot = null; }
      C.chase.pos = null;
      HW.bus.emit('camera', { mode, car: C.car });
    },

    startBlend() {
      const T = window.THREE;
      C.blend = { t: 0, dur: 0.7, p: C.camera.position.clone(), q: C.camera.quaternion.clone(), fov: C.camera.fov };
    },

    onCrash(e) {
      if (!C.crashCam || !(C.mode === 'director' || C.mode === 'orbit' && C.autoCrash) || e.speed < 170) return;
      if (C.crash && HW.sim.time - C.crash.t0 < 4) return;
      C.crash = { t0: HW.sim.time, real: 0, pos: V.clone(e.pos), prevMode: C.mode, dur: 2.2 };
      // a low, close angle, looking across the crash toward the set's centre
      const out = V.norm({ x: e.pos.x + 0.001, y: 0, z: e.pos.z + 0.001 });
      const side = { x: -out.z, y: 0, z: out.x };
      const T = window.THREE;
      C.crash.camPos = new T.Vector3(e.pos.x + out.x * 16 + side.x * 12, e.pos.y + 7, e.pos.z + out.z * 16 + side.z * 12);
      HW.main && HW.main.slowmo && HW.main.slowmo(0.22, 1.6);
    },

    // desired camera pose for the current mode -> {pos, look, up, fov, near}
    desired(dt, sim) {
      const T = window.THREE, cam = C.camera, tmp = C.tmp;
      const car = C.car && C.car.mode !== 'parked' ? C.car : null;
      if (HW.replay && HW.replay.active) return HW.replay.camera(dt);
      if (C.crash) {
        C.crash.real += dt;
        if (C.crash.real > C.crash.dur) C.crash = null;
        else return { pos: C.crash.camPos, look: new T.Vector3(C.crash.pos.x, C.crash.pos.y + 1, C.crash.pos.z), up: new T.Vector3(0, 1, 0), fov: 34, near: 0.2 };
      }
      let mode = C.mode;
      if (mode === 'director') return C.director(dt, sim);
      if ((mode === 'chase' || mode === 'onboard') && !car) mode = 'orbit';
      if (mode === 'onboard' && car.mode !== 'track' && car.mode !== 'retrieving') mode = 'chase';
      if (mode === 'orbit') return null;
      if (mode === 'top') return { pos: new T.Vector3(0, 175, 0.01), look: new T.Vector3(0, 0, 0), up: new T.Vector3(0, 0, -1), fov: 36, near: 1 };
      const q = new T.Quaternion(car.quat.x, car.quat.y, car.quat.z, car.quat.w);
      const fwd = new T.Vector3(0, 0, -1).applyQuaternion(q), up = new T.Vector3(0, 1, 0).applyQuaternion(q);
      const cp = new T.Vector3(car.pos.x, car.pos.y, car.pos.z);
      if (mode === 'onboard') {
        const e = car.entry;
        const pos = cp.clone().addScaledVector(up, e.heightCm * 0.95).addScaledVector(fwd, -e.lengthCm * 0.05);
        return { pos, look: pos.clone().addScaledVector(fwd, 20).addScaledVector(up, -1.2), up, fov: 72, near: 0.05, rigid: true };
      }
      // chase: follow the direction of travel lazily, stay above the floor
      const vel = new T.Vector3(car.vel.x, car.vel.y, car.vel.z);
      if (vel.lengthSq() > 400) C.chase.dir.lerp(vel.normalize(), 1 - Math.exp(-dt * 3)).normalize();
      const flat = C.chase.dir.clone(); flat.y *= 0.35; flat.normalize();
      const want = cp.clone().addScaledVector(flat, -19).add(new T.Vector3(0, 8.5, 0));
      if (!C.chase.pos) C.chase.pos = want.clone();
      C.chase.pos.lerp(want, 1 - Math.exp(-dt * 4));
      C.chase.pos.y = Math.max(C.chase.pos.y, 2.5);
      return { pos: C.chase.pos.clone(), look: cp.clone().addScaledVector(C.chase.dir, 5).add(new T.Vector3(0, 1.2, 0)), up: new T.Vector3(0, 1, 0), fov: 52, near: 0.15 };
    },

    // the auto-director: a list of shots, each held for a few seconds
    director(dt, sim) {
      const T = window.THREE, d = C.dir;
      d.t += dt;
      const running = sim.cars.filter((c) => c.mode === 'track');
      if (!d.shot || d.t > d.len) {
        const shots = ['wide', 'chase', 'loop', 'cross', 'onboard', 'wide2', 'chase'];
        d.idx = (d.idx + 1) % shots.length;
        d.shot = shots[d.idx]; d.t = 0; d.len = 5 + Math.random() * 3;
        if ((d.shot === 'chase' || d.shot === 'onboard') && running.length) {
          d.car = running.reduce((a, b) => (Math.abs(b.v) > Math.abs(a.v) ? b : a));
          C.chase.pos = null;
        }
        if (d.shot === 'onboard') d.len = 4.5;
        C.startBlend(); C.blend.dur = 1.1;
      }
      const tt = d.t;
      if (d.shot === 'wide' || d.shot === 'wide2') {
        const a = (d.shot === 'wide' ? 0.5 : 2.3) + tt * 0.07, r = d.shot === 'wide' ? 118 : 92, h = d.shot === 'wide' ? 62 : 38;
        return { pos: new T.Vector3(Math.sin(a) * r, h, Math.cos(a) * r), look: new T.Vector3(0, 7, 0), up: new T.Vector3(0, 1, 0), fov: 36, near: 0.5 };
      }
      if (d.shot === 'loop') {
        // hero shot: across the hub at one of the tall loops, face-on, tower behind it
        const posts = sim.layout.supports.filter((s) => s.kind === 'post');
        const lb = posts[(d.idx >> 1) % posts.length];
        const out = new T.Vector3(lb.x, 0, lb.z).normalize();
        const side = new T.Vector3(-out.z, 0, out.x);
        const centre = new T.Vector3(lb.x, lb.top * 0.55, lb.z).addScaledVector(out, -9);
        const pos = centre.clone().addScaledVector(out, -58).addScaledVector(side, 14 - tt * 3).setY(15 + tt * 0.6);
        return { pos, look: centre, up: new T.Vector3(0, 1, 0), fov: 36, near: 0.4 };
      }
      if (d.shot === 'cross') {
        const a = 3.9 + tt * 0.05;
        return { pos: new T.Vector3(Math.sin(a) * 30, 11 + tt * 0.4, Math.cos(a) * 30), look: new T.Vector3(0, 4.5, 0), up: new T.Vector3(0, 1, 0), fov: 38, near: 0.2 };
      }
      const car = d.car && d.car.mode !== 'parked' ? d.car : running[0];
      if (!car) { d.t = d.len + 1; return { pos: C.camera.position.clone(), look: new T.Vector3(0, 6, 0), up: new T.Vector3(0, 1, 0), fov: 38, near: 0.5 }; }
      const saved = C.car; C.car = car;
      const prev = C.mode; C.mode = d.shot === 'onboard' ? 'onboard' : 'chase';
      const r = C.desired(dt, sim);
      C.mode = prev; C.car = saved;
      return r;
    },

    update(dt, sim) {
      const T = window.THREE, cam = C.camera;
      const des = C.desired(dt, sim);
      if (!des) {
        // orbit mode: OrbitControls owns the camera
        C.controls.update();
        if (C.blend) C.applyBlend(dt, null);
        const want = fit(38);
        if (!C.blend && (Math.abs(cam.fov - want) > 0.05 || cam.near !== 0.5)) { cam.fov = want; cam.near = 0.5; cam.updateProjectionMatrix(); }
        return;
      }
      // compose the target orientation
      const m = C.tmp.m.lookAt(des.pos, des.look, des.up);
      const q = new T.Quaternion().setFromRotationMatrix(m);
      if (C.blend) {
        C.applyBlend(dt, { pos: des.pos, q, fov: des.fov });
      } else if (des.rigid) {
        cam.position.copy(des.pos); cam.quaternion.copy(q);
      } else {
        cam.position.lerp(des.pos, 1 - Math.exp(-dt * 10));
        cam.quaternion.slerp(q, 1 - Math.exp(-dt * 8));
      }
      des.fov = fit(des.fov);
      const fov = C.blend ? cam.fov : des.fov;
      if (Math.abs(cam.fov - fov) > 0.01 || cam.near !== des.near) { cam.fov = C.blend ? cam.fov : M.lerp(cam.fov, fov, 1 - Math.exp(-dt * 6)); cam.near = des.near; cam.updateProjectionMatrix(); }
    },

    applyBlend(dt, target) {
      const cam = C.camera, b = C.blend;
      b.t += dt;
      const u = M.clamp(b.t / b.dur, 0, 1), e = u * u * (3 - 2 * u);
      if (!target) {
        // blending into orbit: let OrbitControls' pose be the target
        const tp = cam.position.clone(), tq = cam.quaternion.clone();
        cam.position.copy(b.p).lerp(tp, e);
        cam.quaternion.copy(b.q).slerp(tq, e);
        cam.fov = HW.math.lerp(b.fov, fit(38), e); cam.updateProjectionMatrix();
        if (u >= 1) { C.blend = null; }
        return;
      }
      cam.position.copy(b.p).lerp(target.pos, e);
      cam.quaternion.copy(b.q).slerp(target.q, e);
      cam.fov = HW.math.lerp(b.fov, target.fov, e); cam.updateProjectionMatrix();
      if (u >= 1) C.blend = null;
    },
  });
})(window.HW);
