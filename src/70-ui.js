// 70-ui.js - the HUD: brand, camera bar, garage roster, power panel with the slide switch
// and gauges, action bar, speedometer, crash banner, tuning drawer and help. Plain DOM;
// every control has an id; state lives in the sim and config, the UI only mirrors it.
(function (HW) {
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  };
  const ICON = {
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m22 9-6 6M16 9l6 6"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/></svg>',
  };
  const CRASH_WORDS = ['CRASH!', 'SMASH!', 'WHAM!', 'KA-BLAM!', 'CRUNCH!', 'T-BONE!'];

  const U = (HW.ui = {
    followed: null,
    units: 'kmh',
    init(sim) {
      const root = document.getElementById('ui');
      U.sim = sim;
      try { U.units = localStorage.getItem('hw.units') || 'kmh'; } catch (e) { /* storage blocked */ }

      const L = sim.layout, set = L.set;
      U.runWord = L.start.track.closed ? 'laps' : 'runs';
      // the set picker: each set is its own page state, so switching reloads (#s.<id>)
      const pick = h('select', { id: 'set-pick', 'aria-label': 'Track set' },
        Object.values(HW.sets).map((st) => h('option', { value: st.id, text: st.name })));
      pick.value = set.id;
      pick.addEventListener('change', () => { location.hash = 's.' + pick.value; location.reload(); });
      root.append(h('div', { id: 'brand' },
        h('div', { class: 'logo', html: U.logoHtml(set.name) }),
        h('div', { class: 'tag', text: set.tag || 'live physics' }), pick));

      // camera bar
      const modes = [['orbit', 'Orbit'], ['chase', 'Chase'], ['onboard', 'Onboard'], ['top', 'Top'], ['director', 'Director']];
      U.camBtns = {};
      const seg = h('div', { class: 'seg panel', role: 'group', 'aria-label': 'Camera' },
        modes.map(([m, label]) => (U.camBtns[m] = h('button', { id: 'cam-' + m, 'aria-pressed': m === 'orbit' ? 'true' : 'false', onclick: () => U.setCam(m) }, label))));
      U.soundBtn = h('button', { id: 'btn-sound', class: 'iconbtn panel', title: 'Sound (M)', 'aria-label': 'Toggle sound', html: ICON.mute, onclick: () => U.toggleSound() });
      const gearBtn = h('button', { id: 'btn-tune', class: 'iconbtn panel', title: 'Tuning (T)', 'aria-label': 'Physics tuning', html: ICON.gear, onclick: () => U.toggleDrawer() });
      const helpBtn = h('button', { id: 'btn-help', class: 'iconbtn panel', title: 'How it works (H)', 'aria-label': 'How it works', html: ICON.help, onclick: () => U.toggleHelp() });
      root.append(h('div', { id: 'cambar' }, seg, U.soundBtn, gearBtn, helpBtn));

      // garage
      U.rows = new Map();
      const list = h('div', { class: 'list' });
      for (const car of sim.cars) {
        let thumb;
        try { thumb = HW.carModels && HW.carModels.thumbnail ? HW.carModels.thumbnail(car.entry) : null; } catch (e) { thumb = null; }
        if (!thumb) { thumb = HW.tex.canvas(128, 64); const x = thumb.getContext('2d'); x.fillStyle = car.entry.color; x.beginPath(); x.roundRect(8, 18, 112, 30, 12); x.fill(); x.fillStyle = '#111'; x.beginPath(); x.arc(34, 50, 9, 0, 7); x.arc(94, 50, 9, 0, 7); x.fill(); }
        thumb.classList.add('thumb');
        const chip = h('span', { class: 'chip', text: 'garage' });
        const meta = h('div', { class: 'meta', text: '' });
        const act = h('button', { class: 'act', title: 'Drop in / pick up', 'aria-label': 'Drop ' + car.name + ' in or pick it up', text: '+', onclick: (e) => { e.stopPropagation(); U.toggleCar(car); } });
        const row = h('div', { class: 'carrow', id: 'car-' + car.entry.id, role: 'button', tabindex: '0', 'aria-label': 'Follow ' + car.name, onclick: () => U.follow(car), onkeydown: (e) => { if (e.key === 'Enter') U.follow(car); } },
          thumb, h('div', {}, h('div', { class: 'name', text: car.name }), h('div', {}, chip, ' ', meta)), act);
        U.rows.set(car, { row, chip, meta, act });
        list.append(row);
      }
      U.crashNum = h('span', { class: 'num', text: '0' });
      U.garage = h('div', { id: 'garage', class: 'panel' },
        h('div', { class: 'head' }, h('span', { class: 'lbl', text: 'Garage · 1999 5-pack' }), h('span', {}, h('span', { class: 'lbl', text: 'crashes ' }), U.crashNum)),
        list);
      root.append(U.garage);

      // power panel
      U.switchEl = h('button', { id: 'switch', class: 'switch', role: 'switch', 'aria-checked': 'false', 'aria-label': 'Booster on/off (Space)', onclick: () => U.toggleSwitch() }, h('i'));
      const gauge = (id, label, unit) => {
        const num = h('span', { class: 'num', id: 'g-' + id, text: '--' });
        const bar = h('i');
        return { el: h('div', { class: 'gauge' }, h('div', { class: 'lbl', text: label }), h('div', {}, num, h('span', { class: 'unit', text: unit })), h('div', { class: 'bar' }, bar)), num, bar };
      };
      U.g = { volt: gauge('volt', 'Battery', 'V'), amp: gauge('amp', 'Motor', 'A'), rpm: gauge('rpm', 'Motor', 'rpm'), foam: gauge('foam', 'Foam wheel', 'cm/s'), soc: gauge('soc', 'Charge', '%'), load: gauge('load', 'Nips busy', '/8') };
      U.nNips = L.boosters.length;
      U.g.load.el.querySelector('.unit').textContent = '/' + U.nNips;
      if (U.nNips) root.append(h('div', { id: 'power', class: 'panel' },
        h('div', {}, h('div', { class: 'lbl', text: 'Booster', style: 'margin-bottom:6px' }), U.switchEl),
        h('div', { class: 'gauges' }, U.g.volt.el, U.g.amp.el, U.g.rpm.el, U.g.foam.el, U.g.soc.el, U.g.load.el)));

      // the spring launcher: strength, random shots, fire
      U.ln = L.launchers[0] || null;
      if (U.ln) {
        const ln = U.ln;
        const out = h('output', { for: 'ln-str', text: Math.round(ln.strength * 100) + '%' });
        const rng = h('input', { id: 'ln-str', type: 'range', min: '30', max: '100', step: '1', value: String(Math.round(ln.strength * 100)), 'aria-label': 'Launch strength' });
        rng.addEventListener('input', () => { ln.strength = +rng.value / 100; out.textContent = rng.value + '%'; ln.vary = false; vary.checked = false; });
        const vary = h('input', { id: 'ln-vary', type: 'checkbox' }); vary.checked = ln.vary;
        vary.addEventListener('change', () => { ln.vary = vary.checked; });
        const auto = h('input', { id: 'ln-auto', type: 'checkbox' }); auto.checked = ln.auto;
        auto.addEventListener('change', () => { ln.auto = auto.checked; });
        U.lnReady = h('span', { class: 'chip', text: 'empty' });
        U.lnLast = h('div', { class: 'last', text: 'No shot yet' });
        root.append(h('div', { id: 'launch', class: 'panel' },
          h('div', { class: 'row' }, h('span', { class: 'lbl', text: 'Launcher' }), U.lnReady),
          h('div', { class: 'row' }, h('label', { for: 'ln-str', class: 'lbl', text: 'Pull' }), rng, out),
          h('div', { class: 'row' }, h('label', { class: 'check', for: 'ln-vary' }, vary, 'Random'), h('label', { class: 'check', for: 'ln-auto' }, auto, 'Auto-fire'),
            h('button', { id: 'btn-fire', class: 'hot', onclick: () => U.fire(), title: 'Fire the launcher (F)' }, 'Fire')),
          U.lnLast));
        HW.bus.on('launch', (e) => {
          const pct = Math.round(e.strength * 100);
          U.lnLast.textContent = e.car.name + ' · ' + pct + '% · ' + Math.round(e.speed) + ' cm/s';
          if (ln.vary) { rng.value = String(pct); out.textContent = pct + '%'; }
        });
      }

      // action bar
      U.slowBtn = h('button', { id: 'btn-slow', onclick: () => U.toggleSlow(), title: 'Slow motion (S)' }, 'Slow-mo');
      root.append(h('div', { id: 'actions', class: 'panel' },
        h('button', { id: 'btn-add', class: 'hot', onclick: () => U.addCar(), title: 'Drop the next car in (A)' }, 'Add car'),
        h('button', { id: 'btn-lineup', onclick: () => sim.lineUpAll(), title: 'Line up all five (L)' }, 'Line up all 5'),
        h('button', { id: 'btn-nudge', onclick: () => sim.nudge(), title: 'Flick stalled cars (N)' }, 'Nudge'),
        U.slowBtn,
        (U.replayBtn = h('button', { id: 'btn-replay', onclick: () => U.toggleReplay(), title: 'Instant replay of the last crash (R)' }, 'Replay')),
        h('button', { id: 'btn-reset', onclick: () => U.reset(), title: 'Take every car off the track' }, 'Clear track')));
      U.replayBadge = h('div', { id: 'replay-badge', class: 'panel', role: 'status' }, h('span', { class: 'dot' }), 'Replay · click to return');
      U.replayBadge.hidden = true;
      U.replayBadge.addEventListener('click', () => HW.replay.stop());
      root.append(U.replayBadge);
      HW.bus.on('replay', (e) => { U.replayBadge.hidden = !e.on; U.replayBtn.classList.toggle('hot', e.on); });
      HW.bus.on('crash', () => { U.replayBtn.classList.add('fresh'); clearTimeout(U._rpT); U._rpT = setTimeout(() => U.replayBtn.classList.remove('fresh'), 6000); });

      // speedometer
      U.speedBig = h('div', { class: 'big', html: '0<small>cm/s</small>' });
      U.speedScale = h('div', { class: 'scale', text: '' });
      U.speedName = h('div', { class: 'lbl', text: 'Fastest car' });
      root.append(h('div', { id: 'speedo', class: 'panel' }, U.speedName, U.speedBig, U.speedScale));

      // crash banner
      U.toastWord = h('div', { class: 'word', text: 'CRASH!' });
      U.toastWho = h('div', { class: 'who', text: '' });
      U.toast = h('div', { id: 'toast', 'aria-live': 'polite' }, U.toastWord, U.toastWho);
      root.append(U.toast);

      U.hint = h('div', { id: 'hint', class: 'panel', text: 'Click a car to follow it · Space switches the booster · crashed cars are carried back to START' });
      root.append(U.hint);
      setTimeout(() => { U.hint.hidden = true; }, 9000);

      U.buildDrawer(root);
      U.buildHelp(root);

      // events
      HW.bus.on('crash', (e) => U.onCrash(e));
      HW.bus.on('switch', () => U.syncSwitch());
      HW.bus.on('camera', (e) => { for (const [k, b] of Object.entries(U.camBtns)) b.setAttribute('aria-pressed', k === e.mode ? 'true' : 'false'); });
      addEventListener('keydown', (e) => U.onKey(e));
      U.syncSwitch();
    },

    // ---------------------------------------------------------------- actions
    firstGesture() { if (!U._audioStarted && HW.audio && HW.audio.init) { U._audioStarted = true; try { HW.audio.init(); U.syncSound(); } catch (e) { console.warn(e); } } },
    toggleSwitch() { U.firstGesture(); U.sim.setSwitch(!U.sim.power.state.on); },
    syncSwitch() { if (U.switchEl) U.switchEl.setAttribute('aria-checked', U.sim.power.state.on ? 'true' : 'false'); },
    setCam(m) {
      U.firstGesture();
      const car = U.followed || U.sim.cars.find((c) => c.mode === 'track');
      if ((m === 'chase' || m === 'onboard') && car && !U.followed) U.follow(car, true);
      HW.cam.setMode(m, (m === 'chase' || m === 'onboard') ? (U.followed || car) : undefined);
      for (const [k, b] of Object.entries(U.camBtns)) b.setAttribute('aria-pressed', k === m ? 'true' : 'false');
    },
    follow(car, silent) {
      U.firstGesture();
      U.followed = car;
      for (const [c, r] of U.rows) r.row.classList.toggle('followed', c === car);
      if (!silent && (HW.cam.mode === 'orbit' || HW.cam.mode === 'top' || HW.cam.mode === 'director')) U.setCam('chase');
      else HW.cam.car = car;
    },
    toggleCar(car) {
      U.firstGesture();
      if (car.mode === 'parked') { if (!U.sim.power.state.on) U.sim.setSwitch(true); U.sim.launch(car); }
      else U.sim.park(car);
    },
    addCar() {
      U.firstGesture();
      const car = U.sim.cars.find((c) => c.mode === 'parked' && !U.sim.queue.some((q) => q.car === c));
      if (!car) return;
      if (!U.sim.power.state.on) U.sim.setSwitch(true);
      U.sim.launch(car);
    },
    toggleReplay() { U.firstGesture(); if (HW.replay.active) HW.replay.stop(); else HW.replay.start(U.sim); },
    toggleSlow() { U.firstGesture(); HW.main.setSlow(!HW.main.slow); U.slowBtn.setAttribute('aria-pressed', HW.main.slow ? 'true' : 'false'); U.slowBtn.classList.toggle('hot', HW.main.slow); },
    reset() { U.sim.reset(); for (const [, r] of U.rows) r.row.classList.remove('followed'); U.followed = null; if (HW.cam.mode !== 'orbit' && HW.cam.mode !== 'top' && HW.cam.mode !== 'director') U.setCam('orbit'); },
    toggleSound() {
      if (!HW.audio) return;
      if (!U._audioStarted) { U.firstGesture(); return; }
      HW.audio.setEnabled(!HW.audio.enabled);
      U.syncSound();
    },
    syncSound() { const on = HW.audio && HW.audio.enabled; U.soundBtn.innerHTML = on ? ICON.sound : ICON.mute; U.soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); },
    toggleDrawer(force) { const d = U.drawer; d.hidden = force != null ? !force : !d.hidden; U.garage.hidden = !d.hidden; },
    toggleHelp(force) { const d = U.help; d.hidden = force != null ? !force : !d.hidden; },

    onKey(e) {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); U.toggleSwitch(); }
      else if (k >= '1' && k <= '5') { const c = U.sim.cars[+k - 1]; if (c) { if (c.mode === 'parked') U.toggleCar(c); U.follow(c); } }
      else if (k === 'c') { const order = ['orbit', 'chase', 'onboard', 'top', 'director']; U.setCam(order[(order.indexOf(HW.cam.mode) + 1) % order.length]); }
      else if (k === 's') U.toggleSlow();
      else if (k === 'n') U.sim.nudge();
      else if (k === 'f') U.fire();
      else if (k === 'r') U.toggleReplay();
      else if (k === 'a') U.addCar();
      else if (k === 'l') U.sim.lineUpAll();
      else if (k === 'm') U.toggleSound();
      else if (k === 't') U.toggleDrawer();
      else if (k === 'h' || k === '?') U.toggleHelp();
      else if (k === 'escape') { U.toggleHelp(false); U.toggleDrawer(false); if (HW.replay.active) HW.replay.stop(); }
    },

    fire() {
      const ln = U.ln;
      if (!ln) return;
      if (ln.car) HW.stunts.fire(U.sim, ln, ln.vary ? null : ln.strength);
      else if (!U.sim.cars.some((c) => c.mode === 'retrieving' || U.sim.queue.some((q) => q.car === c))) U.addCar();
    },

    // 'Criss Cross Crash' -> 'Criss Cross <span>Crash</span>' (the last word in flame)
    logoHtml(name) {
      const w = String(name).split(' '), last = w.pop();
      return (w.length ? w.join(' ') + ' ' : '') + '<span>' + last + '</span>';
    },

    onCrash(e) {
      U.crashNum.textContent = String(U.sim.crashCount);
      if (e.speed < 150) return;
      U.toastWord.textContent = CRASH_WORDS[Math.floor(Math.random() * CRASH_WORDS.length)];
      U.toastWho.textContent = e.a.name + '  ×  ' + e.b.name + '  ·  ' + Math.round(e.speed) + ' cm/s';
      U.toast.classList.add('show');
      clearTimeout(U._toastT);
      U._toastT = setTimeout(() => U.toast.classList.remove('show'), 1500);
    },

    // ---------------------------------------------------------------- tuning drawer
    buildDrawer(root) {
      const cfg = HW.config;
      const fields = [
        ['charge', 'Battery charge', 0.02, 1, 0.01, (v) => Math.round(v * 100) + '%', 'Tired batteries sag under load: weaker launches, cars that miss the loops.', (v) => U.sim.power.setCharge(v)],
        ['motorR', 'Motor winding', 0.5, 2.5, 0.05, (v) => v.toFixed(2) + ' Ω', 'Lower resistance = a stronger motor that bogs less when several cars launch at once.'],
        ['foamMu', 'Foam grip', 0.3, 1.3, 0.05, (v) => v.toFixed(2), 'Friction between the foam booster wheels and the cars.'],
        ['foamK', 'Foam squeeze', 0.4e6, 2.2e6, 0.05e6, (v) => (v * 0.45 / 1e5).toFixed(1) + ' N', 'How hard a 2.45 cm wide car is pinched against the wall (force at 4.5 mm squeeze).'],
        ['muWall', 'Wall friction', 0.02, 0.45, 0.01, (v) => v.toFixed(2), 'Die-cast sliding on plastic. It is what slows cars in the banked sweeps.'],
        ['crrScale', 'Rolling resistance', 0.3, 3, 0.05, (v) => '×' + v.toFixed(2), 'Axle drag of every car. Crank it up to watch cars run out of energy.'],
        ['jointLoss', 'Track joints', 0, 0.02, 0.001, (v) => (v * 100).toFixed(1) + '%', 'Speed lost clacking over each joint between track pieces. More = more chaos.'],
        ['foamJitter', 'Uneven foam', 0, 0.1, 0.005, (v) => '±' + (v * 100).toFixed(1) + '%', 'A worn foam tyre grips each pass a little differently, so cars drift out of step and meet at the #.'],
        ['timeScale', 'Sim speed', 0.05, 1, 0.05, (v) => '×' + v.toFixed(2), 'Slow the whole world down.'],
      ];
      const body = [h('h3', { text: 'Tuning' })];
      U.fieldEls = [];
      for (const [key, label, min, max, step, fmt, hint, onset] of fields) {
        const out = h('output', { for: 'f-' + key, text: fmt(cfg[key]) });
        const inp = h('input', { id: 'f-' + key, type: 'range', min: String(min), max: String(max), step: String(step), value: String(cfg[key]) });
        inp.addEventListener('input', () => { const v = +inp.value; cfg[key] = v; out.textContent = fmt(v); if (onset) onset(v); });
        U.fieldEls.push({ key, inp, out, fmt });
        body.push(h('div', { class: 'field' }, h('label', { for: 'f-' + key, text: label }), out, inp, h('div', { class: 'hint', text: hint })));
      }
      const check = (id, label, get, set) => {
        const c = h('input', { id, type: 'checkbox' }); c.checked = get();
        c.addEventListener('change', () => set(c.checked));
        return h('label', { class: 'check', for: id }, c, label);
      };
      body.push(check('c-retrieve', 'Carry crashed cars back to START', () => cfg.autoRetrieve, (v) => { cfg.autoRetrieve = v; }));
      body.push(check('c-nudge', 'Flick stalled cars automatically', () => cfg.autoNudge, (v) => { cfg.autoNudge = v; }));
      body.push(check('c-crashcam', 'Slow-motion crash cam (Director)', () => HW.cam.crashCam, (v) => { HW.cam.crashCam = v; }));
      const qsel = h('select', { id: 's-quality' }, ['high', 'medium', 'low'].map((q) => h('option', { value: q, text: q[0].toUpperCase() + q.slice(1) })));
      qsel.value = HW.render.quality;
      qsel.addEventListener('change', () => HW.render.setQuality(qsel.value));
      const usel = h('select', { id: 's-units' }, [['kmh', 'km/h'], ['mph', 'mph']].map(([v, t]) => h('option', { value: v, text: t })));
      usel.value = U.units;
      usel.addEventListener('change', () => { U.units = usel.value; try { localStorage.setItem('hw.units', U.units); } catch (e) { /* blocked */ } });
      body.push(h('div', { class: 'field' }, h('label', { for: 's-quality', text: 'Graphics' }), qsel));
      body.push(h('div', { class: 'field' }, h('label', { for: 's-units', text: 'Scale speed' }), usel));
      body.push(h('button', { id: 'btn-defaults', onclick: () => U.defaults() }, 'Restore defaults'));
      U.drawer = h('div', { id: 'drawer', class: 'panel' }, body);
      U.drawer.hidden = true;
      root.append(U.drawer);
    },
    defaults() {
      const keep = HW.config.charge;
      HW.config.reset();
      U.sim.power.setCharge(1);
      for (const f of U.fieldEls) { f.inp.value = String(HW.config[f.key]); f.out.textContent = f.fmt(HW.config[f.key]); }
      void keep;
    },

    buildHelp(root) {
      const close = h('button', { class: 'close iconbtn', 'aria-label': 'Close', onclick: () => U.toggleHelp(false), text: '×' });
      U.help = h('div', { id: 'help', class: 'panel', role: 'dialog', 'aria-label': 'How it works' }, close,
        h('h3', { text: 'How it works' }),
        h('p', { html: U.sim.layout.set.blurb || '' }),
        U.sim.layout.hub ? h('p', { html: 'Four D cells drive one motor, which turns four foam wheels through a gear train. Each wheel sits between two lanes and pinches passing cars against the far wall: <b>eight pushes a lap</b>. Every launch loads the same motor, so the more cars in the nips, the more it bogs. Watch the gauges.' }) : '',
        h('ul', {},
          h('li', { html: 'In the channel, a car follows the track exactly: gravity, the track’s push (it can only push), rolling resistance, wall scrub, air drag and the foam nips. Too slow over a loop top and the track stops pushing: the car <b>falls off</b>.' }),
          h('li', { html: 'Anything that knocks it out of the channel turns it into a free rigid body (Rapier). It tumbles until it lands upright in a lane, or lies still and a hand carries it back to <b>START</b>.' }),
          h('li', { html: 'Two cars rarely crash: the boosters keep them in step. Uneven foam and clacking joints let them drift until they meet at a crossing. Five cars almost never find a safe rhythm.' })),
        h('p', { html: '<b>Keys</b>: Space booster · A add car · L line up all · N nudge · R replay · S slow-mo · C camera · 1–5 follow a car · T tuning · M sound · H this help. Click a car in the scene or the garage to follow it.' }));
      U.help.hidden = true;
      root.append(U.help);
    },

    // ---------------------------------------------------------------- per-frame
    update(dt, sim) {
      U._t = (U._t || 0) + dt;
      const tel = sim.power.telemetry();
      const g = U.g;
      g.volt.bar.style.width = Math.min(100, tel.V / 6.5 * 100) + '%';
      g.amp.bar.style.width = Math.min(100, tel.I / 5 * 100) + '%';
      g.rpm.bar.style.width = Math.min(100, tel.rpmMotor / 17000 * 100) + '%';
      g.foam.bar.style.width = Math.min(100, tel.foamSpeed / 450 * 100) + '%';
      g.soc.bar.style.width = (tel.soc * 100) + '%';
      const busy = sim.cars.filter((c) => c.mode === 'track' && c.inNip).length;
      g.load.bar.style.width = (busy / Math.max(1, U.nNips) * 100) + '%';
      if (U._t < 0.1) return;
      U._t = 0;
      g.volt.num.textContent = tel.V.toFixed(2);
      g.amp.num.textContent = tel.I.toFixed(2);
      g.rpm.num.textContent = Math.round(tel.rpmMotor).toLocaleString('en-US');
      g.foam.num.textContent = Math.round(tel.foamSpeed);
      g.soc.num.textContent = Math.round(tel.soc * 100);
      g.load.num.textContent = busy;
      U.crashNum.textContent = String(sim.crashCount);
      if (U.ln) { const ready = !!U.ln.car; U.lnReady.textContent = ready ? 'loaded' : 'empty'; U.lnReady.className = 'chip ' + (ready ? 'running' : 'parked'); }
      for (const [car, r] of U.rows) {
        const st = car.mode === 'parked' ? 'garage' : car.status;
        r.chip.textContent = st === 'retrieving' ? 'carried' : st;
        r.chip.className = 'chip ' + st;
        const spd = car.mode === 'track' ? Math.abs(car.v) : 0;
        r.meta.textContent = car.mode === 'parked' ? car.entry.massG + ' g · ' + car.entry.wheelCode : car.laps + ' ' + U.runWord + (car.bestLap ? ' · ' + car.bestLap.toFixed(2) + ' s' : '') + (spd > 5 ? ' · ' + Math.round(spd) : '');
        r.act.textContent = car.mode === 'parked' ? '+' : '−';
      }
      // speedometer: the followed car, or the fastest one on the track
      let car = U.followed && U.followed.mode !== 'parked' ? U.followed : null;
      if (!car) car = sim.cars.filter((c) => c.mode === 'track').sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0] || null;
      if (car) {
        const v = car.speed;
        U.speedName.textContent = (car === U.followed ? '' : 'Fastest · ') + car.name;
        U.speedBig.innerHTML = Math.round(v) + '<small>cm/s</small>';
        U.speedScale.textContent = U.units === 'mph' ? Math.round(HW.units.scaleMph(v)) + ' mph at 1:64' : Math.round(HW.units.scaleKmh(v)) + ' km/h at 1:64';
      } else { U.speedName.textContent = 'No cars running'; U.speedBig.innerHTML = '0<small>cm/s</small>'; U.speedScale.textContent = 'Add a car to start'; }
    },
  });
})(window.HW);
