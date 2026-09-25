// 55-render-cars.js - one visual per simulated car: pose, wheel spin, visibility, the
// "hand" glow while a car is being carried back to START HERE, and a soft marker under the
// car the camera is following. Models come from HW.carModels (53-car-models.js); a
// placeholder is used until that file exists.
(function (HW) {
  function placeholder(T, e) {
    const g = new T.Group();
    const X = window.THREEX;
    const paint = new T.MeshPhysicalMaterial({ color: e.color, roughness: 0.3, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.06 });
    const body = new T.Mesh(new X.RoundedBoxGeometry(e.widthCm * 0.96, e.heightCm * 0.62, e.lengthCm, 3, 0.35), paint);
    body.position.y = 0.22 + e.heightCm * 0.31;
    const cabin = new T.Mesh(new X.RoundedBoxGeometry(e.widthCm * 0.78, e.heightCm * 0.42, e.lengthCm * 0.42, 3, 0.3),
      new T.MeshPhysicalMaterial({ color: 0x223044, roughness: 0.08, metalness: 0.2, clearcoat: 1 }));
    cabin.position.set(0, 0.22 + e.heightCm * 0.72, e.lengthCm * 0.05);
    g.add(body, cabin);
    const wg = new T.CylinderGeometry(e.wheelRadiusCm, e.wheelRadiusCm, 0.55, 18);
    wg.rotateZ(Math.PI / 2);
    const wm = new T.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 });
    const wheels = [];
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const w = new T.Group();
      w.position.set(x * e.trackCm / 2, e.wheelRadiusCm, z * e.wheelbaseCm / 2);
      const m = new T.Mesh(wg, wm);
      const hub = new T.Mesh(new T.BoxGeometry(0.58, e.wheelRadiusCm * 1.2, 0.16), new T.MeshStandardMaterial({ color: 0xcccccc, metalness: 1, roughness: 0.2 }));
      w.add(m, hub);
      g.add(w); wheels.push(w);
    }
    g.userData.wheels = wheels; g.userData.body = body; g.userData.isPlaceholder = true;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  HW.renderCars = {
    items: [],
    build(scene, sim) {
      const T = window.THREE;
      this.scene = scene;
      this.items = sim.cars.map((car) => {
        let model = null;
        try { if (HW.carModels) model = HW.carModels.build(car.entry, { quality: HW.render.quality === 'low' ? 'low' : 'high' }); }
        catch (e) { console.error('[cars] model failed for', car.name, e); }
        if (!model) model = placeholder(T, car.entry);
        model.visible = false;
        model.userData.car = car;
        model.traverse((o) => { o.userData.carId = car.id; });
        scene.add(model);
        return { car, model, spin: 0 };
      });
      // "hand" glow: a soft ring that follows a car being carried
      const ringTex = (() => {
        const c = HW.tex.canvas(128, 128), x = c.getContext('2d');
        const gr = x.createRadialGradient(64, 64, 20, 64, 64, 62);
        gr.addColorStop(0, 'rgba(255,220,150,0)'); gr.addColorStop(0.55, 'rgba(255,200,120,0.55)'); gr.addColorStop(1, 'rgba(255,170,80,0)');
        x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
        return HW.tex.three(c);
      })();
      this.ringMat = new T.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
      for (const it of this.items) {
        const ring = new T.Mesh(new T.PlaneGeometry(12, 12), this.ringMat);
        ring.rotation.x = -Math.PI / 2; ring.visible = false;
        scene.add(ring); it.ring = ring;
      }
      // follow marker
      const mk = HW.tex.canvas(128, 128), mx = mk.getContext('2d');
      mx.strokeStyle = 'rgba(255,201,60,0.9)'; mx.lineWidth = 7; mx.beginPath(); mx.arc(64, 64, 54, 0, Math.PI * 2); mx.stroke();
      this.marker = new T.Mesh(new T.PlaneGeometry(9, 9), new T.MeshBasicMaterial({ map: HW.tex.three(mk), transparent: true, depthWrite: false, opacity: 0.8 }));
      this.marker.visible = false;
      scene.add(this.marker);
    },

    // replace placeholders once real models are available (hot reload during development)
    rebuildModels(sim) {
      if (!HW.carModels) return;
      for (const it of this.items) {
        const m = HW.carModels.build(it.car.entry, {});
        m.userData.car = it.car; m.traverse((o) => { o.userData.carId = it.car.id; });
        this.scene.remove(it.model); this.scene.add(m); it.model = m;
      }
    },

    update(dt, sim, followed) {
      const t = sim.time;
      for (const it of this.items) {
        const c = it.car, m = it.model;
        const replay = HW.replay && HW.replay.active;
        m.visible = replay ? !!c._replayVisible : c.mode !== 'parked';
        if (!m.visible) { it.ring.visible = false; continue; }
        m.position.set(c.pos.x, c.pos.y, c.pos.z);
        m.quaternion.set(c.quat.x, c.quat.y, c.quat.z, c.quat.w);
        // wheels: on the track they roll with the car; free, they keep their spin and slow
        let w;
        if (replay) { w = ((c._replaySpin || 0) - (it.lastReplaySpin ?? c._replaySpin ?? 0)) / Math.max(dt, 1e-4); it.lastReplaySpin = c._replaySpin; it.spin = c._replaySpin || 0; }
        else {
          it.lastReplaySpin = undefined;
          if (c.mode === 'track') w = c.v / c.entry.wheelRadiusCm * (c.reversed ? -1 : 1);
          else w = (it.w || 0) * Math.exp(-dt * 1.5);
          it.spin += w * dt;
        }
        it.w = w;
        if (HW.carModels && HW.carModels.setWheelSpin && m.userData.wheels && !m.userData.isPlaceholder) HW.carModels.setWheelSpin(m, it.spin, Math.abs(w));
        else if (m.userData.wheels) for (const wh of m.userData.wheels) wh.rotation.x = -it.spin;
        // carried by the hand: a warm glow on the floor below it
        const carried = !replay && c.mode === 'retrieving';
        it.ring.visible = carried;
        if (carried) {
          it.ring.position.set(c.pos.x, Math.max(0.05, c.pos.y - 14), c.pos.z);
          const pulse = 0.8 + 0.2 * Math.sin(t * 9 + c.id);
          it.ring.scale.setScalar(pulse);
        }
      }
      const fc = followed && followed.mode !== 'parked' ? followed : null;
      this.marker.visible = !!fc && fc.mode !== 'track';
      if (this.marker.visible) this.marker.position.set(fc.pos.x, 0.06, fc.pos.z);
    },

    modelOf(car) { const it = this.items.find((i) => i.car === car); return it && it.model; },
  };
})(window.HW);
