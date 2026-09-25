// 37-furniture.js - the room as part of the set: a kitchen table, a chair, stacks of books, a
// cardboard box, a mug. Each piece is a few solid boxes (Rapier collides with them, the
// renderer draws them; see 58-render-props.js) and is placed FROM the track rather than by
// hand: a table stands with one leg on a spiral's axis, books stack up under a jump's lip, a
// chair straddles a loop, a box slides over a straight as a tunnel. Move the track and the
// furniture follows.
(function (HW) {
  const V = HW.pieces.vec;
  const Y = [0, 1, 0];

  // world pose at a piece: { at: 'start' | 'end' | 'mid' | 'apex' } -> frame
  function frameAt(L, ref) {
    const tr = L.byId[ref.track], pr = tr.pieces[ref.piece], f = {};
    if (!pr) throw new Error('furniture: no piece ' + ref.piece + ' on ' + ref.track);
    let s = ref.at === 'start' ? pr.s0 : ref.at === 'end' ? pr.s1 : (pr.s0 + pr.s1) / 2;
    if (ref.at === 'apex') { let top = -1e9; for (let i = Math.ceil(pr.s0 / tr.ds); i < Math.min(tr.N, pr.s1 / tr.ds); i++) if (tr.P.y[i] > top) { top = tr.P.y[i]; s = i * tr.ds; } }
    tr.frame(s + (ref.offset || 0), f);
    return f;
  }
  const yawQ = (dx, dz) => { const l = Math.hypot(dx, dz) || 1; return HW.Q.fromBasis({ x: -dz / l, y: 0, z: dx / l }, { x: 0, y: 1, z: 0 }, { x: -dx / l, y: 0, z: -dz / l }); };
  // a box of half extents h centred at local (lx, ly, lz) in a yawed frame at (ox, oz)
  const boxIn = (o, dir, lx, ly, lz, h, look, extra) => {
    const r = [-dir[2], 0, dir[0]];
    return Object.assign({ kind: 'furniture', furniture: true, look, c: [o[0] + r[0] * lx + dir[0] * lz, ly, o[2] + r[2] * lx + dir[2] * lz], h, q: yawQ(dir[0], dir[2]) }, extra || {});
  };

  HW.furniture = {
    prepare() {},
    finish(ctx, L, spec) {
      const cfg = ctx.cfg, rng = HW.rng(spec.seed || 11);
      for (const it of spec.items) {
        if (it.type === 'table') {
          // the leg at `corner` stands on the axis of a spiral (a helix segment of that piece)
          const tr = L.byId[it.leg.track], seg = tr.segments.find((sg) => sg.meta.piece === it.leg.piece && sg.meta.helix);
          const c = seg.meta.helix.c, [sx, sz] = it.size, inset = 4, top = it.top, t = it.thick || 2.6;
          const ex = it.corner.includes('e') ? 1 : -1, ez = it.corner.includes('n') ? -1 : 1;
          const x0 = c[0] + ex * inset, z0 = c[2] + ez * inset;         // the table's outer corner
          const cx = x0 - ex * sx / 2, cz = z0 - ez * sz / 2;
          L.solids.push({ kind: 'furniture', furniture: true, look: 'tabletop', c: [cx, top - t / 2, cz], h: [sx / 2, t / 2, sz / 2] });
          for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const lx = cx + dx * (sx / 2 - inset), lz = cz + dz * (sz / 2 - inset);
            L.solids.push({ kind: 'furniture', furniture: true, look: 'tableleg', c: [lx, (top - t) / 2, lz], h: [2.4, (top - t) / 2, 2.4] });
          }
          L.table = { cx, cz, sx, sz, top };
        } else if (it.type === 'chair') {
          // a chair standing over a loop (its legs straddle the track), or one the track runs
          // across (seatUnder: the seat's top meets the track's underside)
          const f = frameAt(L, it.over || it.seatUnder), dir = V.norm([f.tx, 0, f.tz]), o = [f.px, 0, f.pz];
          const s = it.size || 42, seat = it.seatUnder ? f.py - cfg.floorT - 0.05 : it.seat || 46, t = 2.4, leg = s / 2 - 2.2;
          L.solids.push(boxIn(o, dir, 0, seat - t / 2, 0, [s / 2, t / 2, s / 2], 'chair'));
          for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) L.solids.push(boxIn(o, dir, a * leg, (seat - t) / 2, b * leg, [1.6, (seat - t) / 2, 1.6], 'chair'));
          // the back rises on the side away from the track's run
          L.solids.push(boxIn(o, dir, -leg, seat + 21, 0, [1.2, 21, s / 2], 'chair'));
        } else if (it.type === 'books') {
          // a stack of books propping the track up: its top meets the LOWEST point of the
          // track's underside over the stack (a sloping lip rests on the back edge)
          const f = frameAt(L, it.under), dir = V.norm([f.tx, 0, f.tz]), o = [f.px, 0, f.pz], [w, d] = it.size || [16, 23];
          const tr = L.byId[it.under.track], g = {};
          let low = f.py;
          for (let k = -1; k <= 1; k += 0.25) { tr.frame(f.s + k * d * 0.45, g); low = Math.min(low, g.py); }
          const topY = low - cfg.floorT - 0.04;
          let y = 0, k = 0;
          while (y < topY - 0.5 && k < 40) {
            const th = Math.min(topY - y, 2.2 + rng() * 1.8), sc = 0.85 + rng() * 0.15;
            L.solids.push(boxIn(o, V.rot(dir, Y, (rng() - 0.5) * 0.2), (rng() - 0.5) * 1.2, y + th / 2, (it.shift || 0) + (rng() - 0.5) * 1.2, [w * sc / 2, th / 2, d * sc / 2], 'book', { hue: rng() }));
            y += th; k++;
          }
        } else if (it.type === 'box') {
          // a cardboard box slid over a straight: two sides and a top, open at both ends
          const tr = L.byId[it.around.track], pr = tr.pieces[it.around.piece], f = tr.frame((pr.s0 + pr.s1) / 2, {});
          const dir = V.norm([f.tx, 0, f.tz]), o = [f.px, 0, f.pz], len = pr.s1 - pr.s0 - 2, w = it.width || 16, hgt = it.height || 11, wt = 0.5;
          for (const sg of [-1, 1]) L.solids.push(boxIn(o, dir, sg * (w / 2 - wt / 2), hgt / 2, 0, [wt / 2, hgt / 2, len / 2], 'cardboard'));
          L.solids.push(boxIn(o, dir, 0, hgt - wt / 2, 0, [w / 2, wt / 2, len / 2], 'cardboard', { label: true }));
        } else if (it.type === 'mug') {
          const T0 = L.table;
          const x = T0 ? T0.cx + it.at[0] : it.at[0], z = T0 ? T0.cz + it.at[1] : it.at[1], y = T0 ? T0.top : 0;
          L.solids.push({ kind: 'furniture', furniture: true, look: 'mug', c: [x, y + 4.8, z], h: [4, 4.8, 4] });
        }
      }
    },
  };
  HW.propTypes = HW.propTypes || {};
  HW.propTypes.furniture = HW.furniture;
})(window.HW);
