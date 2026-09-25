// 33-track-build.js - turns a SET (plain data, 35-sets.js) into the layout the physics,
// renderer and Rapier world use.
//
// A set is a graph of TRACKS. Each track is a chain of pieces (31-track-pieces.js, plus
// prop pieces such as the V2791 hub lanes) built into one Path: a closed circuit, or an
// open run with two ends. What happens at an open end is data:
//   'stop'                     a buffer: the car bounces off it and comes to rest
//   'fly'                      a lip: the car leaves as a free rigid body (a jump)
//   { to: 'id', s: 0 }         the run continues on another track (a merge when several
//                              tracks lead to the same one)
//   { split: ['a','b'], policy: 'alternate' | 'random' }   a splitter
// Crossings are simply tracks that intersect in space; the car-car contact code already
// handles cars meeting there.
//
// Props (the V2791 hub) are built around the tracks: prepare() before, finish() after.
(function (HW) {
  const D2R = Math.PI / 180;
  HW.propTypes = HW.propTypes || {};
  HW.propTypes['hub-v2791'] = HW.v2791;
  HW.sets = HW.sets || {};

  const PIECE_LEN = 30.5;          // [M] a straight orange track piece is 12 in; joints fall every piece

  // A run starts at an absolute pose, or relative to where an earlier run ENDS:
  // { rel: 'id', forward, left, up, heading (turn, deg), pitch (absolute, deg) } - a catch
  // ramp placed across a gap from a jump lip.
  function startOf(from, ctx) {
    if (!from.rel) return HW.pieces.startPose(from);
    const e = ctx.ends[from.rel];
    if (!e) throw new Error('track ' + from.rel + ' must come before the run that starts from it');
    const V = HW.pieces.vec, t = e.t, hl = Math.hypot(t[0], t[2]) || 1;
    const fwd = [t[0] / hl, 0, t[2] / hl], left = V.cross([0, 1, 0], fwd);
    const at = V.add(V.add(V.add(e.p, V.sc(fwd, from.forward || 0)), V.sc(left, from.left || 0)), [0, from.up || 0, 0]);
    const heading = Math.atan2(fwd[0], -fwd[2]) * 180 / Math.PI - (from.heading || 0);
    return HW.pieces.startPose({ at, heading, pitch: from.pitch || 0 });
  }

  function buildTrack(ts, ctx) {
    const cfg = ctx.cfg;
    let pose = ts.from ? startOf(ts.from, ctx) : null;
    const segs = [], marks = [];
    ts.pieces.forEach((pc, k) => {
      const id = pc.id || pc.type + k;
      if (pc.type === 'gate') { marks.push({ at: segs.length, kind: pc.kind || 'finish', id }); return; }
      const make = HW.pieces.types[pc.type];
      if (!make) throw new Error('unknown piece type ' + pc.type + ' in track ' + ts.id);
      const r = make(pc, pose, ctx);
      for (const sg of r.segs) {
        const m = sg.meta;
        m.piece = id; m.pieceType = pc.type;
        if (m.region == null) m.region = pc.region || id;
        if (m.name == null) m.name = id;
        if (m.channel == null) m.channel = pc.render !== false;
        if (m.flat == null && (pc.type === 'straight' || pc.type === 'pitch')) m.flat = true;
        if (pc.walls === false) m.noWalls = true;
        if (pc.roll != null) m.roll = pc.roll * D2R;
        if (pc.maxBank != null) m.maxBank = pc.maxBank;
      }
      segs.push(...r.segs);
      pose = r.pose;
    });
    if (pose) ctx.ends[ts.id] = pose;

    // Bank: pieces may bring their own rule (the V2791 lobes); straights and vertical
    // curves are flat; anything else is banked by the heartline rule at the speed a car
    // would have there, estimated from the drop since the start of the run.
    const g = HW.units.G, vIn = ts.vIn || 0, lossG = ts.lossG == null ? 0.06 : ts.lossG;
    let y0 = null;
    const bank = (i, info) => {
      if (y0 == null) y0 = info.y;
      const m = info.seg.meta;
      if (m.bank) return m.bank(info);
      if (m.flat) return { flat: true };
      if (m.roll != null) return { flat: false, roll: m.roll };
      const v2 = vIn * vIn - 2 * g * (info.y - y0) - 2 * lossG * g * info.s;
      return { flat: false, vNom: Math.sqrt(Math.max(v2, 60 * 60)), gain: 1, maxDeg: m.maxBank == null ? (ts.maxBank == null ? 50 : ts.maxBank) : m.maxBank };
    };
    const path = HW.Path.build(segs, { closed: !!ts.closed, ds: cfg.sampleDs, smoothCm: cfg.bankSmoothCm, bank });
    path.id = ts.id; path.spec = ts; path.name = ts.name || ts.id;

    // per-sample flags used by the physics: 1 = no walls here
    path.noWall = new Uint8Array(path.N);
    for (let i = 0; i < path.N; i++) if (path.segments[path.segIdx[i]].meta.noWalls) path.noWall[i] = 1;
    // region tags for the renderer and stats
    path.region = (s) => {
      const i = path.closed ? Math.floor((((s % path.length) + path.length) % path.length) / path.ds) % path.N
        : Math.max(0, Math.min(path.N - 1, Math.floor(s / path.ds)));
      return path.segments[path.segIdx[i]].meta.region;
    };
    // gates: a finish line, a lap line, a timing gate
    path.gates = marks.map((m) => ({ s: m.at < segs.length ? segs[m.at].s0 : path.length, kind: m.kind, id: m.id, track: path }));

    // joints: every piece boundary on a channel, and every 30.5 cm along a straight
    const J = [];
    for (let k = 0; k < segs.length; k++) {
      const sg = segs[k], m = sg.meta;
      if (!m.channel || m.noAutoJoints) continue;
      const newPiece = k === 0 || segs[k - 1].meta.piece !== m.piece;
      if (newPiece) J.push(sg.s0);
      if (m.pieceType === 'straight') for (let x = PIECE_LEN; x < sg.length - 3; x += PIECE_LEN) J.push(sg.s0 + x);
    }
    const ends = path.closed ? [] : [0, path.length];
    path.joints = J.filter((s) => !ends.some((e) => Math.abs(e - s) < 0.5)).sort((a, b) => a - b);
    path.clips = path.joints.slice();
    return path;
  }

  function resolveEnd(spec, byId, closed) {
    if (closed) return null;
    if (spec == null || spec === 'stop') return { kind: 'stop' };
    if (spec === 'fly') return { kind: 'fly' };
    if (spec.to) return { kind: 'link', track: byId[spec.to], s: spec.s };
    if (spec.split) return { kind: 'split', tracks: spec.split.map((id) => byId[id]), policy: spec.policy || 'alternate', n: 0 };
    return { kind: 'stop', ...spec };
  }

  // TRACK SUPPORT towers under any channel that is up off the floor and upright, placed so
  // they never pass through another stretch of track (the lesson from the loop towers).
  function autoSupports(L, cfg) {
    const out = [], f = {}, a = cfg.laneW / 2 + cfg.wallT + 1.4;
    for (const ch of L.channels) {
      const seg0 = ch.track.segments.find((sg) => sg.meta.piece === ch.name);
      if (seg0 && seg0.meta.autoSupport === false) continue;
      const n = Math.max(1, Math.round((ch.s1 - ch.s0) / 24));
      for (let k = 0; k < n; k++) {
        const s = ch.s0 + (ch.s1 - ch.s0) * (k + 0.5) / n;
        ch.track.frame(s, f);
        const top = f.py - f.uy * cfg.floorT - 0.5;
        if (f.uy < 0.5 || top < 2.5) continue;
        if (out.some((o) => Math.hypot(o.x - f.px, o.z - f.pz) < 9)) continue;
        let blocked = false;
        for (const tr of L.tracks) {
          const P = tr.P;
          for (let i = 0; i < tr.N && !blocked; i += 3) {
            if (tr === ch.track && Math.abs(tr.delta(i * tr.ds, s)) < 8) continue;
            if (P.y[i] < top + 1 && Math.hypot(P.x[i] - f.px, P.z[i] - f.pz) < a) blocked = true;
          }
        }
        if (!blocked) out.push({ kind: 'post', x: f.px, z: f.pz, top, s, half: 0.6, clip: null, track: ch.track });
      }
    }
    return out;
  }

  HW.layout = {
    // build(cfg, setId): setId defaults to cfg.set, then the first set registered
    build(cfg = HW.config, setId) {
      const id = setId || cfg.set || 'crissCross';
      const set = HW.sets[id];
      if (!set) throw new Error('no track set ' + id);
      const params = Object.assign({}, set.params);
      const ctx = { cfg, set, params, props: {}, ends: {}, floorY: set.floorY == null ? 0.8 : set.floorY };
      for (const pr of set.props || []) HW.propTypes[pr.kind].prepare(ctx, pr);

      const tracks = set.tracks.map((ts) => buildTrack(ts, ctx));
      const byId = {};
      tracks.forEach((t, i) => { t.index = i; byId[t.id] = t; });
      tracks.forEach((t) => { t.endLink = resolveEnd(t.spec.end, byId, t.closed); t.startLink = resolveEnd(t.spec.start, byId, t.closed); });

      const L = {
        set, id, tracks, byId, path: tracks[0], params,
        dims: { W: cfg.laneW, wallT: cfg.wallT, wallH: cfg.wallH, floorT: cfg.floorT },
        boosters: [], wheels: [], crossings: [], gaps: [], lanes: {}, laneS: {}, lobes: {}, hub: null,
        supports: [], foamR: params.foamR || 3, props: ctx.props,
        stats: { length: tracks.reduce((a, t) => a + t.length, 0), footprint: 0 },
      };
      // channels: the orange track that gets drawn and collided (props draw their own)
      L.channels = [];
      for (const t of tracks) {
        let cur = null;
        for (const sg of t.segments) {
          if (!sg.meta.channel) { cur = null; continue; }
          if (cur && cur.name === sg.meta.piece) { cur.s1 = sg.s0 + sg.length; continue; }
          cur = { track: t, s0: sg.s0, s1: sg.s0 + sg.length, name: sg.meta.piece, kind: sg.meta.kind || sg.meta.pieceType };
          L.channels.push(cur);
        }
      }
      for (const pr of set.props || []) HW.propTypes[pr.kind].finish(ctx, L, pr);
      L.joints = L.path.joints;

      // where the hand drops a car
      const st = set.start || {};
      if (st.booster) {
        const b = L.boosters.find((x) => x.id === st.booster);
        L.start = { track: b.track, s: b.s + (st.offset || 0) };
      } else {
        L.start = { track: byId[st.track] || tracks[0], s: st.s || 0 };
      }
      L.startS = L.start.s;

      L.supports.push(...autoSupports(L, cfg));
      // a red end block at every open end that stops the car (the same box Rapier collides with)
      L.solids = [];
      for (const t of tracks) for (const [lnk, s, sg] of [[t.endLink, t.length, 1], [t.startLink, 0, -1]]) {
        if (!lnk || lnk.kind !== 'stop') continue;
        const f = t.frame(s, {}), off = sg * 0.7, up = (cfg.wallH - cfg.floorT) / 2;
        L.solids.push({ kind: 'buffer', track: t,
          c: [f.px + f.tx * off + f.ux * up, f.py + f.ty * off + f.uy * up, f.pz + f.tz * off + f.uz * up],
          h: [cfg.laneW / 2 + cfg.wallT, (cfg.wallH + cfg.floorT) / 2 + 0.25, 0.6],
          q: HW.Q.fromBasis({ x: f.rx, y: f.ry, z: f.rz }, { x: f.ux, y: f.uy, z: f.uz }, { x: -f.tx, y: -f.ty, z: -f.tz }) });
      }
      let ext = 0;
      for (const t of tracks) for (let i = 0; i < t.N; i++) ext = Math.max(ext, Math.abs(t.P.x[i]), Math.abs(t.P.z[i]));
      L.stats.footprint = 2 * (ext + cfg.laneW / 2 + cfg.wallT);
      L.view = Object.assign({ look: [0, 7, 0], wide: [118, 62], wide2: [92, 38], cross: null, orbit: [0, 6, 4], bound: 40 }, set.view || {});
      return L;
    },
  };
})(window.HW);
