// 51-render-world.js - the room around the set: a varnished oak floor and a woven indigo
// rug under the track (blue under orange, so the track reads at a glance). All textures
// are painted on canvases at load time: no image files, so the page stays one file.
(function (HW) {
  const tex = (HW.tex = {
    canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
    // height canvas (grey) -> tangent-space normal map canvas
    normalFrom(hc, strength) {
      const w = hc.width, h = hc.height;
      const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
      const out = tex.canvas(w, h), ctx = out.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
      const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
        const l = Math.hypot(dx, dy, 1);
        const i = (y * w + x) * 4;
        d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return out;
    },
    three(canvas, { repeat = 1, srgb = true, aniso = 8 } = {}) {
      const T = window.THREE;
      const t = new T.CanvasTexture(canvas);
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = aniso;
      if (srgb) t.colorSpace = T.SRGBColorSpace;
      return t;
    },
  });

  function woodFloor(rng) {
    const S = 1024, planksAcross = 8;                       // one tile = 8 planks x ~2 lengths
    const col = tex.canvas(S, S), hgt = tex.canvas(S, S), rough = tex.canvas(S, S);
    const c = col.getContext('2d'), hc = hgt.getContext('2d'), rc = rough.getContext('2d');
    hc.fillStyle = '#808080'; hc.fillRect(0, 0, S, S);
    const pw = S / planksAcross;
    for (let row = 0; row < planksAcross; row++) {
      const y0 = row * pw;
      let x = -rng() * S * 0.6;
      while (x < S) {
        const len = S * (0.45 + rng() * 0.5);
        const hue = 26 + rng() * 8, sat = 42 + rng() * 16, lit = 34 + rng() * 14;
        const x0 = x, x1 = x + len;
        const draw = (ox) => {
          c.fillStyle = `hsl(${hue},${sat}%,${lit}%)`;
          c.fillRect(x0 + ox, y0, len, pw);
          // grain: long wavy streaks
          for (let k = 0; k < 26; k++) {
            const gy = y0 + rng() * pw, amp = 1 + rng() * 3.5, f = 0.004 + rng() * 0.01, ph = rng() * 6.28;
            const dark = rng() < 0.6;
            c.strokeStyle = dark ? `hsla(${hue - 4},${sat + 8}%,${lit - 10 - rng() * 8}%,${0.25 + rng() * 0.35})` : `hsla(${hue + 3},${sat}%,${lit + 8}%,${0.15 + rng() * 0.2})`;
            c.lineWidth = 0.6 + rng() * 1.6;
            hc.strokeStyle = dark ? 'rgba(90,90,90,0.5)' : 'rgba(150,150,150,0.3)';
            hc.lineWidth = c.lineWidth;
            c.beginPath(); hc.beginPath();
            for (let t = 0; t <= len; t += 12) {
              const yy = gy + Math.sin((x0 + t) * f + ph) * amp;
              if (t === 0) { c.moveTo(x0 + ox + t, yy); hc.moveTo(x0 + ox + t, yy); } else { c.lineTo(x0 + ox + t, yy); hc.lineTo(x0 + ox + t, yy); }
            }
            c.stroke(); hc.stroke();
          }
          // an occasional knot
          if (rng() < 0.35) {
            const kx = x0 + ox + len * (0.15 + rng() * 0.7), ky = y0 + pw * (0.25 + rng() * 0.5);
            for (let r = 9; r > 0; r -= 1.5) {
              c.strokeStyle = `hsla(${hue - 6},${sat + 10}%,${lit - 14}%,0.35)`;
              c.lineWidth = 1.1;
              c.beginPath(); c.ellipse(kx, ky, r * 2.2, r, 0, 0, Math.PI * 2); c.stroke();
            }
          }
          // plank edges: butt joint and the long seam
          c.fillStyle = 'rgba(25,12,5,0.85)';
          c.fillRect(x0 + ox, y0, 1.6, pw); c.fillRect(x0 + ox, y0, len, 1.6);
          hc.fillStyle = '#1e1e1e';
          hc.fillRect(x0 + ox, y0, 1.6, pw); hc.fillRect(x0 + ox, y0, len, 1.6);
          const rv = 120 + rng() * 40 | 0;                // roughnessMap reads the green channel
          rc.fillStyle = `rgb(${rv},${rv},${rv})`;
          rc.fillRect(x0 + ox, y0, len, pw);
        };
        draw(0);
        if (x1 > S) draw(-S);                                 // wrap for seamless tiling
        x = x1;
      }
    }
    return { col, hgt, rough };
  }

  function rugTextures(rng, W, H) {
    // 1 px = 2 mm; a woven indigo field with a cream-and-rust border
    const px = 5, w = Math.round(W * px), h = Math.round(H * px);
    const col = tex.canvas(w, h), hgt = tex.canvas(w, h);
    const c = col.getContext('2d'), hc = hgt.getContext('2d');
    c.fillStyle = '#26365a'; c.fillRect(0, 0, w, h);
    // heathered wool: speckle
    const img = c.getImageData(0, 0, w, h), d = img.data;
    const himg = hc.createImageData(w, h), hd = himg.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // heathered wool: colour speckle only; the weave itself is a fine tiled normal map
      const n = (rng() - 0.5) * 20;
      d[i] = Math.max(0, d[i] + n * 0.7); d[i + 1] = Math.max(0, d[i + 1] + n * 0.8); d[i + 2] = Math.max(0, d[i + 2] + n);
      const hv = 128 + (rng() - 0.5) * 18;
      hd[i] = hd[i + 1] = hd[i + 2] = hv; hd[i + 3] = 255;
    }
    c.putImageData(img, 0, 0); hc.putImageData(himg, 0, 0);
    // border bands
    const band = (inset, width, color, alpha) => {
      c.strokeStyle = color; c.globalAlpha = alpha; c.lineWidth = width * px;
      const o = inset * px + (width * px) / 2;
      c.strokeRect(o, o, w - 2 * o, h - 2 * o);
      c.globalAlpha = 1;
    };
    band(3, 7, '#e7dcc2', 0.92);
    band(6.5, 1.2, '#b8542c', 0.9);
    band(11, 0.8, '#e7dcc2', 0.7);
    // a faint diamond lattice in the field
    c.strokeStyle = 'rgba(160,180,230,0.10)'; c.lineWidth = 3;
    const step = 22 * px;
    for (let k = -h; k < w + h; k += step) {
      c.beginPath(); c.moveTo(k, 0); c.lineTo(k + h, h); c.stroke();
      c.beginPath(); c.moveTo(k, h); c.lineTo(k + h, 0); c.stroke();
    }
    return { col, hgt };
  }

  // a basket weave, 4 cm square, 16 yarn cells each way (2.5 mm): smooth bumps so it reads as
  // wool up close and mips to flat from across the room
  function weaveTile() {
    const S = 256, c = tex.canvas(S, S), x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
    const cell = S / 16;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const cx = Math.floor(px / cell), cy = Math.floor(py / cell), u = (px % cell) / cell, v = (py % cell) / cell;
      const warp = (cx + cy) % 2 === 0;                     // over-under
      // a yarn runs along u (or v): round across it, slightly bulged along it
      const across = warp ? v : u, along = warp ? u : v;
      const h = Math.sin(Math.PI * across) * (0.75 + 0.25 * Math.sin(Math.PI * along)) + 0.08 * Math.sin(px * 1.7 + py * 0.9);
      const i = (py * S + px) * 4;
      d[i] = d[i + 1] = d[i + 2] = 60 + 150 * h; d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  HW.world = {
    build(scene) {
      const T = window.THREE;
      const rng = HW.rng(4242);
      const group = new T.Group();

      // oak floor: 1 tile = 128 cm
      const wf = woodFloor(rng);
      const tile = 128, size = 1400;
      const floorMat = new T.MeshPhysicalMaterial({
        map: tex.three(wf.col, { repeat: size / tile }),
        normalMap: tex.three(tex.normalFrom(wf.hgt, 2.2), { repeat: size / tile, srgb: false }),
        roughnessMap: tex.three(wf.rough, { repeat: size / tile, srgb: false }),
        // satin varnish: a low, soft clearcoat (a strong one turned the rim light into a white haze)
        roughness: 0.66, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.32, specularIntensity: 0.5,
      });
      floorMat.normalScale.set(0.6, 0.6);
      const floor = new T.Mesh(new T.PlaneGeometry(size, size), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.45;
      floor.receiveShadow = true;
      group.add(floor);

      // rug: 190 x 150 cm, top surface at y = 0 (the physics floor)
      const RW = 190, RH = 150, thick = 0.45;
      const rt = rugTextures(rng, RW, RH);
      const rugMat = new T.MeshPhysicalMaterial({
        map: tex.three(rt.col, { repeat: 1 }),
        normalMap: tex.three(tex.normalFrom(weaveTile(), 1.6), { repeat: 1, srgb: false }),
        roughness: 0.94, metalness: 0,
        sheen: 0.35, sheenRoughness: 0.85, sheenColor: new T.Color(0x8fa6d8), specularIntensity: 0.3,
      });
      rugMat.normalMap.repeat.set(RW / 4, RH / 4);
      rugMat.normalScale.set(0.55, 0.55);
      const edgeMat = new T.MeshStandardMaterial({ color: 0xd9ccb0, roughness: 0.95 });
      const rugGeo = new T.BoxGeometry(RW, thick, RH);
      // top face gets the woven texture, the sides a plain binding
      const rug = new T.Mesh(rugGeo, [edgeMat, edgeMat, rugMat, edgeMat, edgeMat, edgeMat]);
      rug.position.set(0, -thick / 2, 6);
      rug.receiveShadow = true;
      group.add(rug);

      scene.add(group);
      HW.world.group = group;
      return group;
    },
  };
})(window.HW);
