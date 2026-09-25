// 52-render-track.js - the orange track: the classic Hot Wheels channel profile swept
// along every lobe (the hub draws its own lanes), piece joints with their connector
// clips, and the TRACK SUPPORT towers / sweep blocks from layout.supports.
(function (HW) {
  const TRACK_ORANGE = 0xff4400;

  // Cross-section in the frame's (R, U) plane: running surface at U = 0. Each part is a
  // strip with its own normals (hard edges between parts, like moulded plastic).
  function profile(d) {
    const a = d.W / 2, t = d.wallT, h = d.wallH, f = d.floorT, r = 0.06;
    const P = [];
    // part: list of [r, u, nr, nu, v]
    const part = (pts) => P.push(pts);
    const floorPts = [];
    for (let k = 0; k <= 6; k++) { const x = -a + (2 * a * k) / 6; floorPts.push([x, 0, 0, 1]); }
    part(floorPts);                                                     // running surface
    part([[a, 0, -1, 0], [a, h - r, -1, 0]]);                           // right wall, inner face
    part([[a, h - r, -1, 0], [a + r * 0.3, h - r * 0.3, -0.7, 0.7], [a + t / 2, h, 0, 1], [a + t - r * 0.3, h - r * 0.3, 0.7, 0.7], [a + t, h - r, 1, 0]]); // rounded lip
    part([[a + t, h - r, 1, 0], [a + t, -f, 1, 0]]);                   // right wall, outer face
    part([[a + t, -f, 0, -1], [-a - t, -f, 0, -1]]);                    // underside
    part([[-a - t, -f, -1, 0], [-a - t, h - r, -1, 0]]);               // left wall, outer face
    part([[-a - t, h - r, -1, 0], [-a - t + r * 0.3, h - r * 0.3, -0.7, 0.7], [-a - t / 2, h, 0, 1], [-a - r * 0.3, h - r * 0.3, 0.7, 0.7], [-a, h - r, 1, 0]]);
    part([[-a, h - r, 1, 0], [-a, 0, 1, 0]]);                           // left wall, inner face
    // v coordinate: cumulative length around the profile
    let acc = 0, prev = null;
    for (const pts of P) for (const q of pts) { if (prev) acc += Math.hypot(q[0] - prev[0], q[1] - prev[1]); q.push(acc); prev = q; }
    return P;
  }

  // Sweep the profile over [s0, s1] with extra rings hugging each joint so seams are crisp.
  function sweep(path, s0, s1, prof, joints, step) {
    const T = window.THREE;
    const ss = [];
    const n = Math.max(2, Math.ceil((s1 - s0) / step));
    for (let k = 0; k <= n; k++) ss.push(s0 + (s1 - s0) * k / n);
    for (const j of joints) if (j > s0 + 0.2 && j < s1 - 0.2) ss.push(j - 0.07, j, j + 0.07);
    ss.sort((a, b) => a - b);
    const nearJoint = (s) => joints.some((j) => Math.abs(s - j) < 0.035);
    const pos = [], nor = [], uv = [], col = [], idx = [];
    const f = {};
    let base = 0;
    for (const pts of prof) {
      const m = pts.length;
      for (let i = 0; i < ss.length; i++) {
        path.frame(ss[i], f);
        const shade = nearJoint(ss[i]) ? 0.42 : 1;
        for (const [r, u, nr, nu, v] of pts) {
          pos.push(f.px + f.rx * r + f.ux * u, f.py + f.ry * r + f.uy * u, f.pz + f.rz * r + f.uz * u);
          const nx = f.rx * nr + f.ux * nu, ny = f.ry * nr + f.uy * nu, nz = f.rz * nr + f.uz * nu, l = Math.hypot(nx, ny, nz) || 1;
          nor.push(nx / l, ny / l, nz / l);
          uv.push(ss[i] / 10, v);
          col.push(shade, shade, shade);
        }
        if (i > 0) {
          const a0 = base + (i - 1) * m, b0 = base + i * m;
          for (let k = 0; k < m - 1; k++) {
            idx.push(a0 + k, b0 + k, a0 + k + 1, a0 + k + 1, b0 + k, b0 + k + 1);
          }
        }
      }
      base += ss.length * m;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  }

  // faint moulding texture for the running surface: flow lines and tiny speckle
  function plasticTexture() {
    const c = HW.tex.canvas(256, 256), x = c.getContext('2d');
    x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256);
    const rng = HW.rng(77);
    for (let i = 0; i < 70; i++) {
      x.strokeStyle = `rgba(${rng() < 0.5 ? 100 : 160},${rng() < 0.5 ? 100 : 160},${rng() < 0.5 ? 100 : 160},0.25)`;
      x.lineWidth = 0.5 + rng();
      const y = rng() * 256;
      x.beginPath(); x.moveTo(0, y); for (let k = 0; k <= 256; k += 16) x.lineTo(k, y + Math.sin(k * 0.05 + i) * 2); x.stroke();
    }
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(0,0,0,${rng() * 0.12})`; x.fillRect(rng() * 256, rng() * 256, 1, 1); }
    return c;
  }

  HW.renderTrack = {
    materials: null,
    build(scene, L) {
      const T = window.THREE, d = { W: L.dims.W, wallT: L.dims.wallT, wallH: L.dims.wallH, floorT: L.dims.floorT };
      const bump = HW.tex.three(HW.tex.normalFrom(plasticTexture(), 0.6), { repeat: 1, srgb: false });
      const mat = new T.MeshPhysicalMaterial({
        color: TRACK_ORANGE, roughness: 0.38, metalness: 0, clearcoat: 0.18, clearcoatRoughness: 0.35,
        vertexColors: true, normalMap: bump, normalScale: new T.Vector2(0.25, 0.25),
        specularIntensity: 0.32, envMapIntensity: 0.8,
      });
      this.materials = { track: mat };
      const group = new T.Group();
      const prof = profile(d);
      for (const name in L.lobes) {
        const lb = L.lobes[name];
        const geo = sweep(L.path, lb.s0, lb.s1, prof, L.joints, 0.35);
        const mesh = new T.Mesh(geo, mat);
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.name = 'lobe-' + name;
        group.add(mesh);
      }
      // connector clips under every joint that is not a hub edge
      const clipMat = new T.MeshStandardMaterial({ color: 0xe4560b, roughness: 0.45 });
      const clipGeo = new T.BoxGeometry(d.W + 2 * d.wallT + 0.12, 0.16, 2.4);
      const f = {};
      const hubEdges = Object.values(L.laneS).flatMap((ln) => [ln.s0, ln.s1]);
      for (const js of L.joints) {
        if (hubEdges.some((e) => Math.abs(e - js) < 0.5)) continue;
        L.path.frame(js, f);
        const clip = new T.Mesh(clipGeo, clipMat);
        clip.position.set(f.px - f.ux * (d.floorT + 0.08), f.py - f.uy * (d.floorT + 0.08), f.pz - f.uz * (d.floorT + 0.08));
        const q = HW.Q.fromBasis({ x: f.rx, y: f.ry, z: f.rz }, { x: f.ux, y: f.uy, z: f.uz }, { x: -f.tx, y: -f.ty, z: -f.tz });
        clip.quaternion.set(q.x, q.y, q.z, q.w);
        clip.castShadow = true; clip.receiveShadow = true;
        group.add(clip);
      }
      group.add(this.buildSupports(L));
      scene.add(group);
      this.group = group;
      return group;
    },

    // TRACK SUPPORT towers (ladder posts on a foot) and stepped sweep blocks
    buildSupports(L) {
      const T = window.THREE, X = window.THREEX;
      const g = new T.Group();
      const mat = new T.MeshPhysicalMaterial({ color: 0x3b4a66, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4 });
      const dark = new T.MeshStandardMaterial({ color: 0x232b3b, roughness: 0.7 });
      for (const sp of L.supports) {
        if (sp.kind === 'post') {
          const h = sp.top;
          const foot = new T.Mesh(new X.RoundedBoxGeometry(6.2, 0.5, 6.2, 2, 0.2), mat);
          foot.position.set(sp.x, 0.25, sp.z);
          const post = new T.Mesh(new X.RoundedBoxGeometry(1.3, h - 0.5, 1.3, 2, 0.12), mat);
          post.position.set(sp.x, 0.5 + (h - 0.5) / 2, sp.z);
          g.add(foot, post);
          // ladder rungs on two faces, like the moulded TRACK SUPPORT
          const rungGeo = new T.BoxGeometry(1.42, 0.18, 1.42);
          for (let y = 2; y < h - 1; y += 1.1) {
            const r = new T.Mesh(rungGeo, dark);
            r.position.set(sp.x, y, sp.z);
            g.add(r);
          }
          // clip that grips the channel
          const clip = new T.Mesh(new X.RoundedBoxGeometry(2.2, 1.2, 2.2, 2, 0.2), mat);
          clip.position.set(sp.x, h + 0.1, sp.z);
          g.add(clip);
        } else {
          const h = Math.max(0.3, sp.top);
          for (let k = 0; k < 3; k++) {
            const w = 4.4 - k * 1.1;
            const step = new T.Mesh(new X.RoundedBoxGeometry(w, h / 3 + 0.01, 3.4, 2, 0.1), mat);
            step.position.set(sp.x, h / 6 + (k * h) / 3, sp.z);
            g.add(step);
          }
        }
      }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      return g;
    },
  };
})(window.HW);
