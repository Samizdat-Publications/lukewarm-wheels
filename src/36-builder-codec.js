// 36-builder-codec.js - Track Builder codes. A custom track is a string of one-letter pieces,
// and that string IS the share code: it rides in the URL as #t.<code>, which fits the only
// thing an artifact link can carry (letters, digits, . _ ~ -).
//
//   code  = start run0 ( '.' runN )*
//   start = L[1-9] (spring launcher; the digit fixes its strength, 1 = 20% .. 9 = 100%;
//           no digit = a random pull each shot) | T (drop tower) | P (the hand flicks the car in)
//   run   = piece*  [~]          ~ closes the run back on its own start (a circuit)
//
// Pieces (all fixed sizes, so they snap together like real track and stay on the grid):
//   S straight (30.5 cm, one 12 in piece)   s half straight
//   l r   90 deg curve left / right          q p   45 deg curve left / right
//   u v   U-turn left / right                b d   banked 90 deg left / right
//   U D   up / down ramp (net 6.6 cm)        O loop     C corkscrew
//   H h   spiral down, left / right          B booster  F finish gate   K brake + end
//   J jump: kicker + lip; the NEXT run is the catch ramp across the gap
//   Y splitter: the NEXT TWO runs are its left and right branches
//   M merge: the run joins back into the start of run 1 (hand start only), so a splitter's
//     branches can come back together and the car goes round again
//   X hammer: a straight with a hammer swinging across it   W paddle wheel beside a straight
(function (HW) {
  const R = 22, PIECE = 30.5;
  const PIECES = {
    S: { name: 'Straight', make: () => [{ type: 'straight', len: PIECE }] },
    s: { name: 'Half straight', make: () => [{ type: 'straight', len: PIECE / 2 }] },
    l: { name: 'Curve left', make: () => [{ type: 'bend', angle: 90, radius: R }] },
    r: { name: 'Curve right', make: () => [{ type: 'bend', angle: -90, radius: R }] },
    q: { name: '45 left', make: () => [{ type: 'bend', angle: 45, radius: R }] },
    p: { name: '45 right', make: () => [{ type: 'bend', angle: -45, radius: R }] },
    u: { name: 'U-turn left', make: () => [{ type: 'bend', angle: 180, radius: R }] },
    v: { name: 'U-turn right', make: () => [{ type: 'bend', angle: -180, radius: R }] },
    b: { name: 'Banked left', make: () => [{ type: 'bend', angle: 90, radius: 18, maxBank: 45 }] },
    d: { name: 'Banked right', make: () => [{ type: 'bend', angle: -90, radius: 18, maxBank: 45 }] },
    U: { name: 'Up ramp', make: () => [{ type: 'pitch', angle: 15, radius: 40 }, { type: 'straight', len: 15 }, { type: 'pitch', angle: -15, radius: 40 }] },
    D: { name: 'Down ramp', make: () => [{ type: 'pitch', angle: -15, radius: 40 }, { type: 'straight', len: 15 }, { type: 'pitch', angle: 15, radius: 40 }] },
    O: { name: 'Loop', make: () => [{ type: 'loop', radius: 12, lateral: 6.5 }] },
    C: { name: 'Corkscrew', make: () => [{ type: 'corkscrew', radius: 7, advance: 34 }] },
    H: { name: 'Spiral left', make: () => [{ type: 'spiral', radius: 15, drop: 10, dir: 'left' }] },
    h: { name: 'Spiral right', make: () => [{ type: 'spiral', radius: 15, drop: 10, dir: 'right' }] },
    B: { name: 'Booster', make: () => [{ type: 'booster', len: 12 }] },
    F: { name: 'Finish gate', make: () => [{ type: 'gate', kind: 'finish' }] },
    K: { name: 'Brake + end', make: () => [{ type: 'brake', len: 40 }], ends: true },
    J: { name: 'Jump', make: () => [{ type: 'pitch', angle: 22, radius: 30 }, { type: 'straight', len: 8 }], ends: true, children: 1 },
    // a moulded splitter: the lane widens into two side by side (a flipper steers each car
    // into one of them), and the branches start from the two halves of the mouth
    Y: { name: 'Splitter', make: () => [{ type: 'straight', len: 12, width: [HW.config.laneW, 2 * (HW.config.laneW + HW.config.wallT)], mouth: true }], ends: true, children: 2 },
    M: { name: 'Merge back', make: () => [], ends: true },
    X: { name: 'Hammer', make: () => [{ type: 'straight', len: PIECE }], hazard: { type: 'hammer', period: 2.2, amp: 40, arm: 16 } },
    W: { name: 'Paddle wheel', make: () => [{ type: 'straight', len: PIECE }], hazard: { type: 'paddle', period: 1.6 } },
  };
  const STARTS = { L: 'Launcher', T: 'Drop tower', P: 'Hand start' };
  const VALID = /^(?:L[1-9]?|T|P)[A-Za-z~.]*$/;

  // "LSSOJ.SlBF" -> { start: 'L', runs: [['S','S','O','J'], ['S','l','B','F']], closed: [false,false] }
  function decode(code) {
    code = String(code || '').trim();
    if (!VALID.test(code)) return null;
    const start = code[0], power = /\d/.test(code[1]) ? +code[1] : null;
    const parts = code.slice(power == null ? 1 : 2).split('.');
    const runs = [], closed = [];
    for (const p of parts) {
      const c = p.endsWith('~');
      runs.push([...(c ? p.slice(0, -1) : p)].filter((ch) => PIECES[ch]));
      closed.push(c);
    }
    return { start, power, runs, closed };
  }
  function encode(m) {
    const pw = m.start === 'L' && m.power ? String(m.power) : '';
    return m.start + pw + m.runs.map((r, i) => r.join('') + (m.closed[i] ? '~' : '')).join('.');
  }

  // which runs hang off which piece: children are assigned in order of appearance
  function tree(m) {
    const kids = m.runs.map(() => []), parent = m.runs.map(() => null);
    let next = 1;
    m.runs.forEach((run, i) => run.forEach((ch, k) => {
      const n = PIECES[ch].children || 0;
      for (let j = 0; j < n; j++) { if (next < m.runs.length) { kids[i].push(next); parent[next] = { run: i, piece: k, kind: ch, branch: j }; } next++; }
    }));
    return { kids, parent, missing: Math.max(0, next - m.runs.length) };
  }

  // the model as a set the builder (33-track-build.js) can build
  function toSet(code) {
    const m = typeof code === 'string' ? decode(code) : code;
    if (!m) return null;
    // make sure every jump and splitter has its runs, so the set always builds
    const miss = tree(m).missing;
    for (let k = 0; k < miss; k++) { m.runs.push([]); m.closed.push(false); }
    const T2 = tree(m);
    const hazards = [];
    const tracks = m.runs.map((run, i) => {
      const id = 'r' + i, pieces = [];
      let from, vIn = 0, start = 'stop';
      const par = T2.parent[i];
      if (i === 0) {
        if (m.start === 'L') {
          from = { at: [-80, 1.2, 0], heading: 90 }; vIn = 330;
          pieces.push(Object.assign({ type: 'launcher', len: 14, id: 'launcher' }, m.power ? { strength: (m.power + 1) / 10, vary: false } : {}));
        }
        else if (m.start === 'T') { from = { at: [-80, 40, 0], heading: 90, pitch: -45 }; pieces.push({ type: 'straight', len: 22, id: 'tower' }, { type: 'pitch', angle: 45, radius: 30, id: 'swoop' }); }
        else { from = { at: [-80, 1.2, 0], heading: 90 }; vIn = 250; }
      } else if (par && par.kind === 'J') {
        from = { rel: 'r' + par.run, forward: 36, up: -0.5, pitch: -8 }; start = 'fly'; vIn = 250;
        pieces.push({ type: 'straight', len: 34, width: [8, 3.6], id: 'funnel' }, { type: 'pitch', angle: 8, radius: 40, width: [3.6, 3.175], id: 'flare' });
      } else if (par && par.kind === 'Y') {
        const sg = par.branch === 0 ? 1 : -1;
        from = { rel: 'r' + par.run, forward: 0, left: sg * (HW.config.laneW / 2 + HW.config.wallT), pitch: 0 }; start = 'fly'; vIn = 250;
        pieces.push({ type: 'bend', angle: 15 * sg, radius: 40, id: 'forkA' }, { type: 'bend', angle: -15 * sg, radius: 40, id: 'forkB' });
      } else { from = { at: [-80, 1.2, 40 * i], heading: 90 }; }
      let end = 'stop';
      run.forEach((ch, k) => {
        const made = PIECES[ch].make();
        made.forEach((pc, j) => { pc.id = 'p' + k + (made.length > 1 ? String.fromCharCode(97 + j) : ''); pc.code = ch; pieces.push(pc); });
        if (ch === 'J') end = 'fly';
        if (ch === 'Y') end = { split: T2.kids[i].map((c) => 'r' + c), policy: 'alternate' };
        if (PIECES[ch].hazard) hazards.push(Object.assign({ track: id, piece: pieces[pieces.length - 1].id }, PIECES[ch].hazard));
        if (ch === 'M' && m.start === 'P' && i > 0) {
          // round again: join the start of run 1 (the same pose a closed loop comes back to)
          pieces.push({ type: 'join', to: [-80, 1.2, 0], heading: 90, pitch: 0, id: 'merge' });
          end = { to: 'r0', s: 0 };
        }
      });
      const closed = (!!m.closed[i] || run.includes('M')) && i === 0 && m.start === 'P';
      if (closed) pieces.push({ type: 'join', to: from.at, heading: from.heading, pitch: 0, id: 'close' });
      return { id, name: 'run ' + (i + 1), from, vIn, pieces, start, end, closed };
    });
    const feat = FEATURED.find((f) => f.code === encode(m));
    const set = {
      id: 'custom', name: feat ? feat.name : 'My Track', year: 2026, floor: 'rug', code: encode(m),
      tag: (feat ? feat.tag + ' · ' : 'built in the Track Builder · ') + encode(m),
      blurb: feat ? feat.blurb + ' Built from stock pieces in the Track Builder: open Build to take it apart.' : 'A track from the Track Builder. Share it with its code: the link carries the whole track.',
      tracks, hazards, startV: m.start === 'P' ? 250 : 0,
      start: m.start === 'L' ? { launcher: 'launcher' } : { track: 'r0', s: m.start === 'T' ? 2 : 4 },
      autoStart: { cars: 3, every: 2.5 }, custom: true,
    };
    return set;
  }

  // What the builder should warn about: dead ends (a run that stops without a brake)
  function deadEnds(m) {
    const out = [];
    m.runs.forEach((run, i) => {
      const last = run[run.length - 1];
      if (m.closed[i]) return;
      if (last && PIECES[last].ends && !(last === 'M' && m.start !== 'P')) return;
      out.push(i);
    });
    return out;
  }

  // Drive one car down a custom track, headless, and say what happened and where: the
  // builder's live check ("falls off the loop", "stops on the up ramp", "finishes in 2.3 s").
  function testRun(set, RAPIER, carIdx = 0, strength = null) {
    HW.sets.__test = Object.assign({}, set, { id: '__test' });
    const L = HW.layout.build(HW.config, '__test');
    const bus = HW.makeBus();                             // silent: the page never hears a test drive
    const sim = new HW.Sim({ RAPIER: RAPIER || null, layout: L, catalog: [HW.catalog[carIdx]], bus });
    const car = sim.cars[0], h = 1 / sim.cfg.substepHz;
    sim.setSwitch(true);
    for (let i = 0; i < 0.4 / h; i++) sim.step(h);
    sim.placeOnTrack(car, L.start.s, set.startV || 0, 0, false, L.start.track);
    const ln = L.launchers[0];
    // a launcher with a fixed strength fires at it; a random one is tested at a firm pull
    if (ln) { ln.car = car; HW.stunts.fire(sim, ln, strength != null ? strength : ln.vary ? 0.85 : ln.strength); }
    const where = (c) => { const tr = c.track || L.start.track, reg = tr.region(c.s) || ''; const m = /^p(\d+)/.exec(reg); return { run: tr.index, piece: m ? +m[1] : -1, region: reg, pos: [c.pos.x, c.pos.y, c.pos.z] }; };
    const res = { ok: false, events: [], top: 0 };
    const off = [];
    const on = (type, fn) => { const f = (e) => { if (e.car === car) fn(e); }; bus.on(type, f); off.push([type, f]); };
    on('derail', (e) => { res.events.push(Object.assign({ kind: e.cause }, where(car))); if (!res.fail && e.cause !== 'jump') res.fail = Object.assign({ kind: e.cause }, where(car)); });
    on('recapture', () => res.events.push(Object.assign({ kind: 'caught' }, where(car))));
    on('gate', (e) => { if (e.gate.kind === 'finish' && !res.ok) { res.ok = true; res.time = car.lastLap; } });
    let n = 0, lastRun = 0;
    const t0 = sim.time;
    while (n++ < 14 / h) {
      sim.step(h);
      // a merge brings it back to run 1: once round is a pass
      const ri = car.track ? car.track.index : lastRun;
      if (ri === 0 && lastRun > 0 && car.mode === 'track' && !res.ok) { res.ok = true; res.back = true; res.time = sim.time - t0; break; }
      lastRun = ri;
      res.top = Math.max(res.top, car.speed);
      if (car.mode === 'retrieving') { if (!res.fail) res.fail = Object.assign({ kind: res.events.some((e) => e.kind === 'jump') ? 'missed the catch' : 'off the track' }, res.events.length ? res.events[res.events.length - 1] : where(car)); break; }
      if (car.mode === 'track' && Math.abs(car.v) < 3 && car.stallT > 0.6) {
        // coming to rest on a Brake + End piece is how a run is meant to finish
        const w = where(car), pc = car.track.spec.pieces.find((p) => p.id && w.region.startsWith(p.id));
        if (pc && pc.code === 'K') { if (!res.ok) { res.ok = true; res.time = sim.time - car.lapStartT; } }
        else if (!res.ok && !res.fail) res.fail = Object.assign({ kind: 'stopped' }, w);
        break;
      }
      if (res.ok && car.track && !car.track.closed && Math.abs(car.v) < 5) break;
      if (res.ok && car.track && car.track.closed && sim.time > 6) break;
    }
    if (!res.ok && !res.fail) res.fail = Object.assign({ kind: car.track && car.track.closed ? 'laps' : 'still going' }, where(car));
    if (car.laps && L.path.closed) { res.ok = true; res.laps = car.laps; }
    for (const [t, f] of off) bus.off(t, f);
    try { if (sim.fb) { sim.fb.events.free(); sim.fb.world.free(); } } catch (e) { /* freeing is best effort */ }
    delete HW.sets.__test;
    return res;
  }

  // Featured tracks: builder codes that show the pieces off. Each passed a test drive with
  // all five castings (tools/simtest.mjs code <code>), except where the blurb says otherwise.
  const FEATURED = [
    { id: 'commute', code: 'PSBOSBllSBCSBll~', name: 'The Daily Commute', tag: 'loop · corkscrew · four boosters',
      blurb: 'An oval with a loop on one straight and a corkscrew on the other. Four boosters keep it going all day, like traffic.' },
    { id: 'lanes', code: 'PSBY.SBOSuSSSSSSuM.SBCSvSSSSSSvM', name: 'Pick a Lane', tag: 'splitter · loop or corkscrew · merge',
      blurb: 'A moulded splitter sends each car left into a loop or right into a corkscrew, and both branches come back round to the same start.' },
    { id: 'hammer', code: 'PSSBSXSBllSBSWSBll~', name: 'Hammer Time', tag: 'swinging hammer · paddle wheel',
      blurb: 'A booster oval with a swinging hammer on one side and a paddle wheel on the other. Timing is everything; most cars have none.' },
    { id: 'beltway', code: 'PBSBSbSBSbSBSbSBSb~', name: 'Banked Beltway', tag: 'four banked turns · eight boosters',
      blurb: 'Flat out on a square of banked turns with a booster on every straight. The fastest lap in the building.' },
    { id: 'leap', code: 'L9SOOSXSJ.SCSWSF', name: 'Leap of Faith', tag: 'launcher · double loop · hammer · jump · corkscrew',
      blurb: 'A full-strength launch into a double loop, past a hammer, over a gap, through a corkscrew and a paddle wheel to the finish. Four of the five castings make it.' },
    { id: 'tower', code: 'TSDSBJ.SBOSF', name: 'Tower of Terror', tag: 'drop tower · down ramp · jump · loop',
      blurb: 'Off the drop tower, down a ramp, a booster, a jump and a loop to the finish. The Aeroflash, lightest of the five, tends to fly past the catch.' },
  ];

  HW.builderCodec = { PIECES, STARTS, FEATURED, decode, encode, toSet, tree, deadEnds, testRun };
})(window.HW);
