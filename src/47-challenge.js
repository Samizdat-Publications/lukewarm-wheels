// 47-challenge.js - a set's challenge: get every car round `laps` times without losing one,
// as fast as you can. You drop the cars in yourself (Add car / A): drop them too close
// together and they meet in the slow stretch on the table; too far apart and the clock runs.
// "Lost" means the hand had to fetch a car (it came off and did not land back in a lane); a
// caught jump is not lost. The best challenge time and the lap record are kept per set.
(function (HW) {
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };

  HW.Challenge = class Challenge {
    constructor(sim, spec) {
      this.sim = sim;
      this.need = spec.cars || 5;
      this.laps = spec.laps || 3;
      this.state = 'idle';
      this.key = 'hw.lap.' + sim.layout.id;
      this.record = load(this.key);                 // best single lap { time, car }
      this.best = load(this.key + '.challenge');     // best challenge time { time }
      sim.bus.on('lap', (e) => this.onLap(e));
      sim.bus.on('retrieve', (e) => this.onLost(e));
      sim.bus.on('dropped', (e) => this.dropped(e.car));
    }

    start() {
      const sim = this.sim;
      sim.reset();
      sim.setSwitch(true);
      this.cars = sim.cars.slice(0, this.need);
      this.done = new Set(); this.count = new Map(); this.lost = null;
      this.t0 = null; this.state = 'running';
      sim.emit('challenge', { state: this.state, ch: this });
    }
    // the clock starts with the first car dropped in
    dropped(car) { if (this.state === 'running' && this.t0 == null && this.cars.includes(car)) this.t0 = this.sim.time; }
    get elapsed() { return this.t0 == null ? 0 : this.sim.time - this.t0; }
    lapsOf(car) { return this.count.get(car) || 0; }

    onLap(e) {
      const car = e.car;
      if (e.time != null && e.time > 0.5 && (!this.record || e.time < this.record.time)) {
        this.record = { time: e.time, car: car.name };
        save(this.key, this.record);
        this.sim.emit('lapRecord', { car, time: e.time });
      }
      if (this.state !== 'running' || !this.cars.includes(car)) return;
      this.count.set(car, this.lapsOf(car) + 1);
      if (this.lapsOf(car) >= this.laps) this.done.add(car);
      if (this.done.size >= this.cars.length) {
        this.state = 'won'; this.took = this.elapsed;
        this.newBest = !this.best || this.took < this.best.time;
        if (this.newBest) { this.best = { time: this.took }; save(this.key + '.challenge', this.best); }
        this.sim.emit('challenge', { state: this.state, ch: this });
      }
    }

    onLost(e) {
      if (this.state !== 'running' || !this.cars.includes(e.car) || this.done.has(e.car)) return;
      const car = e.car, tr = car.track;
      this.state = 'lost';
      this.lost = { car, where: tr ? (tr.region(car.s) || tr.name) : 'the track' };
      this.sim.emit('challenge', { state: this.state, ch: this });
    }
  };
})(window.HW);
