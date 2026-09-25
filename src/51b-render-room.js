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
      const kind = L.set && L.set.room;
      if (kind !== 'kitchen') return null;
      const T = window.THREE, X = window.THREEX, rng = HW.rng(77);
      const g = new T.Group();
      // walls stand clear of everything the set owns
      let lo = L.bounds.lo.slice(), hi = L.bounds.hi.slice();
      for (const b of L.solids || []) if (b.furniture) for (const k of [0, 2]) { lo[k] = Math.min(lo[k], b.c[k] - b.h[k]); hi[k] = Math.max(hi[k], b.c[k] + b.h[k]); }
      const xW = lo[0] - 75, zN = lo[2] - 95, H = 250, len = 900;

      const wallMat = new T.MeshStandardMaterial({ map: HW.tex.three(plaster(rng), { repeat: 1 }), roughness: 0.93 });
      wallMat.map.repeat.set(len / 120, H / 120);
      const north = new T.Mesh(new T.PlaneGeometry(len, H), wallMat);
      north.position.set(xW + len / 2, H / 2 - 0.45, zN);
      const west = new T.Mesh(new T.PlaneGeometry(len, H), wallMat);
      west.rotation.y = Math.PI / 2;
      west.position.set(xW, H / 2 - 0.45, zN + len / 2);
      g.add(north, west);

      // skirting board
      const skirt = new T.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.5 });
      const sk1 = new T.Mesh(new T.BoxGeometry(len, 9, 1.6), skirt); sk1.position.set(xW + len / 2, 4.1, zN + 0.8);
      const sk2 = new T.Mesh(new T.BoxGeometry(1.6, 9, len), skirt); sk2.position.set(xW + 0.8, 4.1, zN + len / 2);
      g.add(sk1, sk2);

      // the window in the west wall, lined up with where the key light comes from
      const wz = Math.min(hi[2], zN + 330), wy = 150, ww = 120, wh = 110;
      const sky = HW.tex.canvas(64, 128), sx = sky.getContext('2d'), sg = sx.createLinearGradient(0, 0, 0, 128);
      sg.addColorStop(0, '#fff3dc'); sg.addColorStop(0.55, '#ffd9a0'); sg.addColorStop(1, '#f2b27a');
      sx.fillStyle = sg; sx.fillRect(0, 0, 64, 128);
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

      // kitchen run along the north wall: base units, worktop, splashback, wall units
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

      g.traverse((o) => { if (o.isMesh && o !== glass && o !== glow) { o.receiveShadow = true; } });
      scene.add(g);
      HW.room.group = g;
      return g;
    },
  };
})(window.HW);
