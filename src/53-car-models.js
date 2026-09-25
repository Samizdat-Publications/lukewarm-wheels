// 53-car-models.js - the five 1999 Criss Cross Crash castings, built procedurally.
//
// Each body is a loft: cross-sections (superellipses with tumblehome) swept along the car
// from nose to tail, driven by per-casting profiles of height, underside and width. The
// underside rises over each wheel, which cuts the arches. The glasshouse is a second loft
// on top, the base plate a third below. Tampos are painted on a canvas addressed by the
// loft's own (along, around) coordinates, so stripes follow the body exactly.
//
// Conventions (the renderer and physics rely on them): centimetres; y = 0 is where the
// wheels touch; x = 0 is the centreline; z = 0 is mid-wheelbase; forward is -Z.
(function (HW) {
  // ---------------------------------------------------------------- profile helpers
  // piecewise cubic (Catmull-Rom, clamped ends) through [x, value] knots, x in 0..1
  function curve(knots) {
    const n = knots.length;
    return function (x) {
      if (x <= knots[0][0]) return knots[0][1];
      if (x >= knots[n - 1][0]) return knots[n - 1][1];
      let i = 0; while (i < n - 2 && x > knots[i + 1][0]) i++;
      const p0 = knots[Math.max(0, i - 1)], p1 = knots[i], p2 = knots[i + 1], p3 = knots[Math.min(n - 1, i + 2)];
      const t = (x - p1[0]) / (p2[0] - p1[0] || 1);
      const m1 = (p2[1] - p0[1]) / ((p2[0] - p0[0]) || 1) * (p2[0] - p1[0]);
      const m2 = (p3[1] - p1[1]) / ((p3[0] - p1[0]) || 1) * (p2[0] - p1[0]);
      const t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
    };
  }
  const sgnPow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

  // Loft: xs = sorted stations along the car (0 = nose .. 1 = tail); each station is a
  // closed section of M points. section(x, v, out) writes [lateral, height] for around-
  // parameter v (0 = bottom centre, 0.25 = right side, 0.5 = top centre, 0.75 = left).
  // group(xMid, vMid) -> 0/1 splits the quads into two material groups. Ends are capped.
  function loft(xs, zOf, M, section, group) {
    const T = window.THREE;
    const pos = [], uv = [], idx = [[], []];
    const p = [0, 0], N = xs.length - 1;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= M; j++) {
        section(xs[i], (j % M) / M, p);
        pos.push(p[0], p[1], zOf(xs[i]));
        uv.push(xs[i], j / M);
      }
    }
    const row = M + 1;
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
      const a = i * row + j, b = a + row;
      const g = group ? group((xs[i] + xs[i + 1]) / 2, (j + 0.5) / M) : 0;
      idx[g].push(a, a + 1, b, a + 1, b + 1, b);
    }
    for (const i of [0, N]) {
      let cx = 0, cy = 0;
      for (let j = 0; j < M; j++) { cx += pos[(i * row + j) * 3]; cy += pos[(i * row + j) * 3 + 1]; }
      cx /= M; cy /= M;
      const c = pos.length / 3;
      pos.push(cx, cy, zOf(xs[i])); uv.push(xs[i], 0.5);
      for (let j = 0; j < M; j++) {
        const a = i * row + j, b = i * row + j + 1;
        if (i === 0) idx[0].push(c, b, a); else idx[0].push(c, a, b);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx[0].concat(idx[1]));
    g.addGroup(0, idx[0].length, 0);
    if (idx[1].length) g.addGroup(idx[0].length, idx[1].length, 1);
    g.computeVertexNormals();
    return g;
  }
  const stations = (n, extra) => {
    const xs = [];
    for (let i = 0; i <= n; i++) xs.push(i / n);
    for (const x of extra) if (x > 0 && x < 1) xs.push(x);
    xs.sort((a, b) => a - b);
    return xs.filter((x, i) => i === 0 || x - xs[i - 1] > 1e-4);
  };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ---------------------------------------------------------------- shared textures
  const cache = { tex: {}, mat: {}, geo: {} };
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c, srgb = true) {
    const T = window.THREE, t = new T.CanvasTexture(c);
    if (srgb) t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  // Wheel faces, 256 px: colour map + a metal/rough map (G = roughness, B = metalness)
  function wheelFace(code, blur) {
    const key = code + (blur ? '-b' : '');
    if (cache.tex[key]) return cache.tex[key];
    const S = 256, col = canvas(S, S), mr = canvas(S, S);
    const c = col.getContext('2d'), m = mr.getContext('2d');
    c.translate(S / 2, S / 2); m.translate(S / 2, S / 2);
    const R = S / 2 - 2;
    // black plastic tyre face
    c.fillStyle = '#121214'; c.beginPath(); c.arc(0, 0, R, 0, 7); c.fill();
    m.fillStyle = 'rgb(0,150,0)'; m.beginPath(); m.arc(0, 0, R, 0, 7); m.fill();
    const chrome = (fn) => {                      // draw a shape in chrome on both maps
      c.fillStyle = '#e8ebf0'; m.fillStyle = 'rgb(0,40,255)';
      fn(c); fn(m);
    };
    if (blur) {
      // spinning fast: the pattern smears into rings
      const ring = (r0, r1, a) => {
        const g = c.createRadialGradient(0, 0, r0, 0, 0, r1);
        g.addColorStop(0, `rgba(210,214,222,${a})`); g.addColorStop(1, `rgba(210,214,222,${a * 0.6})`);
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, r1, 0, 7); c.arc(0, 0, r0, 0, 7, true); c.fill();
        m.fillStyle = `rgb(0,70,${Math.round(255 * a)})`; m.beginPath(); m.arc(0, 0, r1, 0, 7); m.arc(0, 0, r0, 0, 7, true); m.fill();
      };
      if (code === '5DOT') { ring(R * 0.42, R * 0.62, 0.35); ring(0, R * 0.2, 0.9); }
      else if (code === 'SB') { ring(R * 0.2, R * 0.78, 0.7); ring(0, R * 0.2, 0.95); }
      else { ring(R * 0.18, R * 0.74, 0.55); ring(0, R * 0.2, 0.95); }
    } else if (code === '5DOT') {
      // five chrome dots on a black face, chrome hub cap
      chrome((x) => { for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; x.beginPath(); x.arc(Math.cos(a) * R * 0.52, Math.sin(a) * R * 0.52, R * 0.12, 0, 7); x.fill(); } });
      chrome((x) => { x.beginPath(); x.arc(0, 0, R * 0.2, 0, 7); x.fill(); });
    } else if (code === 'SB') {
      // saw blade: a chrome disc with angled cuts
      chrome((x) => { x.beginPath(); x.arc(0, 0, R * 0.8, 0, 7); x.fill(); });
      c.fillStyle = '#18181b'; m.fillStyle = 'rgb(0,150,0)';
      for (const x of [c, m]) {
        for (let k = 0; k < 12; k++) {
          x.save(); x.rotate(k * Math.PI * 2 / 12);
          x.beginPath(); x.moveTo(R * 0.3, 0); x.lineTo(R * 0.78, R * 0.1); x.lineTo(R * 0.78, R * 0.2); x.lineTo(R * 0.34, R * 0.07); x.closePath(); x.fill();
          x.restore();
        }
      }
      chrome((x) => { x.beginPath(); x.arc(0, 0, R * 0.22, 0, 7); x.fill(); });
    } else {
      // 3SP (and fallback 5SP): chrome spokes and rim ring
      const spokes = code === '5SP' ? 5 : 3;
      chrome((x) => {
        x.beginPath(); x.arc(0, 0, R * 0.78, 0, 7); x.arc(0, 0, R * 0.64, 0, 7, true); x.fill();
        for (let k = 0; k < spokes; k++) {
          x.save(); x.rotate(k * Math.PI * 2 / spokes);
          x.beginPath(); x.moveTo(-R * 0.1, 0); x.lineTo(-R * 0.16, R * 0.7); x.lineTo(R * 0.16, R * 0.7); x.lineTo(R * 0.1, 0); x.closePath(); x.fill();
          x.restore();
        }
        x.beginPath(); x.arc(0, 0, R * 0.2, 0, 7); x.fill();
      });
    }
    // tread ring shading
    c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, R * 0.94, 0, 7); c.stroke();
    const out = { map: tex(col), mr: tex(mr, false) };
    cache.tex[key] = out;
    return out;
  }

  // ---------------------------------------------------------------- the castings
  // Profiles are fractions: x of length (0 = nose), heights of total height, widths of
  // half width. top = the painted body's upper surface (bonnet, fenders, deck), bot = its
  // underside, cab = the glasshouse (x0..x1, roof profile, roof width), sq = section
  // squareness (2 = oval, 4 = boxy), tumble = how far the sides lean in near the top.
  const SHAPES = {
    porsche959: {
      top: [[0, 0.34], [0.04, 0.48], [0.1, 0.58], [0.16, 0.63], [0.26, 0.62], [0.33, 0.6], [0.5, 0.62], [0.66, 0.64], [0.8, 0.68], [0.88, 0.68], [0.96, 0.62], [1, 0.54]],
      bot: [[0, 0.24], [0.08, 0.14], [0.9, 0.14], [1, 0.22]],
      wid: [[0, 0.70], [0.06, 0.86], [0.2, 0.96], [0.32, 0.95], [0.5, 0.93], [0.7, 1.0], [0.84, 1.0], [0.96, 0.9], [1, 0.8]],
      cab: { x0: 0.31, x1: 0.84, roof: [[0, 0], [0.22, 0.86], [0.34, 1.0], [0.52, 0.98], [0.78, 0.72], [1, 0]], w: 0.66 },
      sq: 2.8, tumble: 0.18, wing: { x: 0.93, h: 0.72, chord: 0.09, span: 0.9, posts: 0.07 },
    },
    aeroflash: {
      top: [[0, 0.3], [0.06, 0.52], [0.14, 0.68], [0.25, 0.7], [0.36, 0.68], [0.5, 0.7], [0.72, 0.72], [0.85, 0.74], [0.96, 0.72], [1, 0.62]],
      bot: [[0, 0.16], [0.07, 0.15], [0.92, 0.15], [1, 0.2]],
      wid: [[0, 0.52], [0.08, 0.78], [0.2, 0.92], [0.4, 0.96], [0.72, 1.0], [0.9, 1.0], [1, 0.92]],
      cab: { x0: 0.36, x1: 0.74, roof: [[0, 0], [0.3, 0.9], [0.5, 1.0], [0.72, 0.9], [1, 0]], w: 0.58 },
      sq: 3.2, tumble: 0.24, wing: { x: 0.95, h: 0.86, chord: 0.11, span: 1.0, posts: 0.06 },
    },
    fordgt90: {
      top: [[0, 0.34], [0.05, 0.54], [0.12, 0.68], [0.2, 0.7], [0.3, 0.66], [0.5, 0.66], [0.7, 0.7], [0.82, 0.74], [0.92, 0.74], [1, 0.64]],
      bot: [[0, 0.2], [0.07, 0.14], [0.92, 0.14], [1, 0.22]],
      wid: [[0, 0.64], [0.06, 0.86], [0.18, 0.97], [0.34, 0.95], [0.55, 0.95], [0.74, 1.0], [0.92, 0.98], [1, 0.9]],
      cab: { x0: 0.30, x1: 0.76, roof: [[0, 0], [0.24, 0.9], [0.42, 1.0], [0.62, 0.95], [0.84, 0.6], [1, 0]], w: 0.62 },
      sq: 4.2, tumble: 0.2, wing: null, exhaust: true,
    },
    chevystocker: {
      top: [[0, 0.42], [0.04, 0.54], [0.12, 0.6], [0.3, 0.6], [0.5, 0.59], [0.8, 0.62], [0.94, 0.63], [1, 0.58]],
      bot: [[0, 0.2], [0.06, 0.13], [0.93, 0.13], [1, 0.2]],
      wid: [[0, 0.82], [0.05, 0.94], [0.2, 0.99], [0.5, 0.98], [0.8, 0.99], [0.95, 0.96], [1, 0.9]],
      cab: { x0: 0.33, x1: 0.84, roof: [[0, 0], [0.2, 0.84], [0.32, 1.0], [0.56, 1.0], [0.75, 0.66], [1, 0]], w: 0.74 },
      sq: 4.4, tumble: 0.16, wing: { x: 0.965, h: 0.66, chord: 0.05, span: 0.92, posts: 0.0, blade: true },
    },
    chevy1500: {
      top: [[0, 0.42], [0.04, 0.52], [0.12, 0.55], [0.26, 0.56], [0.4, 0.56], [0.56, 0.57], [0.58, 0.6], [1, 0.6]],
      bot: [[0, 0.2], [0.05, 0.11], [0.95, 0.11], [1, 0.2]],
      wid: [[0, 0.86], [0.05, 0.96], [0.2, 1.0], [0.6, 1.0], [0.95, 0.98], [1, 0.94]],
      cab: { x0: 0.27, x1: 0.56, roof: [[0, 0], [0.26, 0.92], [0.4, 1.0], [0.92, 0.98], [1, 0]], w: 0.8 },
      sq: 5.0, tumble: 0.1, wing: null, bed: { x0: 0.585, x1: 0.975, floor: 0.45 },
    },
  };

  // ---------------------------------------------------------------- tampos
  // Stripes are painted into the body texture, addressed by the loft: u = along (0 nose ..
  // 1 tail), v = around (0 bottom, 0.25 right side, 0.5 top, 0.75 left side); canvas row =
  // (1 - v) * H. Numbers and lettering are separate decals that conform to the body surface
  // (see decalMesh), so they stay crisp and undistorted on curved panels.
  const TW = 1024, TH = 512;
  function decalCanvas(draw, w = 256, h = 128) { const c = canvas(w, h), x = c.getContext('2d'); draw(x, w, h); return c; }
  const FONT = (px, w = 800) => `italic ${w} ${px}px "Barlow Condensed", "Arial Narrow", Impact, sans-serif`;
  function textDecal(txt, fill, stroke, opts = {}) {
    return decalCanvas((x, w, h) => {
      if (opts.disc) { x.beginPath(); x.ellipse(w / 2, h / 2, h * 0.62, h * 0.46, 0, 0, 7); x.fillStyle = opts.disc; x.fill(); if (opts.ring) { x.lineWidth = h * 0.07; x.strokeStyle = opts.ring; x.stroke(); } }
      if (opts.box) { x.fillStyle = opts.box; x.beginPath(); x.roundRect(w * 0.12, h * 0.1, w * 0.76, h * 0.8, h * 0.12); x.fill(); }
      const px = opts.px || h * 0.78;
      x.font = FONT(px, opts.weight || 800); x.textAlign = 'center'; x.textBaseline = 'middle';
      if (stroke) { x.lineJoin = 'round'; x.lineWidth = px * 0.16; x.strokeStyle = stroke; x.strokeText(txt, w / 2, h / 2 + px * 0.04); }
      x.fillStyle = fill; x.fillText(txt, w / 2, h / 2 + px * 0.04);
    }, opts.cw || 256, opts.ch || 128);
  }
  // returns { body: canvas, decals: [{ side: 'both'|'top', along, up|lat, w, h, canvas }] }
  function livery(e) {
    const c = canvas(TW, TH), x = c.getContext('2d');
    x.fillStyle = e.color; x.fillRect(0, 0, TW, TH);
    const [c1, c2, c3] = e.livery.colors;
    const band = (u0, u1, v0, v1, col) => { x.fillStyle = col; x.fillRect(u0 * TW, TH * (1 - v1), (u1 - u0) * TW, TH * (v1 - v0)); };
    const both = (u0, u1, v0, v1, col) => { band(u0, u1, v0, v1, col); band(u0, u1, 1 - v1, 1 - v0, col); };
    const D = [];
    // side decals: along 0..1 (nose->tail), up 0..1 of the body side (sill->shoulder); w, h in cm
    if (e.id === 'porsche959') {
      both(0.02, 0.98, 0.14, 0.18, c2); both(0.1, 0.96, 0.18, 0.205, c1);
      band(0.02, 0.3, 0.47, 0.53, c1); band(0.02, 0.3, 0.49, 0.51, c3);
      D.push({ side: 'both', along: 0.5, up: 0.55, w: 1.5, h: 0.62, canvas: textDecal('959', c1, c2) });
      D.push({ side: 'both', along: 0.78, up: 0.5, w: 1.1, h: 0.22, canvas: textDecal('TWIN TURBO', c3, c2, { px: 70, weight: 700 }) });
    } else if (e.id === 'aeroflash') {
      both(0.0, 1, 0.17, 0.2, c1); both(0.34, 1, 0.2, 0.22, c2);
      band(0.0, 1, 0.475, 0.49, c2); band(0.0, 1, 0.51, 0.525, c2);
      D.push({ side: 'both', along: 0.54, up: 0.5, w: 1.25, h: 0.62, canvas: textDecal('3', c1, null, { disc: c3, ring: c1 }) });
      D.push({ side: 'top', along: 0.16, lat: 0, w: 1.0, h: 0.8, canvas: textDecal('3', c1, null, { disc: c3, ring: c2 }) });
    } else if (e.id === 'fordgt90') {
      both(0.05, 0.96, 0.15, 0.18, c2); both(0.3, 0.96, 0.18, 0.2, c1);
      band(0.02, 0.3, 0.46, 0.54, c3);
      D.push({ side: 'both', along: 0.5, up: 0.55, w: 1.4, h: 0.7, canvas: textDecal('15', c1, c2, { box: c3 }) });
      D.push({ side: 'top', along: 0.14, lat: 0, w: 1.0, h: 0.7, canvas: textDecal('15', c1, c2) });
    } else if (e.id === 'chevystocker') {
      both(0.0, 1, 0.14, 0.19, c1); both(0.0, 1, 0.19, 0.215, c2); both(0.0, 1, 0.215, 0.23, c3);
      band(0.02, 0.3, 0.47, 0.53, c1);
      D.push({ side: 'both', along: 0.52, up: 0.62, w: 1.8, h: 0.6, canvas: textDecal('4777', c2, c3) });
      D.push({ side: 'top', along: 0.58, lat: 0, w: 1.2, h: 0.55, canvas: textDecal('4777', c1, c3) });
    } else if (e.id === 'chevy1500') {
      both(0.6, 0.99, 0.15, 0.18, c1);
      D.push({ side: 'both', along: 0.43, up: 0.5, w: 1.5, h: 0.72, canvas: textDecal('1500', c2, null, { disc: c1, ring: c2, px: 64 }) });
      D.push({ side: 'both', along: 0.14, up: 0.55, w: 0.9, h: 0.3, canvas: textDecal('CHEVY', c1, null, { px: 84 }) });
      D.push({ side: 'top', along: 0.42, lat: 0, w: 1.2, h: 0.6, canvas: textDecal('1500', c1, null, { px: 70 }) });
    }
    return { body: c, decals: D };
  }

  // ---------------------------------------------------------------- shape evaluation
  // Everything about one casting's surfaces, in centimetres.
  function shapeOf(e) {
    const S = SHAPES[e.id] || SHAPES.fordgt90;
    const L = e.lengthCm, W = e.widthCm, H = e.heightCm, r = e.wheelRadiusCm;
    const topC = curve(S.top), bot = curve(S.bot), wid = curve(S.wid), roof = curve(S.cab.roof);
    const top = S.bed ? (x) => (x > S.bed.x0 && x < S.bed.x1 ? S.bed.floor : topC(x)) : topC;
    const zOf = (x) => -L / 2 + x * L;
    const wz = [-e.wheelbaseCm / 2, e.wheelbaseCm / 2];
    const tireW = 0.46, xInner = e.trackCm / 2 - tireW / 2 - 0.1, Ra = r + 0.08;
    // fenders must clear the wheel tops: bulge the outer shoulders where the bonnet is lower
    const need = 2 * r + 0.16;
    const bumpAt = wz.map((z) => Math.max(0, need - H * top((z + L / 2) / L)));
    const archY = (z) => { let y = 0; for (const w of wz) { const d = z - w; if (Math.abs(d) < Ra) y = Math.max(y, r + Math.sqrt(Ra * Ra - d * d)); } return y; };
    const bump = (z) => { let b = 0; wz.forEach((w, k) => { const d = (z - w) / (Ra * 1.3); b = Math.max(b, bumpAt[k] * Math.exp(-d * d * 1.8)); }); return b; };
    const n = S.sq;
    function body(x, v, out) {
      const th = 2 * Math.PI * v - Math.PI / 2, cx = sgnPow(Math.cos(th), 2 / n), cy = sgnPow(Math.sin(th), 2 / n);
      const z = zOf(x), w = (W / 2) * wid(x), t = H * top(x), b = H * bot(x);
      const yc = (t + b) / 2, hh = Math.max(0.02, (t - b) / 2);
      const px = w * cx * (1 - S.tumble * Math.max(0, cy));
      let py = yc + hh * cy;
      const lat = Math.abs(cx);
      if (cy > -0.2) py += bump(z) * smooth(0.5, 0.95, lat) * smooth(-0.2, 0.6, cy);
      if (S.bed && x > S.bed.x0 && x < S.bed.x1 && cy > 0) py = py + (H * topC(x) - py) * smooth(0.82, 0.9, lat);   // bed sides
      const ay = archY(z);
      if (ay > 0 && py < ay) py += (ay - py) * smooth(xInner - 0.12, xInner + 0.02, Math.abs(px));
      out[0] = px; out[1] = py;
    }
    const cab = S.cab, nc = 3.2;
    function cabin(xl, v, out) {
      const x = cab.x0 + xl * (cab.x1 - cab.x0);
      const th = 2 * Math.PI * v - Math.PI / 2, cx = sgnPow(Math.cos(th), 2 / nc), cy = sgnPow(Math.sin(th), 2 / nc);
      const tb = H * topC(x) - 0.08, tr = H * (topC(x) + (1 - topC(x)) * Math.max(0, roof(xl)));
      const yc = (tb + tr) / 2, hh = Math.max(0.01, (tr - tb) / 2);
      const f = (cy + 1) / 2;
      const w = (W / 2) * wid(x) * (1 - S.tumble) * 0.93 * (1 - f * f) + (W / 2) * cab.w * f * f;
      out[0] = w * cx; out[1] = yc + hh * cy;
    }
    return { S, L, W, H, r, top, topC, bot, wid, roof, zOf, wz, tireW, xInner, Ra, body, cabin, cab };
  }

  // ---------------------------------------------------------------- materials
  const TINT = { clear: 0x1b232c, blue: 0x1c3056, smoke: 0x24262b, black: 0x07080a };
  function mats(e) {
    const T = window.THREE, k = e.id + (e.color || '');
    if (cache.mat[k]) return cache.mat[k];
    const lv = livery(e);
    const paint = new T.MeshPhysicalMaterial({ map: tex(lv.body), metalness: 0.28, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.07 });
    const glass = new T.MeshPhysicalMaterial({ color: TINT[e.tint] || TINT.clear, metalness: 0.2, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5 });
    const base = new T.MeshStandardMaterial(/black/.test(e.base) ? { color: 0x1c1d20, metalness: 0.7, roughness: 0.45 } : { color: 0xb3b8bf, metalness: 0.88, roughness: 0.42 });
    const face = wheelFace(e.wheelCode, false), faceB = wheelFace(e.wheelCode, true);
    const wheelFaceMat = new T.MeshStandardMaterial({ map: face.map, metalnessMap: face.mr, roughnessMap: face.mr, metalness: 1, roughness: 1 });
    const shared = (name, make) => cache.mat[name] || (cache.mat[name] = make());
    return (cache.mat[k] = {
      paint, glass, base, wheelFace: wheelFaceMat, face, faceB, livery: lv,
      tyre: shared('tyre', () => new T.MeshStandardMaterial({ color: 0x141416, roughness: 0.55 })),
      chrome: shared('chrome', () => new T.MeshStandardMaterial({ color: 0xe6e9ee, metalness: 1, roughness: 0.18 })),
      head: shared('head', () => new T.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xffe6a8, emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.3 })),
      tail: shared('tail', () => new T.MeshStandardMaterial({ color: 0xc0121b, emissive: 0x7a0008, emissiveIntensity: 0.4, roughness: 0.25 })),
      dark: shared('dark', () => new T.MeshStandardMaterial({ color: 0x101114, roughness: 0.6 })),
    });
  }

  // ---------------------------------------------------------------- wheels
  function wheelGeos(r, w) {
    const T = window.THREE, key = r.toFixed(3) + '/' + w;
    if (cache.geo[key]) return cache.geo[key];
    const hw = w / 2;
    const pts = [[0.5 * r, -hw], [0.9 * r, -hw], [0.985 * r, -hw + 0.05], [r, -hw + 0.11], [r, hw - 0.11], [0.985 * r, hw - 0.05], [0.9 * r, hw], [0.5 * r, hw]]
      .map(([a, b]) => new T.Vector2(a, b));
    const tyre = new T.LatheGeometry(pts, 28); tyre.rotateZ(-Math.PI / 2);
    const face = new T.CircleGeometry(0.9 * r, 28); face.rotateY(Math.PI / 2); face.translate(hw + 0.004, 0, 0);
    const back = new T.CircleGeometry(0.9 * r, 16); back.rotateY(-Math.PI / 2); back.translate(-hw - 0.004, 0, 0);
    return (cache.geo[key] = { tyre, face, back });
  }

  // ---------------------------------------------------------------- decals
  // Find the surface point of a section: pick 'R'/'L' = side at height target, 'T' = top at
  // lateral position target. Bisection on the around-parameter v.
  function surfaceAt(sectionFn, x, pick, target) {
    const p = [0, 0];
    let lo, hi;
    if (pick === 'T') { lo = 0.27; hi = 0.73; } else { lo = 0.02; hi = 0.48; }
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2; sectionFn(x, mid, p);
      if (pick === 'T') { if (p[0] > target) lo = mid; else hi = mid; }
      else if (p[1] < target) lo = mid; else hi = mid;
    }
    const v = (lo + hi) / 2; sectionFn(x, v, p);
    return { v, px: pick === 'L' ? -p[0] : p[0], py: p[1] };
  }
  // A small grid laid onto the body (or roof), lifted a hair along the surface normal.
  function decalMesh(sh, d, mat) {
    const T = window.THREE, nu = 12, nv = 6;
    const onCab = d.side === 'top' && d.along > sh.cab.x0 + 0.05 && d.along < sh.cab.x1 - 0.05;
    const fn = onCab ? (x, v, o) => sh.cabin((x - sh.cab.x0) / (sh.cab.x1 - sh.cab.x0), v, o) : sh.body;
    const g = new T.Group();
    for (const sd of d.side === 'both' ? ['R', 'L'] : ['T']) {
      const pos = [], uv = [], idx = [];
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const a = i / (nu - 1) - 0.5, b = j / (nv - 1) - 0.5;
        let x, q;
        if (sd === 'T') {
          x = d.along - b * d.h / sh.L;
          q = surfaceAt(fn, x, 'T', (d.lat || 0) + a * d.w);
        } else {
          // on the right side the text runs tail -> nose, on the left nose -> tail
          x = d.along + (sd === 'R' ? -a : a) * d.w / sh.L;
          const probe = [0, 0]; sh.body(x, 0.02, probe); const sill = probe[1] + 0.08;
          sh.body(x, 0.4, probe); const shoulder = probe[1];
          q = surfaceAt(sh.body, x, sd, sill + d.up * (shoulder - sill) + b * d.h);
        }
        const e = 0.004, pa = [0, 0], pb = [0, 0];
        fn(x, q.v + e, pa); fn(x, q.v - e, pb);
        let nx = pa[1] - pb[1], ny = -(pa[0] - pb[0]);
        if (sd === 'L') nx = -nx;
        const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        if (sd === 'T' && ny < 0) { nx = -nx; ny = -ny; }
        if (sd === 'R' && nx < 0) { nx = -nx; ny = -ny; }
        if (sd === 'L' && nx > 0) { nx = -nx; ny = -ny; }
        pos.push(q.px + nx * 0.008, q.py + ny * 0.008, sh.zOf(x));
        uv.push(i / (nu - 1), j / (nv - 1));
      }
      for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
        const a0 = j * nu + i, b0 = a0 + nu;
        idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const m = new T.Mesh(geo, mat);
      m.renderOrder = 2;
      g.add(m);
    }
    return g;
  }

  // ---------------------------------------------------------------- build
  function build(e, opts = {}) {
    const T = window.THREE, X = window.THREEX;
    const sh = shapeOf(e), M = mats(e), S = sh.S, hi = opts.quality !== 'low';
    const g = new T.Group();
    // painted body, with extra stations hugging every arch edge and the bed ends
    const extra = [];
    for (const w of sh.wz) { const a = (w - sh.Ra + sh.L / 2) / sh.L, b = (w + sh.Ra + sh.L / 2) / sh.L; extra.push(a - 0.003, a + 0.003, b - 0.003, b + 0.003); }
    if (S.bed) extra.push(S.bed.x0 - 0.002, S.bed.x0 + 0.002, S.bed.x1 - 0.002, S.bed.x1 + 0.002);
    const body = new T.Mesh(loft(stations(hi ? 72 : 36, extra), sh.zOf, hi ? 48 : 24, sh.body), M.paint);
    g.add(body);
    // glasshouse: glass all round, painted roof panel (uv remapped onto the body texture)
    const cz = (xl) => sh.zOf(S.cab.x0 + xl * (S.cab.x1 - S.cab.x0));
    const cabGeo = loft(stations(hi ? 30 : 14, []), cz, hi ? 40 : 20, sh.cabin, (xl, v) => (v > 0.365 && v < 0.635 && sh.roof(xl) > 0.84 ? 1 : 0));
    const uvA = cabGeo.attributes.uv;
    for (let i = 0; i < uvA.count; i++) uvA.setX(i, S.cab.x0 + uvA.getX(i) * (S.cab.x1 - S.cab.x0));
    const cabin = new T.Mesh(cabGeo, [M.glass, M.paint]);
    g.add(cabin);
    // unpainted base plate with rivets
    const probe = [0, 0]; sh.body(0.5, 0, probe);
    const bw = sh.xInner - 0.08, blen = sh.L * 0.84;
    const base = new T.Mesh(new X.RoundedBoxGeometry(bw * 2, 0.1, blen, 2, 0.04), M.base);
    base.position.set(0, probe[1] + 0.02, 0);
    g.add(base);
    for (const z of [-blen * 0.42, blen * 0.42]) {
      const rv = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.06, 12), M.chrome);
      rv.position.set(0, probe[1] - 0.04, z); g.add(rv);
    }
    // wheels and axles: [front-left, front-right, rear-left, rear-right]
    const wg = wheelGeos(sh.r, sh.tireW);
    const wheels = [];
    for (const [sx, z] of [[-1, sh.wz[0]], [1, sh.wz[0]], [-1, sh.wz[1]], [1, sh.wz[1]]]) {
      const pivot = new T.Group(); pivot.position.set(sx * e.trackCm / 2, sh.r, z);
      const inner = new T.Group(); if (sx < 0) inner.rotation.y = Math.PI;
      inner.add(new T.Mesh(wg.tyre, M.tyre), new T.Mesh(wg.face, M.wheelFace), new T.Mesh(wg.back, M.dark));
      pivot.add(inner); g.add(pivot); wheels.push(pivot);
    }
    for (const z of sh.wz) {
      const ax = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, e.trackCm, 8), M.chrome);
      ax.rotation.z = Math.PI / 2; ax.position.set(0, sh.r, z); g.add(ax);
    }
    // lamps: set into the nose and tail
    const lamp = (mat, x, y, z) => { const m = new T.Mesh(new T.SphereGeometry(0.12, 14, 8), mat); m.scale.set(1.25, 0.62, 0.45); m.position.set(x, y, z); g.add(m); };
    sh.body(0.02, 0.25, probe); const noseW = probe[0], noseY = probe[1];
    sh.body(0.985, 0.25, probe); const tailW = probe[0], tailY = probe[1];
    for (const s of [-1, 1]) {
      lamp(M.head, s * noseW * 0.62, noseY + 0.05, sh.zOf(0.012));
      lamp(M.tail, s * tailW * 0.66, tailY + 0.08, sh.zOf(0.992));
    }
    // body-colour parts without the livery texture
    const plain = cache.mat[e.id + e.color + '-plain'] || (cache.mat[e.id + e.color + '-plain'] = new T.MeshPhysicalMaterial({ color: e.color, metalness: 0.28, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.07 }));
    if (S.wing) {
      const wz = sh.zOf(S.wing.x), span = S.wing.span * sh.W, deck = sh.H * sh.topC(S.wing.x);
      if (S.wing.blade) {
        const blade = new T.Mesh(new X.RoundedBoxGeometry(span, 0.16, 0.05, 1, 0.02), plain);
        blade.position.set(0, deck + 0.06, wz); blade.rotation.x = -0.25; g.add(blade);
      } else {
        const wy = S.wing.h * sh.H, chord = S.wing.chord * sh.L;
        const wing = new T.Mesh(new X.RoundedBoxGeometry(span, 0.06, chord, 2, 0.025), plain);
        wing.position.set(0, wy, wz); wing.rotation.x = 0.08; g.add(wing);
        for (const s of [-1, 1]) {
          const post = new T.Mesh(new T.BoxGeometry(0.06, Math.max(0.05, wy - deck), chord * 0.5), plain);
          post.position.set(s * span * 0.3, (wy + deck) / 2, wz); g.add(post);
        }
      }
    }
    if (S.exhaust) {
      for (const [dx, dy] of [[-0.14, 0], [0.14, 0], [0, 0.2]]) {
        const pipe = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.18, 12), M.chrome);
        pipe.rotation.x = Math.PI / 2; pipe.position.set(dx, sh.H * 0.3 + dy, sh.zOf(0.995)); g.add(pipe);
      }
    }
    if (S.bed) {
      // bed floor liner and a tailgate lip in the body colour
      const len = (S.bed.x1 - S.bed.x0) * sh.L;
      const liner = new T.Mesh(new T.BoxGeometry(sh.W * 0.78, 0.02, len * 0.96), M.dark);
      liner.position.set(0, sh.H * S.bed.floor + 0.012, sh.zOf((S.bed.x0 + S.bed.x1) / 2)); g.add(liner);
    }
    // tampos
    for (const d of M.livery.decals) {
      const key = e.id + '-decal-' + M.livery.decals.indexOf(d);
      const dm = cache.mat[key] || (cache.mat[key] = new T.MeshPhysicalMaterial({
        map: tex(d.canvas), transparent: true, depthWrite: false, roughness: 0.32, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      }));
      g.add(decalMesh(sh, d, dm));
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = o.renderOrder !== 2; o.receiveShadow = true; } });
    g.userData.wheels = wheels;
    g.userData.body = body;
    g.userData.parts = { cabin, base, faceMat: M.wheelFace, face: M.face, faceB: M.faceB };
    g.userData.dims = { length: sh.L, width: sh.W, height: sh.H };
    return g;
  }

  function setWheelSpin(group, angle, angularSpeed) {
    const ws = group.userData.wheels;
    if (!ws) return;
    for (const w of ws) w.rotation.x = -angle;
    const p = group.userData.parts;
    if (!p || !p.faceMat) return;
    const want = Math.abs(angularSpeed || 0) > 70 ? p.faceB : p.face;
    if (p.faceMat.map !== want.map) { p.faceMat.map = want.map; p.faceMat.metalnessMap = want.mr; p.faceMat.roughnessMap = want.mr; p.faceMat.needsUpdate = true; }
  }

  // side-view icon for the roster, drawn from the same profiles as the 3D body
  function thumbnail(e) {
    const sh = shapeOf(e), c = canvas(256, 128), x = c.getContext('2d');
    const sc = 232 / sh.L, ox = 12, gy = 112;
    const PX = (z) => ox + (z + sh.L / 2) * sc, PY = (y) => gy - y * sc;
    const p = [0, 0], N = 90;
    const topE = [], botE = [];
    for (let i = 0; i <= N; i++) {
      const xx = i / N; let t = -1e9, b = 1e9;
      for (let k = 0; k < 64; k++) { sh.body(xx, k / 64, p); if (p[1] > t) t = p[1]; if (Math.abs(p[0]) > sh.xInner - 0.02 && p[1] < b) b = p[1]; }
      topE.push([PX(sh.zOf(xx)), PY(t)]); botE.push([PX(sh.zOf(xx)), PY(b === 1e9 ? t : b)]);
    }
    const cabE = [];
    for (let i = 0; i <= 40; i++) {
      const xl = i / 40; let t = -1e9;
      for (let k = 0; k < 32; k++) { sh.cabin(xl, k / 32, p); if (p[1] > t) t = p[1]; }
      cabE.push([PX(sh.zOf(sh.cab.x0 + xl * (sh.cab.x1 - sh.cab.x0))), PY(t)]);
    }
    // glass
    x.beginPath(); cabE.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath();
    const gl = x.createLinearGradient(0, 30, 0, 90); gl.addColorStop(0, '#5d7394'); gl.addColorStop(1, '#141b26');
    x.fillStyle = gl; x.fill();
    // body
    x.beginPath(); topE.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
    for (let i = botE.length - 1; i >= 0; i--) x.lineTo(botE[i][0], botE[i][1]);
    x.closePath();
    const bg = x.createLinearGradient(0, 30, 0, 115); bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.18, e.color); bg.addColorStop(1, e.color);
    x.fillStyle = bg; x.fill();
    x.globalCompositeOperation = 'multiply'; const sd = x.createLinearGradient(0, 60, 0, 116); sd.addColorStop(0, 'rgba(255,255,255,1)'); sd.addColorStop(1, 'rgba(90,90,90,1)'); x.fillStyle = sd; x.fill();
    x.globalCompositeOperation = 'source-over';
    // wheels
    for (const z of sh.wz) {
      x.beginPath(); x.arc(PX(z), PY(sh.r), sh.r * sc, 0, 7); x.fillStyle = '#121214'; x.fill();
      x.beginPath(); x.arc(PX(z), PY(sh.r), sh.r * sc * 0.55, 0, 7); x.fillStyle = e.wheelCode === '5DOT' ? '#2a2b2f' : '#cfd4dc'; x.fill();
    }
    return c;
  }

  Object.assign(HW.carModels || (HW.carModels = {}), { build, setWheelSpin, thumbnail, shapeOf, livery, loft });
})(window.HW);
