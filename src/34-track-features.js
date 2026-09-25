// 34-track-features.js - the working parts a set can put on its track, beyond plain
// channel: foam-wheel BOOSTERS, a spring LAUNCHER, and HAZARDS that swing across the lane.
// Pieces register here while the tracks are built; finish() turns them into what the
// physics (41/44/45), the Rapier world (43) and the renderer (58) use.
(function (HW) {
  const T = HW.pieces.types, V = HW.pieces.vec;

  // A Hot Wheels power booster: a short straight through a housing with a foam wheel on
  // each side (or one side), both driven by the set's motor. The wheels reach into the lane
  // and pinch a passing car between them.
  T.booster = (pc, pose, ctx) => {
    const r = T.straight({ len: pc.len || 12 }, pose, ctx);
    for (const sg of r.segs) { sg.meta.channel = false; sg.meta.flat = true; }
    ctx.features.push({ kind: 'booster', pc, piece: ctx.curPiece, track: ctx.curTrack });
    return r;
  };

  // A spring launcher at the start of a run: a plunger behind a car at rest. Drawn as
  // ordinary channel; the plunger replaces the red end buffer.
  T.launcher = (pc, pose, ctx) => {
    const r = T.straight({ len: pc.len || 14 }, pose, ctx);
    for (const sg of r.segs) sg.meta.flat = true;
    ctx.features.push({ kind: 'launcher', pc, piece: ctx.curPiece, track: ctx.curTrack });
    return r;
  };

  // A brake run: a straight lined with rubber pads that grip the car's sides, adding `mu`
  // times its weight of drag (the catch box at the end of a real stunt set does this job).
  T.brake = (pc, pose, ctx) => {
    const r = T.straight({ len: pc.len || 30 }, pose, ctx);
    for (const sg of r.segs) { sg.meta.flat = true; sg.meta.brake = pc.mu == null ? 0.35 : pc.mu; }
    return r;
  };

  const qOf = (f) => HW.Q.fromBasis({ x: f.rx, y: f.ry, z: f.rz }, { x: f.ux, y: f.uy, z: f.uz }, { x: -f.tx, y: -f.ty, z: -f.tz });
  const at = (f, r, u, t) => [f.px + f.rx * r + f.ux * u + f.tx * t, f.py + f.ry * r + f.uy * u + f.ty * t, f.pz + f.rz * r + f.uz * u + f.tz * t];

  HW.features = {
    finish(ctx, L) {
      const cfg = ctx.cfg, W = cfg.laneW, wt = cfg.wallT;
      L.launchers = [];
      L.hazards = [];
      for (const ft of ctx.features) {
        const tr = L.byId[ft.track], pr = tr.pieces[ft.piece], pc = ft.pc, f = {};
        if (ft.kind === 'booster') {
          const sc = (pr.s0 + pr.s1) / 2, len = pr.s1 - pr.s0;
          tr.frame(sc, f);
          const foamR = pc.foamR || 2.5, reach = pc.reach == null ? 0.95 : pc.reach;
          const sides = pc.sides === 'left' ? ['left'] : pc.sides === 'right' ? ['right'] : ['right', 'left'];
          for (const side of sides) {
            const sg = side === 'right' ? 1 : -1;
            const pos = at(f, sg * (reach + foamR), 0, 0);
            const name = ft.piece + '/' + side;
            L.wheels.push({ name, pos, spin: sg, track: tr, axis: [f.ux, f.uy, f.uz] });
            L.boosters.push({ id: name, wheel: name, track: tr, s: sc, foamR, foamEdge: reach, pushSign: -sg, side, wheelPos: pos });
            // housing beside the lane, open on the lane side where the wheel reaches in
            const hw = 2.6, hh = 0.6;
            L.solids.push({ kind: 'housing', c: at(f, sg * (W / 2 + wt + hw), hh - cfg.floorT, 0), h: [hw, hh, len / 2], q: qOf(f), track: tr });
          }
          L.solids.push({ kind: 'boosterDeck', c: at(f, 0, -cfg.floorT / 2, 0), h: [W / 2 + wt, cfg.floorT / 2, len / 2], q: qOf(f), track: tr });
          // no walls where the foam comes through
          const open = foamR * 0.95;
          for (let i = Math.floor((sc - open) / tr.ds); i <= Math.ceil((sc + open) / tr.ds); i++) if (i >= 0 && i < tr.N) tr.noWall[i] = 1;
          L.foamR = foamR;
        } else if (ft.kind === 'launcher') {
          tr.plunger = true;
          L.launchers.push({
            id: ft.piece, track: tr, s: pr.s0 + (pc.rest == null ? 4 : pc.rest),
            k: pc.k || 5.5e5,                // [E] dyne/cm: a 4 cm pull gives a 44 g car ~4.2 m/s
            travel: pc.travel || 4,          // [E] cm of pull at full strength
            plungerG: pc.plungerG || 6,      // [E] g of plunger that the spring also has to throw
            strength: pc.strength == null ? 0.8 : pc.strength, vary: pc.vary !== false, auto: pc.auto !== false,
            varyMin: pc.varyMin == null ? 0.62 : pc.varyMin, varyMax: pc.varyMax == null ? 1 : pc.varyMax,
          });
        }
      }
      // Every loop and corkscrew hangs from a TRACK SUPPORT tower beside its apex, as the V2791
      // loops do: on whichever side is clear of the rest of the track, clipped to the channel.
      for (const tr of L.tracks) for (const [id, pr] of Object.entries(tr.pieces)) {
        if (pr.type !== 'loop' && pr.type !== 'corkscrew') continue;
        let top = -1, iTop = 0;
        for (let i = Math.ceil(pr.s0 / tr.ds); i < Math.min(tr.N, pr.s1 / tr.ds); i++) if (tr.P.y[i] > top) { top = tr.P.y[i]; iTop = i; }
        const f = tr.frame(iTop * tr.ds, {}), n = V.norm(V.cross([f.tx, f.ty, f.tz], [0, 1, 0]));
        const clear = (x, z) => { let d = 1e9; for (const t2 of L.tracks) for (let i = 0; i < t2.N; i += 4) d = Math.min(d, Math.hypot(t2.P.x[i] - x, t2.P.z[i] - z)); return d; };
        let best = null;
        for (const sg of [-1, 1]) {
          const x = f.px + n[0] * sg * 6.5, z = f.pz + n[2] * sg * 6.5, c = clear(x, z);
          if (!best || c > best.c) best = { x, z, c, sg };
        }
        // the clip grips the channel's outer (upper) face at the apex, on the tower's side
        const clip = at(f, 0, -(cfg.floorT + 0.25), 0).map((v, k) => v + n[k] * best.sg * (W / 2 + wt));
        L.supports.push({ kind: 'post', x: best.x, z: best.z, top: clip[1], s: iTop * tr.ds, half: 0.6, clip, track: tr, piece: id });
      }
      // hazards: { type: 'hammer' | 'paddle', track, piece or s, ... } in the set. The moving part
      // is a box: axes (rotation axis, arm, their cross product), half extents `half` on them.
      for (const hz of ctx.set.hazards || []) {
        const tr = L.byId[hz.track], f = {};
        const s = hz.s != null ? hz.s : (tr.pieces[hz.piece].s0 + tr.pieces[hz.piece].s1) / 2 + (hz.offset || 0);
        tr.frame(s, f);
        const base = { type: hz.type, track: tr, s, period: hz.period || 2.2, phase: hz.phase || 0, mass: 1e7 };
        if (hz.type === 'hammer') {
          // a pendulum hung above the lane, swinging ACROSS it; the head clears the floor by `clear`
          const arm = hz.arm || 16, clear = hz.clear == null ? 0.45 : hz.clear, head = hz.head || [1.6, 1.6, 2.4];
          const pivot = at(f, 0, arm + clear + 2 * head[1], 0);
          L.hazards.push(Object.assign(base, { pivot, axis: [f.tx, f.ty, f.tz], arm0: [-f.ux, -f.uy, -f.uz], armLen: arm + head[1],
            half: [head[2], head[1], head[0]], swing: (hz.amp || 55) * Math.PI / 180, spin: 0 }));
        } else {
          // a paddle wheel beside the lane turning about the vertical, its blade sweeping the lane
          const len = hz.len || 7, side = hz.side === 'left' ? -1 : 1;
          // the blade rides above the lane walls (0.95 cm) and below a car's roof
          const pivot = at(f, side * (W / 2 + wt + 1.2), 1.6, 0);
          L.hazards.push(Object.assign(base, { pivot, axis: [0, 1, 0], arm0: [-f.rx * side, 0, -f.rz * side], armLen: len / 2,
            half: [0.6, len / 2, 0.35], swing: 0, spin: (hz.rpm || 30) * 2 * Math.PI / 60 }));
        }
      }
    },
  };
})(window.HW);
