// 51-render-cars.js — procedural low-poly bodies for the five 1999 Criss Cross Crash
// castings. Origin = chassis centre, matching the physics cuboid: length along Z with
// -Z the nose, width along X, height along Y. Liveries are painted into CanvasTextures.
// Public: HW.renderCars.buildMesh(entry) -> THREE.Group, .sync(car, group),
//         .collectorCard(entry) -> HTML string, .textureCache
(function (HW) {
  const TH = () => window.THREE;

  const TINTS = {
    smoke:  { c: 0x24262b, o: 0.62 },
    clear:  { c: 0xd8e6f2, o: 0.30 },
    yellow: { c: 0xe6c02f, o: 0.46 },
    blue:   { c: 0x3d7ccd, o: 0.48 },
    black:  { c: 0x08090b, o: 0.90 },
  };
  const INTERIORS = { black: 0x15161a, gray: 0x6a6f77, grey: 0x6a6f77, tan: 0xb99a6b,
                      red: 0x8c1f16, white: 0xdedede, none: null };

  const cache = new Map();
  const remember = (key, make) => { let v = cache.get(key); if (v === undefined) { v = make(); cache.set(key, v); } return v; };

  // ---- canvas helpers ------------------------------------------------------
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function texFrom(cv) {
    const THREE = TH(), t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4; if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true; return t;
  }
  // rot = -Math.PI/2 lays the text across the width, which is how a roof/hood graphic
  // reads when the car is seen from above with the nose pointing away.
  function label(ctx, txt, x, y, size, fill, stroke, rot) {
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ctx.font = 'bold ' + size + 'px "Arial Black", Impact, Haettenschweiler, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineWidth = Math.max(2, size * 0.10); ctx.strokeStyle = stroke; ctx.strokeText(txt, 0, 0); }
    ctx.fillStyle = fill; ctx.fillText(txt, 0, 0);
    ctx.restore();
  }
  function taperBand(ctx, x0, y0, t0, x1, y1, t1, fill) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 + t1); ctx.lineTo(x0, y0 + t0);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  function flames(ctx, x0, y0, len, amp, fill, stroke) {
    ctx.beginPath(); ctx.moveTo(x0, y0 + amp);
    for (let i = 0; i < 4; i++) {
      const a = x0 + len * (i / 4), b = x0 + len * ((i + 1) / 4);
      ctx.quadraticCurveTo(a + (b - a) * 0.4, y0 - amp * (1.1 - i * 0.18), b, y0 + amp * 0.15);
      ctx.quadraticCurveTo(b - (b - a) * 0.15, y0 + amp * 0.8, b, y0 + amp);
    }
    ctx.lineTo(x0, y0 + amp); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.lineWidth = 3; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  // ---- livery painting -----------------------------------------------------
  // Side canvas: u = 0 at the nose, u = 1 at the tail; canvas y = 0 is the roof
  // line (three.js textures are flipY, so canvas row 0 lands at v = 1).
  function paintSide(entry) {
    const W = 512, H = 192, cv = canvas(W, H), ctx = cv.getContext('2d');
    const L = entry.livery || {}, col = L.colors || [entry.accent, '#ffffff', '#111111'];
    const c0 = col[0] || entry.accent, c1 = col[1] || '#ffffff', c2 = col[2] || '#111111';
    ctx.fillStyle = entry.color; ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, 'rgba(255,255,255,0)');
    g.addColorStop(0.72, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000000');
    ctx.globalAlpha = 0.30; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;

    switch (L.style) {
      case 'stripe':
        taperBand(ctx, 20, 150, 16, 492, 118, 26, c0);
        taperBand(ctx, 20, 168, 7, 492, 146, 10, c1);
        label(ctx, L.text || '', 352, 118, 46, c2, c1);
        if (L.sub) label(ctx, L.sub, 178, 170, 19, c1, c2);
        break;
      case 'race-stripe':
        ctx.beginPath(); ctx.moveTo(70, 192); ctx.lineTo(300, 74); ctx.lineTo(392, 74);
        ctx.lineTo(162, 192); ctx.closePath(); ctx.fillStyle = c0; ctx.fill();
        ctx.beginPath(); ctx.moveTo(176, 192); ctx.lineTo(406, 74); ctx.lineTo(440, 74);
        ctx.lineTo(210, 192); ctx.closePath(); ctx.fillStyle = c1; ctx.fill();
        taperBand(ctx, 20, 172, 10, 492, 160, 12, c2);
        label(ctx, L.text || '', 262, 130, 50, c1, c2);
        break;
      case 'number':
        taperBand(ctx, 20, 156, 12, 492, 130, 20, c0);
        ctx.beginPath(); ctx.arc(316, 118, 44, 0, Math.PI * 2); ctx.fillStyle = c2; ctx.fill();
        ctx.lineWidth = 6; ctx.strokeStyle = c1; ctx.stroke();
        label(ctx, L.text || '', 316, 119, 52, c1, null);
        if (L.sub) label(ctx, L.sub, 148, 152, 19, c1, c2);
        break;
      case 'oval':
        ctx.beginPath(); ctx.ellipse(300, 126, 92, 40, 0, 0, Math.PI * 2);
        ctx.fillStyle = c1; ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = c0; ctx.stroke();
        label(ctx, L.text || '', 300, 127, 40, c0, null);
        ctx.beginPath(); ctx.ellipse(120, 140, 44, 22, 0, 0, Math.PI * 2);
        ctx.fillStyle = c1; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = c0; ctx.stroke();
        if (L.sub) label(ctx, L.sub, 120, 141, 17, c0, null);
        break;
      case 'flames':
        flames(ctx, 8, 108, 300, 52, c0, c1);
        label(ctx, L.text || '', 400, 140, 34, c1, c2);
        break;
      default:
        taperBand(ctx, 20, 150, 14, 492, 126, 20, c0);
        label(ctx, L.text || '', 340, 128, 40, c1, c2);
    }
    return texFrom(cv);
  }

  // Top canvas: u = 0 at the nose, u = 1 at the tail; canvas y runs across the width.
  function paintTop(entry) {
    const W = 512, H = 192, cv = canvas(W, H), ctx = cv.getContext('2d');
    const L = entry.livery || {}, col = L.colors || [entry.accent, '#ffffff', '#111111'];
    const c0 = col[0] || entry.accent, c1 = col[1] || '#ffffff', c2 = col[2] || '#111111';
    ctx.fillStyle = entry.color; ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#000000'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#000000');
    ctx.globalAlpha = 0.18; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;

    switch (L.style) {
      case 'stripe':
        ctx.fillStyle = c0; ctx.fillRect(0, 70, W, 20); ctx.fillRect(0, 102, W, 20);
        ctx.fillStyle = c1; ctx.fillRect(0, 92, W, 8);
        break;
      case 'race-stripe':
        ctx.fillStyle = c0; ctx.fillRect(0, 64, W, 26); ctx.fillStyle = c1; ctx.fillRect(0, 102, W, 26);
        label(ctx, L.text || '', 300, 96, 38, c1, c2, -Math.PI / 2);
        break;
      case 'number':
        ctx.fillStyle = c0; ctx.fillRect(0, 82, W, 28);
        ctx.beginPath(); ctx.arc(262, 96, 46, 0, Math.PI * 2); ctx.fillStyle = c2; ctx.fill();
        ctx.lineWidth = 6; ctx.strokeStyle = c1; ctx.stroke();
        label(ctx, L.text || '', 262, 97, 54, c1, null, -Math.PI / 2);
        break;
      case 'oval':
        ctx.beginPath(); ctx.ellipse(258, 96, 74, 46, 0, 0, Math.PI * 2);
        ctx.fillStyle = c1; ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = c0; ctx.stroke();
        label(ctx, L.text || '', 258, 97, 34, c0, null, -Math.PI / 2);
        break;
      case 'flames':
        flames(ctx, 0, 30, 300, 44, c0, c1);
        ctx.save(); ctx.translate(0, H); ctx.scale(1, -1); flames(ctx, 0, 30, 300, 44, c0, c1); ctx.restore();
        break;
      default:
        ctx.fillStyle = c0; ctx.fillRect(0, 84, W, 24);
    }
    return texFrom(cv);
  }

  // ---- rim faces -----------------------------------------------------------
  function rimTexture(code) {
    const S = 96, cv = canvas(S, S), ctx = cv.getContext('2d'), c = S / 2;
    ctx.fillStyle = '#141619'; ctx.beginPath(); ctx.arc(c, c, c - 1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#dfe3e9'; ctx.beginPath(); ctx.arc(c, c, c - 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#14161a';
    const wedge = (a0, a1, r0, r1) => {
      ctx.beginPath(); ctx.arc(c, c, r1, a0, a1); ctx.arc(c, c, r0, a1, a0, true); ctx.closePath(); ctx.fill();
    };
    if (code === '5DOT') {
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath(); ctx.arc(c + Math.cos(a) * 25, c + Math.sin(a) * 25, 10, 0, Math.PI * 2); ctx.fill();
      }
    } else if (code === '3SP') {
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 - Math.PI / 2 + 0.62; wedge(a, a + 1.40, 12, c - 8); }
    } else if (code === 'SB') {
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; wedge(a, a + 0.20, 22, c - 7); }
      ctx.beginPath(); ctx.arc(c, c, 21, 0, Math.PI * 2);
      ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 2; ctx.stroke();
    } else { // 5SP and fallback
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2 + 0.36; wedge(a, a + 0.90, 12, c - 8); }
    }
    ctx.fillStyle = '#eef1f5'; ctx.beginPath(); ctx.arc(c, c, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8b9099'; ctx.beginPath(); ctx.arc(c, c, 4.5, 0, Math.PI * 2); ctx.fill();
    return texFrom(cv);
  }

  // ---- geometry helpers ----------------------------------------------------
  // Extrude a side profile given in (z, y) car coordinates across `width` in X, then
  // re-project UVs: the +/-X lids sample the side livery, the walls the top livery.
  // Material groups: 0 = lids, 1 = walls (three.js ExtrudeGeometry convention).
  function extrudeProfile(pts, width, L, W, H, chamfer) {
    const THREE = TH();
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    sh.closePath();
    const b = Math.max(0.02, chamfer == null ? 0.06 : chamfer);
    const geo = new THREE.ExtrudeGeometry(sh, {
      // bevelOffset: -bevelSize keeps the widest section on the profile outline and
      // insets the two lids instead, so the mesh never grows past the physics cuboid.
      depth: Math.max(0.1, width - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b,
      bevelOffset: -b, bevelSegments: 1, curveSegments: 1, steps: 1,
    });
    geo.computeBoundingBox();
    const bb = geo.boundingBox, span = bb.max.z - bb.min.z, mid = (bb.max.z + bb.min.z) / 2;
    geo.translate(0, 0, -mid);
    if (span > 1e-6) geo.scale(1, 1, width / span);
    geo.rotateY(-Math.PI / 2);        // shape x -> car z, extrusion axis -> car x
    geo.computeVertexNormals();
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    const uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), nx = nor.getX(i);
      let u = (z + L / 2) / L, v;
      // Seen from +X the nose is on the viewer's right, so mirror u there: the side
      // livery then reads nose-to-tail on both flanks.
      if (Math.abs(nx) > 0.55) { v = (y + H / 2) / H; if (nx > 0) u = 1 - u; }
      else { v = (x + W / 2) / W; }
      uv.setXY(i, u, v);
    }
    geo.setAttribute('uv', uv);
    return geo;
  }

  function quad(a, b, c, d) {
    const THREE = TH(), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2],
      a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]], 3));
    g.computeVertexNormals();
    return g;
  }

  // ---- the mesh ------------------------------------------------------------
  function buildMesh(entry, cfg) {
    const THREE = TH();
    if (!THREE) throw new Error('renderCars.buildMesh: window.THREE is not ready');
    cfg = cfg || HW.config || {};
    const L = entry.lengthCm, W = entry.widthCm, H = entry.heightCm;
    const b = entry.body || { style: 'racer', cabin: { x0: 0.32, x1: 0.72, height: 0.42 },
                              rakeF: 0.34, rakeR: 0.18, hoodDrop: 0.2 };
    const cab = b.cabin || { x0: 0.32, x1: 0.72, height: 0.42 };
    const cabinH = H * cab.height, lowerH = H - cabinH;
    const yBase = -H / 2 + lowerH, yTop = H / 2;
    const zF = -L / 2 + cab.x0 * L, zR = -L / 2 + cab.x1 * L, cl = Math.max(0.4, zR - zF);
    const rakeF = cl * (b.rakeF == null ? 0.34 : b.rakeF), rakeR = cl * (b.rakeR == null ? 0.18 : b.rakeR);
    const hood = (b.hoodDrop || 0) * lowerH, deck = hood * 0.55;

    const sideTex = remember(entry.id + ':side', () => paintSide(entry));
    const topTex = remember(entry.id + ':top', () => paintTop(entry));
    const mk = (map) => new THREE.MeshStandardMaterial({ map, metalness: 0.60, roughness: 0.35 });
    const paint = [remember(entry.id + ':matSide', () => mk(sideTex)),
                   remember(entry.id + ':matTop', () => mk(topTex))];
    const plain = remember(entry.id + ':matPlain', () => new THREE.MeshStandardMaterial(
      { color: new THREE.Color(entry.color), metalness: 0.6, roughness: 0.35 }));

    const group = new THREE.Group();
    group.name = 'car:' + entry.id;
    const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; group.add(m); return m; };

    // lower body: nose -> hood -> beltline -> deck -> tail, closed under the sills
    const sill = -H / 2 + 0.10;
    add(extrudeProfile([
      [-L / 2, yBase - hood], [zF, yBase], [zR, yBase], [L / 2, yBase - deck],
      [L / 2 - 0.10, sill], [-L / 2 + 0.10, sill],
    ], W, L, W, H, 0.07), paint);

    // greenhouse
    const cabW = W * (b.style === 'pickup' || b.style === 'stocker' ? 0.90 : 0.86);
    add(extrudeProfile([
      [zF, yBase - 0.04], [zR, yBase - 0.04], [zR - rakeR, yTop], [zF + rakeF, yTop],
    ], cabW, L, W, H, 0.05), paint);

    // ---- glass --------------------------------------------------------------
    const tn = TINTS[entry.tint] || TINTS.smoke;
    const glassMat = remember('glass:' + entry.tint, () => new THREE.MeshStandardMaterial({
      color: new THREE.Color(tn.c), transparent: true, opacity: tn.o, roughness: 0.07,
      metalness: 0.10, side: THREE.DoubleSide, depthWrite: false }));
    const m = 0.09, gx = cabW / 2 + 0.018;
    const win = [[zF + m * 1.5, yBase + 0.05], [zR - m * 1.5, yBase + 0.05],
                 [zR - rakeR - m, yTop - m], [zF + rakeF + m, yTop - m]];
    if (win[3][0] < win[2][0] - 0.05 && win[0][0] < win[1][0] - 0.05) {
      const wg = new THREE.Shape();
      wg.moveTo(win[0][0], win[0][1]);
      for (let i = 1; i < 4; i++) wg.lineTo(win[i][0], win[i][1]);
      wg.closePath();
      const sg = new THREE.ShapeGeometry(wg); sg.rotateY(-Math.PI / 2);
      for (const s of [-1, 1]) { const w = new THREE.Mesh(sg, glassMat); w.position.x = s * gx; group.add(w); }
    }
    // windscreen + backlight: a quad on each raked face, nudged out along its normal
    const gw = cabW * 0.90, eps = 0.022, midZ = (zF + zR) / 2;
    const slopeGlass = (z0, z1) => {
      const dz = z1 - z0, dy = cabinH, n = Math.hypot(dz, dy) || 1;
      let nz = -dy / n, ny = dz / n;
      if ((z0 - midZ) * nz < 0) { nz = -nz; ny = -ny; }
      const p = (t) => [z0 + dz * t + nz * eps, yBase + cabinH * t + ny * eps + 0.02];
      const lo = p(0.07), hi = p(0.93);
      return quad([-gw / 2, lo[1], lo[0]], [gw / 2, lo[1], lo[0]], [gw / 2, hi[1], hi[0]], [-gw / 2, hi[1], hi[0]]);
    };
    group.add(new THREE.Mesh(slopeGlass(zF, zF + rakeF), glassMat));
    group.add(new THREE.Mesh(slopeGlass(zR, zR - rakeR), glassMat));

    // interior hint, seen through the glass
    const ic = INTERIORS[entry.interior];
    if (ic != null) {
      const im = new THREE.Mesh(new THREE.BoxGeometry(cabW * 0.78, cabinH * 0.32, cl * 0.72),
        remember('int:' + entry.interior, () => new THREE.MeshStandardMaterial({ color: ic, roughness: 0.9, metalness: 0.0 })));
      im.position.set(0, yBase + cabinH * 0.17, midZ); group.add(im);
    }

    // pickup bed
    if (b.bed) {
      const z0 = zR + 0.05, z1 = L / 2 - 0.08, bl = Math.max(0.4, z1 - z0);
      const wallH = cabinH * 0.40, t = 0.13, bw = W * 0.94;
      const box = (w, h, d, x, y, z, mat) => {
        const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mm.position.set(x, y, z); mm.castShadow = true; group.add(mm);
      };
      box(t, wallH, bl, -(bw / 2 - t / 2), yBase + wallH / 2, (z0 + z1) / 2, plain);
      box(t, wallH, bl, (bw / 2 - t / 2), yBase + wallH / 2, (z0 + z1) / 2, plain);
      box(bw, wallH, t, 0, yBase + wallH / 2, z1 - t / 2, plain);
      box(bw - 2 * t, 0.07, bl - t, 0, yBase + 0.035, (z0 + z1) / 2 - t / 2,
        remember('bedfloor', () => new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.8, metalness: 0.3 })));
    }

    // rear wing
    if (b.spoiler) {
      const wy = b.style === 'stocker' ? yTop - cabinH * 0.22 : yBase + 0.20;
      const wz = L / 2 - 0.30;
      const wing = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, 0.07, 0.42), plain);
      wing.position.set(0, wy, wz); wing.castShadow = true; group.add(wing);
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, Math.max(0.06, wy - yBase), 0.14), plain);
        post.position.set(s * W * 0.28, (wy + yBase) / 2, wz); group.add(post);
      }
    }

    // base plate
    const metal = /metal/i.test(entry.base || '') && !/black/i.test(entry.base || '');
    const baseMat = remember('base:' + (metal ? 'metal' : 'black'), () => new THREE.MeshStandardMaterial(
      metal ? { color: 0xb4b9c1, metalness: 0.90, roughness: 0.32 }
            : { color: 0x121316, metalness: 0.25, roughness: 0.75 }));
    const bp = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.10, L * 0.94), baseMat);
    bp.position.y = -H / 2 + 0.05; bp.receiveShadow = true; group.add(bp);

    // wheels: FL(-X,-Z), FR(+X,-Z), RL(-X,+Z), RR(+X,+Z)
    const r = entry.wheelRadiusCm || 0.5, tw = Math.min(0.36, r * 0.72);
    const tireGeo = remember('tire:' + r.toFixed(2) + ':' + tw.toFixed(2), () => {
      const g2 = new THREE.CylinderGeometry(r, r, tw, 14, 1); g2.rotateZ(Math.PI / 2); return g2; });
    const tireMat = remember('tire:mat', () => new THREE.MeshStandardMaterial({ color: 0x121215, roughness: 0.92, metalness: 0.05 }));
    const rimTex = remember('rim:' + entry.wheelCode, () => rimTexture(entry.wheelCode));
    const rimMat = remember('rim:mat:' + entry.wheelCode, () => new THREE.MeshStandardMaterial({ map: rimTex, roughness: 0.28, metalness: 0.85 }));
    const rimGeo = remember('rimgeo:' + r.toFixed(2), () => new THREE.CircleGeometry(r * 0.94, 16));
    const clearance = cfg.carClearance == null ? 0.3 : cfg.carClearance;
    const wheelY = r - H / 2 - clearance;
    const wheels = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const wg = new THREE.Group();
      wg.position.set(sx * entry.trackCm / 2, wheelY, sz * entry.wheelbaseCm / 2);
      const tire = new THREE.Mesh(tireGeo, tireMat); tire.castShadow = true; wg.add(tire);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.x = sx * (tw / 2 + 0.006);
      rim.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      wg.add(rim);
      group.add(wg); wheels.push(wg);
    }

    const stiff = cfg.suspStiffness || 1, rest = cfg.suspRest == null ? 0.6 : cfg.suspRest;
    const staticComp = (HW.units ? HW.units.G : 981) / (4 * stiff);
    group.userData = { entry, wheels, wheelY, connY: wheelY + rest - staticComp, halfH: H / 2 };
    return group;
  }

  // Spin (and, when the controller reports one, settle) the wheels. Body position and
  // orientation stay the renderer's job.
  function sync(car, group) {
    if (!car || !group || !group.userData || !group.userData.wheels) return;
    const ws = group.userData.wheels, base = group.userData.wheelY, connY = group.userData.connY;
    for (let k = 0; k < 4; k++) {
      const st = car.wheelState ? car.wheelState(k) : null;
      if (!st) continue;
      ws[k].rotation.x = st.rot || 0;
      if (typeof st.len === 'number' && isFinite(st.len)) {
        ws[k].position.y = Math.max(base - 0.5, Math.min(base + 0.5, connY - st.len));
      }
    }
  }

  function collectorCard(entry) {
    const w = (HW.wheelTypes && HW.wheelTypes[entry.wheelCode]) || {};
    const pack = HW.pack || { name: 'Criss Cross Crash 5-Pack', year: entry.year, toyNumber: '21081' };
    const L = entry.livery || {};
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const row = (k, v) => '<tr><th>' + esc(k) + '</th><td>' + esc(v) + '</td></tr>';
    return '<div class="hw-card" data-car="' + esc(entry.id) + '">' +
      '<div class="hw-card-swatch" style="background:' + esc(entry.color) + ';border-color:' + esc(entry.accent) + '"></div>' +
      '<h3>' + esc(entry.name) + ' <span class="hw-card-year">' + esc(entry.year) + '</span></h3>' +
      '<p class="hw-card-pack">' + esc(pack.name) + ' &middot; toy #' + esc(pack.toyNumber) + '</p>' +
      '<table class="hw-card-specs">' +
      row('Body colour', entry.color) +
      row('Tampo', L.tampo || ((L.style || '') + ' ' + (L.text || ''))) +
      row('Wheels', entry.wheelCode + (w.name ? ' (' + w.name + ')' : '')) +
      row('Base', entry.base) +
      row('Window', entry.tint) +
      row('Interior', entry.interior) +
      row('Mass', entry.massG + ' g') +
      row('Size (L x W x H)', entry.lengthCm + ' x ' + entry.widthCm + ' x ' + entry.heightCm + ' cm') +
      '</table></div>';
  }

  HW.renderCars = {
    buildMesh, sync, collectorCard, textureCache: cache, TINTS,
    clearCache() { for (const v of cache.values()) if (v && v.dispose) v.dispose(); cache.clear(); },
  };
})(window.HW);
