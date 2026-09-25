// 74-showroom.js - the Showroom: one casting at a time on a slowly turning display plinth,
// big enough to see the tampos and the wheels, with its card (what the real toy is, the
// numbers the physics uses) and what it has done in this session, and the tuner (coins,
// wheels, paint) right there. The sim pauses while you look; the same renderer draws a
// small studio scene of its own. Open it from the garage (the Showroom button) or with V.
(function (HW) {
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== '') el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  };
  const S = (HW.showroom = {
    active: false, idx: 0, yaw: 0.6, dist: 34, spin: 0.25, best: new Map(),

    init(sim) {
      S.sim = sim;
      HW.bus.on('jump', (e) => { if (e.landed && (!S.best.get(e.car) || e.dist > S.best.get(e.car).dist)) S.best.set(e.car, { dist: e.dist, air: e.air }); });
      addEventListener('keydown', (e) => {
        if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || (HW.builderUI && HW.builderUI.panel)) return;
        const k = e.key.toLowerCase();
        if (k === 'v') { S.active ? S.close() : S.open(); }
        else if (!S.active) return;
        else if (k === 'escape') S.close();
        else if (k === 'arrowright') S.show(S.idx + 1);
        else if (k === 'arrowleft') S.show(S.idx - 1);
      });
    },

    // ---------------------------------------------------------------- the studio
    stage() {
      if (S.scene) return;
      const T = window.THREE, X = window.THREEX;
      const sc = new T.Scene();
      // a dark studio sweep, warm at the floor
      const bg = HW.tex.canvas(4, 256), bx = bg.getContext('2d'), gr = bx.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#07090d'); gr.addColorStop(0.55, '#141a24'); gr.addColorStop(1, '#2a1a10');
      bx.fillStyle = gr; bx.fillRect(0, 0, 4, 256);
      sc.background = HW.tex.three(bg);
      sc.environment = HW.render.scene.environment;
      sc.environmentIntensity = 0.45;
      // key from above the viewer's shoulder (the camera stands at +x +z), so the shadow falls on the plinth in view
      const key = new T.DirectionalLight(0xfff1e0, 2.8); key.position.set(-8, 30, 10); key.castShadow = true;
      Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 5, far: 60 });
      key.shadow.camera.updateProjectionMatrix();
      key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.02; key.shadow.radius = 5;
      const rim = new T.DirectionalLight(0x9fc4ff, 1.8); rim.position.set(-10, 9, -18);
      const fill = new T.HemisphereLight(0xc9d6ff, 0x3a2414, 0.45);
      sc.add(key, rim, fill);
      // the plinth: satin grey (light enough to show the car's shadow) with an orange ring
      const plinth = new T.Group();
      const top = new T.Mesh(new T.CylinderGeometry(9, 9.4, 1.2, 96), new T.MeshPhysicalMaterial({ color: 0x62666f, roughness: 0.6, clearcoat: 0.25, clearcoatRoughness: 0.35 }));
      top.position.y = -0.6; top.receiveShadow = true;
      const ring = new T.Mesh(new T.TorusGeometry(9.25, 0.18, 12, 128), new T.MeshStandardMaterial({ color: 0xff6a13, emissive: 0xff4a00, emissiveIntensity: 0.6, roughness: 0.4 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = -0.02;
      plinth.add(top, ring);
      const pool = HW.tex.canvas(128, 128), px = pool.getContext('2d'), pg = px.createRadialGradient(64, 64, 10, 64, 64, 64);
      pg.addColorStop(0, 'rgba(255,190,120,0.28)'); pg.addColorStop(1, 'rgba(255,190,120,0)');
      px.fillStyle = pg; px.fillRect(0, 0, 128, 128);
      const glow = new T.Mesh(new T.PlaneGeometry(60, 60), new T.MeshBasicMaterial({ map: HW.tex.three(pool), transparent: true, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = -1.25;
      const floor = new T.Mesh(new T.CircleGeometry(80, 64), new T.MeshStandardMaterial({ color: 0x0e0f13, roughness: 0.9 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -1.3; floor.receiveShadow = true;
      sc.add(floor, glow, plinth);
      S.plinth = plinth;
      S.scene = sc;
      S.cam = new T.PerspectiveCamera(28, 1, 0.1, 400);
      // drag to turn the plinth, wheel to come closer
      const cv = document.getElementById('stage');
      let drag = null;
      cv.addEventListener('pointerdown', (e) => { if (S.active) drag = { x: e.clientX, yaw: S.yaw }; });
      addEventListener('pointerup', () => { drag = null; });
      addEventListener('pointermove', (e) => { if (S.active && drag) { S.yaw = drag.yaw + (e.clientX - drag.x) * 0.01; S.spin = 0; } });
      cv.addEventListener('wheel', (e) => { if (!S.active) return; S.dist = HW.math.clamp(S.dist * (1 + Math.sign(e.deltaY) * 0.08), 22, 80); e.preventDefault(); }, { passive: false });
    },

    // ---------------------------------------------------------------- open, close, pick
    open(car) {
      if (S.active) return;
      S.stage(); S.panelBuild();
      S.wasPaused = HW.main.paused; HW.main.paused = true;
      S.active = true;
      document.body.classList.add('showroom');
      S.panel.hidden = false;
      const cars = S.sim.cars;
      S.show(car ? cars.indexOf(car) : HW.ui.followed ? cars.indexOf(HW.ui.followed) : S.idx);
    },
    close() {
      if (!S.active) return;
      S.active = false;
      HW.main.paused = S.wasPaused;
      document.body.classList.remove('showroom');
      S.panel.hidden = true;
    },
    show(i) {
      const cars = S.sim.cars, n = cars.length;
      S.idx = ((i % n) + n) % n;
      const car = cars[S.idx];
      if (S.model) { S.plinth.remove(S.model); S.model.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      S.model = HW.carModels.build(HW.renderCars.entryOf(car), { quality: 'high' });
      S.model.traverse((o) => { if (o.isMesh) { o.castShadow = o.renderOrder !== 2; } });
      // the car stands on the plinth, scaled up so a 7 cm casting fills the frame
      S.model.scale.setScalar(2);
      S.model.position.set(0, 0, 0);
      S.plinth.add(S.model);
      // a soft contact shadow under the car, as a product shot has
      if (!S.blob) {
        const T = window.THREE, c = HW.tex.canvas(128, 128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 6, 64, 64, 64);
        g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.55, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(0, 0, 128, 128);
        S.blob = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: HW.tex.three(c), transparent: true, depthWrite: false }));
        S.blob.rotation.x = -Math.PI / 2; S.blob.position.y = 0.03; S.blob.renderOrder = 1;
        S.plinth.add(S.blob);
      }
      S.blob.scale.set(car.entry.widthCm * 2 * 2.2, car.entry.lengthCm * 2 * 1.4, 1);
      S.spin = S.spin || 0.25;
      S.fill(car);
    },

    // ---------------------------------------------------------------- the card
    panelBuild() {
      if (S.panel) return;
      const W = HW.tune.WHEELS;
      S.title = h('h3'); S.sub = h('p', { class: 'sub' });
      S.specs = h('dl', { class: 'specs' }); S.stats = h('dl', { class: 'specs' });
      S.coins = h('input', { id: 'sr-coins', type: 'range', min: '0', max: '4', step: '1', 'aria-label': 'Coins taped under the base' });
      S.coinsOut = h('output', { for: 'sr-coins' });
      S.wheels = h('select', { id: 'sr-wheels', 'aria-label': 'Wheels' }, Object.entries(W).map(([k, w]) => h('option', { value: k, text: w.name })));
      S.paint = h('input', { id: 'sr-paint', type: 'color', 'aria-label': 'Paint' });
      const car = () => S.sim.cars[S.idx];
      const tuned = (patch, remodel) => { HW.tune.set(S.sim, car(), patch); if (remodel) { HW.renderCars.rebuildModels(S.sim, car()); S.show(S.idx); } else S.fill(car()); };
      S.coins.addEventListener('input', () => tuned({ coins: +S.coins.value }));
      S.wheels.addEventListener('change', () => tuned({ wheels: S.wheels.value }));
      S.paint.addEventListener('change', () => tuned({ paint: S.paint.value }, true));
      S.panel = h('div', { id: 'showroom', class: 'panel', role: 'dialog', 'aria-label': 'Showroom' },
        h('div', { class: 'row' }, h('span', { class: 'lbl', text: 'Showroom · ' + (HW.pack ? HW.pack.year + ' ' + HW.pack.name : 'the five-pack') }),
          h('button', { class: 'close iconbtn', 'aria-label': 'Close the showroom', onclick: () => S.close(), text: '×' })),
        h('div', { class: 'row nav' }, h('button', { 'aria-label': 'Previous car', onclick: () => S.show(S.idx - 1), text: '‹' }), S.title, h('button', { 'aria-label': 'Next car', onclick: () => S.show(S.idx + 1), text: '›' })),
        S.sub,
        h('div', { class: 'lbl', text: 'The casting' }), S.specs,
        h('div', { class: 'lbl', text: 'This session' }), S.stats,
        h('div', { class: 'lbl', text: 'Tune it' }),
        h('div', { class: 'field' }, h('label', { for: 'sr-coins', text: 'Coins under the base' }), S.coinsOut, S.coins),
        h('div', { class: 'row' }, h('label', { for: 'sr-wheels', class: 'lbl2', text: 'Wheels' }), S.wheels, h('label', { for: 'sr-paint', class: 'lbl2', text: 'Paint' }), S.paint),
        h('div', { class: 'row' }, h('button', { onclick: () => tuned({ coins: 0, wheels: car().entry.wheelCode, paint: null }, true) }, 'Back to stock'),
          h('button', { class: 'hot', onclick: () => { const c = car(); S.close(); HW.ui.follow(c); } }, 'Follow it')));
      S.panel.hidden = true;
      document.getElementById('ui').append(S.panel);
    },
    fill(car) {
      const e = car.entry, t = HW.tune.of(e), w = HW.tune.WHEELS[t.wheels] || HW.tune.WHEELS[e.wheelCode];
      const dd = (dl, rows) => dl.replaceChildren(...rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]));
      S.title.textContent = car.name;
      S.sub.textContent = (e.livery && e.livery.tampo ? e.livery.tampo + '. ' : '') + `${w.name} wheels, ${e.base} base, ${e.tint} glass.`;
      const mph = (v) => Math.round(HW.units.scaleMph(v));
      dd(S.specs, [
        ['Mass', `${car.m.toFixed(1)} g${t.coins ? ` (${e.massG} + ${t.coins} coin${t.coins > 1 ? 's' : ''})` : ''}`],
        ['Size', `${e.lengthCm} × ${e.widthCm} × ${e.heightCm} cm`],
        ['Wheelbase', `${e.wheelbaseCm} cm, track ${e.trackCm} cm`],
        ['Rolling drag', `${car.crr.toFixed(3)} (${w.name})`],
        ['Air drag area', `${car.CdA.toFixed(2)} cm² · ${(car.CdA / car.m * 1000).toFixed(1)} per kg`],
      ]);
      const j = S.best.get(car), runs = HW.ui.runWord || 'laps';
      dd(S.stats, [
        [runs[0].toUpperCase() + runs.slice(1), String(car.laps || 0) + (car.bestLap ? `, best ${car.bestLap.toFixed(2)} s` : '')],
        ['Top speed', car.topSpeed ? `${Math.round(car.topSpeed)} cm/s (${mph(car.topSpeed)} mph at 1:64)` : 'not run yet'],
        ['Crashes', String(car.crashes || 0)],
        ...(j ? [['Best jump', `${Math.round(j.dist)} cm, ${j.air.toFixed(2)} s in the air`]] : []),
      ]);
      S.coins.value = String(t.coins || 0); S.coinsOut.textContent = `${t.coins || 0} × 2.5 g`;
      S.wheels.value = t.wheels || e.wheelCode; S.paint.value = t.paint || e.color;
    },

    // ---------------------------------------------------------------- per frame (sim paused)
    frame(dt) {
      const R = HW.render, cv = R.renderer.domElement;
      const w = cv.clientWidth || innerWidth, hh = cv.clientHeight || innerHeight;
      S.yaw += dt * S.spin;
      if (S.plinth) S.plinth.rotation.y = S.yaw;
      // the car sits a little right of centre on wide screens, clear of the card
      const wide = w > 820, a = S.cam;
      a.aspect = w / hh; a.fov = w / hh < 1 ? 40 : 28; a.updateProjectionMatrix();
      const off = wide ? -4.5 : 0;
      a.position.set(off + S.dist * 0.66, S.dist * 0.42, S.dist * 0.66);
      a.lookAt(off, wide ? 1.5 : -3, 0);
      R.renderer.render(S.scene, a);
    },
  });
})(window.HW);
