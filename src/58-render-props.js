// 58-render-props.js - the working parts of a set, drawn: power booster housings and their
// foam wheels, the launcher plunger, finish arches and the hazards. (The V2791 hub draws
// itself in 54-render-hub.js.) Everything here reads the layout the physics uses, so what
// you see is what the cars hit.
(function (HW) {
  const TRACK_ORANGE = 0xff4400;

  function checkerCanvas(text) {
    const c = HW.tex.canvas(512, 96), x = c.getContext('2d');
    for (let i = 0; i < 32; i++) for (let j = 0; j < 6; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#f4f1e8'; x.fillRect(i * 16, j * 16, 16, 16); }
    x.fillStyle = 'rgba(12,12,12,.82)'; x.fillRect(96, 18, 320, 60);
    x.font = '700 46px "Barlow Condensed", "Arial Narrow", sans-serif'; x.fillStyle = '#ffd23f'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 256, 50);
    return c;
  }

  HW.renderProps = {
    build(scene, sim) {
      const T = window.THREE, X = window.THREEX, L = sim.layout;
      const g = new T.Group();
      const red = new T.MeshPhysicalMaterial({ color: 0xc8161d, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 });
      const black = new T.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.6 });
      const grey = new T.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.6 });
      const orange = new T.MeshPhysicalMaterial({ color: TRACK_ORANGE, roughness: 0.38, clearcoat: 0.18 });
      const foamMat = new T.MeshStandardMaterial({ color: 0x3b3d42, roughness: 0.96 });
      const yellow = new T.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.5 });
      const place = (m, b) => { m.position.set(b.c[0], b.c[1], b.c[2]); if (b.q) m.quaternion.set(b.q.x, b.q.y, b.q.z, b.q.w); return m; };

      // booster housings, decks and foam wheels
      for (const b of L.solids || []) {
        if (b.kind === 'housing') {
          g.add(place(new T.Mesh(new X.RoundedBoxGeometry(b.h[0] * 2, b.h[1] * 2, b.h[2] * 2, 3, 0.25), red), b));
        } else if (b.kind === 'boosterDeck') {
          g.add(place(new T.Mesh(new T.BoxGeometry(b.h[0] * 2, b.h[1] * 2, b.h[2] * 2), orange), b));
        }
      }
      this.wheels = [];
      for (const w of L.wheels) {
        if (!w.track) continue;                                   // hub wheels belong to the hub
        const piv = new T.Group();
        piv.position.set(w.pos[0], w.pos[1] + 0.05, w.pos[2]);
        const fr = L.foamR;
        const foam = new T.Mesh(new T.CylinderGeometry(fr, fr, 1.3, 40, 1), foamMat);
        foam.position.y = 0.65;
        const hubcap = new T.Mesh(new T.CylinderGeometry(fr * 0.5, fr * 0.5, 0.14, 24), yellow);
        hubcap.position.y = 1.36;
        const spoke = new T.Mesh(new T.BoxGeometry(fr * 1.6, 0.16, 0.4), black);
        spoke.position.y = 1.42;
        piv.add(foam, hubcap, spoke);
        piv.userData.spin = w.spin || 1;
        g.add(piv);
        this.wheels.push(piv);
      }

      // launchers: a plunger rod and knob behind the rest position
      this.plungers = [];
      for (const ln of L.launchers) {
        const f = ln.track.frame(0, {});
        const q = HW.Q.fromBasis({ x: f.rx, y: f.ry, z: f.rz }, { x: f.ux, y: f.uy, z: f.uz }, { x: -f.tx, y: -f.ty, z: -f.tz });
        const grp = new T.Group();
        grp.position.set(f.px, f.py, f.pz); grp.quaternion.set(q.x, q.y, q.z, q.w);
        const body = new T.Mesh(new X.RoundedBoxGeometry(5.4, 2.2, 6, 3, 0.3), red);        // the launcher box behind the lane
        body.position.set(0, 1.0, 3.2);
        const head = new T.Mesh(new X.RoundedBoxGeometry(2.4, 0.9, 0.6, 2, 0.12), black);  // pushes the car's tail
        head.position.set(0, 0.55, 0);
        const rod = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 7, 10), grey);
        rod.rotation.x = Math.PI / 2; rod.position.set(0, 0.8, 3.5);
        const knob = new T.Mesh(new T.SphereGeometry(0.9, 16, 12), yellow);
        knob.position.set(0, 0.8, 7.2);
        const slider = new T.Group(); slider.add(head, rod, knob);
        grp.add(body, slider);
        g.add(grp);
        this.plungers.push({ ln, slider, restZ: -(ln.s - 3.5) });
      }

      // finish arches over every finish gate
      const banner = new T.MeshBasicMaterial({ map: HW.tex.three(checkerCanvas('FINISH'), { srgb: true }), side: T.DoubleSide });
      for (const tr of L.tracks) for (const gt of tr.gates) {
        if (gt.kind !== 'finish') continue;
        const f = tr.frame(gt.s, {}), w = L.dims.W / 2 + L.dims.wallT + 1.2, hgt = 7;
        for (const sg of [-1, 1]) {
          const post = new T.Mesh(new X.RoundedBoxGeometry(0.7, hgt, 0.7, 2, 0.15), black);
          post.position.set(f.px + f.rx * w * sg, f.py + hgt / 2 - 0.2, f.pz + f.rz * w * sg);
          g.add(post);
        }
        const plate = new T.Mesh(new T.PlaneGeometry(2 * w + 0.7, (2 * w + 0.7) * 96 / 512 * 1.6), banner);
        plate.position.set(f.px, f.py + hgt - 0.6, f.pz);
        plate.lookAt(plate.position.x - f.tx, plate.position.y, plate.position.z - f.tz);
        g.add(plate);
      }

      // hazards: a frame holding the pivot, and the moving arm + head (updated every frame)
      this.hazards = [];
      for (const hz of L.hazards) {
        const grp = new T.Group();
        const p = hz.pivot;
        if (hz.type === 'hammer') {
          const f = hz.track.frame(hz.s, {}), w = L.dims.W / 2 + 3.2;
          for (const sg of [-1, 1]) {
            const post = new T.Mesh(new X.RoundedBoxGeometry(0.8, p[1] + 0.6, 0.8, 2, 0.15), black);
            post.position.set(p[0] + f.rx * w * sg, (p[1] + 0.6) / 2, p[2] + f.rz * w * sg);
            grp.add(post);
          }
          const bar = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 2 * w + 0.8, 12), grey);
          bar.position.set(p[0], p[1], p[2]);
          bar.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(f.rx, f.ry, f.rz));
          grp.add(bar);
        } else {
          const hub = new T.Mesh(new T.CylinderGeometry(0.7, 0.9, p[1] + 0.8, 16), black);
          hub.position.set(p[0], (p[1] + 0.8) / 2, p[2]);
          grp.add(hub);
        }
        // the moving part, in the hazard box's own axes (a0 = axis, a1 = arm, a2)
        const mover = new T.Group();
        const head = new T.Mesh(new X.RoundedBoxGeometry(hz.half[0] * 2, hz.half[1] * 2, hz.half[2] * 2, 2, 0.2), hz.type === 'hammer' ? red : yellow);
        mover.add(head);
        if (hz.type === 'hammer') {
          const arm = new T.Mesh(new T.BoxGeometry(0.35, hz.armLen - hz.half[1], 0.35), grey);
          arm.position.y = -(hz.armLen - hz.half[1]) / 2 - hz.half[1];
          mover.add(arm);
        }
        grp.add(mover);
        g.add(grp);
        this.hazards.push({ hz, mover });
      }

      g.traverse((o) => { if (o.isMesh && o.material !== banner) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(g);
      this.group = g;
      this.update(0, sim);                                      // movers start where the physics has them
      return g;
    },

    update(dt, sim) {
      const a = sim.power.state.wheelAngle;
      for (const piv of this.wheels || []) piv.rotation.y = -a * piv.userData.spin;
      for (const p of this.plungers || []) p.slider.position.z = p.restZ + (p.ln.pull || 0);
      for (const { hz, mover } of this.hazards || []) {
        const b = hz.box;
        if (!b) continue;
        mover.position.set(b.c.x, b.c.y, b.c.z);
        mover.quaternion.set(b.q.x, b.q.y, b.q.z, b.q.w);
      }
    },
  };
})(window.HW);
