// 90-main.js — boot sequence and frame loop. Waits for hw:libs-ready (fired by the
// module loader in index.html after RAPIER.init()). Uses HW.render if 50-render-scene.js
// provided one, otherwise the built-in debug renderer below so the physics can be
// exercised before the real renderer exists.
(function (HW) {
  const cfg = HW.config;

  // ---- debug renderer: orange ribbons, wall strips, box cars, spinning foam wheels ----
  const debugRender = {
    scene: null, camera: null, renderer: null, controls: null, carMeshes: [], wheelMeshes: [], carWheelMeshes: [],
    init(canvas) {
      const THREE = window.THREE;
      const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true }));
      r.setPixelRatio(Math.min(2, devicePixelRatio)); r.setSize(innerWidth, innerHeight); r.shadowMap.enabled = false;
      const scene = (this.scene = new THREE.Scene()); scene.background = new THREE.Color(0x1a1d24);
      const cam = (this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 2000));
      cam.position.set(70, 90, 110); cam.lookAt(0, 0, 0);
      this.controls = new window.OrbitControls(cam, canvas); this.controls.target.set(0, 0, 0);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.0));
      const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(60, 120, 40); scene.add(sun);
      const grid = new THREE.GridHelper(300, 30, 0x333844, 0x262a33); grid.position.y = -0.5; scene.add(grid);
      const mesh = HW.sim.mesh;
      const geo = (m) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3)); g.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2)); g.setIndex(new THREE.BufferAttribute(m.indices, 1)); g.computeVertexNormals(); return g; };
      scene.add(new THREE.Mesh(geo(mesh.floorVisual), new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7, side: THREE.DoubleSide })));
      scene.add(new THREE.Mesh(geo(mesh.walls), new THREE.MeshStandardMaterial({ color: 0xd85a10, roughness: 0.7, side: THREE.DoubleSide })));
      for (const p of mesh.hub.plates) { const b = new THREE.Mesh(new THREE.BoxGeometry(p.half.x * 2, p.half.y * 2, p.half.z * 2), new THREE.MeshStandardMaterial({ color: 0xc0181c })); b.position.set(p.center.x, p.center.y, p.center.z); scene.add(b); }
      for (const w of HW.sim.track.wheels) {
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(w.radius, w.radius, 1.6, 32), new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.9 }));
        cyl.position.set(w.center.x, w.center.y, w.center.z); scene.add(cyl); this.wheelMeshes.push(cyl);
        const mark = new THREE.Mesh(new THREE.BoxGeometry(w.radius * 0.9, 1.7, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222 })); mark.position.x = w.radius * 0.5; cyl.add(mark);
      }
      for (const s of mesh.supports) { const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, s.p.y, 1.2), new THREE.MeshStandardMaterial({ color: 0x888888 })); post.position.set(s.p.x, s.p.y / 2 - 0.5, s.p.z); scene.add(post); }
      for (const car of HW.sim.cars) {
        const e = car.entry;
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(e.widthCm, e.heightCm, e.lengthCm), new THREE.MeshStandardMaterial({ color: e.color, metalness: 0.4, roughness: 0.4 }));
        g.add(body);
        const nose = new THREE.Mesh(new THREE.BoxGeometry(e.widthCm * 0.6, e.heightCm * 0.5, 0.6), new THREE.MeshStandardMaterial({ color: e.accent })); nose.position.set(0, e.heightCm * 0.5, -(e.lengthCm / 2 - 0.3)); g.add(nose);
        const wheels = [];
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => { // same order as 42-vehicle.js
          const wm = new THREE.Mesh(new THREE.CylinderGeometry(e.wheelRadiusCm, e.wheelRadiusCm, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0x151515 }));
          wm.rotation.z = Math.PI / 2; wm.position.set(sx * e.trackCm / 2, -e.heightCm / 2, sz * e.wheelbaseCm / 2); g.add(wm); wheels.push(wm);
        });
        scene.add(g); this.carMeshes.push(g); this.carWheelMeshes.push(wheels);
      }
      addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); r.setSize(innerWidth, innerHeight); });
    },
    update(dt) {
      const sim = HW.sim, omega = sim.elec.omegaWheel;
      this.wheelMeshes.forEach((w) => { w.rotation.y += omega * dt; });
      sim.cars.forEach((car, i) => {
        const g = this.carMeshes[i]; g.visible = !car.lifted; if (car.lifted) return;
        g.position.set(car.pos.x, car.pos.y, car.pos.z); g.quaternion.set(car.quat.x, car.quat.y, car.quat.z, car.quat.w);
        this.carWheelMeshes[i].forEach((wm, k) => { const ws = car.wheelState(k); if (ws) { wm.rotation.x = ws.rot; if (ws.len != null) wm.position.y = car.controller.wheelChassisConnectionPointCs(k).y - ws.len; } });
      });
      this.controls.update(); this.renderer.render(this.scene, this.camera);
    },
  };
  HW.debugRender = debugRender;

  // ---- HUD (debug) ----
  function hud() {
    const el = document.getElementById('hud'); if (!el) return;
    HW.bus.on('telemetry', (t) => {
      const e = t.elec;
      const lines = [
        `t=${t.t.toFixed(1)}s  switch=${e.on ? 'ON' : 'off'}  V=${e.V.toFixed(2)}  I=${e.I.toFixed(2)}A  motor=${e.rpmMotor.toFixed(0)}rpm  wheel=${e.rpmWheel.toFixed(0)}rpm  surface=${e.surfaceSpeed.toFixed(0)}cm/s  load=${e.tauLoadWheelGcm.toFixed(0)}g.cm`,
        `crashes=${t.crashes}  zones: ${t.zones.filter((z) => z.engaged).map((z) => z.name + ':' + z.F.toFixed(0)).join(' ') || '-'}`,
        ...t.cars.map((c) => `${c.name.padEnd(14)} ${c.lifted ? 'lifted' : `${c.circuit} s=${c.s.toFixed(0).padStart(3)} v=${c.speed.toFixed(0).padStart(3)}cm/s (${c.scaleKmh.toFixed(0)} km/h scale) lat=${c.lateral.toFixed(1)} laps=${c.laps} ${c.inBooster || ''} ${c.stalled ? 'STALLED' : ''} ${c.offTrack ? 'OFF' : ''}`}`),
        'keys: Space=switch  L=line up five  R=reset  N=nudge stalled  1-5=drop car at its gate',
      ];
      el.textContent = lines.join('\n');
    });
  }

  function keys() {
    addEventListener('keydown', (ev) => {
      if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA')) return;
      const sim = HW.sim;
      if (ev.code === 'Space') { ev.preventDefault(); sim.toggleSwitch(); }
      else if (ev.key === 'l' || ev.key === 'L') sim.lineUpFive();
      else if (ev.key === 'r' || ev.key === 'R') sim.reset();
      else if (ev.key === 'n' || ev.key === 'N') sim.nudgeStalled();
      else if (ev.key >= '1' && ev.key <= '5') { const i = +ev.key - 1; const g = sim.track.lineUp[i]; sim.cars[i].spawnAtGate(g); }
    });
  }

  HW.main = {
    booted: false, renderApi: null, acc: 0, last: 0, paused: false,
    boot() {
      if (HW.main.booted) return; HW.main.booted = true;
      HW.log('boot: THREE r' + window.THREE.REVISION + ', RAPIER ' + window.RAPIER.version());
      HW.sim.create();
      const canvas = document.getElementById('view');
      HW.main.renderApi = (HW.render && HW.render.init) ? HW.render : debugRender;
      HW.main.renderApi.init(canvas);
      if (HW.ui && HW.ui.init) HW.ui.init(); else { hud(); }
      keys();
      HW.main.last = performance.now();
      requestAnimationFrame(HW.main.frame);
      HW.bus.emit('booted', HW);
    },
    frame(now) {
      const m = HW.main;
      let dt = (now - m.last) / 1000; m.last = now; if (dt > 0.1) dt = 0.1;
      if (!m.paused) {
        m.acc += dt; const h = 1 / cfg.physicsHz; let n = 0;
        while (m.acc >= h && n < cfg.maxSubsteps) { HW.sim.step(h); m.acc -= h; n++; }
        if (n === cfg.maxSubsteps) m.acc = 0;
      }
      m.renderApi.update(dt, HW.sim.telemetry);
      requestAnimationFrame(m.frame);
    },
  };
  addEventListener('hw:libs-ready', () => HW.main.boot());
  if (window.THREE && window.RAPIER && window.__hwLibsReady) HW.main.boot();
})(window.HW);
