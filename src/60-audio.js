// 60-audio.js - the toy's sound: motor whine, rolling cars, joint clacks, foam thwips, crashes.
//
// Web Audio only: no worklets, no fetch. Nothing creates an AudioContext until init() is
// called from a user gesture, and every entry point is wrapped, so an audio failure can only
// silence the audio, never throw into the game loop.
//
// Graph: voices -> {motor, roll, sfx} buses -> master -> compressor (limiter) -> soft clip ->
// destination; roll + sfx also feed a small synthetic room. Continuous sound (motor, rolling)
// is synthesized live from the physics every frame. One-shots play from banks of variants:
// modal-synthesis clicks and clanks rendered at init, plus the ElevenLabs samples in
// 61-audio-assets.js (banks "s:<name>") once decoded. Positions are sim cm; the panners use
// an 'inverse' distance model tuned for a 65 cm toy heard from 20-150 cm.
// Tuning: HW.audio.params (live; the audition page is tools/audio.html).
(function (HW) {
  'use strict';
  if (!HW) HW = window.HW = {};
  const G = 981;
  const P = {
    master: 1.0,                         // into the limiter, times volume^2
    motor: 0.7, roll: 0.9, sfx: 0.9, reverb: 0.14,
    refDist: 35, rolloff: 0.7, panning: 'equalpower',
    // motor: 380-class brushed can motor (3-slot armature, 2 brushes) through two spur stages
    commPerRev: 6, pinion: 10, stage1: 3.2, stage2: 10, idleI: 0.25, loadI: 4,
    whine: 0.11, hum: 0.12, mesh: 0.05, air: 0.42, growl: 2.0, hiss: 0.1,
    // rolling: hard plastic wheels on plastic track
    vRef: 400, rollHiss: 0.2, rumble: 0.12, buzz: 0.1, scrape: 0.09, maxRoll: 8,
    // one-shot gains at the reference intensity (bank peaks are normalised to 1)
    joint: 0.18, jointRate: 45, wall: 0.2, land: 0.3, nip: 0.4, bump: 0.35, crash: 0.9,
    impact: 0.5, drop: 0.22, switchGain: 0.3, whoosh: 0.25, lap: 0.06, nudge: 0.22,
    floorY: 2.5,                         // impacts below this height (cm) land on the wooden floor
    maxVoices: 40,
  };

  let ctx = null, N = null, broken = false, enabled = true, volume = 0.8, errors = 0;
  let noiseBuf = null, slowBuf = null, waves = null, motor = null, ana = null;
  const rolls = [], carVoice = new Map(), banks = {}, active = new Set(), jobs = [], lastT = new Map();
  let simT0 = 0, tScale = 1, lastSimT = null, frozenFor = 0, foamV = 0, tokens = 8, duck = 0, frameNo = 0;
  const st = { started: 0, dropped: 0, gated: 0, samples: 0, sampleErr: 0, events: {} };
  const HUB_SW = { x: 0, y: 7, z: 0 };

  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const rr = (a, b) => a + (b - a) * Math.random();
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const fin = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
  const idOf = (c) => (c && c.id != null ? c.id : 0);
  const posOf = (c) => (c && c.pos) || null;
  const persOf = (c) => { const h = Math.sin(idOf(c) * 12.9898 + 4.1) * 43758.5453; return 0.92 + 0.16 * (h - Math.floor(h)); };

  function fail(e) {
    errors++;
    if (errors <= 3) console.warn('[audio]', (e && e.message) || e);
    if (errors >= 50 && !broken) { broken = true; try { N.master.gain.value = 0; } catch (_) { /* nothing left to do */ } }
  }
  const quiet = (p) => { if (p && p.catch) p.catch(() => {}); };

  // ---------------------------------------------------------------- node helpers
  const gainN = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  function filt(type, f, q, db) {
    const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f;
    if (q != null) b.Q.value = q; if (db != null) b.gain.value = db; return b;
  }
  function oscN(w, f) { const o = ctx.createOscillator(); if (typeof w === 'string') o.type = w; else o.setPeriodicWave(w); o.frequency.value = f; o.start(); return o; }
  function loopN(buf, rate) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(0, Math.random() * buf.duration); return s; }
  function chain() { for (let i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]); return arguments[arguments.length - 1]; }
  function waveOf(amps) {
    const re = new Float32Array(amps.length + 1), im = new Float32Array(amps.length + 1);
    amps.forEach((a, i) => { im[i + 1] = a; });
    return ctx.createPeriodicWave(re, im);
  }
  // smoothed param update; skips changes under 0.3% so a steady frame costs nothing
  function set(p, v, tc) {
    if (!(v === v)) return;
    if (p._hw !== undefined && Math.abs(v - p._hw) <= 1e-5 + Math.abs(p._hw) * 0.003) return;
    p._hw = v; p.setTargetAtTime(v, ctx.currentTime, tc || 0.03);
  }
  function pannerN(pos) {
    const p = ctx.createPanner();
    p.panningModel = P.panning; p.distanceModel = 'inverse';
    p.refDistance = P.refDist; p.rolloffFactor = P.rolloff; p.maxDistance = 1e4;
    if (pos) {
      const x = fin(pos.x, 0), y = fin(pos.y, 0), z = fin(pos.z, 0);
      if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
    }
    return p;
  }
  function place(p, v) {
    const x = fin(v.x, 0), y = fin(v.y, 0), z = fin(v.z, 0);
    if (p.positionX) { set(p.positionX, x, 0.02); set(p.positionY, y, 0.02); set(p.positionZ, z, 0.02); } else p.setPosition(x, y, z);
  }

  // ---------------------------------------------------------------- buffers and curves
  function makeNoise(sec) {
    const n = Math.floor(sec * ctx.sampleRate), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  // smooth random steps every 10 ms, +-1: a modulator whose rate is set by playbackRate
  function makeSlow(sec) {
    const sr = ctx.sampleRate, n = Math.floor(sec * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), step = Math.floor(0.01 * sr);
    const first = rr(-1, 1); let a = first, c = rr(-1, 1);
    for (let i = 0; i < n; i++) {
      const k = i % step;
      if (k === 0 && i) { a = c; c = i + step >= n ? first : rr(-1, 1); }
      d[i] = a + (c - a) * (0.5 - 0.5 * Math.cos(Math.PI * k / step));
    }
    return b;
  }
  function roomIR() {                  // ~0.5 s living-room tail, darkening as it decays
    const sr = ctx.sampleRate, n = Math.floor(0.5 * sr), b = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        lp += (0.08 + 0.6 * Math.exp(-t / 0.06)) * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.exp(-t / 0.075) * Math.min(1, t / 0.004);
      }
    }
    return b;
  }
  function curve(fn) { const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = fn(i / (n - 1) * 2 - 1); return c; }
  const tanhCurve = (k) => curve((x) => Math.tanh(k * x) / Math.tanh(k));
  const clipCurve = () => curve((x) => { const a = Math.abs(x); return Math.sign(x) * (a < 0.7 ? a : 0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28)); });

  // ---------------------------------------------------------------- motor (continuous)
  function buildMotor() {
    const m = {};
    m.pan = pannerN({ x: 0, y: 4.5, z: 0 }); m.pan.connect(N.motor);
    m.lvl = gainN(0);
    chain(m.lvl, filt('peaking', 950, 0.9, 3), filt('lowpass', 5500, 0.6), m.pan);
    // commutator ripple, driven into a saturator harder as the current rises (the load growl)
    m.comm = oscN(waves.comm, 100); m.drive = gainN(0.25); m.gComm = gainN(0);
    const sh = ctx.createWaveShaper(); sh.curve = tanhCurve(4); sh.oversample = '4x';
    chain(m.comm, m.drive, sh, m.gComm, m.lvl);
    m.rot = oscN(waves.hum, 50); m.gRot = gainN(0); chain(m.rot, m.gRot, m.lvl);
    // pinion mesh and second-stage mesh, amplitude-modulated by their shaft runout
    m.mesh1 = oscN(waves.mesh, 500); m.am1 = gainN(1); m.gMesh1 = gainN(0); chain(m.mesh1, m.am1, m.gMesh1, m.lvl);
    m.lfo1 = oscN('sine', 50); chain(m.lfo1, gainN(0.35), m.am1.gain);
    m.mesh2 = oscN(waves.mesh, 150); m.am2 = gainN(1); m.gMesh2 = gainN(0); chain(m.mesh2, m.am2, m.gMesh2, m.lvl);
    m.lfo2 = oscN('sine', 15); chain(m.lfo2, gainN(0.45), m.am2.gain);
    // air and housing rattle (the "vacuum cleaner"), a load growl pulsing at the foam-wheel rate, brush hiss
    const nz = loopN(noiseBuf, 1);
    m.bpAir = filt('bandpass', 800, 0.5); m.gAir = gainN(0); chain(nz, m.bpAir, m.gAir, m.lvl);
    m.amG = gainN(1); m.gGrowl = gainN(0); chain(nz, filt('bandpass', 300, 0.8), m.amG, m.gGrowl, m.lvl);
    m.wheel = oscN('triangle', 20); m.depW = gainN(0); chain(m.wheel, m.depW, m.amG.gain);
    m.gHiss = gainN(0); chain(nz, filt('highpass', 4500, 0.7), m.gHiss, m.lvl);
    // slow pitch wander (cents) so the whine is never a sterile tone
    const wd = chain(loopN(slowBuf, 0.08), gainN(7));
    for (const o of [m.comm, m.rot, m.mesh1, m.mesh2]) wd.connect(o.detune);
    return m;
  }
  function motorUpdate(tel, frozen) {
    const m = motor, rpm = Math.max(0, fin(tel.rpmMotor, 0)), rps = rpm / 60, I = Math.max(0, fin(tel.I, 0));
    const load = clamp((I - P.idleI) / P.loadI, 0, 1.4), spin = sstep(200, 3000, rpm), top = clamp(rpm / 16000, 0, 1.25);
    const f = (hz) => Math.max(0.5, hz), rps2 = rps / P.stage1, rpsW = fin(tel.rpmWheel, rpm / 10.3) / 60;
    set(m.comm.frequency, f(rps * P.commPerRev)); set(m.rot.frequency, f(rps));
    set(m.mesh1.frequency, f(rps * P.pinion)); set(m.lfo1.frequency, f(rps));
    set(m.mesh2.frequency, f(rps2 * P.stage2)); set(m.lfo2.frequency, f(rps2));
    set(m.wheel.frequency, f(rpsW)); set(m.depW.gain, 0.7 * sstep(1, 8, rpsW));
    set(m.drive.gain, 0.25 * (1 + 2.5 * load));
    set(m.gComm.gain, P.whine * spin * (0.5 + 0.5 * top) * (0.8 + 0.5 * load));
    set(m.gRot.gain, P.hum * spin * top);
    set(m.gMesh1.gain, P.mesh * spin * (0.35 + 1.1 * load));
    set(m.gMesh2.gain, P.mesh * 1.2 * spin * (0.5 + 0.8 * load));
    set(m.bpAir.frequency, 450 + rps * 4); set(m.gAir.gain, P.air * Math.pow(top, 1.5));
    set(m.gGrowl.gain, P.growl * load);
    set(m.gHiss.gain, P.hiss * (spin * top + 1.5 * load));
    set(m.lvl.gain, frozen ? 0 : 1, 0.1);
  }

  // ---------------------------------------------------------------- rolling (continuous, per car)
  function buildRoll() {
    const v = { car: null, seen: 0, pers: 1 };
    v.pan = pannerN({ x: 0, y: -1000, z: 0 }); v.pan.connect(N.roll);
    v.lvl = gainN(0); v.lvl.connect(v.pan);
    const nz = loopN(noiseBuf, 1);
    v.bpRoll = filt('bandpass', 1500, 0.6); v.gRoll = gainN(0); chain(nz, v.bpRoll, v.gRoll, v.lvl);
    v.lpRum = filt('lowpass', 200, 0.9); v.gRum = gainN(0); chain(nz, v.lpRum, v.gRum, v.lvl);
    v.bpScr = filt('bandpass', 3000, 1.3); v.amScr = gainN(1); v.gScr = gainN(0); chain(nz, v.bpScr, v.amScr, v.gScr, v.lvl);
    N.chatter.connect(v.amScr.gain);
    v.buzz = oscN(waves.buzz, 100); v.bpBuzz = filt('bandpass', 1800, 0.8); v.amBuzz = gainN(1); v.gBuzz = gainN(0);
    chain(v.buzz, v.bpBuzz, v.amBuzz, v.gBuzz, v.lvl);
    N.rattle.connect(v.amBuzz.gain);
    return v;
  }
  function rollUpdate(v, car, frozen) {
    const sp = fin(car.speed, 0), m = fin(car.m, 40), W = m * G, x = clamp(sp / P.vRef, 0, 2);
    let hiss = 0, rum = 0, buzz = 0, scr = 0, fRoll = 400 + 2200 * Math.min(x, 1.4);
    if (car.mode === 'track') {
      const nf = car.airborne ? 0 : clamp(fin(car.Nf, W) / W, 0, 14);
      const press = Math.sqrt(nf), touch = nf > 0.05 ? 1 : 0;      // press: 1 on the flat, ~3.6 at 13 g in a loop
      hiss = P.rollHiss * touch * Math.pow(x, 1.4) * (0.75 + 0.25 * Math.min(press, 3.6));
      rum = P.rumble * touch * x * Math.max(0, press - 0.8);         // the loop piece roars under 13 g
      buzz = P.buzz * touch * sstep(15, 120, sp) * Math.pow(x, 0.9) * (0.8 + 0.2 * Math.min(press, 3.6));
      scr = P.scrape * Math.sqrt(clamp(fin(car.Nw, 0) / W * x, 0, 8)) * sstep(8, 60, sp);
    } else if (car.mode === 'free' && car.pos && fin(car.pos.y, 99) < P.floorY && Math.abs(fin(car.vel && car.vel.y, 99)) < 25) {
      hiss = P.rollHiss * 0.8 * Math.pow(x, 1.2); fRoll = 300 + 900 * Math.min(x, 1.4);    // sliding on the floor
    }
    const r = fin(car.entry && car.entry.wheelRadiusCm, 0.5);
    set(v.buzz.frequency, Math.max(1, sp / (2 * Math.PI * r)) * v.pers);
    set(v.bpRoll.frequency, fRoll * v.pers);
    set(v.lpRum.frequency, 110 + 160 * Math.min(x, 1.5));
    set(v.bpScr.frequency, (2200 + 1400 * Math.min(x, 1.5)) * v.pers);
    set(v.gRoll.gain, hiss); set(v.gRum.gain, rum); set(v.gBuzz.gain, buzz); set(v.gScr.gain, scr, 0.015);
    set(v.lvl.gain, frozen ? 0 : 1, 0.08);
    if (car.pos) place(v.pan, car.pos);
  }
  function carsUpdate(list, frozen) {
    frameNo++;
    for (let i = 0; i < list.length; i++) {
      const car = list[i]; if (!car) continue;
      let v = carVoice.get(car);
      if (!v) {                        // voices are made on demand and reused, at most P.maxRoll
        v = rolls.find((r) => !r.car) || (rolls.length < P.maxRoll ? rolls[rolls.push(buildRoll()) - 1] : null);
        if (!v) continue;
        v.car = car; v.pers = persOf(car); carVoice.set(car, v);
      }
      v.seen = frameNo;
      rollUpdate(v, car, frozen);
    }
    for (const v of rolls) if (v.car && v.seen !== frameNo) { set(v.lvl.gain, 0, 0.05); carVoice.delete(v.car); v.car = null; }
  }

  // ---------------------------------------------------------------- one-shot banks (modal synthesis)
  function modes(d, sr, t0, list, amp, jit) {        // decaying sinusoids [f Hz, amp, tau s]
    const i0 = Math.floor(t0 * sr), na = Math.max(1, Math.round(0.0003 * sr));
    for (const md of list) {
      const f = md[0] * (1 + jit * (2 * Math.random() - 1)), tau = md[2] * (1 + 0.5 * jit * (2 * Math.random() - 1));
      if (f >= sr * 0.45) continue;
      const w = 2 * Math.PI * f / sr, r = Math.exp(-1 / (tau * sr)), c = Math.cos(w) * r, s = Math.sin(w) * r, ph = Math.random() * 1.6;
      let re = Math.cos(ph) * amp * md[1], im = Math.sin(ph) * amp * md[1];
      const n = Math.min(d.length - i0, Math.ceil(tau * sr * 7));
      for (let i = 0; i < n; i++) { d[i0 + i] += i < na ? im * i / na : im; const t = re * c - im * s; im = re * s + im * c; re = t; }
    }
  }
  function burst(d, sr, t0, dur, amp, hp, lp) {     // decaying noise through one-pole HP / LP
    const i0 = Math.floor(t0 * sr), n = Math.min(d.length - i0, Math.ceil(dur * sr * 6));
    const ah = hp ? Math.exp(-2 * Math.PI * hp / sr) : 0, al = lp ? 1 - Math.exp(-2 * Math.PI * lp / sr) : 1;
    let l = 0, hin = 0, h = 0;
    for (let i = 0; i < n; i++) {
      l += al * ((Math.random() * 2 - 1) * Math.exp(-i / (dur * sr)) - l);
      h = ah * (h + l - hin); hin = l;
      d[i0 + i] += amp * (hp ? h : l);
    }
  }
  function sweep(d, sr, t0, dur, fOf, q, envOf, amp) {  // noise through a moving SVF bandpass
    const i0 = Math.floor(t0 * sr), n = Math.min(d.length - i0, Math.ceil(dur * sr)), k = 1 / q;
    let s1 = 0, s2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n, g = Math.tan(Math.PI * Math.min(fOf(t), sr * 0.45) / sr);
      const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2, v3 = Math.random() * 2 - 1 - s2;
      const v1 = a1 * s1 + a2 * v3, v2 = s2 + a2 * s1 + a3 * v3;
      s1 = 2 * v1 - s1; s2 = 2 * v2 - s2;
      d[i0 + i] += amp * envOf(t) * v1;
    }
  }
  function glide(d, sr, t0, dur, f0, f1, amp, att) {    // a tone falling f0 -> f1 (the foam "whump")
    const i0 = Math.floor(t0 * sr), n = Math.min(d.length - i0, Math.ceil(dur * sr)); let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n; ph += 2 * Math.PI * f0 * Math.pow(f1 / f0, t) / sr;
      d[i0 + i] += amp * Math.min(1, i / (att * sr)) * (1 - t) * (1 - t) * Math.sin(ph);
    }
  }
  const PLASTIC = [[1250, 1, 0.012], [2350, 0.8, 0.008], [3700, 0.6, 0.006], [5200, 0.4, 0.004]];
  const METAL = [[2650, 1, 0.05], [4150, 0.7, 0.035], [5950, 0.5, 0.025], [8300, 0.35, 0.015], [10900, 0.2, 0.01]];
  const CLANK = [[1450, 0.45, 0.06], [2650, 1, 0.1], [3900, 0.8, 0.08], [5200, 0.6, 0.06], [6700, 0.5, 0.045], [8300, 0.4, 0.035], [9800, 0.3, 0.025], [12100, 0.2, 0.018]];
  const WOOD = [[170, 1, 0.03], [410, 0.7, 0.02], [880, 0.4, 0.012], [1900, 0.2, 0.006]];
  const knock = (d, sr, t, a, list, jit) => { burst(d, sr, t, 0.0015, 0.5 * a, 600, 0); modes(d, sr, t, list, a, jit); };
  // name: [variants, seconds, render(d, sr)]
  const RECIPES = {
    joint: [8, 0.05, (d, sr) => { burst(d, sr, 0, 0.0015, 0.5, 1500, 0); modes(d, sr, 0, PLASTIC, 0.8, 0.12); modes(d, sr, 0, [[190, 0.6, 0.01]], 1, 0.15); }],
    wall: [5, 0.07, (d, sr) => { burst(d, sr, 0, 0.001, 0.5, 2000, 0); modes(d, sr, 0, [[3100, 0.7, 0.03], [4800, 0.5, 0.02], [7300, 0.35, 0.012]], 0.7, 0.1); modes(d, sr, 0, [[650, 0.8, 0.012], [1400, 0.6, 0.008]], 0.8, 0.12); }],
    land: [4, 0.09, (d, sr) => { for (const [t, a] of [[0, 1], [rr(0.002, 0.007), rr(0.5, 0.8)]]) knock(d, sr, t, a, [[240, 1, 0.02], [520, 0.7, 0.015], [1100, 0.5, 0.01], [2300, 0.3, 0.006]], 0.12); modes(d, sr, 0, [[3600, 0.2, 0.02]], 1, 0.1); }],
    bump: [5, 0.14, (d, sr) => { burst(d, sr, 0, 0.0007, 0.4, 3000, 0); modes(d, sr, 0, METAL, 1, 0.1); modes(d, sr, 0, [[900, 0.3, 0.006]], 1, 0.2); }],
    clank: [4, 0.55, (d, sr) => {
      for (const [t, a] of [[0, 1], [rr(0.003, 0.009), rr(0.4, 0.7)], [rr(0.012, 0.028), rr(0.2, 0.45)]]) {
        burst(d, sr, t, 0.003, 0.9 * a, 800, 0); modes(d, sr, t, CLANK, a, 0.1); modes(d, sr, t, [[380, 0.5, 0.03], [760, 0.3, 0.02]], a, 0.2);
      }
    }],
    rattle: [4, 0.7, (d, sr) => {                    // a car tumbling: bounces spreading out and dying away
      let t = 0.004, a = 1;
      for (let k = 0, n = 10 + ((Math.random() * 7) | 0); k < n && t < 0.62; k++) {
        burst(d, sr, t, 0.0008, 0.5 * a, 1200, 0);
        modes(d, sr, t, [[rr(700, 1500), 1, rr(0.004, 0.01)], [rr(1800, 3500), 0.7, rr(0.003, 0.007)], [rr(3800, 6000), 0.5, rr(0.002, 0.005)]], 0.8 * a, 0);
        if (Math.random() < 0.3) modes(d, sr, t, [[rr(3000, 6000), 1, 0.02], [rr(6500, 9000), 0.6, 0.012]], 0.35 * a, 0);
        t += rr(0.012, 0.05) * (1 + k * 0.12); a *= rr(0.7, 0.95);
      }
    }],
    floor: [5, 0.17, (d, sr) => { burst(d, sr, 0, 0.002, 0.6, 0, 3000); modes(d, sr, 0, WOOD, 1, 0.15); modes(d, sr, 0, [[3500, 0.25, 0.02], [5600, 0.15, 0.012]], 1, 0.1); }],
    switch: [2, 0.08, (d, sr) => { for (const [t, a] of [[0, 1], [rr(0.009, 0.014), 0.6]]) { burst(d, sr, t, 0.0008, 0.6 * a, 2500, 0); modes(d, sr, t, [[2900, 0.8, 0.006], [4400, 0.6, 0.004], [1600, 0.5, 0.008]], a, 0.08); } }],
    drop: [3, 0.25, (d, sr) => { for (const [t, a] of [[0, 1], [rr(0.035, 0.05), rr(0.25, 0.4)], [rr(0.065, 0.085), rr(0.08, 0.15)]]) { knock(d, sr, t, a, [[330, 1, 0.02], [800, 0.7, 0.012], [1700, 0.5, 0.008]], 0.12); modes(d, sr, t, [[3300, 0.4, 0.03], [5100, 0.3, 0.02]], a, 0.1); } }],
    nip: [4, 0.2, (d, sr) => {                       // whump of the squeeze + thwip as the car is flung through
      glide(d, sr, 0, 0.07, rr(130, 160), rr(55, 70), 0.9, 0.004);
      sweep(d, sr, 0.004, rr(0.1, 0.13), (t) => 500 * Math.pow(5.5, t), 2.2, (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.6)), 2) * (1 - t), 0.9);
      modes(d, sr, 0, [[rr(900, 1300), 0.35, 0.01]], 1, 0);
    }],
    whoosh: [2, 0.6, (d, sr) => sweep(d, sr, 0, 0.58, (t) => 300 + 900 * Math.sin(Math.PI * t), 1.3, (t) => Math.pow(Math.sin(Math.PI * t), 2), 1)],
    tick: [2, 0.05, (d, sr) => modes(d, sr, 0, [[3400, 0.8, 0.01], [5100, 0.5, 0.006]], 1, 0.05)],
    nudge: [2, 0.1, (d, sr) => { burst(d, sr, 0, 0.003, 0.7, 0, 1500); modes(d, sr, 0, [[260, 0.8, 0.02], [640, 0.5, 0.012]], 1, 0.1); modes(d, sr, 0.001, [[3000, 0.2, 0.02]], 1, 0.1); }],
    scrape: [3, 0.25, (d, sr) => sweep(d, sr, 0, 0.22, (t) => 2600 + 700 * Math.sin(t * 40), 1.5, (t) => (1 - t) * (0.6 + 0.4 * Math.sin(t * 230)), 1)],
  };
  function addVariant(bank, buf, offset, dur, peak, cut) {
    (banks[bank] = banks[bank] || []).push({ buffer: buf, offset, dur, norm: 1 / Math.max(peak, 1e-4), cut: !!cut });
  }
  function queueBanks() {
    const sr = ctx.sampleRate;
    for (const name of Object.keys(RECIPES)) {
      const [count, sec, fn] = RECIPES[name];
      for (let i = 0; i < count; i++) jobs.push(() => {
        const d = new Float32Array(Math.ceil(sec * sr)); fn(d, sr);
        let peak = 0; for (let k = 0; k < d.length; k++) { const a = Math.abs(d[k]); if (a > peak) peak = a; }
        const nf = Math.ceil(0.003 * sr); for (let k = 0; k < nf; k++) d[d.length - 1 - k] *= k / nf;
        const buf = ctx.createBuffer(1, d.length, sr); buf.getChannelData(0).set(d);
        addVariant(name, buf, 0, buf.duration, peak);
      });
    }
    pump();
  }
  function pump() {                    // render a few ms per task so init() never janks the frame
    const t0 = performance.now();
    try { while (jobs.length && performance.now() - t0 < 6) jobs.shift()(); } catch (e) { fail(e); }
    if (jobs.length) setTimeout(pump, 0);
  }
  function decodeAssets() {
    const A = HW.audioAssets, T = HW.audioAssetTrim || {};
    if (!A || typeof A !== 'object') return;
    for (const name of Object.keys(A)) {
      try {
        const bin = atob(A[name]), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        const ok = (buf) => { try { addSample('s:' + name.replace(/_\d+$/, ''), buf, T[name]); st.samples++; } catch (e) { fail(e); } };
        quiet(ctx.decodeAudioData(u.buffer, ok, () => { st.sampleErr++; }));
      } catch (e) { st.sampleErr++; }
    }
  }
  function addSample(bank, buf, trim) {  // within the trim window: skip the lead-in, stop at -48 dB, normalise
    const d = buf.getChannelData(0), sr = buf.sampleRate;
    const a0 = trim ? Math.max(0, Math.round(trim[0] * sr)) : 0, n = trim ? Math.min(d.length, a0 + Math.round(trim[1] * sr)) : d.length;
    let peak = 0; for (let i = a0; i < n; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
    if (peak < 1e-4) return;
    let on = a0; while (on < n && Math.abs(d[on]) < peak * 0.05) on++;
    on = Math.max(a0, on - Math.round(0.003 * sr));
    let end = n - 1; while (end > on && Math.abs(d[end]) < peak * 0.004) end--;
    const cut = end >= n - 2 && n < d.length;       // the window ends on sound: fade it out
    addVariant(bank, buf, on / sr, Math.min((n - on) / sr, (end - on) / sr + 0.03), peak, cut);
  }

  // ---------------------------------------------------------------- one-shot playback
  const has = (b) => !!(banks[b] && banks[b].length);
  const pick = (sBank, synth, pS) => (has(sBank) && Math.random() < pS ? sBank : synth);
  function play(name, o) {
    const b = banks[name];
    if (!b || !b.length) return null;
    let gain = fin(o.gain, 1);
    if (gain < 0.002) return null;
    if (active.size >= P.maxVoices && (gain < 0.35 || active.size >= P.maxVoices * 1.5)) { st.dropped++; return null; }
    if (duck > 1) gain /= Math.sqrt(duck);          // a pile-up shares one loudness budget
    duck += gain * gain;
    let k = (Math.random() * b.length) | 0;
    if (b.length > 1 && k === b.last) k = (k + 1) % b.length;
    b.last = k;
    const s = b[k], t0 = Math.max(fin(o.when, 0), ctx.currentTime), rate = clamp(fin(o.rate, 1), 0.25, 4);
    const src = ctx.createBufferSource(); src.buffer = s.buffer; src.playbackRate.value = rate;
    const g = gainN(gain * s.norm), nodes = [src, g];
    let head = src;
    if (o.lp && o.lp < 15000) { const f = filt('lowpass', o.lp, 0.6); src.connect(f); head = f; nodes.push(f); }
    head.connect(g);
    if (o.pos) { const p = pannerN(o.pos); g.connect(p); p.connect(N.sfx); nodes.push(p); } else g.connect(N.sfx);
    const len = Math.min(s.dur, fin(o.maxDur, 1e9)), end = t0 + len / rate;
    if (len < s.dur || s.cut) { g.gain.setValueAtTime(gain * s.norm, Math.max(t0, end - Math.min(0.06, 0.3 * len / rate))); g.gain.linearRampToValueAtTime(0, end); }
    src.start(t0, s.offset, len);
    const v = { nodes, end };
    active.add(v); st.started++;
    src.onended = () => release(v);
    return v;
  }
  function release(v) { if (!active.delete(v)) return; for (const n of v.nodes) { try { n.disconnect(); } catch (_) { /* already gone */ } } }
  function when(t) {                   // spread a frame's events over the frame, by their sim time
    const now = ctx.currentTime + 0.004;
    return typeof t === 'number' ? now + clamp((t - simT0) / tScale, 0, 0.05) : now;
  }
  function gate(key, t, gap) {         // per-source rate limit, on the sim clock when there is one
    const now = typeof t === 'number' ? t : ctx.currentTime, last = lastT.get(key);
    if (last !== undefined && now >= last && now - last < gap) { st.gated++; return false; }
    lastT.set(key, now); return true;
  }

  // ---------------------------------------------------------------- events
  const H = {
    switch(on) { play(pick('s:switch', 'switch', 1), { pos: HUB_SW, gain: P.switchGain, rate: on ? rr(0.98, 1.02) : rr(0.86, 0.9) }); },
    nip(e) {
      const car = e.car, wp = e.booster && e.booster.wheelPos;
      const pos = Array.isArray(wp) ? { x: wp[0], y: wp[1], z: wp[2] } : wp || posOf(car);
      const slip = clamp((foamV - fin(car && car.speed, 0)) / 250, 0, 1.2), x = clamp(foamV / 400, 0.15, 1.3);
      play('nip', { when: when(e.t), pos, gain: P.nip * x * (0.3 + 0.7 * slip), rate: (0.72 + 0.3 * x) * rr(0.96, 1.04) });
    },
    wall(e) {
      if (!gate('w' + idOf(e.car), e.t, 0.035)) return;
      const x = clamp(fin(e.speed, 30) / 120, 0.04, 1.5);
      play('wall', { when: when(e.t), pos: posOf(e.car), gain: P.wall * Math.pow(x, 0.9) * rr(0.8, 1.1), rate: rr(0.94, 1.06), lp: 1800 + 12000 * Math.min(x, 1) });
    },
    joint(e) {                         // front axle, then the rear axle one wheelbase later
      const car = e.car;
      if (!gate('j' + idOf(car), e.t, 0.018)) return;
      if (tokens < 1) { st.gated++; return; }
      tokens -= 1;
      const sp = fin(e.speed, 300), x = clamp(sp / P.vRef, 0.08, 1.5), W = fin(car && car.m, 40) * G;
      const press = Math.sqrt(clamp(fin(car && car.Nf, W) / W, 0.2, 14));
      const o = { when: when(e.t), pos: posOf(car), gain: P.joint * Math.pow(x, 1.1) * (0.7 + 0.3 * Math.min(press, 3)) * rr(0.7, 1.15), rate: persOf(car) * rr(0.94, 1.06), lp: 2500 + 9000 * Math.min(x, 1) };
      play('joint', o);
      const dt = fin(car && car.entry && car.entry.wheelbaseCm, 4.8) / Math.max(sp, 1);
      if (dt < 0.05) { o.when += dt; o.gain *= rr(0.55, 0.85); o.rate *= rr(0.97, 1.03); play('joint', o); }
    },
    land(e) {
      if (!gate('l' + idOf(e.car), e.t, 0.05)) return;
      const x = clamp(fin(e.speed, 20) / 60, 0.05, 1.3);
      play('land', { when: when(e.t), pos: posOf(e.car), gain: P.land * x, rate: rr(0.94, 1.08), lp: 1500 + 10000 * Math.min(x, 1) });
    },
    bump(e) {
      const a = idOf(e.a), b = idOf(e.b);
      if (!gate('b' + Math.min(a, b) + '_' + Math.max(a, b), e.t, 0.07)) return;
      const x = clamp(fin(e.speed, 60) / 200, 0.05, 1.3);
      play(pick('s:bump', 'bump', 0.35), { when: when(e.t), pos: e.pos || posOf(e.a), gain: P.bump * Math.pow(x, 0.9), rate: rr(0.92, 1.1), lp: 2500 + 12000 * Math.min(x, 1) });
    },
    crash(e) {                         // sample (if any) + synthetic clank + plastic clatter, scaled by closing speed
      const sp = fin(e.speed, 300), x = clamp(sp / 450, 0.12, 1.8), t = when(e.t), pos = e.pos || posOf(e.a);
      const mass = fin(e.a && e.a.m, 40) + fin(e.b && e.b.m, 40), rate = rr(0.95, 1.05) * Math.sqrt(80 / clamp(mass, 50, 120));
      const g = P.crash * Math.pow(x, 0.85), lp = 2500 + 16000 * clamp(sp / 550, 0, 1), sample = has('s:crash') && sp > 130;
      // the samples carry up to 1.5 s of their own tumbling; the physics sends that as impact
      // events, so keep only the collision and its first rattle (longer for harder hits)
      if (sample) play('s:crash', { when: t, pos, gain: g, rate, lp, maxDur: 0.25 + sp / 1000 });
      play('clank', { when: t, pos, gain: g * (sample ? 0.4 : 0.85), rate: rate * rr(0.97, 1.03), lp });
      if (!sample || sp > 450) play(pick('s:clatter', 'rattle', 0.4), { when: t + rr(0.03, 0.08), pos, gain: g * (sample ? 0.25 : 0.5), rate: rr(0.92, 1.08), lp: lp * 0.8, maxDur: 0.5 });
    },
    impact(e) {                        // a tumbling car hits the floor (wood) or the track (plastic)
      const car = e.car;
      if (!gate('i' + idOf(car), e.t, 0.05)) return;
      const fg = Math.max(1, fin(e.force, 0) / (fin(car && car.m, 40) * G));     // force in g
      const x = clamp((Math.log10(fg) - 0.7) / 2, 0.03, 1.2), pos = e.pos || posOf(car), floor = pos && fin(pos.y, 9) < P.floorY;
      const o = { when: when(e.t), pos, gain: P.impact * Math.pow(x, 1.1), rate: rr(0.9, 1.1), lp: 1500 + 14000 * Math.min(x, 1) };
      // floor: synthetic wood body + the sample's die-cast tick on top; track: one hollow knock
      const bank = floor ? 'floor' : pick('s:knock', 'land', 0.5);
      play(bank, bank === 's:knock' ? Object.assign({}, o, { maxDur: 0.06 }) : o);
      if (floor && has('s:floor') && Math.random() < 0.6) play('s:floor', Object.assign({}, o, { gain: o.gain * 0.6, maxDur: 0.25 }));
      if (x > 0.45 && Math.random() < 0.6) play('bump', { when: o.when + 0.002, pos, gain: o.gain * 0.35, rate: rr(0.9, 1.15), lp: o.lp });
    },
    derail(e) {                        // 'hit' already made its noise as a crash
      const pos = posOf(e.car), t = when(e.t);
      if (e.cause === 'drift') play('scrape', { when: t, pos, gain: 0.22, rate: rr(0.9, 1.1) });
      else if (e.cause === 'lift') { play('wall', { when: t, pos, gain: 0.25, rate: rr(0.9, 1.05) }); play('scrape', { when: t, pos, gain: 0.14, rate: rr(0.95, 1.1), maxDur: 0.12 }); }
    },
    recapture(e) { play(pick('s:knock', 'land', 0.5), { when: when(e.t), pos: posOf(e.car), gain: P.land * 0.5, rate: rr(0.95, 1.08) }); },
    retrieve(e) {
      const pos = posOf(e.car), t = when(e.t);
      play('whoosh', { when: t, pos, gain: P.whoosh, rate: rr(0.9, 1.1) });
      play('tick', { when: t + 0.12, pos, gain: P.whoosh * 0.4, rate: rr(0.8, 0.9) });
    },
    dropped(e) { play(pick('s:drop', 'drop', 0.75), { when: when(e.t), pos: posOf(e.car), gain: P.drop, rate: rr(0.94, 1.06) }); },
    lap(e) { if (P.lap > 0) play('tick', { when: when(e.t), pos: posOf(e.car), gain: P.lap, rate: rr(1.1, 1.2) }); },
    nudge(e) { play('nudge', { when: when(e.t), pos: posOf(e.car), gain: P.nudge, rate: rr(0.9, 1.1) }); },
    // stunt parts: the plunger's thwack, a hazard's whack, a car into an end buffer, a finish line
    launch(e) {
      const pos = posOf(e.car), t = when(e.t), x = clamp(e.strength || 0.8, 0.3, 1);
      play('nudge', { when: t, pos, gain: P.nudge * (0.8 + 0.8 * x), rate: rr(0.7, 0.8) });
      play(pick('s:knock', 'bump', 0.5), { when: t + 0.004, pos, gain: P.land * 0.7 * x, rate: rr(1.1, 1.3), maxDur: 0.08 });
    },
    whack(e) {
      const pos = posOf(e.car), t = when(e.t), x = clamp((e.speed || 100) / 250, 0.3, 1.2);
      play('bump', { when: t, pos, gain: 0.5 * x, rate: rr(0.75, 0.9) });
      play(pick('s:knock', 'wall', 0.6), { when: t + 0.003, pos, gain: 0.45 * x, rate: rr(0.8, 0.95) });
    },
    buffer(e) { play(pick('s:knock', 'wall', 0.5), { when: when(e.t), pos: posOf(e.car), gain: clamp((e.speed || 60) / 300, 0.08, 0.45), rate: rr(0.85, 1.0), maxDur: 0.1 }); },
    gate(e) { if (e.gate && e.gate.kind === 'finish') play('tick', { when: when(e.t), pos: posOf(e.car), gain: Math.max(P.lap, 0.2), rate: rr(1.3, 1.4) }); },
  };
  let subscribed = false;
  function subscribe() {
    if (subscribed || !HW.bus || typeof HW.bus.on !== 'function') return;
    subscribed = true;
    for (const type of Object.keys(H)) {
      HW.bus.on(type, (d) => {
        if (!ctx || broken || !enabled || ctx.state !== 'running') return;
        st.events[type] = (st.events[type] || 0) + 1;
        try { H[type](d == null ? {} : d); } catch (e) { fail(e); }
      });
    }
  }

  // ---------------------------------------------------------------- lifecycle
  const masterGain = () => (enabled ? P.master * volume * volume : 0);
  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { broken = true; return false; }
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (_) { ctx = new AC(); }
    N = { master: gainN(0), comp: ctx.createDynamicsCompressor(), clip: ctx.createWaveShaper() };
    const c = N.comp;
    c.threshold.value = -10; c.knee.value = 4; c.ratio.value = 12; c.attack.value = 0.002; c.release.value = 0.2;
    N.clip.curve = clipCurve();
    chain(N.master, N.comp, N.clip, ctx.destination);
    N.motor = gainN(P.motor); N.roll = gainN(P.roll); N.sfx = gainN(P.sfx);
    for (const b of [N.motor, N.roll, N.sfx]) b.connect(N.master);
    N.verb = ctx.createConvolver(); N.verb.buffer = roomIR(); N.verbIn = gainN(P.reverb);
    N.roll.connect(N.verbIn); N.sfx.connect(N.verbIn); chain(N.verbIn, N.verb, N.master);
    noiseBuf = makeNoise(2); slowBuf = makeSlow(4);
    const buzz = []; for (let n = 1; n <= 24; n++) buzz.push(Math.pow(n, -0.55) * (0.6 + 0.4 * Math.cos(n * 0.9)));
    waves = {
      comm: waveOf([1, 0.5, 0.33, 0.22, 0.3, 0.12, 0.08, 0.1, 0.05, 0.04, 0.03, 0.025]),
      hum: waveOf([1, 0.45, 0.2, 0.1]), mesh: waveOf([1, 0.3, 0.15, 0.1, 0.05]), buzz: waveOf(buzz),
    };
    N.rattle = chain(loopN(slowBuf, 0.6), gainN(0.5));     // axle rattle AM, shared by the rolling voices
    N.chatter = chain(loopN(slowBuf, 1.3), gainN(0.6));    // wall-scrape chatter AM
    motor = buildMotor();
    set(N.master.gain, masterGain(), 0.05);
    queueBanks(); decodeAssets();
    document.addEventListener('visibilitychange', onVis);
    return true;
  }
  function onVis() {
    try {
      if (!ctx || broken) return;
      if (document.hidden) { if (ctx.state === 'running') quiet(ctx.suspend()); }
      else if (enabled && ctx.state !== 'running') quiet(ctx.resume());
    } catch (e) { fail(e); }
  }
  function init() {
    if (broken) return Promise.resolve(false);
    try {
      subscribe();
      if (!ctx && !build()) return Promise.resolve(false);
      const s = ctx.createBufferSource();             // iOS: start something inside the gesture
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); s.connect(ctx.destination); s.start(0);
      if (!enabled) { quiet(ctx.suspend()); return Promise.resolve(false); }
      if (ctx.state === 'running') return Promise.resolve(true);
      return Promise.resolve(ctx.resume()).then(() => ctx.state === 'running', () => false);
    } catch (e) { fail(e); broken = true; return Promise.resolve(false); }
  }
  function setEnabled(on) {
    try {
      enabled = !!on;
      if (!ctx || broken) return;
      set(N.master.gain, masterGain(), 0.04);
      if (enabled) { if (ctx.state !== 'running' && !document.hidden) quiet(ctx.resume()); }
      else setTimeout(() => { try { if (!enabled && ctx.state === 'running') quiet(ctx.suspend()); } catch (_) { /* ignore */ } }, 250);
    } catch (e) { fail(e); }
  }
  function setVolume(v) {
    try { volume = clamp(fin(+v, volume), 0, 1); if (ctx && !broken) set(N.master.gain, masterGain(), 0.05); } catch (e) { fail(e); }
  }
  function listen(L) {
    const l = ctx.listener, p = L.pos, f = L.fwd || { x: 0, y: 0, z: -1 }, u = L.up || { x: 0, y: 1, z: 0 };
    const v = [fin(p.x, 0), fin(p.y, 0), fin(p.z, 0), fin(f.x, 0), fin(f.y, 0), fin(f.z, -1), fin(u.x, 0), fin(u.y, 1), fin(u.z, 0)];
    const cx = v[4] * v[8] - v[5] * v[7], cy = v[5] * v[6] - v[3] * v[8], cz = v[3] * v[7] - v[4] * v[6];
    if (cx * cx + cy * cy + cz * cz < 1e-6) { v[6] = 0; v[7] = 0; v[8] = -1; }   // looking straight down: north is up
    if (l.positionX) {
      const ps = [l.positionX, l.positionY, l.positionZ, l.forwardX, l.forwardY, l.forwardZ, l.upX, l.upY, l.upZ];
      for (let i = 0; i < 9; i++) set(ps[i], v[i], 0.02);
    } else { l.setPosition(v[0], v[1], v[2]); l.setOrientation(v[3], v[4], v[5], v[6], v[7], v[8]); }
  }
  // called every rendered frame, after the sim has stepped
  function update(dt, sim, listener) {
    if (!ctx || broken) return;
    try {
      dt = clamp(fin(dt, 0.016), 0, 0.25);
      tokens = Math.min(8, tokens + dt * P.jointRate);
      duck *= Math.exp(-dt / 0.3);
      set(N.master.gain, masterGain(), 0.05); set(N.motor.gain, P.motor); set(N.roll.gain, P.roll);
      set(N.sfx.gain, P.sfx); set(N.verbIn.gain, P.reverb);
      if (listener && listener.pos) listen(listener);
      if (active.size) { const old = ctx.currentTime - 1; for (const v of active) if (v.end < old) release(v); }
      if (!sim) return;
      tScale = fin(sim.cfg && sim.cfg.timeScale, 1) || 1;
      let frozen = false;                             // a paused sim silences the continuous sound
      if (typeof sim.time === 'number') {
        frozenFor = sim.time === lastSimT ? frozenFor + dt : 0;
        lastSimT = sim.time; simT0 = sim.time; frozen = frozenFor > 0.25;
      }
      const tel = sim.power && typeof sim.power.telemetry === 'function' ? sim.power.telemetry() : null;
      if (tel) { foamV = fin(tel.foamSpeed, 0); motorUpdate(tel, frozen); }
      if (Array.isArray(sim.cars)) carsUpdate(sim.cars, frozen);
    } catch (e) { fail(e); }
  }
  function stats() {
    try {
      const r = N && N.comp.reduction;
      return {
        state: ctx ? ctx.state : 'none', voices: active.size, rollVoices: rolls.filter((v) => v.car).length,
        started: st.started, dropped: st.dropped, gated: st.gated, samples: st.samples, sampleErrors: st.sampleErr,
        banksPending: jobs.length, banks: Object.fromEntries(Object.keys(banks).map((k) => [k, banks[k].length])),
        events: Object.assign({}, st.events), errors, broken, reduction: fin(r && typeof r === 'object' ? r.value : r, 0),
      };
    } catch (e) { fail(e); return null; }
  }
  function meter() {                   // peak / RMS of the output and of the limiter input (dev tool)
    if (!ctx || broken) return null;
    try { return readMeters(); } catch (e) { fail(e); return null; }
  }
  function readMeters() {
    if (!ana) {
      ana = { out: ctx.createAnalyser(), pre: ctx.createAnalyser(), buf: new Float32Array(2048) };
      ana.out.fftSize = ana.pre.fftSize = 2048; N.clip.connect(ana.out); N.master.connect(ana.pre);
    }
    const read = (a) => {
      a.getFloatTimeDomainData(ana.buf); let pk = 0, ss = 0;
      for (let i = 0; i < ana.buf.length; i++) { const x = ana.buf[i]; ss += x * x; if (Math.abs(x) > pk) pk = Math.abs(x); }
      return { peak: pk, rms: Math.sqrt(ss / ana.buf.length) };
    };
    return { out: read(ana.out), pre: read(ana.pre) };
  }

  subscribe();
  HW.audio = {
    init, setEnabled, setVolume, update,
    get enabled() { return enabled; },
    get ready() { return !!ctx && !broken && ctx.state === 'running'; },
    params: P, stats, meter,
  };
})(window.HW);
