// 71-ui-race.js - the Race Day panel (heats, knockout, results board, "why it won"), the car
// tuner, and the physics overlay's readout (g-load and an energy bar for the followed car).
(function (HW) {
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== '') el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  };
  const STATE = { idle: 'Ready to stage', staging: 'Staging the cars', staged: 'On the gate', countdown: 'Get set', running: 'GO', done: 'Results' };
  const LOSS = [['roll', 'axles', '#e23a2a'], ['air', 'air', '#4aa3ff'], ['wall', 'wall', '#ff8a1a'], ['side', 'scrub', '#b36bff'], ['impact', 'joints', '#8d949c']];

  const R = (HW.uiRace = {
    init(sim, root) {
      R.sim = sim;
      R.buildOverlay(root);
      R.buildTuner(root);
      if (sim.challenge) R.buildChallenge(root, sim.challenge);
      const race = sim.race;
      if (!race) return;
      R.state = h('span', { class: 'chip', text: STATE.idle });
      R.tree = [0, 1, 2, 3].map((k) => h('i', { class: 'lamp ' + (k < 3 ? 'amber' : 'green') }));
      R.board = h('ol', { class: 'board' });
      R.why = h('div', { class: 'why' });
      R.tour = h('div', { class: 'tour' });
      const auto = h('input', { id: 'race-auto', type: 'checkbox' }); auto.checked = race.auto;
      auto.addEventListener('change', () => { race.auto = auto.checked; });
      root.append(h('div', { id: 'race', class: 'panel' },
        h('div', { class: 'row' }, h('span', { class: 'lbl', text: 'Race Day' }), R.state, h('span', { class: 'tree' }, R.tree)),
        h('div', { class: 'row' },
          h('button', { id: 'btn-race', class: 'hot', onclick: () => R.race(), title: 'Stage the next heat, or drop the gate (G)' }, 'Race!'),
          h('button', { id: 'btn-ko', onclick: () => race.knockout(), title: 'Knockout: the slowest car in each heat is out' }, 'Knockout'),
          h('button', { id: 'btn-tune2', onclick: () => R.toggleTuner(), title: 'Tune a car' }, 'Tuner'),
          h('label', { class: 'check', for: 'race-auto' }, auto, 'Auto')),
        R.board, R.why, R.tour));
      HW.bus.on('raceDone', (e) => R.showResult(e.result));
      HW.bus.on('raceStage', () => { R.why.textContent = ''; });
      HW.bus.on('raceChampion', (e) => { R.tour.replaceChildren(h('b', { text: 'Champion: ' + e.car.name })); });
      addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'g' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) R.race(); });
      if (HW.config.autoStart) setTimeout(() => { if (race.state === 'idle') race.stage(); }, 900);
    },

    race() {
      const race = R.sim.race;
      if (race.state === 'staged') race.start();
      else if (race.state === 'idle' || race.state === 'done') race.next();
    },

    showResult(res) {
      const race = R.sim.race, fmtMph = (v) => Math.round(HW.units.scaleMph(v));
      R.board.innerHTML = '';
      const rows = [...res.entries].sort((a, b) => (a.time == null ? 1e9 : a.time) - (b.time == null ? 1e9 : b.time));
      for (const r of rows) {
        const lost = LOSS.map(([k, , col]) => `<i style="width:${Math.max(0, r.lostPct ? r.lostPct[k] : 0) * 2}px;background:${col}"></i>`).join('');
        R.board.append(h('li', { class: r.place === 1 ? 'win' : '' },
          h('span', { class: 'dot', style: 'background:' + ((r.car.tuned && r.car.tuned.paint) || r.car.entry.color) }),
          h('span', { class: 'nm', text: r.name }),
          h('span', { class: 'ln', text: 'L' + (r.lane + 1) }),
          h('span', { class: 't', text: r.time != null ? r.time.toFixed(3) + ' s' : 'DNF' }),
          h('span', { class: 'v', text: r.time != null ? Math.round(r.v) + ' cm/s · ' + fmtMph(r.v) + ' mph' : '' }),
          r.pb ? h('span', { class: 'pb', text: 'PB' }) : '',
          h('span', { class: 'loss', html: lost, title: 'Energy lost from the drop: axles, air, wall, scrub, joints' })));
      }
      R.why.replaceChildren(...res.why.lines.map((l) => h('p', { text: l })));
      const T = race.tourney;
      if (T && !T.champion) R.tour.textContent = `Knockout round ${T.round}: out so far ${T.out.map((c) => c.name).join(', ') || 'nobody'}.`;
      else if (!T) R.tour.textContent = '';
    },

    update(dt, sim) {
      const race = sim.race;
      if (race) {
        R.state.textContent = race.tourney && race.state === 'staging' ? `Knockout round ${race.tourney.round}` : STATE[race.state] || race.state;
        R.state.className = 'chip ' + (race.state === 'running' ? 'running' : race.state === 'done' ? 'incoming' : 'parked');
        R.tree.forEach((el, k) => el.classList.toggle('on', k < 3 ? race.lights > k && race.lights < 4 : race.lights === 4 && race.state === 'running'));
      }
      R.updateOverlay(sim);
      const ch = sim.challenge;
      if (ch && ch.state === 'running') R.chSt.textContent = ch.t0 == null ? 'Drop the cars in with Add car (A).' : `${ch.done.size} of ${ch.need} done · laps ${ch.cars.map((c) => ch.lapsOf(c)).join(' ')} · none lost · ${ch.elapsed.toFixed(1)} s`;
    },

    // ---------------------------------------------------------------- the set's challenge
    buildChallenge(root, ch) {
      const words = (id) => String(id).replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();
      R.chSt = h('p', { class: 'st', text: `Get all ${ch.need} cars round ${ch.laps} times without losing one. Press Start, then drop them in with Add car (A): too close together and they meet on the table.` });
      R.chRec = h('p', { class: 'rec' });
      const showRec = () => { R.chRec.textContent = (ch.record ? `Lap record ${ch.record.time.toFixed(2)} s · ${ch.record.car}` : 'No lap record yet') + (ch.best ? ` · best challenge ${ch.best.time.toFixed(1)} s` : ''); };
      showRec();
      root.append(h('div', { id: 'challenge', class: 'panel' },
        h('div', { class: 'row' }, h('span', { class: 'lbl', text: 'Challenge' }), h('button', { class: 'hot', onclick: () => ch.start() }, 'Start')),
        R.chSt, R.chRec));
      R.ch = ch;
      const bus = R.sim.bus;
      bus.on('lapRecord', () => { showRec(); R.chRec.textContent = 'New lap record! ' + R.chRec.textContent; });
      bus.on('challenge', (e) => {
        R.chSt.className = 'st ' + e.state;
        if (e.state === 'won') { R.chSt.textContent = `Done: ${ch.need} cars × ${ch.laps} laps in ${ch.took.toFixed(1)} s, none lost!` + (ch.newBest ? ' Best yet.' : ''); showRec(); }
        else if (e.state === 'lost') R.chSt.textContent = `Lost the ${ch.lost.car.name} at the ${words(ch.lost.where)}. Try again?`;
      });
    },

    // ---------------------------------------------------------------- tuner
    buildTuner(root) {
      const sim = R.sim, W = HW.tune.WHEELS;
      const pick = h('select', { id: 'tune-car', 'aria-label': 'Car to tune' }, sim.cars.map((c, i) => h('option', { value: String(i), text: c.name })));
      const coins = h('input', { id: 'tune-coins', type: 'range', min: '0', max: '4', step: '1' });
      const coinsOut = h('output', { for: 'tune-coins' });
      const wheels = h('select', { id: 'tune-wheels' }, Object.entries(W).map(([k, w]) => h('option', { value: k, text: `${w.name} (rolling ${w.crr.toFixed(3)})` })));
      const paint = h('input', { id: 'tune-paint', type: 'color' });
      const stats = h('div', { class: 'hint' });
      const car = () => sim.cars[+pick.value];
      const show = () => {
        const c = car(), t = HW.tune.of(c.entry);
        coins.value = String(t.coins || 0); coinsOut.textContent = `${t.coins || 0} × 2.5 g`;
        wheels.value = t.wheels || c.entry.wheelCode;
        paint.value = t.paint || c.entry.color;
        stats.textContent = `${c.m.toFixed(1)} g · rolling ${c.crr.toFixed(3)} · frontal area × drag ${(c.CdA).toFixed(2)} cm² · air drag per gram ${(c.CdA / c.m * 1000).toFixed(1)}`;
      };
      pick.addEventListener('change', show);
      coins.addEventListener('input', () => { HW.tune.set(sim, car(), { coins: +coins.value }); show(); });
      wheels.addEventListener('change', () => { HW.tune.set(sim, car(), { wheels: wheels.value }); show(); });
      paint.addEventListener('change', () => { HW.tune.set(sim, car(), { paint: paint.value }); HW.renderCars.rebuildModels(sim, car()); show(); });
      const stock = h('button', { onclick: () => { HW.tune.set(sim, car(), { coins: 0, wheels: car().entry.wheelCode, paint: null }); HW.renderCars.rebuildModels(sim, car()); show(); } }, 'Stock');
      const close = h('button', { class: 'close iconbtn', 'aria-label': 'Close', onclick: () => R.toggleTuner(false), text: '×' });
      R.tuner = h('div', { id: 'tuner', class: 'panel', role: 'dialog', 'aria-label': 'Car tuner' }, close,
        h('h3', { text: 'Tuner' }),
        h('div', { class: 'field' }, h('label', { for: 'tune-car', text: 'Car' }), pick),
        h('div', { class: 'field' }, h('label', { for: 'tune-coins', text: 'Coins under the base' }), coinsOut, coins,
          h('div', { class: 'hint', text: 'Mass does not change how fast gravity pulls a car, but it makes air drag matter less.' })),
        h('div', { class: 'field' }, h('label', { for: 'tune-wheels', text: 'Wheels' }), wheels,
          h('div', { class: 'hint', text: 'Rolling resistance is most of what a car loses on a gravity strip.' })),
        h('div', { class: 'field' }, h('label', { for: 'tune-paint', text: 'Paint' }), paint, stock),
        stats);
      R.tuner.hidden = true;
      root.append(R.tuner);
      R.tunerShow = show;
    },
    toggleTuner(on) { const t = R.tuner; t.hidden = on == null ? !t.hidden : !on; if (!t.hidden) R.tunerShow(); },

    // ---------------------------------------------------------------- overlay readout
    buildOverlay(root) {
      R.ov = { g: h('span', { class: 'num', text: '-' }), name: h('span', { class: 'lbl', text: '' }), bar: h('div', { class: 'ebar' }), key: h('div', { class: 'ekey' }) };
      R.ov.key.innerHTML = [['kinetic', '#33e06b'], ['height', '#ffd23f'], ...LOSS.map(([, l, c]) => [l, c])].map(([l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')
        + '<span class="arrows">arrows: green floor, orange wall (1 g = 3 cm); red drag, yellow push (x10)</span>';
      R.ovPanel = h('div', { id: 'overlay', class: 'panel' }, h('div', { class: 'row' }, h('span', { class: 'lbl', text: 'Forces' }), R.ov.name), h('div', { class: 'row' }, h('span', { class: 'lbl', text: 'Floor' }), R.ov.g, h('span', { class: 'unit', text: 'g' })), R.ov.bar, R.ov.key);
      R.ovPanel.hidden = true;
      root.append(R.ovPanel);
    },
    toggleOverlay(on) {
      const v = on == null ? !HW.overlay.on : on;
      HW.overlay.set(v); R.ovPanel.hidden = !v;
      const b = document.getElementById('btn-forces'); if (b) b.setAttribute('aria-pressed', v ? 'true' : 'false');
    },
    updateOverlay(sim) {
      if (!HW.overlay.on) return;
      let car = HW.ui.followed && HW.ui.followed.mode === 'track' ? HW.ui.followed : null;
      if (!car) car = sim.cars.filter((c) => c.mode === 'track').sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];
      if (!car) { R.ov.name.textContent = 'no car on track'; return; }
      R.ov.name.textContent = car.name;
      R.ov.g.textContent = (car.Nf / (car.m * HW.units.G)).toFixed(2);
      // energy since the car was put on the track: where it went
      const E = car.energy, KE = 0.5 * car.m * car.v * car.v, lo = sim.layout.bounds ? sim.layout.bounds.lo[1] : 0;
      const PE = car.m * HW.units.G * Math.max(0, car.pos.y - lo);
      const parts = [KE, PE, ...LOSS.map(([k]) => Math.max(0, E[k] || 0))], tot = parts.reduce((a, b) => a + b, 0) || 1;
      const cols = ['#33e06b', '#ffd23f', ...LOSS.map(([, , c]) => c)];
      R.ov.bar.innerHTML = parts.map((p, i) => `<i style="width:${(100 * p / tot).toFixed(1)}%;background:${cols[i]}"></i>`).join('');
    },
  });
})(window.HW);
