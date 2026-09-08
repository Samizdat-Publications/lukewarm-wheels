// 60-ui.js — control panel (SPEC s5.10): booster switch, run buttons, car chips with
// lane placement, SVG gauges, event log, camera row, tuning drawer bound to HW.config.
// Injects its own <style> + DOM; index.html carries no panel markup. Every use of
// HW.render is guarded: it may still be the stub, in which case 90-main uses debugRender.
(function (HW) {
  const cfg = HW.config, D = HW.config.defaults, U = HW.units;
  const NS = 'http://www.w3.org/2000/svg';

  // ---- config <-> location.hash (a track rebuild without HW.render.rebuild reloads) ----
  function serialiseConfig() {
    const diff = {};
    for (const k in D) if (cfg[k] !== D[k]) diff[k] = cfg[k];
    return 'cfg=' + encodeURIComponent(JSON.stringify(diff));
  }
  (function applyHash() {                       // at SCRIPT LOAD time: 90-main boots on hw:libs-ready
    const m = /(?:^#|[#&])cfg=([^&]*)/.exec(location.hash || ''); if (!m) return;
    try {
      const o = JSON.parse(decodeURIComponent(m[1])); let n = 0;
      for (const k in o) if (k in D && typeof o[k] === typeof D[k]) { cfg[k] = o[k]; n++; }
      HW.log('ui: restored ' + n + ' config keys from location.hash');
    } catch (e) { console.warn('[HW] ui: unreadable config hash', e); }
  })();

  // ---- tiny DOM helpers ------------------------------------------------------
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const sv = (tag, a) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const add = (p, ...kids) => { for (const k of kids) p.appendChild(k); return p; };
  function fmt(v) {
    const a = Math.abs(v);
    if (a >= 1e5 || (a > 0 && a < 0.01)) return v.toExponential(2);   // foamK, motorKe/Kt read as exponents
    if (a >= 1000) return v.toFixed(0);
    if (a >= 100) return v.toFixed(1);
    if (a >= 10) return v.toFixed(2);
    if (a >= 1) return v.toFixed(2);
    return v.toFixed(3);
  }

  // ---- gauge: 240 deg arc + needle, updated by mutating three attributes ------
  const R = 32, CX = 50, CY = 44, ARC = 2 * Math.PI * R * (240 / 360);
  function arcPath() {
    const p = (deg) => { const a = deg * Math.PI / 180; return (CX + R * Math.cos(a)).toFixed(2) + ' ' + (CY - R * Math.sin(a)).toFixed(2); };
    return 'M' + p(210) + 'A' + R + ' ' + R + ' 0 1 1 ' + p(-30);
  }
  function gauge(label, unit, min, max, color) {
    const box = el('div', 'g'); add(box, el('div', 'glab', label));
    const svg = sv('svg', { viewBox: '0 0 100 64' });
    const val = sv('path', { d: arcPath(), class: 'garc gv', stroke: color, 'stroke-dasharray': ARC.toFixed(2), 'stroke-dashoffset': ARC.toFixed(2) });
    const nd = sv('g', { transform: 'rotate(0 ' + CX + ' ' + CY + ')' });
    add(nd, sv('line', { x1: CX, y1: CY, x2: (CX - 26 * Math.cos(Math.PI / 6)).toFixed(2), y2: (CY + 26 * Math.sin(Math.PI / 6)).toFixed(2), class: 'gneedle' }),
      sv('circle', { cx: CX, cy: CY, r: 3.2, class: 'ghub' }));
    add(svg, sv('path', { d: arcPath(), class: 'garc gt' }), val, nd);
    const num = el('b', null, '--'), un = el('span', null, unit);
    add(box, svg, add(el('div', 'gnum'), num, un));
    let last = NaN;
    return { el: box, set(x) {
      if (!isFinite(x)) x = 0;
      if (x === last) return; last = x;
      const f = Math.max(0, Math.min(1, (x - min) / (max - min)));
      nd.setAttribute('transform', 'rotate(' + (240 * f).toFixed(1) + ' ' + CX + ' ' + CY + ')');
      val.setAttribute('stroke-dashoffset', (ARC * (1 - f)).toFixed(2));
      num.textContent = fmt(x);
    } };
  }

  // ---- tuning drawer spec: 0.25x-4x for constants, 0-1 for fractions, +-40% geometry --
  const mul = (k, lo, hi) => ({ min: D[k] * lo, max: D[k] * hi });
  const TUNE = [
    ['Foam booster', [
      { k: 'foamK', unit: 'dyne/cm', ...mul('foamK', 0.25, 4) },
      { k: 'foamMu', unit: 'mu', min: 0.05, max: 2 },
      { k: 'slipVel', unit: 'cm/s', ...mul('slipVel', 0.25, 4) },
      { k: 'boostPushFrac', unit: '', min: 0, max: 1 },
    ]],
    ['Motor / battery', [
      { k: 'motorKe', unit: 'V.s/rad', ...mul('motorKe', 0.25, 4) },
      { k: 'motorKt', unit: 'N.m/A', ...mul('motorKt', 0.25, 4) },
      { k: 'motorR', unit: 'ohm', ...mul('motorR', 0.25, 4) },
      { k: 'gearRatio', unit: ':1', ...mul('gearRatio', 0.25, 4) },
      { k: 'foamWheelMassG', unit: 'g', ...mul('foamWheelMassG', 0.25, 4) },
      { k: 'battHealth', unit: 'xR', min: 0.5, max: 4 },
      { k: 'battUsedFrac', unit: 'SoD', min: 0, max: 1, rebuild: true },
    ]],
    ['Cars', [
      { k: 'crrScale', unit: 'x', min: 0, max: 4 },
      { k: 'wallFriction', unit: 'mu', min: 0, max: 1 },
      { k: 'carFriction', unit: 'mu', min: 0, max: 1 },
      { k: 'frictionSlip', unit: '', min: 0.05, max: 2, rebuild: true },
      { k: 'sideFriction', unit: '', min: 0, max: 1, rebuild: true },
      { k: 'comDrop', unit: 'cm', min: 0, max: 1.2, rebuild: true },
    ]],
    ['Track geometry', [
      { k: 'lobeLift', unit: 'cm', ...mul('lobeLift', 0.6, 1.4), rebuild: true },
      { k: 'lobeBlend', unit: '', min: 0, max: 1, rebuild: true },
      { k: 'straightLen', unit: 'cm', ...mul('straightLen', 0.6, 1.4), rebuild: true },
      { k: 'junctionRadius', unit: 'cm', ...mul('junctionRadius', 0.6, 1.4), rebuild: true },
      { k: 'laneOffset', unit: 'cm', ...mul('laneOffset', 0.6, 1.4), rebuild: true },
      { k: 'boosterR', unit: 'cm', ...mul('boosterR', 0.6, 1.4), rebuild: true },
      { k: 'lobeWallHeight', unit: 'cm', ...mul('lobeWallHeight', 0.6, 1.4), rebuild: true },
      { k: 'wallHeight', unit: 'cm', ...mul('wallHeight', 0.6, 1.4), rebuild: true },
    ]],
  ];

  const CSS = `
#hwui,#hwui *{box-sizing:border-box}
#hwui{position:fixed;inset:0;z-index:5;pointer-events:none;color:#dfe3ec;font:12px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif}
#hwui>*{pointer-events:auto}
.hwp{position:absolute;left:0;top:0;bottom:0;width:300px;padding:10px 12px 18px;background:rgba(13,15,20,.94);border-right:1px solid #2b303c;overflow:hidden auto;transition:transform .18s ease;scrollbar-width:thin;scrollbar-color:#39404f transparent}
#hwui.hid .hwp{transform:translateX(-302px)}
.hwtab{position:absolute;left:8px;top:8px;display:none;width:32px;height:32px;font-size:15px}
#hwui.hid .hwtab{display:block}
#hwui h1{margin:0;font-size:15px;letter-spacing:.02em;font-weight:650}
#hwui h1 small{display:block;font-size:10px;font-weight:400;color:#7d879b;letter-spacing:.08em;text-transform:uppercase}
.hd{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px}
.sec{margin:12px 0 0;padding-top:10px;border-top:1px solid #222834}
.sect{font-size:9.5px;letter-spacing:.11em;text-transform:uppercase;color:#79839a;margin-bottom:6px}
button,.btn{font:inherit;color:#dfe3ec;background:#1c212c;border:1px solid #333b4a;border-radius:6px;padding:6px 8px;cursor:pointer}
button:hover{background:#252c3a;border-color:#48536a}
button:active{transform:translateY(1px)}
.row{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.row.r3{grid-template-columns:1fr 1fr 1fr}
/* booster slide switch */
.swwrap{display:flex;align-items:center;gap:10px;margin:2px 0 2px}
.sw{position:relative;width:96px;height:38px;border-radius:19px;background:#241417;border:1px solid #4a2026;cursor:pointer;flex:0 0 auto;transition:background .15s,border-color .15s;padding:0}
.sw.on{background:#c0181c;border-color:#ff6a5e;box-shadow:0 0 12px rgba(224,40,40,.45)}
.knob{position:absolute;top:3px;left:3px;width:30px;height:30px;border-radius:50%;background:linear-gradient(#f2f4f8,#b9c0cd);transition:left .15s ease}
.sw.on .knob{left:63px}
.swst{font-size:16px;font-weight:700;letter-spacing:.06em;color:#8a5158}
.swst.on{color:#ff7b6f}
.swsub{font-size:10px;color:#79839a}
/* car chips */
.chips{display:flex;flex-direction:column;gap:4px}
.chip{display:flex;align-items:center;gap:7px;padding:5px 7px;text-align:left;width:100%}
.chip i{width:11px;height:11px;border-radius:3px;flex:0 0 auto;box-shadow:inset 0 0 0 1px rgba(0,0,0,.4)}
.chip .cn{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chip .cl{font:10px ui-monospace,Consolas,monospace;color:#79839a}
.chip.sel{border-color:#ff9a3c;background:#2a2318}
.chip.up{opacity:.62}
.chip.arm{border-color:#3ddc84;background:#16281e;opacity:1}
.hint{margin-top:5px;font-size:10.5px;color:#8b94a8;min-height:26px}
.hint.act{color:#3ddc84}
/* gauges */
.gg{display:grid;grid-template-columns:1fr 1fr;gap:6px 8px}
.g{background:#151a23;border:1px solid #232a36;border-radius:7px;padding:5px 4px 4px;text-align:center}
.glab{font-size:9px;letter-spacing:.05em;color:#79839a;text-transform:uppercase;white-space:nowrap;overflow:hidden}
.g svg{width:100%;height:auto;display:block}
.garc{fill:none;stroke-width:6;stroke-linecap:round}
.gt{stroke:#252c39}
.gneedle{stroke:#e9edf6;stroke-width:2.2;stroke-linecap:round}
.ghub{fill:#e9edf6}
.gnum{font:600 13px/1.1 ui-monospace,Consolas,monospace;margin-top:-2px}
.gnum span{font-size:9px;font-weight:400;color:#79839a;margin-left:3px}
.stats{display:flex;gap:8px;margin-top:7px}
.stat{flex:1;background:#151a23;border:1px solid #232a36;border-radius:7px;padding:5px 7px}
.stat b{display:block;font:600 17px/1.15 ui-monospace,Consolas,monospace}
.stat s{display:block;text-decoration:none;font-size:9px;letter-spacing:.05em;color:#79839a;text-transform:uppercase}
/* log */
.log{list-style:none;margin:0;padding:0;font:10.5px/1.5 ui-monospace,Consolas,monospace}
.log li{padding:2px 6px;border-left:2px solid #333b4a;margin-bottom:2px;background:#141922;color:#b9c1d2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.log li.crash{border-color:#e04a2f;color:#ffb9a6}
.log li.stall{border-color:#e0b52f}
.log li.lap{border-color:#3ddc84}
.log li.off{border-color:#6a7488}
.log li.em{color:#5f6879;border-color:#262d3a}
/* tuning */
details.tune{margin-top:10px;border-top:1px solid #222834;padding-top:8px}
details.tune>summary{cursor:pointer;list-style:none;font-size:9.5px;letter-spacing:.11em;text-transform:uppercase;color:#9aa4b8;display:flex;justify-content:space-between}
details.tune>summary::-webkit-details-marker{display:none}
details.tune[open]>summary .car{transform:rotate(90deg)}
.car{display:inline-block;transition:transform .15s}
.tg{margin:9px 0 2px;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#6f788b}
.sl{margin-bottom:5px}
.sl .lb{display:flex;justify-content:space-between;align-items:baseline;gap:4px}
.sl .lb b{font-weight:500;font-size:11px}
.sl .lb em{font:10px ui-monospace,Consolas,monospace;font-style:normal;color:#9aa4b8;white-space:nowrap}
.sl .lb em i{font-style:normal;color:#6b7488}
.bd{font:8.5px/1 system-ui;letter-spacing:.04em;text-transform:uppercase;color:#8a7327;border:1px solid #6a5a24;border-radius:3px;padding:1px 3px;margin-left:4px}
.bd.hot{color:#1a1d24;background:#e0b52f;border-color:#e0b52f}
input[type=range]{width:100%;height:16px;margin:1px 0 0;-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer}
input[type=range]::-webkit-slider-runnable-track{height:3px;border-radius:2px;background:#2e3644}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;margin-top:-5px;width:13px;height:13px;border-radius:50%;background:#ff8c2b;border:0}
input[type=range]::-moz-range-track{height:3px;border-radius:2px;background:#2e3644}
input[type=range]::-moz-range-thumb{width:13px;height:13px;border:0;border-radius:50%;background:#ff8c2b}
label.cb{display:flex;align-items:center;gap:5px;cursor:pointer;padding:6px 8px;border:1px solid #333b4a;border-radius:6px;background:#1c212c}
.foot{margin-top:12px;padding-top:8px;border-top:1px solid #222834;font:10px/1.6 ui-monospace,Consolas,monospace;color:#6e7789}
.foot kbd{color:#c3cbdb;background:#1c212c;border:1px solid #333b4a;border-radius:3px;padding:0 3px}
.toast{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);background:rgba(20,24,32,.95);border:1px solid #3a4356;border-radius:7px;padding:7px 14px;opacity:0;transition:opacity .2s;pointer-events:none;box-shadow:0 6px 22px rgba(0,0,0,.5)}
.toast.show{opacity:1}
`;

  // ---------------------------------------------------------------------------
  const ui = {
    selected: null, root: null, armed: null, ready: false,
    gauges: {}, chips: [], sliders: [], log: [],

    init() {
      if (ui.ready) return; ui.ready = true;
      const hud = document.getElementById('hud'); if (hud) hud.style.display = 'none';
      add(document.head, add(el('style'), document.createTextNode(CSS)));
      const root = ui.root = el('div'); root.id = 'hwui';
      const p = el('aside', 'hwp');
      const tab = el('button', 'hwtab', '☰'); tab.title = 'Show panel';
      tab.onclick = () => root.classList.remove('hid');
      const toastEl = el('div', 'toast');
      add(root, p, tab, toastEl); document.body.appendChild(root);
      ui._toast = toastEl;

      // ---- header + booster switch -----------------------------------------
      const h1 = el('h1', null, 'Criss Cross Crash'); add(h1, el('small', null, 'Mattel V2791 · 1999 five-pack'));
      const hide = el('button', null, '«'); hide.title = 'Collapse panel'; hide.onclick = () => root.classList.add('hid');
      add(p, add(el('div', 'hd'), h1, hide));

      const sw = el('button', 'sw'); sw.setAttribute('role', 'switch'); sw.title = 'Booster motor (Space)';
      add(sw, el('div', 'knob'));
      const swSt = el('div', 'swst', 'OFF');
      sw.onclick = () => HW.sim.toggleSwitch();
      add(p, add(el('div', 'swwrap'), sw, add(el('div'), swSt, el('div', 'swsub', 'Booster motor'))));
      ui._setSwitch = (on) => { sw.classList.toggle('on', !!on); swSt.classList.toggle('on', !!on); swSt.textContent = on ? 'ON' : 'OFF'; };

      // ---- run buttons ------------------------------------------------------
      const mk = (txt, fn, title) => { const b = el('button', null, txt); b.onclick = fn; if (title) b.title = title; return b; };
      add(p, add(el('div', 'sec'),
        add(el('div', 'row'),
          mk('Line up all five', () => { HW.sim.lineUpFive(); ui.showToast('Five cars at the booster gates'); }, 'L'),
          mk('Reset', () => { HW.sim.reset(); ui.showToast('Reset'); }, 'R'),
          mk('Nudge', () => {
            const c = ui.selected;
            if (c && !c.lifted) { c.nudge(); ui.showToast('Nudged ' + c.entry.name); }
            else { HW.sim.nudgeStalled(); ui.showToast('Nudged all stalled cars'); }
          }, 'N — selected car, else every stalled car'),
          mk('Lift all', () => { for (const c of HW.sim.cars) c.lift(); ui.selected = null; ui.armed = null; ui.syncChips(); ui.showToast('All cars lifted'); }))));

      // ---- car chips --------------------------------------------------------
      const chipBox = el('div', 'chips'), hint = el('div', 'hint');
      ui._hint = hint;
      add(p, add(el('div', 'sec'), el('div', 'sect', 'Cars'), chipBox, hint));
      ui._chipBox = chipBox;
      ui.buildChips();

      // ---- gauges -----------------------------------------------------------
      const gg = el('div', 'gg');
      const G = ui.gauges = {
        battV: gauge('Battery', 'V', 0, 6.5, '#3ddc84'),
        motorA: gauge('Motor', 'A', 0, 4, '#ffcf3c'),
        rpm: gauge('Motor rpm', 'rpm', 0, 16000, '#5ab7ff'),
        surf: gauge('Foam surface', 'cm/s', 0, 600, '#ff8c2b'),
        carV: gauge('Car speed', 'cm/s', 0, 600, '#ff5d5d'),
        carKmh: gauge('Scale 1:64', 'km/h', 0, 1400, '#c07bff'),
      };
      for (const k in G) add(gg, G[k].el);
      const crashN = el('b', null, '0'), lapN = el('b', null, '0');
      const stats = add(el('div', 'stats'),
        add(el('div', 'stat'), crashN, el('s', null, 'Crashes')),
        add(el('div', 'stat'), lapN, el('s', null, 'Laps (all cars)')));
      ui._crashN = crashN; ui._lapN = lapN;
      add(p, add(el('div', 'sec'), el('div', 'sect', 'Gauges'), gg, stats));

      // ---- event log --------------------------------------------------------
      const logEl = el('ul', 'log'); ui._logEl = logEl;
      add(p, add(el('div', 'sec'), el('div', 'sect', 'Events'), logEl));
      ui.pushLog('em', 'waiting for the first lap…');

      // ---- camera row -------------------------------------------------------
      const camSec = el('div', 'sec'); ui._camSec = camSec;
      add(p, camSec); ui.buildCameras();

      // ---- tuning drawer ----------------------------------------------------
      add(p, ui.buildTuning());

      // ---- footer -----------------------------------------------------------
      const foot = el('div', 'foot');
      foot.innerHTML = '<kbd>Space</kbd> booster &nbsp;<kbd>L</kbd> line up &nbsp;<kbd>R</kbd> reset<br>' +
        '<kbd>N</kbd> nudge stalled &nbsp;<kbd>1</kbd>&ndash;<kbd>5</kbd> drop car at its gate';
      add(p, foot);

      ui.wireEvents();
      ui.syncChips();
    },

    // ---- car chips ---------------------------------------------------------
    buildChips() {
      const box = ui._chipBox; box.textContent = ''; ui.chips = [];
      HW.catalog.forEach((entry, i) => {
        const c = el('button', 'chip'), sw = el('i'), laps = el('span', 'cl', '0 laps');
        sw.style.background = entry.color;
        add(c, sw, el('span', 'cn', entry.name), laps);
        let t = null;
        c.addEventListener('click', () => { if (t) return; t = setTimeout(() => { t = null; ui.chipClick(i); }, 200); });
        c.addEventListener('dblclick', () => { clearTimeout(t); t = null; ui.chipDouble(i); });
        c.title = entry.name + ' — click to select / lift, again to arm placement, double-click to drop at its gate';
        add(box, c); ui.chips.push({ el: c, laps, lapN: -1 });
      });
    },
    chipClick(i) {
      const car = HW.sim.cars[i]; if (!car) return;
      ui.selected = car;
      if (car.lifted) ui.armed = car;                    // lifted -> arm lane placement
      else { car.lift(); ui.armed = null; }              // placed  -> lift it off the track
      ui.syncChips();
    },
    chipDouble(i) {
      const car = HW.sim.cars[i]; if (!car) return;
      ui.selected = car; ui.armed = null;
      try { car.spawnAtGate(HW.sim.track.lineUp[i % HW.sim.track.lineUp.length]); ui.showToast(car.entry.name + ' at gate ' + car.gate); }
      catch (e) { ui.showToast('Could not drop at gate'); console.warn(e); }
      ui.syncChips();
    },
    select(car) { ui.selected = car || null; if (ui.armed !== car) ui.armed = null; ui.syncChips(); },
    syncChips() {
      ui.chips.forEach((c, i) => {
        const car = HW.sim && HW.sim.cars ? HW.sim.cars[i] : null;
        c.el.classList.toggle('sel', !!car && car === ui.selected);
        c.el.classList.toggle('up', !!car && car.lifted);
        c.el.classList.toggle('arm', !!car && car === ui.armed);
      });
      const h = ui._hint, s = ui.selected;
      h.classList.toggle('act', !!ui.armed);
      if (ui.armed) h.textContent = 'Placement armed: click a lane in the 3D view to drop ' + ui.armed.entry.name + ' there (Esc cancels).';
      else if (s && !s.lifted) h.textContent = s.entry.name + ' selected — click its chip again to lift it off the track.';
      else if (s) h.textContent = s.entry.name + ' is lifted — click its chip to arm lane placement, or double-click for its gate.';
      else h.textContent = 'Click a car to select it. Double-click drops it at its own booster gate.';
    },

    // ---- camera row (HW.render may be a stub) ------------------------------
    buildCameras() {
      const sec = ui._camSec; sec.textContent = '';
      const names = (HW.render && HW.render.cameraNames) || null;
      add(sec, el('div', 'sect', 'Camera'));
      if (names && names.length) {
        const row = el('div', 'row' + (names.length % 3 === 0 ? ' r3' : ''));
        for (const n of names) { const b = el('button', null, n); b.onclick = () => { try { HW.render.setCamera(n); } catch (e) { console.warn(e); } ui.showToast('Camera: ' + n); }; add(row, b); }
        add(sec, row);
      } else add(sec, el('div', 'hint', 'Orbit with the mouse (camera presets arrive with the 3D renderer).'));
      const cb = el('label', 'cb'), box = el('input');
      box.type = 'checkbox'; box.disabled = !(HW.render && HW.render.xray);
      box.onchange = () => { try { HW.render.xray(box.checked); } catch (e) { console.warn(e); } };
      add(cb, box, el('span', null, 'X-ray hub / gear train'));
      cb.style.marginTop = '6px'; add(sec, cb);
    },

    // ---- tuning drawer -----------------------------------------------------
    buildTuning() {
      const d = el('details', 'tune');
      const sum = el('summary'); add(sum, add(el('span'), el('span', 'car', '▸'), document.createTextNode(' Tuning')), el('span', null, 'HW.config'));
      add(d, sum);
      ui.sliders = [];
      for (const [group, keys] of TUNE) {
        add(d, el('div', 'tg', group));
        for (const spec of keys) {
          const row = el('div', 'sl'), lb = el('div', 'lb'), name = el('b', null, spec.k), vs = el('em');
          const num = document.createTextNode(''), unit = el('i', null, spec.unit ? ' ' + spec.unit : '');
          add(vs, num, unit);
          if (spec.rebuild) add(name, el('span', 'bd', 'rebuild'));
          add(lb, name, vs);
          const inp = el('input'); inp.type = 'range';
          inp.min = spec.min; inp.max = spec.max; inp.step = (spec.max - spec.min) / 500;
          const rec = { spec, inp, num, badge: spec.rebuild ? name.lastChild : null };
          inp.oninput = () => {
            cfg[spec.k] = +inp.value; num.textContent = fmt(cfg[spec.k]);
            if (rec.badge) rec.badge.classList.add('hot');
            if (spec.rebuild) ui._dirty = true;
          };
          add(row, lb, inp); add(d, row); ui.sliders.push(rec);
        }
      }
      const btns = el('div', 'row'); btns.style.marginTop = '10px';
      const rb = el('button', null, 'Rebuild track'); rb.onclick = () => ui.rebuild();
      const df = el('button', null, 'Defaults'); df.onclick = () => { cfg.reset(); ui.syncSliders(); ui.showToast('Config back to defaults'); };
      add(btns, rb, df); add(d, btns);
      ui.syncSliders();
      return d;
    },
    syncSliders() {
      for (const r of ui.sliders) {
        r.inp.value = cfg[r.spec.k];
        r.num.textContent = fmt(cfg[r.spec.k]);
        if (r.badge) r.badge.classList.remove('hot');
      }
      ui._dirty = false;
    },
    rebuild() {
      if (HW.render && HW.render.rebuild) {
        HW.sim.create();
        try { HW.render.rebuild(); } catch (e) { console.error(e); }
        ui.showToast('Track rebuilt'); ui.syncSliders();
      } else {
        ui.showToast('Reloading with the new geometry…');
        location.hash = serialiseConfig();
        setTimeout(() => location.reload(), 120);
      }
    },

    // ---- log ---------------------------------------------------------------
    pushLog(kind, text) {
      const li = el('li', kind, text); li.title = text;
      const l = ui._logEl; l.insertBefore(li, l.firstChild);
      while (l.childNodes.length > 6) l.removeChild(l.lastChild);
    },

    showToast(msg) {
      const t = ui._toast; if (!t) return;
      t.textContent = msg; t.classList.add('show');
      clearTimeout(ui._toastT); ui._toastT = setTimeout(() => t.classList.remove('show'), 1800);
    },

    // ---- wiring ------------------------------------------------------------
    wireEvents() {
      const nm = (c) => (c && c.entry ? c.entry.name : 'car');
      HW.bus.on('switch', (on) => ui._setSwitch(on));
      HW.bus.on('crash', (e) => ui.pushLog('crash', nm(e.a) + ' hit ' + nm(e.b) + ' at ' + e.closing.toFixed(0) + ' cm/s'));
      HW.bus.on('stall', (e) => ui.pushLog('stall', nm(e.car) + ' stalled'));
      HW.bus.on('lap', (e) => ui.pushLog('lap', nm(e.car) + ' lap ' + e.laps));
      HW.bus.on('offtrack', (e) => ui.pushLog('off', nm(e.car) + ' left the track'));
      HW.bus.on('sim-created', () => { ui.selected = null; ui.armed = null; ui.syncChips(); ui.buildCameras(); });
      HW.bus.on('booted', () => ui.buildCameras());
      HW.bus.on('telemetry', ui.onTelemetry);

      // lane placement: NDC from the click on #view, then HW.render.pickLane
      const canvas = document.getElementById('view');
      if (canvas) {
        let dx = 0, dy = 0;
        canvas.addEventListener('pointerdown', (e) => { dx = e.clientX; dy = e.clientY; });
        canvas.addEventListener('click', (e) => {
          if (!ui.armed) return;
          if (Math.hypot(e.clientX - dx, e.clientY - dy) > 5) return;      // that was an orbit drag
          const car = ui.armed;
          if (!(HW.render && HW.render.pickLane)) { ui.showToast('Lane picking needs the 3D renderer — double-click a chip instead'); return; }
          const r = canvas.getBoundingClientRect();
          const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
          const ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
          let hit = null; try { hit = HW.render.pickLane(nx, ny); } catch (err) { console.warn('[HW] pickLane', err); }
          if (!hit || !hit.path) { ui.showToast('No lane under the cursor'); return; }
          HW.sim.placeCar(car, hit.path, hit.s, 0);
          ui.armed = null; ui.syncChips(); ui.showToast(nm(car) + ' placed on ' + (hit.path.name || 'the track'));
        });
      }
      addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
        if (e.key === 'Escape' && ui.armed) { ui.armed = null; ui.syncChips(); ui.showToast('Placement cancelled'); }
      });
    },

    onTelemetry(t) {
      const G = ui.gauges, e = t.elec;
      G.battV.set(e.V); G.motorA.set(e.I); G.rpm.set(e.rpmMotor); G.surf.set(e.surfaceSpeed);
      ui._setSwitch(e.on);
      const sel = ui.selected ? t.cars.find((c) => c.id === ui.selected.id) : null;
      const sp = sel && !sel.lifted ? sel.speed : 0;
      G.carV.set(sp); G.carKmh.set(U.cmsToScaleKmh(sp));
      if (ui._crashN.textContent !== String(t.crashes)) ui._crashN.textContent = t.crashes;
      let laps = 0;
      for (let i = 0; i < t.cars.length; i++) {
        laps += t.cars[i].laps;
        const c = ui.chips[i]; if (!c) continue;
        if (c.lapN !== t.cars[i].laps) { c.lapN = t.cars[i].laps; c.laps.textContent = c.lapN + (c.lapN === 1 ? ' lap' : ' laps'); }
      }
      if (ui._lapN.textContent !== String(laps)) ui._lapN.textContent = laps;
    },
  };

  HW.ui = ui;
})(window.HW);
