// 90-main.js - boot and the frame loop. Waits for three.js and Rapier (loaded by the module
// script in index.html), builds the sim, the scene and the HUD, then runs: fixed-step
// physics inside sim.update, render, UI and audio once per frame. Clicking a car follows
// it; clicking the hub's slide switch toggles the booster.
(function (HW) {
  const main = (HW.main = { slow: false, slowT: 0, paused: false });

  // which set: #s.<id> in the URL (an artifact passes only a bare #token)
  const tok = (location.hash || '').slice(1);
  if (tok.startsWith('s.') && HW.sets[tok.slice(2)]) HW.config.set = tok.slice(2);
  const bootSet = HW.sets[HW.config.set || 'crissCross'];
  try {
    const bl = document.querySelector('#boot .logo');
    if (bl && bootSet) bl.innerHTML = HW.ui.logoHtml(bootSet.name);
    document.title = bootSet.name;
  } catch (e) { /* no DOM (node) */ }

  function boot() {
    const T = window.THREE;
    const canvas = document.getElementById('stage');
    let q = 'high';
    try { q = localStorage.getItem('hw.quality') || q; } catch (e) { /* storage blocked */ }
    // a laptop iGPU or a phone gets medium to start with
    if (/Mobi|Android/i.test(navigator.userAgent) && q === 'high') q = 'medium';
    HW.render.quality = q;
    HW.render.init(canvas);
    const sim = (HW.sim = new HW.Sim({ RAPIER: window.RAPIER || null }));
    HW.world.build(HW.render.scene);
    HW.renderTrack.build(HW.render.scene, sim.layout);
    HW.renderHub.build(HW.render.scene, sim.layout);
    HW.renderProps.build(HW.render.scene, sim);
    HW.renderRace.build(HW.render.scene, sim);
    HW.renderCars.build(HW.render.scene, sim);
    HW.cam.init(HW.render.camera, canvas, sim.layout.view);
    HW.fx.init(HW.render.scene);
    HW.replay.init();
    HW.ui.init(sim);
    HW.overlay.build(HW.render.scene, sim);
    HW.uiRace.init(sim, document.getElementById('ui'));
    setupPicking(canvas, sim);

    // open running: booster on, a few cars dropped in one after another (a race strip stages its own)
    if (HW.config.autoStart && !sim.race) {
      sim.setSwitch(true);
      const as = sim.layout.set.autoStart || { cars: 3, every: 0.9 };
      let k = 0;
      for (const car of sim.cars.slice(0, as.cars)) sim.queue.push({ car, at: 0.8 + as.every * k++ });
    }
    document.getElementById('boot').classList.add('gone');
    main.last = performance.now();
    main.fpsT = 0; main.frames = 0; main.lowFrames = 0;
    requestAnimationFrame(frame);
  }

  main.setSlow = (on) => { main.slow = on; HW.config.timeScale = on ? 0.25 : 1; };
  // temporary slow motion (crash cam); restores whatever was set before
  main.slowmo = (scale, secs) => {
    if (main.slowmoT > 0) return;
    main.slowBefore = HW.config.timeScale;
    HW.config.timeScale = Math.min(HW.config.timeScale, scale);
    main.slowmoT = secs;
  };

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - main.last) / 1000;
    main.last = now;
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    const sim = HW.sim;
    if (main.slowmoT > 0) { main.slowmoT -= dt; if (main.slowmoT <= 0) HW.config.timeScale = main.slow ? 0.25 : main.slowBefore || 1; }
    if (!main.paused) sim.update(dt);
    HW.replay.update(dt, sim);
    HW.fx.update(dt);
    HW.renderHub.update(dt, sim);
    HW.renderProps.update(dt, sim);
    HW.renderRace.update(dt, sim);
    HW.overlay.update(dt, sim);
    HW.renderCars.update(dt, sim, HW.ui.followed);
    HW.cam.update(dt, sim);
    HW.render.render(dt);
    HW.ui.update(dt, sim);
    HW.uiRace.update(dt, sim);
    if (HW.audio && HW.audio.update) {
      try {
        const c = HW.render.camera;
        const fwd = new window.THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion), up = new window.THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion);
        HW.audio.update(dt, sim, { pos: c.position, fwd, up });
      } catch (e) { /* audio must never stop the game */ }
    }
    autoQuality(dt);
  }

  // drop a quality level if the frame rate stays low for a few seconds
  function autoQuality(dt) {
    main.age = (main.age || 0) + dt;
    // skip start-up (texture painting, shader compiles) and throttled or hidden frames
    if (main.age < 6 || dt > 0.09 || document.visibilityState !== 'visible') { main.fpsT = 0; main.frames = 0; return; }
    main.fpsT += dt; main.frames++;
    if (main.fpsT < 2) return;
    const fps = main.frames / main.fpsT;
    main.fpsT = 0; main.frames = 0;
    main.fps = fps;
    if (fps < 40 && document.visibilityState === 'visible') main.lowFrames++; else main.lowFrames = 0;
    if (main.lowFrames >= 3) {
      main.lowFrames = 0;
      const next = HW.render.quality === 'high' ? 'medium' : HW.render.quality === 'medium' ? 'low' : null;
      if (next) HW.render.setQuality(next);
    }
  }

  function setupPicking(canvas, sim) {
    const T = window.THREE, ray = new T.Raycaster(), ndc = new T.Vector2();
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; HW.ui.firstGesture(); });
    canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 500) return;
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, HW.render.camera);
      const targets = [];
      for (const it of HW.renderCars.items) if (it.model.visible) targets.push(it.model);
      if (HW.renderHub.switchKnob) targets.push(HW.renderHub.switchKnob);
      const hits = ray.intersectObjects(targets, true);
      if (!hits.length) return;
      let o = hits[0].object;
      if (o && o === HW.renderHub.switchKnob) { HW.ui.toggleSwitch(); return; }
      while (o && !o.userData.car) o = o.parent;
      if (o && o.userData.car) HW.ui.follow(o.userData.car);
    });
  }

  if (window.__hwLibsReady) boot();
  else addEventListener('hw:libs-ready', () => {
    try { boot(); }
    catch (e) {
      console.error(e);
      const el = document.getElementById('boot-err');
      if (el) { el.hidden = false; el.textContent = 'Something broke while building the scene:\n' + (e && e.stack || e); }
    }
  }, { once: true });
})(window.HW);
