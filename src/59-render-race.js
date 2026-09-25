// 59-render-race.js - Race Day's hardware (start gate flaps, the light tree, the finish gantry
// with a light per lane, lane numbers) and the physics OVERLAY every set can switch on: the
// forces on each car as arrows and a speed-coloured trail behind it. The arrows are the very
// numbers the integrator used this substep, so the overlay is the model, not an illustration.
(function (HW) {
  const PLACE = [0x33e06b, 0xffd23f, 0xff8a1a, 0xe23a2a];      // lane light colour by finishing place

  function numberCanvas(n) {
    const c = HW.tex.canvas(64, 64), x = c.getContext('2d');
    x.fillStyle = '#f4f1e8'; x.font = '800 italic 50px "Barlow Condensed", "Arial Narrow", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), 32, 34);
    return c;
  }

  HW.renderRace = {
    build(scene, sim) {
      const T = window.THREE, X = window.THREEX, L = sim.layout, race = sim.race;
      this.race = race;
      if (!race) return;
      const g = new T.Group();
      const black = new T.MeshStandardMaterial({ color: 0x16171a, roughness: 0.55 });
      const grey = new T.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.35, metalness: 0.6 });
      const W = L.dims.W, wt = L.dims.wallT;
      // start gate: a flap across each lane just ahead of the held car, hinged at the floor
      this.flaps = [];
      for (const tr of race.lanes) {
        const f = tr.frame(race.holdS + 4.2, {});
        const hinge = new T.Group();
        hinge.position.set(f.px, f.py, f.pz);
        const q = HW.Q.fromBasis({ x: f.rx, y: f.ry, z: f.rz }, { x: f.ux, y: f.uy, z: f.uz }, { x: -f.tx, y: -f.ty, z: -f.tz });
        hinge.quaternion.set(q.x, q.y, q.z, q.w);
        const pivot = new T.Group(); hinge.add(pivot);
        const flap = new T.Mesh(new T.BoxGeometry(W - 0.2, 1.6, 0.18), black);
        flap.position.set(0, 0.8, 0);
        pivot.add(flap);
        g.add(hinge);
        this.flaps.push(pivot);
        // lane number painted on the deck behind the car
        const b = tr.frame(1.4, {});
        const num = new T.Mesh(new T.PlaneGeometry(2.2, 2.2), new T.MeshBasicMaterial({ map: HW.tex.three(numberCanvas(this.flaps.length)), transparent: true, depthWrite: false }));
        num.position.set(b.px + b.ux * 0.02, b.py + b.uy * 0.02, b.pz + b.uz * 0.02);
        num.lookAt(num.position.x + b.ux, num.position.y + b.uy, num.position.z + b.uz);
        g.add(num);
      }
      // the light tree beside lane 4 at the top of the hill
      const f4 = race.lanes[race.lanes.length - 1].frame(race.holdS, {});
      const side = W / 2 + wt + 4;
      const tx = f4.px + f4.rx * side, tz = f4.pz + f4.rz * side;
      const pole = new T.Mesh(new T.CylinderGeometry(0.3, 0.35, f4.py + 10, 12), grey);
      pole.position.set(tx, (f4.py + 10) / 2, tz);
      const head = new T.Mesh(new X.RoundedBoxGeometry(2.2, 8.4, 2.2, 2, 0.3), black);
      head.position.set(tx, f4.py + 12, tz);
      g.add(pole, head);
      this.tree = [];
      for (let k = 0; k < 4; k++) {
        const col = k < 3 ? 0xffb020 : 0x2aff6a;
        const m = new T.MeshStandardMaterial({ color: 0x222222, emissive: col, emissiveIntensity: 0, roughness: 0.3 });
        const lamp = new T.Mesh(new T.SphereGeometry(0.75, 16, 12), m);
        lamp.position.set(tx - f4.tx * 1.05, f4.py + 15 - k * 1.95, tz - f4.tz * 1.05);
        g.add(lamp);
        this.tree.push(m);
      }
      // finish gantry over all four lanes, one lamp per lane
      const gl = race.lanes.map((tr) => tr.frame(tr.gates[0].s, {}));
      const a = gl[0], b = gl[gl.length - 1], hgt = 9;
      const ends = [[a.px - a.rx * (W / 2 + 2.5), a.pz - a.rz * (W / 2 + 2.5)], [b.px + b.rx * (W / 2 + 2.5), b.pz + b.rz * (W / 2 + 2.5)]];
      for (const [x, z] of ends) {
        const post = new T.Mesh(new X.RoundedBoxGeometry(0.9, a.py + hgt, 0.9, 2, 0.15), black);
        post.position.set(x, (a.py + hgt) / 2, z);
        g.add(post);
      }
      const span = Math.hypot(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]);
      const beam = new T.Mesh(new X.RoundedBoxGeometry(span + 1, 1.6, 1.4, 2, 0.2), black);
      beam.position.set((ends[0][0] + ends[1][0]) / 2, a.py + hgt, (ends[0][1] + ends[1][1]) / 2);
      beam.lookAt(ends[1][0], a.py + hgt, ends[1][1]); beam.rotateY(Math.PI / 2);
      g.add(beam);
      this.laneLamps = gl.map((f) => {
        const m = new T.MeshStandardMaterial({ color: 0x222222, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.3 });
        const lamp = new T.Mesh(new T.CylinderGeometry(0.8, 0.8, 0.4, 20), m);
        lamp.rotation.x = Math.PI / 2;
        lamp.position.set(f.px - f.tx * 0.8, a.py + hgt - 0.1, f.pz - f.tz * 0.8);
        lamp.lookAt(lamp.position.x - f.tx, lamp.position.y, lamp.position.z - f.tz); lamp.rotateX(Math.PI / 2);
        g.add(lamp);
        return m;
      });
      g.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(g);
      this.group = g;
    },

    update(dt, sim) {
      const race = this.race;
      if (!race) return;
      // flaps stand while cars are staged, and fall flat when the gate drops
      const down = race.state === 'running' || race.state === 'done';
      for (const p of this.flaps) p.rotation.x += ((down ? -Math.PI / 2 : 0) - p.rotation.x) * Math.min(1, dt * (down ? 30 : 6));
      this.tree.forEach((m, k) => { const on = k < 3 ? race.lights > k && race.lights < 4 : race.lights === 4 && race.state === 'running'; m.emissiveIntensity = on ? 2.2 : 0; });
      const cur = race.current || [];
      this.laneLamps.forEach((m, lane) => {
        const r = cur.find((x) => x.lane === lane);
        if (r && r.place && race.state !== 'staging') { m.emissive.setHex(PLACE[Math.min(3, r.place - 1)]); m.emissiveIntensity = r.place === 1 ? 3 : 1.4; }
        else m.emissiveIntensity = 0;
      });
    },
  };

  // ------------------------------------------------------------ the physics overlay
  const TRAIL = 90;
  HW.overlay = {
    on: false,
    build(scene, sim) {
      const T = window.THREE;
      this.sim = sim;
      this.group = new T.Group(); this.group.visible = false;
      scene.add(this.group);
      const mk = (hex) => { const a = new T.ArrowHelper(new T.Vector3(0, 1, 0), new T.Vector3(), 1, hex, 0.9, 0.55); a.visible = false; this.group.add(a); return a; };
      this.items = sim.cars.map((car) => {
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(TRAIL * 3), 3));
        geo.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(TRAIL * 3), 3));
        geo.setDrawRange(0, 0);
        const line = new T.Line(geo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
        line.frustumCulled = false;
        this.group.add(line);
        return { car, line, n: 0, floor: mk(0x33e06b), wall: mk(0xff8a1a), drag: mk(0xe23a2a), push: mk(0xffd23f) };
      });
    },
    set(on) { this.on = on; if (this.group) this.group.visible = on; },
    update(dt, sim) {
      if (!this.on || !this.items) return;
      const T = window.THREE, v = new T.Vector3(), o = new T.Vector3(), col = new T.Color();
      for (const it of this.items) {
        const c = it.car, show = c.mode === 'track' || c.mode === 'free';
        // trail: shift in the newest point, coloured blue (slow) to red (fast)
        const pos = it.line.geometry.attributes.position, cl = it.line.geometry.attributes.color;
        if (show) {
          pos.array.copyWithin(3, 0, (TRAIL - 1) * 3); cl.array.copyWithin(3, 0, (TRAIL - 1) * 3);
          pos.array[0] = c.pos.x; pos.array[1] = c.pos.y + 0.6; pos.array[2] = c.pos.z;
          col.setHSL(0.66 * (1 - HW.math.clamp(c.speed / 450, 0, 1)), 1, 0.55);
          cl.array[0] = col.r; cl.array[1] = col.g; cl.array[2] = col.b;
          it.n = Math.min(TRAIL, it.n + 1);
        } else it.n = 0;
        it.line.geometry.setDrawRange(0, it.n);
        pos.needsUpdate = true; cl.needsUpdate = true;
        const on = c.mode === 'track';
        for (const k of ['floor', 'wall', 'drag', 'push']) it[k].visible = false;
        if (!on) continue;
        // arrows in units of the car's weight: 1 g = 3 cm. Forces along the track (drag, the
        // booster's push) are a few percent of the weight, so they are drawn ten times longer.
        const f = c.frame, W = c.m * HW.units.G, k = 3 / W;
        o.set(c.pos.x + f.ux * 1.2, c.pos.y + f.uy * 1.2, c.pos.z + f.uz * 1.2);
        const arrow = (a, x, y, z, F, gain = 1) => {
          if (!(F * gain > W * 0.05)) return;
          v.set(x, y, z).normalize(); a.position.copy(o); a.setDirection(v); a.setLength(Math.min(18, F * k * gain), 0.9, 0.55); a.visible = true;
        };
        arrow(it.floor, f.ux, f.uy, f.uz, c.Nf);
        if (c.wallSide) arrow(it.wall, -f.rx * c.wallSide, -f.ry * c.wallSide, -f.rz * c.wallSide, c.Nw);
        const sg = c.v >= 0 ? 1 : -1, drag = (c.dragF || 0);
        arrow(it.drag, -f.tx * sg, -f.ty * sg, -f.tz * sg, drag, 10);
        if (c.Fdrive) arrow(it.push, f.tx * Math.sign(c.Fdrive), f.ty * Math.sign(c.Fdrive), f.tz * Math.sign(c.Fdrive), Math.abs(c.Fdrive), 10);
      }
    },
  };
})(window.HW);
