// 54-render-hub.js - the red V2791 hub: plus-shaped body, orange lane floors forming the #,
// lane walls, four foam booster wheels (spoked yellow caps, all turning clockwise seen
// from above), the idler gear under a clear dome, and the battery box with its working
// ON/OFF slide switch. Geometry comes from layout.hub, which the Rapier colliders use too.
(function (HW) {
  function roundedRectShape(T, x0, y0, x1, y1, r) {
    const s = new T.Shape();
    s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
    s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1); s.lineTo(x0 + r, y1);
    s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
    return s;
  }
  // plus outline with rounded outer corners and filleted inner corners (x right, y = -z world)
  function plusShape(T, a, L, ro, ri) {
    const s = new T.Shape();
    s.moveTo(-a + ro, L);
    s.lineTo(a - ro, L); s.quadraticCurveTo(a, L, a, L - ro);
    s.lineTo(a, a + ri); s.quadraticCurveTo(a, a, a + ri, a);
    s.lineTo(L - ro, a); s.quadraticCurveTo(L, a, L, a - ro);
    s.lineTo(L, -a + ro); s.quadraticCurveTo(L, -a, L - ro, -a);
    s.lineTo(a + ri, -a); s.quadraticCurveTo(a, -a, a, -a - ri);
    s.lineTo(a, -L + ro); s.quadraticCurveTo(a, -L, a - ro, -L);
    s.lineTo(-a + ro, -L); s.quadraticCurveTo(-a, -L, -a, -L + ro);
    s.lineTo(-a, -a - ri); s.quadraticCurveTo(-a, -a, -a - ri, -a);
    s.lineTo(-L + ro, -a); s.quadraticCurveTo(-L, -a, -L, -a + ro);
    s.lineTo(-L, a - ro); s.quadraticCurveTo(-L, a, -L + ro, a);
    s.lineTo(-a - ri, a); s.quadraticCurveTo(-a, a, -a, a + ri);
    s.lineTo(-a, L - ro); s.quadraticCurveTo(-a, L, -a + ro, L);
    return s;
  }

  function spokeCanvas(blur) {
    const S = 256, c = HW.tex.canvas(S, S), x = c.getContext('2d');
    x.translate(S / 2, S / 2);
    x.fillStyle = '#f2b705'; x.beginPath(); x.arc(0, 0, S / 2 - 2, 0, Math.PI * 2); x.fill();
    if (blur) {
      // spinning: spokes smear into concentric bands
      const g = x.createRadialGradient(0, 0, 10, 0, 0, S / 2);
      g.addColorStop(0, '#6d4f00'); g.addColorStop(0.35, '#b8890a'); g.addColorStop(0.36, '#d6a106'); g.addColorStop(0.8, '#caa018'); g.addColorStop(1, '#8a6a08');
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, S / 2 - 2, 0, Math.PI * 2); x.fill();
    } else {
      x.fillStyle = '#5a4100';
      for (let k = 0; k < 5; k++) {
        x.save(); x.rotate((k * Math.PI * 2) / 5);
        x.beginPath(); x.ellipse(0, -S * 0.27, S * 0.085, S * 0.16, 0, 0, Math.PI * 2); x.fill();
        x.restore();
      }
    }
    x.fillStyle = '#3a3a3a'; x.beginPath(); x.arc(0, 0, S * 0.1, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#9a9a9a'; x.beginPath(); x.arc(0, 0, S * 0.045, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 4; x.beginPath(); x.arc(0, 0, S / 2 - 4, 0, Math.PI * 2); x.stroke();
    return c;
  }

  function gearShape(T, rOut, rIn, teeth) {
    const s = new T.Shape();
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * Math.PI * 2, a1 = ((i + 0.25) / teeth) * Math.PI * 2, a2 = ((i + 0.5) / teeth) * Math.PI * 2, a3 = ((i + 0.75) / teeth) * Math.PI * 2;
      const pts = [[rIn, a0], [rOut, a1], [rOut, a2], [rIn, a3]];
      pts.forEach(([r, a], k) => { const px = Math.cos(a) * r, py = Math.sin(a) * r; if (i === 0 && k === 0) s.moveTo(px, py); else s.lineTo(px, py); });
    }
    const hole = new T.Path(); hole.absarc(0, 0, rIn * 0.25, 0, Math.PI * 2, true); s.holes.push(hole);
    return s;
  }

  function logoCanvas() {
    const c = HW.tex.canvas(512, 256), x = c.getContext('2d');
    x.fillStyle = '#b30f16'; x.fillRect(0, 0, 512, 256);
    // flame swoosh
    const g = x.createLinearGradient(40, 0, 470, 0);
    g.addColorStop(0, '#ffd23a'); g.addColorStop(0.55, '#ff7a14'); g.addColorStop(1, '#e8200e');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(40, 170); x.bezierCurveTo(120, 60, 300, 40, 480, 70); x.bezierCurveTo(380, 80, 300, 100, 280, 118);
    x.bezierCurveTo(360, 110, 420, 118, 470, 132); x.bezierCurveTo(360, 140, 240, 170, 200, 206); x.bezierCurveTo(150, 190, 90, 190, 40, 170);
    x.fill();
    x.save(); x.translate(256, 150); x.transform(1, 0, -0.22, 1, 0, 0);
    x.font = '900 46px "Racing Sans One", "Arial Black", Impact, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 10; x.strokeStyle = '#1b0a02'; x.strokeText('LUKEWARM WHEELS', 0, 0);
    x.fillStyle = '#fff6e0'; x.fillText('LUKEWARM WHEELS', 0, 0);
    x.restore();
    x.font = '700 30px "Barlow Condensed", "Arial Narrow", sans-serif'; x.fillStyle = '#ffe7b0'; x.textAlign = 'center';
    x.fillText('CRISS CROSS CALAMITY', 256, 222);
    return c;
  }

  function startCanvas() {
    const c = HW.tex.canvas(128, 256), x = c.getContext('2d');
    x.clearRect(0, 0, 128, 256);
    x.fillStyle = 'rgba(255,248,230,0.92)';
    for (let k = 0; k < 3; k++) {
      const y = 40 + k * 46;
      x.beginPath(); x.moveTo(20, y + 34); x.lineTo(64, y); x.lineTo(108, y + 34); x.lineTo(108, y + 50); x.lineTo(64, y + 16); x.lineTo(20, y + 50); x.closePath(); x.fill();
    }
    x.save(); x.translate(64, 222); x.font = '800 30px "Barlow Condensed", "Arial Narrow", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('START', 0, 0); x.restore();
    return c;
  }

  HW.renderHub = {
    build(scene, L) {
      if (!L.hub) { this.switchKnob = null; return; }
      const T = window.THREE, X = window.THREEX, hub = L.hub, h0 = hub.deckH, { p, Lh, W } = L.dims;
      const g = new T.Group();
      const red = new T.MeshPhysicalMaterial({ color: 0xc8141c, roughness: 0.34, clearcoat: 0.45, clearcoatRoughness: 0.22, specularIntensity: 0.5 });
      const darkRed = new T.MeshPhysicalMaterial({ color: 0x8e0c12, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 });
      const black = new T.MeshPhysicalMaterial({ color: 0x17181c, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25 });
      const grey = new T.MeshPhysicalMaterial({ color: 0x9aa0aa, roughness: 0.35, clearcoat: 0.4 });
      const orange = HW.renderTrack.materials ? HW.renderTrack.materials.track.clone() : new T.MeshPhysicalMaterial({ color: 0xff5f0e, roughness: 0.34, clearcoat: 0.55 });
      orange.vertexColors = false;
      this.mats = { red, black, grey, orange };

      // body: extruded plus, top face at the lane deck
      const bev = 0.35;
      const body = new T.Mesh(new T.ExtrudeGeometry(plusShape(T, hub.armW - bev, Lh - bev, 1.6, 1.8), { depth: h0 - 2 * bev, bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: 4, curveSegments: 10 }), red);
      body.rotation.x = -Math.PI / 2; body.position.y = bev;
      g.add(body);
      // a darker skirt line near the floor, and four rubber feet
      const skirt = new T.Mesh(new T.ExtrudeGeometry(plusShape(T, hub.armW + 0.05, Lh + 0.05, 1.7, 1.7), { depth: 0.5, bevelEnabled: false, curveSegments: 10 }), darkRed);
      skirt.rotation.x = -Math.PI / 2; skirt.position.y = 0;
      g.add(skirt);

      // lane floors: the # in track orange (C/D and A/B at a hair's different height)
      for (const k of ['C', 'D', 'A', 'B']) {
        const ln = L.lanes[k], ns = ln.dir[2] !== 0;
        const geo = new T.BoxGeometry(ns ? W + 0.02 : 2 * Lh, 0.05, ns ? 2 * Lh : W + 0.02);
        const m = new T.Mesh(geo, orange);
        m.position.set(ns ? ln.from[0] : 0, h0 - 0.025 + (ns ? 0.004 : 0.008), ns ? 0 : ln.from[2]);
        g.add(m);
      }
      // walls (merged into one mesh)
      const wallGeos = hub.walls.map((b) => {
        const geo = new X.RoundedBoxGeometry(b.h[0] * 2, b.h[1] * 2 + 0.3, b.h[2] * 2, 2, 0.06);
        geo.translate(b.c[0], b.c[1] - 0.15, b.c[2]);
        return geo;
      });
      const walls = new T.Mesh(X.mergeGeometries(wallGeos), red);
      g.add(walls);

      // centre island with the idler gear under a clear dome
      const isl = hub.island;
      const islMesh = new T.Mesh(new X.RoundedBoxGeometry(isl.h[0] * 2, isl.h[1] * 2, isl.h[2] * 2, 3, 0.25), red);
      islMesh.position.set(isl.c[0], isl.c[1], isl.c[2]);
      g.add(islMesh);
      const gear = new T.Mesh(new T.ExtrudeGeometry(gearShape(T, 0.95, 0.78, 14), { depth: 0.25, bevelEnabled: false }), new T.MeshStandardMaterial({ color: 0xbdb8ad, roughness: 0.55 }));
      gear.rotation.x = -Math.PI / 2; gear.position.set(0, isl.c[1] + isl.h[1] + 0.02, 0);
      const gearPivot = new T.Group(); gearPivot.add(gear); g.add(gearPivot);
      gear.position.set(0, 0, 0); gearPivot.position.set(0, isl.c[1] + isl.h[1] + 0.02, 0);
      const dome = new T.Mesh(new T.SphereGeometry(1.15, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new T.MeshPhysicalMaterial({ color: 0xdfe8ff, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.09, depthWrite: false, envMapIntensity: 0.3 }));
      dome.position.set(0, isl.c[1] + isl.h[1], 0);
      dome.scale.y = 0.55;
      g.add(dome);

      // booster modules
      const foamMat = new T.MeshStandardMaterial({ color: 0x3b3d42, roughness: 0.96 });
      const capTex = HW.tex.three(spokeCanvas(false), { srgb: true }), capBlur = HW.tex.three(spokeCanvas(true), { srgb: true });
      const capMat = new T.MeshPhysicalMaterial({ map: capTex, roughness: 0.35, clearcoat: 0.6 });
      this.cap = { mat: capMat, sharp: capTex, blur: capBlur };
      this.wheels = [];
      const fr = L.foamR;
      for (const w of L.wheels) {
        const pivot = new T.Group();
        pivot.position.set(w.pos[0], h0 + 0.05, w.pos[2]);
        const foam = new T.Mesh(new T.CylinderGeometry(fr, fr, 1.3, 48, 1), foamMat);
        foam.position.y = 0.65;
        const cap = new T.Mesh(new T.CylinderGeometry(fr * 0.66, fr * 0.66, 0.12, 40), [foamMat, capMat, foamMat]);
        cap.position.y = 1.36;
        pivot.add(foam, cap);
        g.add(pivot);
        this.wheels.push(pivot);
      }
      // an axle boss on each wheel: the booster wheels sit open, spokes visible from above
      for (const piv of this.wheels) {
        const boss = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 0.5, 16), black);
        boss.position.y = 1.55;
        piv.add(boss);
      }

      // battery / motor box with the logo and the ON/OFF slide switch
      const bb = hub.battery;
      const box = new T.Mesh(new X.RoundedBoxGeometry(bb.h[0] * 2, bb.h[1] * 2, bb.h[2] * 2, 4, 0.45), red);
      box.position.set(bb.c[0], bb.c[1], bb.c[2]);
      g.add(box);
      const lidTex = HW.tex.three(logoCanvas(), { srgb: true });
      const lid = new T.Mesh(new T.PlaneGeometry(bb.h[0] * 1.8, bb.h[0] * 0.9), new T.MeshStandardMaterial({ map: lidTex, roughness: 0.45 }));
      lid.rotation.x = -Math.PI / 2; lid.rotation.z = Math.PI / 4;
      lid.position.set(bb.c[0], bb.c[1] + bb.h[1] + 0.01, bb.c[2]);
      g.add(lid);
      // switch on the south face: a slot and a sliding knob
      const slot = new T.Mesh(new X.RoundedBoxGeometry(2.6, 0.9, 0.2, 2, 0.08), black);
      slot.position.set(bb.c[0], 2.2, bb.c[2] + bb.h[2] + 0.05);
      const knob = new T.Mesh(new X.RoundedBoxGeometry(1.0, 0.75, 0.5, 2, 0.12), grey);
      knob.position.set(bb.c[0] - 0.7, 2.2, bb.c[2] + bb.h[2] + 0.2);
      knob.userData.pick = 'switch';
      slot.userData.pick = 'switch';
      g.add(slot, knob);
      const lab = HW.tex.canvas(256, 64), lx = lab.getContext('2d');
      lx.font = '700 36px "Barlow Condensed", sans-serif'; lx.fillStyle = '#fff3e0'; lx.textBaseline = 'middle';
      lx.fillText('OFF', 18, 32); lx.textAlign = 'right'; lx.fillText('ON', 238, 32);
      const label = new T.Mesh(new T.PlaneGeometry(3.6, 0.9), new T.MeshBasicMaterial({ map: HW.tex.three(lab), transparent: true }));
      label.position.set(bb.c[0], 3.1, bb.c[2] + bb.h[2] + 0.02);
      g.add(label);
      this.switchKnob = knob; this.switchBase = bb.c[0];

      // START HERE on lane C, south arm
      const f = L.path.frame(L.startS, {});
      const start = new T.Mesh(new T.PlaneGeometry(W * 0.8, W * 1.6), new T.MeshBasicMaterial({ map: HW.tex.three(startCanvas()), transparent: true, depthWrite: false }));
      start.rotation.x = -Math.PI / 2;
      start.position.set(f.px, h0 + 0.02, f.pz + 1.2);
      g.add(start);

      g.traverse((o) => { if (o.isMesh && o !== dome && o !== start && o !== label) { o.castShadow = true; o.receiveShadow = true; } });
      this.gearPivot = gearPivot;
      this.group = g;
      scene.add(g);
      return g;
    },

    update(dt, sim) {
      if (!this.switchKnob) return;
      const st = sim.power.state, a = st.wheelAngle, w = sim.power.omegaW;
      for (const piv of this.wheels) piv.rotation.y = -a;          // clockwise seen from above
      this.gearPivot.rotation.y = a;                                // the idler turns the other way
      // spokes smear once the wheel turns faster than the eye can follow
      const fast = Math.abs(w) > 25;
      const want = fast ? this.cap.blur : this.cap.sharp;
      if (this.cap.mat.map !== want) { this.cap.mat.map = want; this.cap.mat.needsUpdate = true; }
      // slide switch
      const target = this.switchBase + (st.on ? 0.7 : -0.7);
      this.switchKnob.position.x += (target - this.switchKnob.position.x) * Math.min(1, dt * 18);
    },
  };
})(window.HW);
