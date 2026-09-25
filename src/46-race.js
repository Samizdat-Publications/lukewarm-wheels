// 46-race.js - Race Day: the race controller, the "why did it win" analysis, knockout
// tournaments and the car tuner.
//
// A heat: the hand carries each entrant to its lane, the start gate holds them, a tree of
// lights counts down, the gate drops and gravity does the rest. The timing gate records each
// car's crossing to a fraction of a substep. Every car keeps an energy ledger from the moment
// the gate drops (rolling resistance, air, wall scrub, joints), so the result can be
// explained in the model's own terms: which loss the winner avoided.
(function (HW) {
  const M = HW.math, G = HW.units.G;

  // ------------------------------------------------------------ the tuner
  // Per casting: coins taped under the base (a US cent is 2.5 g), a wheel swap, a paint job.
  HW.tune = {
    COIN_G: 2.5,
    WHEELS: Object.assign({}, HW.wheelTypes, {
      GRAPHITE: { radius: 0.5, crr: 0.015, name: 'Polished + graphite', rim: '5sp' },
      RUBBER: { radius: 0.52, crr: 0.034, name: 'Real Riders rubber', rim: '5sp' },
    }),
    all: {},
    load() {
      // no storage (node, a private window): keep whatever tunes were set in this session
      try { if (typeof localStorage !== 'undefined') this.all = JSON.parse(localStorage.getItem('hw.tune') || '{}') || {}; } catch (e) { /* keep */ }
      return this.all;
    },
    save() { try { localStorage.setItem('hw.tune', JSON.stringify(this.all)); } catch (e) { /* storage blocked */ } },
    of(entry) { return this.all[entry.id] || { coins: 0, wheels: entry.wheelCode, paint: null }; },
    // apply a casting's tune to a car in a running sim (mass, wheels; paint is the renderer's)
    apply(sim, car) {
      const t = this.of(car.entry), w = this.WHEELS[t.wheels] || this.WHEELS[car.entry.wheelCode];
      car.m = car.entry.massG + (t.coins || 0) * this.COIN_G;
      car.crr = w.crr;
      car.tuned = t;
      if (sim && sim.fb && HW.freebody.setMass) HW.freebody.setMass(sim.fb, car);
    },
    set(sim, car, patch) { this.all[car.entry.id] = Object.assign({}, this.of(car.entry), patch); this.save(); this.apply(sim, car); HW.bus.emit('tune', { car }); },
  };

  // ------------------------------------------------------------ explaining a result
  const LOSSES = [['roll', 'axle and tyre drag'], ['air', 'air drag'], ['wall', 'rubbing the wall'], ['side', 'sideways scrub'], ['impact', 'track joints and knocks']];
  function ledger(car, e0) {
    const E = {};
    for (const [k] of LOSSES) E[k] = (car.energy[k] || 0) - (e0[k] || 0);
    return E;
  }
  function explain(res) {
    const done = res.filter((r) => r.time != null).sort((a, b) => a.time - b.time);
    if (!done.length) return { lines: ['Nobody reached the timing gate.'] };
    const W = done[0], lines = [];
    const pct = (r, k) => 100 * r.loss[k] / r.drop;
    for (const r of res) {
      r.kept = 100 * 0.5 * r.m * r.v * r.v / r.drop;
      r.lostPct = {}; for (const [k] of LOSSES) r.lostPct[k] = pct(r, k);
    }
    const second = done[1];
    const margin = second ? second.time - W.time : null;
    lines.push(`${W.name} wins` + (second ? ` by ${(margin * 1000).toFixed(0)} ms (${(margin * W.v).toFixed(1)} cm at the line).` : '.'));
    if (second) {
      // which loss differs most between the winner and the runner-up, per unit of energy dropped
      let best = null;
      for (const [k, label] of LOSSES) { const d = second.lostPct[k] - W.lostPct[k]; if (!best || d > best.d) best = { k, label, d }; }
      if (best && best.d > 0.3) {
        let why = '';
        if (best.k === 'roll') {
          const wW = HW.tune.WHEELS[W.wheels], wS = HW.tune.WHEELS[second.wheels];
          why = wW && wS && wW !== wS ? ` Its ${wW.name} wheels roll easier than the ${wS.name} (rolling coefficient ${(W.crr).toFixed(3)} against ${(second.crr).toFixed(3)}).`
            : ` Same wheels, but no two die-casts roll alike: its axles drag ${(100 * (second.crr - W.crr) / second.crr).toFixed(0)}% less.`;
        } else if (best.k === 'air') {
          why = ` Drag slows a car in proportion to frontal area over mass: ${(W.CdA / W.m * 1000).toFixed(1)} against ${(second.CdA / second.m * 1000).toFixed(1)} for the ${second.name}.`;
        } else if (best.k === 'wall') {
          why = ` The ${second.name} ran against the wall and scrubbed.`;
        }
        lines.push(`${second.name} lost ${second.lostPct[best.k].toFixed(1)}% of its drop to ${best.label}, ${W.name} only ${W.lostPct[best.k].toFixed(1)}%.` + why);
      } else lines.push('Too close to call on physics alone: the track joints decided it.');
    }
    const heavy = [...done].sort((a, b) => b.m - a.m)[0];
    if (heavy && (W.tuned && W.tuned.coins)) lines.push(`${W.name} carried ${W.tuned.coins * HW.tune.COIN_G} g of coins: more mass against the same air drag.`);
    const dnf = res.filter((r) => r.time == null);
    for (const r of dnf) lines.push(`${r.name}: ${r.dnf || 'did not finish'}.`);
    return { lines, winner: W, margin };
  }

  // ------------------------------------------------------------ the controller
  HW.Race = class Race {
    constructor(sim) {
      this.sim = sim;
      const L = sim.layout, spec = L.set.race;
      this.lanes = spec.lanes.map((id) => L.byId[id]);
      this.holdS = spec.hold || 4;
      this.state = 'idle';
      this.auto = true;
      this.lights = 0;                        // 0 = dark, 1..3 ambers, 4 = green
      this.last = null;
      this.history = [];
      this.tourney = null;
      this.best = {};
      try { this.best = JSON.parse(localStorage.getItem('hw.best.' + L.id) || '{}') || {}; } catch (e) { this.best = {}; }
      HW.bus.on('gate', (e) => this.onGate(e));
      HW.bus.on('derail', (e) => { const r = this.entry(e.car); if (r && this.state === 'running' && r.time == null) r.dnf = e.cause === 'hit' ? 'crashed' : 'left the track'; });
    }
    entry(car) { return this.current ? this.current.find((r) => r.car === car) : null; }

    // stage a heat: up to one car per lane (default: the next four in rotation)
    stage(cars) {
      const sim = this.sim;
      if (!cars) {
        const pool = sim.cars;
        const k = (this.history.length * 3) % pool.length;
        cars = [...pool.slice(k), ...pool.slice(0, k)].slice(0, this.lanes.length);
      }
      // lanes rotate between heats so no car keeps the same lane
      const shift = this.history.length % this.lanes.length;
      this.current = cars.map((car, i) => ({ car, name: car.name, lane: (i + shift) % this.lanes.length, time: null }));
      for (const c of sim.cars) if (!cars.includes(c) && c.mode !== 'parked' && c.mode !== 'retrieving') sim.startRetrieve(c, { park: true });
      for (const r of this.current) {
        const tgt = { track: this.lanes[r.lane], s: this.holdS, hold: true };
        if (r.car.mode === 'parked') { r.car.retrieveTo = tgt; sim.launch(r.car); }
        else sim.startRetrieve(r.car, tgt);
      }
      this.state = 'staging'; this.t = 0; this.lights = 0;
      sim.emit('raceStage', { race: this });
    }

    start() { if (this.state === 'staged') { this.state = 'countdown'; this.t = 0; } }

    step(h) {
      const sim = this.sim;
      this.t += h;
      for (const c of sim.cars) if (c.held && c.mode === 'track') { c.v = 0; c.s = this.holdS; c.stallT = 0; }
      if (this.state === 'staging') {
        if (this.current.every((r) => r.car.mode === 'track' && r.car.held)) { this.state = 'staged'; this.t = 0; }
        else if (this.t > 12) this.stage(this.current.map((r) => r.car));      // something got stuck: try again
      } else if (this.state === 'staged') {
        if (this.auto && this.t > 0.6) this.start();
      } else if (this.state === 'countdown') {
        const k = Math.min(4, 1 + Math.floor(this.t / 0.5));
        if (k !== this.lights) { this.lights = k; sim.emit('raceLight', { n: k }); }
        if (this.t >= 1.5) this.go();
      } else if (this.state === 'running') {
        for (const r of this.current) {
          const c = r.car;
          if (r.time != null || r.dnf) continue;
          if (c.mode === 'track' && Math.abs(c.v) < 4 && this.t > 1) r.dnf = 'ran out of speed';
        }
        if (this.current.every((r) => r.time != null || r.dnf) || this.t > 8) this.finish();
      } else if (this.state === 'done') {
        if (this.auto && this.t > 7) this.next();
      }
    }

    go() {
      const sim = this.sim;
      this.state = 'running'; this.t = 0; this.t0 = sim.time; this.lights = 4;
      for (const r of this.current) {
        const c = r.car;
        c.held = false; c.finished = false; c.lapStartT = sim.time;
        r.e0 = Object.assign({}, c.energy);
        r.y0 = c.pos.y;
      }
      sim.emit('raceGo', { race: this });
    }

    onGate(e) {
      if (this.state !== 'running' || !e.gate || e.gate.kind !== 'finish') return;
      const r = this.entry(e.car);
      if (!r || r.time != null) return;
      r.time = (e.tCross != null ? e.tCross : this.sim.time) - this.t0;
      r.v = Math.abs(e.car.v);
      r.place = this.current.filter((x) => x.time != null).length;
      this.sim.emit('raceCross', { race: this, entry: r });
    }

    finish() {
      const sim = this.sim;
      for (const r of this.current) {
        const c = r.car;
        r.m = c.m; r.crr = c.crr * c.crrMul * sim.cfg.crrScale; r.CdA = c.CdA; r.wheels = (c.tuned && c.tuned.wheels) || c.entry.wheelCode; r.tuned = c.tuned;
        r.loss = ledger(c, r.e0);
        const gy = r.time != null ? this.lanes[r.lane].frame(this.lanes[r.lane].gates[0].s, {}).py : c.pos.y;
        r.drop = Math.max(1, c.m * G * (r.y0 - gy));
        if (r.v == null) r.v = Math.abs(c.v || 0);
        if (r.time != null) {
          const b = this.best[c.entry.id];
          r.pb = !b || r.time < b;
          if (r.pb) this.best[c.entry.id] = r.time;
        }
      }
      try { localStorage.setItem('hw.best.' + sim.layout.id, JSON.stringify(this.best)); } catch (e) { /* blocked */ }
      this.last = { entries: this.current, why: explain(this.current), t: sim.time };
      this.history.push(this.last);
      this.state = 'done'; this.t = 0;
      sim.emit('raceDone', { race: this, result: this.last });
      if (this.tourney) this.tourneyAfter(this.last);
    }

    next() {
      if (this.tourney && this.tourney.champion) { this.tourney = null; }
      if (this.tourney) this.stage(this.tourney.next);
      else this.stage();
    }

    // ---------------------------------------------------------- knockout
    // Every remaining car races (four lanes at a time); the slowest of each heat is out,
    // until one is left. With five cars: 4 race, one is out, the fifth joins, and so on.
    knockout() {
      const cars = this.sim.cars.slice();
      this.tourney = { round: 1, alive: cars, out: [], heats: [], next: cars.slice(0, this.lanes.length), champion: null };
      this.stage(this.tourney.next);
    }
    tourneyAfter(res) {
      const T = this.tourney;
      T.heats.push(res);
      const ranked = [...res.entries].sort((a, b) => (a.time == null ? 1e9 : a.time) - (b.time == null ? 1e9 : b.time));
      const loser = ranked[ranked.length - 1].car;
      T.out.push(loser);
      T.alive = T.alive.filter((c) => c !== loser);
      T.round++;
      if (T.alive.length === 1) { T.champion = T.alive[0]; this.sim.emit('raceChampion', { race: this, car: T.champion }); return; }
      // everyone still in who did not just race goes first, then the heat's finishers
      const raced = res.entries.map((r) => r.car);
      const waiting = T.alive.filter((c) => !raced.includes(c));
      T.next = [...waiting, ...ranked.map((r) => r.car).filter((c) => T.alive.includes(c))].slice(0, this.lanes.length);
    }
  };

  HW.race = { explain, ledger };
})(window.HW);
