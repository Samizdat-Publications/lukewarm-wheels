// 50-render-scene.js — the real renderer (SPEC s5.9). Warm indoor floor, soft key light,
// orange track ribbons from HW.sim.mesh, red plus-shaped hub with four booster housings,
// foam wheels, track supports, an x-ray gear train (pinion / idler / four satellites),
// five camera presets, lane picking for the UI and cheap crash sparks.
(function (HW) {
  const CAMS = ['overview', 'crash', 'chase', 'booster', 'gears'];
  // vertical budget (cm): table top, red hub case, gear plane
  const FLOOR_Y = -4.0, CASE_TOP = -0.45, CASE_BOT = -3.6, GEAR_Y = -1.4, GEAR_T = 0.8;
  const SPARKS = 6, SPARK_N = 12, SPARK_LIFE = 0.4;

  let T = null;                       // window.THREE, captured in init()
  // scratch objects — nothing in update() allocates
  let _v1, _v2, _v3, _q1, _ray, _ndc, _mat4, _quat, _sc, _eul;

  // ---------- procedural textures ----------
  function floorTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#a9937a'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) {           // grain streaks
      const y = Math.random() * 512, w = 20 + Math.random() * 160;
      x.strokeStyle = `rgba(${90 + Math.random() * 90 | 0},${60 + Math.random() * 60 | 0},30,0.05)`;
      x.lineWidth = 0.6 + Math.random(); x.beginPath(); x.moveTo(Math.random() * 512, y); x.lineTo(Math.random() * 512 + w, y + (Math.random() - 0.5) * 3); x.stroke();
    }
    for (let p = 0; p <= 512; p += 128) {      // plank joints
      x.strokeStyle = 'rgba(60,38,18,0.35)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(0, p); x.lineTo(512, p); x.stroke();
      x.strokeStyle = 'rgba(255,235,205,0.10)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(0, p + 2); x.lineTo(512, p + 2); x.stroke();
    }
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(30, 30); t.anisotropy = 8;
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }
  function sparkTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,235,1)'); g.addColorStop(0.35, 'rgba(255,190,60,0.85)');
    g.addColorStop(1, 'rgba(255,120,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  }

  // ---------- small builders ----------
  function bufGeo(m) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(m.positions, 3));
    if (m.uvs) g.setAttribute('uv', new T.BufferAttribute(m.uvs, 2));
    g.setIndex(new T.BufferAttribute(m.indices, 1));
    g.computeVertexNormals();
    return g;
  }
  function box(w, h, d, mat, x, y, z, ry) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); if (ry) m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    return m;
  }
  // a spur gear: hub cylinder + one InstancedMesh of teeth (1 extra draw call per gear)
  function gear(radius, teeth, mat, thick) {
    const g = new T.Group();
    const body = new T.Mesh(new T.CylinderGeometry(radius * 0.9, radius * 0.9, thick, Math.max(12, teeth), 1), mat);
    body.castShadow = true; g.add(body);
    const tg = new T.BoxGeometry(radius * 0.30, thick, radius * 0.24);
    const im = new T.InstancedMesh(tg, mat, teeth);
    for (let i = 0; i < teeth; i++) {
      const a = i / teeth * Math.PI * 2;
      _eul.set(0, a, 0); _quat.setFromEuler(_eul);
      _v1.set(Math.sin(a) * radius * 0.96, 0, Math.cos(a) * radius * 0.96);
      _mat4.compose(_v1, _quat, _sc); im.setMatrixAt(i, _mat4);
    }
    im.instanceMatrix.needsUpdate = true; g.add(im);
    return g;
  }

  // The NS and EW ribbons are exactly coplanar where they cross the hub, which z-fights.
  // 31-track-mesh emits floorVisual circuit by circuit, 4 verts per sample (+1 closing
  // sample), so lift the second circuit by 0.03 cm — invisible, and the colliders are untouched.
  function deZFight(m) {
    const cs = HW.sim.track.circuits;
    if (!cs || cs.length !== 2) return m;
    const n0 = 4 * (cs[0].samples.N + 1), n1 = 4 * (cs[1].samples.N + 1);
    if (m.positions.length / 3 !== n0 + n1) return m;     // layout changed: leave it alone
    const pos = m.positions.slice();
    for (let i = n0; i < n0 + n1; i++) pos[i * 3 + 1] += 0.03;
    return { positions: pos, indices: m.indices, uvs: m.uvs };
  }

  const render = {
    scene: null, camera: null, renderer: null, controls: null,
    cameraNames: CAMS, mode: 'overview', xrayOn: false, selectedCar: null,
    carGroups: [], foamWheels: [], gears: null, floorMesh: null, hubParts: [],
    hubMat: null, sparks: [], sparkAt: 0, switchKnob: null,
    _chasePos: null, _chaseAim: null, _chaseInit: false,

    // ================= init =================
    init(canvas) {
      T = window.THREE;
      _v1 = new T.Vector3(); _v2 = new T.Vector3(); _v3 = new T.Vector3();
      _q1 = new T.Quaternion(); _quat = new T.Quaternion(); _sc = new T.Vector3(1, 1, 1);
      _mat4 = new T.Matrix4(); _eul = new T.Euler(); _ray = new T.Raycaster(); _ndc = new T.Vector2();
      const cfg = HW.config, sim = HW.sim, track = sim.track, mesh = sim.mesh;

      const r = (this.renderer = new T.WebGLRenderer({ canvas, antialias: true }));
      r.setPixelRatio(Math.min(2, devicePixelRatio)); r.setSize(innerWidth, innerHeight);
      r.shadowMap.enabled = !!cfg.shadows; r.shadowMap.type = T.PCFShadowMap;
      r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.18;

      const scene = (this.scene = new T.Scene());
      scene.background = new T.Color(0x1b1a19);
      scene.fog = new T.Fog(0x1b1a19, 260, 620);

      const cam = (this.camera = new T.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 1200));
      this.controls = new window.OrbitControls(cam, canvas);
      this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
      this.controls.maxPolarAngle = Math.PI * 0.92;

      // ---- lights ----
      scene.add(new T.HemisphereLight(0xfff0dc, 0x3a2f26, 1.05));
      const b = track.bounds;
      const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.62 + 12;
      const sun = new T.DirectionalLight(0xfff2e0, 2.1);
      sun.position.set(span * 0.75, span * 1.5, span * 0.55);
      if (cfg.shadows) {
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const sc = sun.shadow.camera;
        sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
        sc.near = 1; sc.far = span * 4; sc.updateProjectionMatrix();
        sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.6;
      }
      scene.add(sun); scene.add(sun.target);
      const fill = new T.DirectionalLight(0xbcd0ff, 0.45); fill.position.set(-span, span * 0.7, -span * 0.8); scene.add(fill);
      // lights the hub underside for the gear-train view only
      this.underLight = new T.PointLight(0xffeedd, 1.5, 90, 0);
      this.underLight.position.set(7, GEAR_Y - 7, 9); this.underLight.visible = false; scene.add(this.underLight);

      // ---- room floor ----
      const floor = new T.Mesh(new T.PlaneGeometry(900, 900),
        new T.MeshStandardMaterial({ map: floorTexture(), color: 0xcac2b6, roughness: 0.85, metalness: 0.02 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; floor.receiveShadow = true;
      scene.add(floor);

      this.buildTrack(mesh);
      this.buildHub(mesh, track, cfg);
      this.buildGearTrain(track);
      this.buildCars(sim);
      this.buildSparks();

      HW.bus.on('crash', (e) => this.burst(e && e.at));
      addEventListener('resize', () => this.resize());
      this.setCamera('overview');
      HW.log('render: scene ready', { supports: mesh.supports.length, wheels: track.wheels.length });
    },

    // ---- orange track ----
    buildTrack(mesh) {
      const floorMat = new T.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.6, metalness: 0.04, side: T.DoubleSide });
      const wallMat = new T.MeshStandardMaterial({ color: 0xd44f00, roughness: 0.62, metalness: 0.04, side: T.DoubleSide });
      const fm = new T.Mesh(bufGeo(deZFight(mesh.floorVisual)), floorMat);
      fm.castShadow = true; fm.receiveShadow = true; this.floorMesh = fm; this.scene.add(fm);
      const wm = new T.Mesh(bufGeo(mesh.walls), wallMat);
      wm.castShadow = true; wm.receiveShadow = true; this.scene.add(wm);

      // grey track supports: post from the table up to the lobe apex + a wide foot
      const postMat = new T.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.55, metalness: 0.15 });
      for (const s of mesh.supports) {
        const h = s.p.y - FLOOR_Y;
        this.scene.add(box(1.4, h, 1.4, postMat, s.p.x, FLOOR_Y + h / 2, s.p.z));
        this.scene.add(box(5.0, 0.6, 5.0, postMat, s.p.x, FLOOR_Y + 0.3, s.p.z));
      }
      // short connector feet under the flat track so the ribbons do not float
      const feet = [];
      for (const c of HW.sim.track.circuits) {
        for (let s = 0; s < c.length; s += 22) {
          const f = c.sample(s);
          if (f.p.y > 0.4) continue;
          if (Math.abs(f.p.x) < 15 && Math.abs(f.p.z) < 15) continue; // hub owns the middle
          feet.push(f.p);
        }
      }
      const footH = -FLOOR_Y;
      const fim = new T.InstancedMesh(new T.BoxGeometry(2.6, footH, 1.6), postMat, feet.length);
      fim.castShadow = true; fim.receiveShadow = true;
      feet.forEach((p, i) => {
        _v1.set(p.x, FLOOR_Y + footH / 2, p.z); _eul.set(0, Math.atan2(p.x, p.z), 0);
        _quat.setFromEuler(_eul); _mat4.compose(_v1, _quat, _sc); fim.setMatrixAt(i, _mat4);
      });
      fim.instanceMatrix.needsUpdate = true; this.scene.add(fim);
    },

    // ---- red hub: plates, case, four booster housings, foam wheels, battery box, switch ----
    buildHub(mesh, track, cfg) {
      const hub = mesh.hub;
      const hubMat = (this.hubMat = new T.MeshStandardMaterial({ color: 0xc4141a, roughness: 0.42, metalness: 0.05 }));
      const darkMat = new T.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.7, metalness: 0.1 });
      const greyMat = new T.MeshStandardMaterial({ color: 0x8e949c, roughness: 0.55, metalness: 0.2 });
      this.hubParts = [];
      const addHub = (m) => { this.hubParts.push(m); this.scene.add(m); return m; };

      for (const p of hub.plates) addHub(box(p.half.x * 2, p.half.y * 2, p.half.z * 2, hubMat, p.center.x, p.center.y, p.center.z));
      // the module body under the lane plates: two crossed boxes forming the red plus
      const ch = (CASE_TOP - CASE_BOT), cy = (CASE_TOP + CASE_BOT) / 2;
      for (const p of hub.plates) addHub(box(p.half.x * 2 - 0.5, ch, p.half.z * 2 - 0.5, hubMat, 0, cy, 0));

      // four raised housings between the lane pairs, split into two pieces around the foam wheel
      const hh = hub.housingHeight;
      for (const H of hub.housings) {
        const r0 = Math.hypot(H.from.x, H.from.z), r1 = Math.hypot(H.to.x, H.to.z);
        const dx = (H.to.x - H.from.x), dz = (H.to.z - H.from.z);
        const dl = Math.hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl, ry = Math.atan2(ux, uz);
        const wr = H.wheel ? Math.hypot(H.wheel.center.x, H.wheel.center.z) : (r0 + r1) / 2;
        const gap = (H.wheel ? H.wheel.radius : 2) + 0.35;
        const runs = [[r0, Math.min(r1, wr - gap)], [Math.max(r0, wr + gap), r1]];
        for (const [a, c] of runs) {
          if (c - a < 0.25) continue;
          const mid = (a + c) / 2;
          addHub(box(H.halfW * 2, hh, c - a, hubMat, ux * mid, CASE_TOP + 0.4 + hh / 2, uz * mid, ry));
        }
        // low spine running the whole arm, passing under the foam wheel
        const sh = Math.max(0.4, (H.wheel ? H.wheel.center.y - H.wheel.radius : 1.9) - 0.25);
        addHub(box(H.halfW * 2, sh, r1 - r0, hubMat, ux * (r0 + r1) / 2, CASE_TOP + 0.4 + sh / 2, uz * (r0 + r1) / 2, ry));
        // dark module face at the arm tip
        addHub(box(H.halfW * 2, hh * 0.85, 0.9, darkMat, ux * (r1 - 0.5), CASE_TOP + 0.4 + hh * 0.5, uz * (r1 - 0.5), ry));
      }

      // foam wheels: grey discs spinning about Y between the two lanes of each arm
      const foamMat = new T.MeshStandardMaterial({ color: 0x7f838a, roughness: 1.0, metalness: 0 });
      const markMat = new T.MeshStandardMaterial({ color: 0x24262a, roughness: 0.9 });
      for (const w of track.wheels) {
        const cyl = new T.Mesh(new T.CylinderGeometry(w.radius, w.radius, 1.6, 28, 1), foamMat);
        cyl.position.set(w.center.x, w.center.y, w.center.z);
        cyl.castShadow = true; this.scene.add(cyl); this.foamWheels.push(cyl);
        const mark = new T.Mesh(new T.BoxGeometry(w.radius * 0.95, 1.68, 0.34), markMat);
        mark.position.x = w.radius * 0.5; cyl.add(mark);
        const mark2 = new T.Mesh(new T.BoxGeometry(0.34, 1.68, w.radius * 0.95), markMat);
        mark2.position.z = w.radius * 0.5; cyl.add(mark2);
        // spindle down into the module so the disc does not look like it floats
        const sp = new T.Mesh(new T.CylinderGeometry(0.32, 0.32, w.center.y - CASE_BOT, 10), greyMat);
        sp.position.set(w.center.x, (w.center.y + CASE_BOT) / 2, w.center.z); this.scene.add(sp);
      }

      // battery box under the west arm + ON/OFF slide switch on the south face
      const bb = box(7.0, 2.8, 8.4, darkMat, -11.0, FLOOR_Y + 1.4, 0);
      this.scene.add(bb);
      this.scene.add(box(5.6, 0.4, 6.8, greyMat, -11.0, FLOOR_Y + 0.1, 0)); // battery door
      const zS = cfg.hubHalf + 0.05;
      this.scene.add(box(3.4, 1.5, 0.4, darkMat, 0, CASE_TOP - 1.1, zS));
      this.switchKnob = box(1.0, 0.9, 0.5, greyMat, -0.7, CASE_TOP - 1.1, zS + 0.15);
      this.scene.add(this.switchKnob);
    },

    // ---- x-ray gear train: motor pinion (N module), central idler, four satellites ----
    buildGearTrain(track) {
      const metal = new T.MeshStandardMaterial({ color: 0xc9d0d8, roughness: 0.35, metalness: 0.6, emissive: 0x15171b });
      const dark = new T.MeshStandardMaterial({ color: 0x33373d, roughness: 0.5, metalness: 0.4 });
      const R = Math.hypot(track.wheels[0].center.x, track.wheels[0].center.z) || 8.5;
      const satR = R * 0.4, idlR = R - satR, pinR = 1.3;
      const G = { sats: [], idler: null, pinion: null, group: new T.Group() };
      G.idler = gear(idlR, 22, metal, GEAR_T); G.idler.position.set(0, GEAR_Y, 0); G.group.add(G.idler);
      for (const w of track.wheels) {
        const s = gear(satR, 14, metal, GEAR_T);
        s.position.set(w.center.x, GEAR_Y, w.center.z); G.group.add(s); G.sats.push(s);
      }
      // motor sits on the north module, its pinion meshing with the north satellite
      const n = track.wheels.find((w) => w.arm === 'N') || track.wheels[0];
      const px = n.center.x + satR + pinR, pz = n.center.z;
      G.pinion = gear(pinR, 9, metal, GEAR_T); G.pinion.position.set(px, GEAR_Y, pz); G.group.add(G.pinion);
      const can = new T.Mesh(new T.CylinderGeometry(1.4, 1.4, 1.9, 20), dark);
      can.position.set(px, GEAR_Y - 1.25, pz); G.group.add(can);
      const shaft = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 1.4, 8), metal);
      shaft.position.set(px, GEAR_Y - 0.9, pz); G.group.add(shaft);
      this.gears = G; this.scene.add(G.group);
    },

    // ---- cars ----
    buildCars(sim) {
      for (const car of sim.cars) {
        let g = null;
        if (HW.renderCars && HW.renderCars.buildMesh) { try { g = HW.renderCars.buildMesh(car.entry); } catch (e) { console.error('[render] renderCars.buildMesh', e); g = null; } }
        if (!g) g = this.debugCar(car.entry);
        g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        this.scene.add(g); this.carGroups.push(g);
      }
    },
    // fallback casting (same shape as the 90-main.js debug renderer) — wheels FL,FR,RL,RR
    debugCar(e) {
      const g = new T.Group();
      const body = new T.Mesh(new T.BoxGeometry(e.widthCm, e.heightCm, e.lengthCm),
        new T.MeshStandardMaterial({ color: e.color, metalness: 0.55, roughness: 0.32 }));
      g.add(body);
      const cabin = new T.Mesh(new T.BoxGeometry(e.widthCm * 0.82, e.heightCm * 0.55, e.lengthCm * 0.42),
        new T.MeshStandardMaterial({ color: 0x1b2026, metalness: 0.2, roughness: 0.15 }));
      cabin.position.set(0, e.heightCm * 0.62, e.lengthCm * 0.04); g.add(cabin);
      const nose = new T.Mesh(new T.BoxGeometry(e.widthCm * 0.6, e.heightCm * 0.4, 0.6),
        new T.MeshStandardMaterial({ color: e.accent, metalness: 0.3, roughness: 0.4 }));
      nose.position.set(0, e.heightCm * 0.35, -(e.lengthCm / 2 - 0.3)); g.add(nose);
      const wheels = [];
      const wg = new T.CylinderGeometry(e.wheelRadiusCm, e.wheelRadiusCm, 0.5, 14);
      const wmat = new T.MeshStandardMaterial({ color: 0x141414, roughness: 0.6, metalness: 0.3 });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {   // same order as 42-vehicle.js
        const wm = new T.Mesh(wg, wmat);
        wm.rotation.z = Math.PI / 2;                                  // axle along local X; rotation.x = spin
        wm.position.set(sx * e.trackCm / 2, -e.heightCm / 2, sz * e.wheelbaseCm / 2);
        g.add(wm); wheels.push(wm);
      });
      g.userData.wheels = wheels;
      return g;
    },

    // ---- crash sparks: SPARKS pooled Points bursts of SPARK_N particles ----
    buildSparks() {
      const tex = sparkTexture();
      for (let i = 0; i < SPARKS; i++) {
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(new Float32Array(SPARK_N * 3), 3));
        const mat = new T.PointsMaterial({ map: tex, size: 1.6, sizeAttenuation: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: 0xffc766 });
        const pts = new T.Points(geo, mat);
        pts.frustumCulled = false; pts.visible = false;
        pts.userData = { vel: new Float32Array(SPARK_N * 3), life: 0 };
        this.scene.add(pts); this.sparks.push(pts);
      }
    },
    burst(at) {
      if (!at || !this.sparks.length) return;
      const p = this.sparks[this.sparkAt++ % SPARKS];
      const pos = p.geometry.attributes.position.array, vel = p.userData.vel;
      for (let i = 0; i < SPARK_N; i++) {
        pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z;
        const a = Math.random() * Math.PI * 2, e = 0.25 + Math.random() * 0.9, sp = 30 + Math.random() * 70;
        vel[i * 3] = Math.cos(a) * sp; vel[i * 3 + 1] = e * sp; vel[i * 3 + 2] = Math.sin(a) * sp;
      }
      p.geometry.attributes.position.needsUpdate = true;
      p.userData.life = SPARK_LIFE; p.material.opacity = 1; p.visible = true;
    },
    stepSparks(dt) {
      for (const p of this.sparks) {
        if (!p.visible) continue;
        const L = (p.userData.life -= dt);
        if (L <= 0) { p.visible = false; continue; }
        const pos = p.geometry.attributes.position.array, vel = p.userData.vel;
        for (let i = 0; i < SPARK_N; i++) {
          vel[i * 3 + 1] -= 900 * dt;
          pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        }
        p.geometry.attributes.position.needsUpdate = true;
        p.material.opacity = L / SPARK_LIFE;
      }
    },

    // ================= cameras =================
    setCamera(name) {
      if (!CAMS.includes(name)) return;
      this.mode = name;
      const b = HW.sim.track.bounds, cam = this.camera, ctl = this.controls;
      const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
      ctl.enabled = name !== 'chase';
      if (name === 'overview') { cam.position.set(span * 0.62, span * 0.78, span * 0.94); ctl.target.set(6, 2, 0); }
      else if (name === 'crash') { cam.position.set(19, 16, 29); ctl.target.set(0, 1.5, 0); }
      else if (name === 'booster') { const w = HW.sim.track.wheels.find((x) => x.arm === 'N') || HW.sim.track.wheels[0]; cam.position.set(w.center.x + 9, w.center.y + 6.5, w.center.z - 16); ctl.target.set(w.center.x, w.center.y, w.center.z); }
      else if (name === 'gears') { cam.position.set(18, GEAR_Y - 11.6, 26); ctl.target.set(0, GEAR_Y, 0); }
      else if (name === 'chase') { this._chaseInit = false; }
      this.xray(name === 'gears');
      if (this.underLight) this.underLight.visible = name === 'gears';
      cam.lookAt(ctl.target); ctl.update();
      HW.bus.emit('camera', name);
      return name;
    },
    // 25 % opaque hub so the gear train shows through
    xray(on) {
      this.xrayOn = !!on;
      const m = this.hubMat; if (!m) return;
      m.transparent = this.xrayOn; m.opacity = this.xrayOn ? 0.25 : 1; m.depthWrite = !this.xrayOn;
      m.needsUpdate = true;
      for (const p of this.hubParts) p.castShadow = !this.xrayOn;
    },

    // ================= lane picking =================
    // ndc in [-1,1]; returns the nearest circuit position under the pointer, or null.
    pickLane(ndcX, ndcY) {
      if (!this.floorMesh) return null;
      _ndc.set(ndcX, ndcY); _ray.setFromCamera(_ndc, this.camera);
      const hits = _ray.intersectObject(this.floorMesh, false);
      if (!hits.length) return null;
      const p = hits[0].point, q = { x: p.x, y: p.y, z: p.z };
      let best = null;
      for (const c of HW.sim.track.circuits) {
        const pr = c.project(q);
        if (!best || pr.dist < best.dist) best = { path: c, s: pr.s, lateral: pr.lateral, dist: pr.dist };
      }
      if (!best || best.dist >= 4) return null;
      return { path: best.path, s: best.s, lateral: best.lateral };
    },

    resize() {
      const cam = this.camera;
      cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    },

    // ================= frame =================
    update(dt, tel) {
      const sim = HW.sim, elec = tel ? tel.elec : sim.elec.telemetry();
      const omegaW = sim.elec.omegaWheel;                       // rad/s at the foam wheels
      const omegaM = elec.rpmMotor * Math.PI / 30;

      for (const w of this.foamWheels) w.rotation.y += omegaW * dt;
      const G = this.gears;
      if (G) {
        for (const s of G.sats) s.rotation.y += omegaW * dt;    // all four turn together
        G.idler.rotation.y -= omegaW * dt;                      // idler meshes them: opposite sense
        G.pinion.rotation.y -= omegaM * dt;                     // motor speed, meshes the N satellite
      }
      if (this.switchKnob) this.switchKnob.position.x = elec.on ? 0.7 : -0.7;

      const cars = sim.cars;
      for (let i = 0; i < cars.length; i++) {
        const car = cars[i], g = this.carGroups[i];
        if (!g) continue;
        g.visible = !car.lifted;
        if (car.lifted) continue;
        g.position.set(car.pos.x, car.pos.y, car.pos.z);
        g.quaternion.set(car.quat.x, car.quat.y, car.quat.z, car.quat.w);
        const wheels = g.userData && g.userData.wheels;
        if (wheels && car.controller) {
          for (let k = 0; k < wheels.length && k < 4; k++) {
            const ws = car.wheelState(k); const wm = wheels[k];
            if (!ws || !wm) continue;
            wm.rotation.x = ws.rot;
            if (ws.len != null) { const cp = car.controller.wheelChassisConnectionPointCs(k); if (cp) wm.position.y = cp.y - ws.len; }
          }
        }
        if (HW.renderCars && HW.renderCars.sync) { try { HW.renderCars.sync(car, g); } catch (e) { /* car renderer is optional */ } }
      }

      this.stepSparks(dt);
      this.updateCamera(dt);
      this.renderer.render(this.scene, this.camera);
    },

    updateCamera(dt) {
      if (this.mode === 'chase') {
        const car = this.selectedCar || HW.sim.cars[0];
        if (car && !car.lifted) {
          if (!this._chasePos) { this._chasePos = new T.Vector3(); this._chaseAim = new T.Vector3(); }
          _q1.set(car.quat.x, car.quat.y, car.quat.z, car.quat.w);
          _v1.set(0, 0, 1).applyQuaternion(_q1);                // car forward is -Z, so +Z is behind
          _v2.set(car.pos.x, car.pos.y, car.pos.z);
          _v3.copy(_v2).addScaledVector(_v1, 14); _v3.y += 4.0; _v2.y += 0.6;
          if (!this._chaseInit) { this._chasePos.copy(_v3); this._chaseAim.copy(_v2); this._chaseInit = true; }
          const k = Math.min(1, dt * 5);
          this._chasePos.lerp(_v3, k); this._chaseAim.lerp(_v2, k);
          this.camera.position.copy(this._chasePos);
          this.camera.lookAt(this._chaseAim);
        }
      } else if (this.controls) {
        this.controls.update();
      }
    },
  };

  HW.render = render;
})(window.HW);
