// 51b-render-room.js - the room around a set that asks for one (set.room). 'kitchen': two
// plaster walls meeting behind the set, a skirting board, a window in the west wall where the
// late-afternoon key light comes in, and a run of kitchen cabinets with a worktop and a tiled
// splashback along the north wall. Drawn only: no car can reach it. Placed from the set's
// bounds, so the walls always stand clear of the track and its furniture.
(function (HW) {
  const tex = () => HW.tex;

  // warm plaster: a soft mottle and a few trowel sweeps (colour), a matching bump
  function plaster(rng) {
    const S = 512, c = tex().canvas(S, S), x = c.getContext('2d');
    x.fillStyle = '#d8ccb4'; x.fillRect(0, 0, S, S);
    for (let k = 0; k < 900; k++) {
      const r = 6 + rng() * 40, l = 72 + rng() * 10;
      x.fillStyle = `hsla(38, 22%, ${l}%, 0.05)`;
      x.beginPath(); x.arc(rng() * S, rng() * S, r, 0, 7); x.fill();
    }
    return c;
  }
  // white subway tiles, 15 x 7.5 cm, running bond; 1 px = 2 mm
  function tiles() {
    const W = 300, H = 150, c = tex().canvas(W, H), x = c.getContext('2d');
    x.fillStyle = '#b9b4aa'; x.fillRect(0, 0, W, H);
    for (let row = 0; row < 4; row++) for (let k = -1; k < 5; k++) {
      const ox = k * 75 + (row % 2 ? 37.5 : 0), oy = row * 37.5;
      const g = x.createLinearGradient(0, oy, 0, oy + 37.5);
      g.addColorStop(0, '#f6f4ef'); g.addColorStop(1, '#e7e3da');
      x.fillStyle = g; x.beginPath(); x.roundRect(ox + 1.2, oy + 1.2, 72.6, 35.1, 3); x.fill();
    }
    return c;
  }

  HW.room = {
    build(scene, L) {
      const kind = (L.set && L.set.room) || 'living';
      if (kind === 'none') return null;
      const T = window.THREE, X = window.THREEX, rng = HW.rng(77);
      const g = new T.Group();
      // walls stand clear of everything the set owns, on the far sides as the opening camera
      // sees it. The room is built in a local frame with its two walls on x = 0 and z = 0 and
      // the floor running to +x, +z, then placed (and mirrored if need be) at that corner.
      let lo = L.bounds.lo.slice(), hi = L.bounds.hi.slice();
      for (const b of L.solids || []) if (b.furniture) for (const k of [0, 2]) { lo[k] = Math.min(lo[k], b.c[k] - b.h[k]); hi[k] = Math.max(hi[k], b.c[k] + b.h[k]); }
      const v = L.view || {}, cam = v.camera || [0, 0, 1], aim = v.orbit || [0, 0, 0];
      const sx = aim[0] - cam[0] < 0 ? 1 : -1, sz = aim[2] - cam[2] < 0 ? 1 : -1;
      // clearance from the set to each wall: room for what stands against it (a 60 cm kitchen run,
      // an 85 cm sofa) plus a margin to walk round
      const [mx, mz] = kind === 'kitchen' ? [75, 95] : [155, 110];
      const cx = sx > 0 ? lo[0] - mx : hi[0] + mx, cz = sz > 0 ? lo[2] - mz : hi[2] + mz;
      const ez = sz > 0 ? hi[2] - cz : cz - lo[2];                    // room depth to the set's far edge
      g.position.set(cx, 0, cz); g.scale.set(sx, 1, sz);
      const xW = 0, zN = 0, H = 250, len = 900;

      const wallMat = new T.MeshStandardMaterial({ map: HW.tex.three(plaster(rng), { repeat: 1 }), roughness: 0.93 });
      wallMat.map.repeat.set(len / 120, H / 120);
      const north = new T.Mesh(new T.PlaneGeometry(len, H), wallMat);
      north.position.set(xW + len / 2, H / 2 - 0.45, zN);
      const west = new T.Mesh(new T.PlaneGeometry(len, H), wallMat);
      west.rotation.y = Math.PI / 2;
      west.position.set(xW, H / 2 - 0.45, zN + len / 2);
      g.add(north, west);
      // the near walls and the ceiling close the room for low and upward views (chase, onboard,
      // the Director): one-sided planes facing in, so a camera outside the room sees through them
      const exL = (sx > 0 ? hi[0] - cx : cx - lo[0]) + 300, ezL = ez + 300;
      const east = new T.Mesh(new T.PlaneGeometry(len, H), wallMat);
      east.rotation.y = -Math.PI / 2; east.position.set(exL, H / 2 - 0.45, zN + len / 2);
      const south = new T.Mesh(new T.PlaneGeometry(len, H), wallMat);
      south.rotation.y = Math.PI; south.position.set(xW + len / 2, H / 2 - 0.45, ezL);
      const ceil = new T.Mesh(new T.PlaneGeometry(len, len), new T.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.95 }));
      ceil.rotation.x = Math.PI / 2; ceil.position.set(xW + len / 2, H - 0.45, zN + len / 2);
      g.add(east, south, ceil);

      // skirting board
      const skirt = new T.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.5 });
      const sk1 = new T.Mesh(new T.BoxGeometry(len, 9, 1.6), skirt); sk1.position.set(xW + len / 2, 4.1, zN + 0.8);
      const sk2 = new T.Mesh(new T.BoxGeometry(1.6, 9, len), skirt); sk2.position.set(xW + 0.8, 4.1, zN + len / 2);
      g.add(sk1, sk2);

      // the window in the west wall, lined up with where the key light comes from
      const wz = Math.min(ez, 330), wy = 150, ww = 120, wh = 110;
      const sky = HW.tex.canvas(64, 128), skx = sky.getContext('2d'), sg = skx.createLinearGradient(0, 0, 0, 128);
      sg.addColorStop(0, '#fff3dc'); sg.addColorStop(0.55, '#ffd9a0'); sg.addColorStop(1, '#f2b27a');
      skx.fillStyle = sg; skx.fillRect(0, 0, 64, 128);
      const glass = new T.Mesh(new T.PlaneGeometry(ww, wh), new T.MeshBasicMaterial({ map: HW.tex.three(sky), toneMapped: false, fog: false }));
      glass.material.color.setScalar(1.6);
      glass.rotation.y = Math.PI / 2; glass.position.set(xW + 0.3, wy, wz);
      const frame = new T.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.45 });
      const bar = (w, h, d, y, z) => { const m = new T.Mesh(new T.BoxGeometry(d, h, w), frame); m.position.set(xW + d / 2, y, z); g.add(m); };
      bar(ww + 10, 5, 4, wy + wh / 2 + 2.5, wz); bar(ww + 10, 5, 4, wy - wh / 2 - 2.5, wz);
      bar(5, wh, 4, wy, wz - ww / 2 - 2.5); bar(5, wh, 4, wy, wz + ww / 2 + 2.5);
      bar(3, wh, 3, wy, wz); bar(ww, 3, 3, wy, wz);
      bar(ww + 18, 3, 12, wy - wh / 2 - 6, wz);                        // sill
      g.add(glass);
      // a soft glow on the floor under the window, as the sun would lay down
      const pool = HW.tex.canvas(128, 128), px = pool.getContext('2d'), pg = px.createRadialGradient(64, 64, 4, 64, 64, 62);
      pg.addColorStop(0, 'rgba(255,214,150,0.35)'); pg.addColorStop(1, 'rgba(255,214,150,0)');
      px.fillStyle = pg; px.fillRect(0, 0, 128, 128);
      const glow = new T.Mesh(new T.PlaneGeometry(220, 120), new T.MeshBasicMaterial({ map: HW.tex.three(pool), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      glow.rotation.x = -Math.PI / 2; glow.position.set(xW + 110, -0.4, wz + 30);
      g.add(glow);

      if (kind === 'living') livingRoom(g, T, X, rng, ez);
      else kitchen(g, T, X, len);
      g.traverse((o) => { if (o.isMesh && o !== glass && o !== glow) { o.receiveShadow = true; } });
      scene.add(g);
      HW.room.group = g;
      return g;
    },
  };

  // a kitchen run along the north wall: base units, worktop, splashback, wall units
  function kitchen(g, T, X, len) {
      const xW = 0, zN = 0;
      const run = Math.min(360, len - 60), x0 = xW + 2;
      const door = new T.MeshPhysicalMaterial({ color: 0x4f6b5d, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.4 });
      const carcass = new T.MeshStandardMaterial({ color: 0x2c3a33, roughness: 0.7 });
      const top = new T.MeshPhysicalMaterial({ color: 0xe9e4da, roughness: 0.28, clearcoat: 0.5, clearcoatRoughness: 0.2 });
      const brass = new T.MeshStandardMaterial({ color: 0xc9a25a, metalness: 1, roughness: 0.3 });
      const plinth = new T.Mesh(new T.BoxGeometry(run, 10, 54), carcass); plinth.position.set(x0 + run / 2, 5 - 0.45, zN + 29);
      g.add(plinth);
      const nDoors = Math.round(run / 60);
      for (let k = 0; k < nDoors; k++) {
        const w = run / nDoors, cx = x0 + w * (k + 0.5);
        const d = new T.Mesh(new X.RoundedBoxGeometry(w - 0.8, 76, 2, 2, 0.4), door); d.position.set(cx, 10 + 38, zN + 58);
        const hdl = new T.Mesh(new X.RoundedBoxGeometry(12, 1.2, 1.4, 2, 0.5), brass); hdl.position.set(cx, 80, zN + 59.8);
        const box = new T.Mesh(new T.BoxGeometry(w, 76, 56), carcass); box.position.set(cx, 48, zN + 29);
        g.add(box, d, hdl);
        // wall units above
        const u = new T.Mesh(new X.RoundedBoxGeometry(w - 0.8, 70, 2, 2, 0.4), door); u.position.set(cx, 190, zN + 34);
        const ub = new T.Mesh(new T.BoxGeometry(w, 70, 32), carcass); ub.position.set(cx, 190, zN + 16);
        const uh = new T.Mesh(new X.RoundedBoxGeometry(1.2, 10, 1.4, 2, 0.5), brass); uh.position.set(cx + (k % 2 ? -1 : 1) * (w / 2 - 6), 162, zN + 35.8);
        g.add(ub, u, uh);
      }
      const wt = new T.Mesh(new X.RoundedBoxGeometry(run + 3, 3.5, 63, 2, 0.8), top); wt.position.set(x0 + run / 2, 87.75, zN + 31.5);
      g.add(wt);
      const tileTex = HW.tex.three(tiles(), { repeat: 1 });
      tileTex.repeat.set(run / 60, 1);
      const splash = new T.Mesh(new T.PlaneGeometry(run, 65), new T.MeshStandardMaterial({ map: tileTex, roughness: 0.25 }));
      splash.position.set(x0 + run / 2, 89.5 + 32.5, zN + 0.3);
      g.add(splash);
      // a toaster and a canister on the worktop, for scale
      const steel = new T.MeshStandardMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.22 });
      const slot = new T.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 });
      const tx = x0 + run * 0.72, ty = 89.5, tz = zN + 26;
      const body = new T.Mesh(new X.RoundedBoxGeometry(28, 18, 16, 4, 4), new T.MeshPhysicalMaterial({ color: 0xc23a2b, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
      body.position.set(tx, ty + 9, tz);
      for (const dz of [-3.2, 3.2]) { const s = new T.Mesh(new T.BoxGeometry(20, 0.6, 2.4), slot); s.position.set(tx, ty + 18.05, tz + dz); g.add(s); }
      const lever = new T.Mesh(new X.RoundedBoxGeometry(3, 1.6, 2.4, 2, 0.6), steel); lever.position.set(tx + 15, ty + 12, tz);
      const jar = new T.Mesh(new T.CylinderGeometry(6, 6, 16, 24), new T.MeshPhysicalMaterial({ color: 0xe8d9b5, roughness: 0.35, clearcoat: 0.6 }));
      jar.position.set(x0 + run * 0.3, 97.5, zN + 22);
      const jlid = new T.Mesh(new T.CylinderGeometry(6.3, 6.3, 2, 24), new T.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.6 }));
      jlid.position.set(x0 + run * 0.3, 106.5, zN + 22);
      g.add(body, lever, jar, jlid);

  }

  // a living room: a bookcase along the north wall, a sofa under the window, a floor lamp
  function livingRoom(g, T, X, rng, ez) {
    const wood = new T.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.6 });
    const shelfW = 160, shelfD = 30, shelfH = 180, x0 = 60;
    const box = (w, h, d, x, y, z, m) => { const o = new T.Mesh(new X.RoundedBoxGeometry(w, h, d, 2, Math.min(0.6, w / 4, h / 4, d / 4)), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    // the carcass: two sides, a top, a back and five shelves full of books
    box(2.5, shelfH, shelfD, x0, shelfH / 2, shelfD / 2, wood); box(2.5, shelfH, shelfD, x0 + shelfW, shelfH / 2, shelfD / 2, wood);
    box(shelfW + 2.5, 2.5, shelfD, x0 + shelfW / 2, shelfH, shelfD / 2, wood);
    box(shelfW, shelfH, 1, x0 + shelfW / 2, shelfH / 2, 0.8, new T.MeshStandardMaterial({ color: 0x4e3521, roughness: 0.8 }));
    // the books are one merged mesh (a shelf-full as separate meshes cost ~150 draw calls)
    const books = [];
    for (let k = 0; k < 5; k++) {
      const y = 8 + k * 36;
      box(shelfW, 2, shelfD - 2, x0 + shelfW / 2, y, shelfD / 2, wood);
      let x = x0 + 3;
      while (x < x0 + shelfW - 6) {
        const w = 2 + rng() * 3.5, h = 20 + rng() * 10, hue = rng();
        if (rng() < 0.08) { x += 6; continue; }                       // a gap on the shelf
        const col = new T.Color().setHSL(hue, 0.35 + rng() * 0.3, 0.25 + rng() * 0.3);
        const geo = new T.BoxGeometry(w, h, 18 + rng() * 5).toNonIndexed();
        geo.translate(x + w / 2, y + 1 + h / 2, shelfD / 2 + 1);
        const n = geo.attributes.position.count, c = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
        geo.setAttribute('color', new T.Float32BufferAttribute(c, 3));
        books.push(geo);
        x += w + 0.2;
      }
    }
    const shelfBooks = new T.Mesh(X.mergeGeometries(books), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
    shelfBooks.castShadow = true;
    g.add(shelfBooks);
    // a sofa along the west wall, under the window
    const fabric = new T.MeshStandardMaterial({ color: 0x7a8c96, roughness: 0.95 });
    const sz0 = Math.min(ez, 330) - 110, sl = 200;
    box(85, 40, sl, 45, 22, sz0 + sl / 2, fabric);                    // base
    box(22, 45, sl, 11, 60, sz0 + sl / 2, fabric);                    // back
    for (const z of [sz0 + 11, sz0 + sl - 11]) box(85, 58, 22, 45, 29, z, fabric);   // arms
    for (let k = 0; k < 3; k++) box(60, 12, sl / 3 - 4, 55, 48, sz0 + 22 + (k + 0.5) * ((sl - 44) / 3), new T.MeshStandardMaterial({ color: 0x8a9ca6, roughness: 0.95 }));
    // a floor lamp in the corner, its shade lit
    const brass = new T.MeshStandardMaterial({ color: 0xb08d57, metalness: 1, roughness: 0.35 });
    const lx = 30, lz = 40;
    const base = new T.Mesh(new T.CylinderGeometry(12, 14, 3, 32), brass); base.position.set(lx, 1.5, lz);
    const pole = new T.Mesh(new T.CylinderGeometry(1.2, 1.2, 150, 12), brass); pole.position.set(lx, 76, lz);
    const shade = new T.Mesh(new T.CylinderGeometry(16, 22, 26, 32, 1, true), new T.MeshStandardMaterial({ color: 0xf2e3c4, emissive: 0xffc98a, emissiveIntensity: 0.55, side: T.DoubleSide, roughness: 0.9 }));
    shade.position.set(lx, 158, lz);
    g.add(base, pole, shade);
  }
})(window.HW);
