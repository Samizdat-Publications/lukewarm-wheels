// 75-trophies.js - trophies: small goals across the sets, earned from what the sim already
// reports on the bus (crashes, jumps, laps, races, the challenge), kept in localStorage
// (hw.trophies) with a few lifetime counters. A toast and a chime when one is earned; the
// cabinet (Y, or the trophy button) lists them all, with a hint for each one still to get.
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
  const CUP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>';

  // id, name, how (shown locked and unlocked), where (a set id, or '' for anywhere)
  const LIST = [
    ['firstCrash', 'Fender Bender', 'Crash two cars into each other.', ''],
    ['bigHit', 'T-Bone', 'A crash at 250 cm/s or more.', ''],
    ['pileup', 'Pile-Up', 'Three crashes inside two seconds.', ''],
    ['crash100', 'Insurance Nightmare', '100 crashes, all-time.', ''],
    ['fallOff', 'Gravity Wins', 'A car too slow for a loop falls off the top.', ''],
    ['laps50', 'Frequent Flyer', '50 laps or runs, all-time.', ''],
    ['fullHouse', 'Full House', 'All five castings on the track at once.', 'crissCross'],
    ['flat', 'Flat Batteries', 'Run the D cells below 25% charge (Tuning).', 'crissCross'],
    ['fullSend', 'Full Send', 'Fire the launcher at 95% or more.', 'loopLeap'],
    ['whack', 'Hammer Time', 'Get a car hit by a hammer or a paddle wheel.', ''],
    ['landJump', 'Stuck the Landing', 'Land a jump.', ''],
    ['wipeout', 'Wipeout', 'Miss the catch ramp.', ''],
    ['hugeAir', 'Huge Air', 'Land a jump of 60 cm or more.', ''],
    ['race', 'Drag Racer', 'Run a heat on the drag strip.', 'dragStrip'],
    ['photoFinish', 'Photo Finish', 'A heat won by less than 0.02 s.', 'dragStrip'],
    ['champ', 'Knockout Champion', 'See a knockout through to a champion.', 'dragStrip'],
    ['pitCrew', 'Pit Crew', 'Tune a car: a coin, other wheels or new paint.', ''],
    ['cleanPlate', 'Clean Plate', 'Beat the kitchen challenge.', 'kitchenGP'],
    ['onTheClock', 'On the Clock', 'Set a lap record in the kitchen.', 'kitchenGP'],
    ['tourist', 'Tourist', 'Visit all five track sets.', ''],
    ['testDriver', 'Test Driver', 'Play a featured track.', ''],
    ['architect', 'Architect', 'Play a track you made in the Track Builder.', ''],
    ['fork', 'Fork in the Road', 'Send a car through a splitter.', ''],
    ['onboard', 'Hood Ornament', 'Ride along with the Onboard camera.', ''],
    ['replay', 'Instant Replay', 'Watch a replay.', ''],
    ['showroom', 'Window Shopping', 'Visit the Showroom.', ''],
    ['cheese', 'Say Cheese', 'Save a photo in photo mode (P).', ''],
  ];
  const KEY = 'hw.trophies';

  const Y = (HW.trophies = {
    isOpen: false,
    count() { return { got: LIST.filter(([id]) => Y.got[id]).length, all: LIST.length }; },
    init(sim) {
      Y.sim = sim;
      try { Y.data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { Y.data = null; }
      Y.data = Object.assign({ got: {}, crashes: 0, laps: 0, sets: {} }, Y.data || {});
      Y.got = Y.data.got;
      const set = sim.layout.set, B = HW.bus, on = (t, f) => B.on(t, (e) => { try { f(e || {}); } catch (err) { console.warn(err); } });

      // where we are
      if (!set.custom) { Y.data.sets[set.id] = 1; Y.save(); }
      const real = Object.values(HW.sets).filter((s) => s && s.id && !s.custom && s.id !== '__test');
      if (real.every((s) => Y.data.sets[s.id])) Y.earn('tourist');
      if (set.custom) {
        const feat = (HW.builderCodec.FEATURED || []).some((f) => f.code === set.code);
        Y.earn(feat ? 'testDriver' : 'architect');
      }

      // crashes and falls
      let recent = [];
      on('crash', (e) => {
        Y.earn('firstCrash');
        if (e.speed >= 250) Y.earn('bigHit');
        const t = sim.time; recent = recent.filter((x) => t - x < 2); recent.push(t);
        if (recent.length >= 3) Y.earn('pileup');
        Y.data.crashes++; if (Y.data.crashes >= 100) Y.earn('crash100');
        Y.dirty = true;
      });
      on('derail', (e) => { if (e.cause === 'lift') Y.earn('fallOff'); });
      on('lap', () => { Y.data.laps++; if (Y.data.laps >= 50) Y.earn('laps50'); Y.dirty = true; });
      on('launch', (e) => { if (set.id === 'loopLeap' && e.strength >= 0.95) Y.earn('fullSend'); });
      on('whack', () => Y.earn('whack'));
      on('jump', (e) => {
        if (e.landed && e.air > 0.05) { Y.earn('landJump'); if (e.dist >= 60) Y.earn('hugeAir'); }
        else if (!e.landed && e.air > 0.08) Y.earn('wipeout');
      });
      on('raceDone', (e) => {
        Y.earn('race');
        const t = (e.result && e.result.entries || []).map((r) => r.time).filter((x) => x != null).sort((a, b) => a - b);
        if (t.length >= 2 && t[1] - t[0] < 0.02) Y.earn('photoFinish');
      });
      on('raceChampion', () => Y.earn('champ'));
      on('tune', () => Y.earn('pitCrew'));
      on('challenge', (e) => { if (e.state === 'won' && set.id === 'kitchenGP') Y.earn('cleanPlate'); });
      on('lapRecord', () => { if (set.id === 'kitchenGP') Y.earn('onTheClock'); });
      on('split', () => Y.earn('fork'));
      on('camera', (e) => { if (e.mode === 'onboard') Y.earn('onboard'); });
      on('replay', (e) => { if (e.on) Y.earn('replay'); });
      // the counters are saved now and then, not on every crash
      setInterval(() => {
        if (Y.dirty) { Y.dirty = false; Y.save(); }
        if (set.id === 'crissCross') {
          if (sim.cars.filter((c) => c.mode === 'track').length >= 5) Y.earn('fullHouse');
          if (sim.power.telemetry().soc < 0.25) Y.earn('flat');
        }
        if (HW.showroom.active) Y.earn('showroom');
      }, 500);

      // the cabinet and the toast
      Y.btn = h('button', { id: 'btn-trophies', class: 'iconbtn panel', title: 'Trophies (Y)', 'aria-label': 'Trophies', html: CUP, onclick: () => Y.toggle() });
      const bar = document.getElementById('cambar');
      if (bar) bar.insertBefore(Y.btn, document.getElementById('btn-sound'));
      Y.list = h('div', { class: 'tlist' });
      Y.head = h('span', { class: 'lbl' });
      Y.panel = h('div', { id: 'trophies', class: 'panel', role: 'dialog', 'aria-label': 'Trophies' },
        h('div', { class: 'row' }, h('h3', { text: 'Trophies' }), Y.head, h('button', { class: 'close iconbtn', 'aria-label': 'Close', onclick: () => Y.toggle(false), text: '×' })),
        Y.list);
      Y.panel.hidden = true;
      Y.toastEl = h('div', { id: 'trophy-toast', class: 'panel', role: 'status', 'aria-live': 'polite' });
      const root = document.getElementById('ui');
      root.append(Y.panel, Y.toastEl);
    },

    save() { try { localStorage.setItem(KEY, JSON.stringify(Y.data)); } catch (e) { /* storage blocked */ } },
    earn(id) {
      if (Y.got[id]) return;
      const t = LIST.find((x) => x[0] === id);
      if (!t) return;
      Y.got[id] = Date.now();
      Y.save();
      Y.queue = (Y.queue || []).concat([t]);
      if (!Y.showing) Y.next();
      HW.bus.emit('trophy', { id, name: t[1] });
      if (Y.isOpen) Y.render();
    },
    // one toast at a time; several earned together wait their turn
    next() {
      const t = Y.queue && Y.queue.shift();
      if (!t || !Y.toastEl) { Y.showing = false; return; }
      Y.showing = true;
      Y.toastEl.innerHTML = '';
      Y.toastEl.append(h('span', { class: 'cup', html: CUP }), h('div', {}, h('div', { class: 'lbl', text: 'Trophy · ' + Y.count().got + ' / ' + LIST.length }), h('b', { text: t[1] }), h('div', { class: 'how', text: t[2] })));
      Y.toastEl.classList.add('show');
      setTimeout(() => { Y.toastEl.classList.remove('show'); setTimeout(() => Y.next(), 350); }, 3200);
    },
    toggle(force) {
      if (!Y.panel) return;
      Y.isOpen = force != null ? !!force : !Y.isOpen;
      Y.panel.hidden = !Y.isOpen;
      if (Y.isOpen) Y.render();
    },
    render() {
      const c = Y.count(), names = {};
      for (const s of Object.values(HW.sets)) if (s && s.id) names[s.id] = s.name;
      Y.head.textContent = c.got + ' / ' + c.all;
      Y.list.replaceChildren(...LIST.map(([id, name, how, where]) => h('div', { class: 'trow' + (Y.got[id] ? ' got' : '') },
        h('span', { class: 'cup', html: CUP }),
        h('div', {}, h('b', { text: name }), h('div', { class: 'how', text: how + (where && !Y.got[id] && Y.sim.layout.set.id !== where ? '  · ' + names[where] : '') })))));
    },
  });
})(window.HW);
