// 72-builder.js - the Track Builder: snap pieces together, see the track, test-drive it, share
// it. Pieces snap by construction (each starts where the last one ended, at zero curvature,
// so every join is G2); towers appear by themselves; open ends glow red; a car is driven down
// the track headless after every edit and the builder says where it would fail. The code in
// the box IS the track: Play puts it in the link (#t.<code>) and loads it.
(function (HW) {
  const C = HW.builderCodec;
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== '') el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  };
  const GROUPS = [
    ['Straights', 'Ss'], ['Curves', 'lrqpuv'], ['Banked', 'bd'], ['Hills', 'UD'],
    ['Stunts', 'OCHhJ'], ['Hazards', 'XW'], ['Parts', 'BYMFK'],
  ];
  const FAIL = { lift: 'falls off', drift: 'drifts out of the lane', hit: 'crashes', hazard: 'is knocked off', stopped: 'runs out of speed', 'missed the catch': 'misses the catch', 'off the track': 'leaves the track', 'still going': 'is still going after 14 s', laps: 'keeps lapping' };

  const B = (HW.builderUI = {
    open() {
      if (B.panel) return;
      const sim = HW.sim;
      HW.main.paused = true;
      // hide the live set: the preview replaces it until you Play or leave
      for (const g of [HW.renderTrack.group, HW.renderHub.group, HW.renderProps.group, HW.renderRace.group]) if (g) g.visible = false;
      for (const it of HW.renderCars.items) { it.model.visible = false; if (it.ring) it.ring.visible = false; }
      if (HW.overlay.group) HW.overlay.group.visible = false;
      document.body.classList.add('building');
      const set = sim.layout.set;
      B.model = C.decode(set.custom ? set.code : 'LSSOSJ.SlSBSF');
      B.run = 0; B.sel = null;
      B.build();
      B.refresh();
    },
    close() { location.reload(); },
    play() { location.hash = 't.' + C.encode(B.model); location.reload(); },

    build() {
      const root = document.getElementById('ui');
      B.startBtns = Object.entries(C.STARTS).map(([k, name]) => h('button', { 'aria-pressed': 'false', onclick: () => { B.model.start = k; B.refresh(); } }, name));
      // the launcher's pull: random each shot, or fixed (it rides in the code as L1..L9)
      B.power = h('select', { id: 'b-power', 'aria-label': 'Launcher strength' },
        h('option', { value: '', text: 'random pull' }), [...'123456789'].map((d) => h('option', { value: d, text: (+d + 1) * 10 + '% pull' })));
      B.power.addEventListener('change', () => { B.model.power = B.power.value ? +B.power.value : null; B.refresh(); });
      B.tabs = h('div', { class: 'tabs', role: 'tablist' });
      B.strip = h('div', { class: 'strip', 'aria-label': 'Pieces in this run' });
      B.status = h('div', { class: 'status', role: 'status' });
      B.code = h('input', { id: 'b-code', type: 'text', spellcheck: 'false', 'aria-label': 'Track code' });
      B.code.addEventListener('change', () => { const m = C.decode(B.code.value); if (m) { B.model = m; B.run = 0; B.sel = null; B.refresh(); } else B.code.value = C.encode(B.model); });
      B.closeBtn = h('button', { onclick: () => { B.model.closed[0] = !B.model.closed[0]; B.refresh(); }, title: 'Join the end of run 1 back to its start (hand start only)' }, 'Close the loop');
      const palette = GROUPS.map(([name, keys]) => h('div', { class: 'grp' }, h('div', { class: 'lbl', text: name }),
        h('div', { class: 'keys' }, [...keys].map((k) => h('button', { class: 'pc', title: C.PIECES[k].name + ' (' + k + ')', onclick: () => B.add(k) }, h('b', { text: k }), ' ', C.PIECES[k].name)))));
      B.panel = h('div', { id: 'builder', class: 'panel' },
        h('div', { class: 'row' }, h('span', { class: 'lbl', text: 'Track Builder' }), h('button', { class: 'close iconbtn', 'aria-label': 'Leave the builder', onclick: B.close, text: '×' })),
        h('div', { class: 'row seg' }, h('span', { class: 'lbl', text: 'Start' }), B.startBtns, B.power),
        B.tabs, B.strip,
        h('div', { class: 'row' },
          h('button', { onclick: () => B.remove(), title: 'Remove the selected piece (Backspace)' }, 'Remove'),
          h('button', { onclick: () => { B.sel = null; B.refresh(); }, title: 'Add new pieces at the end of the run' }, 'At end'),
          B.closeBtn,
          h('button', { onclick: () => { B.model = C.decode(B.model.start); B.run = 0; B.sel = null; B.refresh(); } }, 'Clear'),
          B.featured = h('select', { id: 'b-featured', 'aria-label': 'Start from a featured track' },
            h('option', { value: '', text: 'Featured…' }), C.FEATURED.map((f) => h('option', { value: f.code, text: f.name })))),
        h('div', { class: 'palette' }, palette),
        B.status,
        h('div', { class: 'row' }, h('label', { for: 'b-code', class: 'lbl', text: 'Code' }), B.code,
          h('button', { onclick: () => B.copy(), title: 'Copy a link to this track' }, 'Copy link'),
          h('button', { class: 'hot', onclick: () => B.play(), title: 'Load this track and run it' }, 'Play')));
      B.featured.addEventListener('change', () => { const m = C.decode(B.featured.value); B.featured.value = ''; if (m) { B.model = m; B.run = 0; B.sel = null; B.refresh(); } });
      root.append(B.panel);
      addEventListener('keydown', B.onKey);
    },

    onKey(e) {
      if (!B.panel || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); B.remove(); }
      else if (e.key === 'Enter') B.play();
      else if (C.PIECES[e.key]) B.add(e.key);
    },

    add(k) {
      const run = B.model.runs[B.run];
      const at = B.sel == null ? run.length : B.sel + 1;
      // a jump or a splitter ends its run: nothing may follow it
      const last = (ch) => C.PIECES[ch] && (C.PIECES[ch].children || ch === 'M');
      if (at > 0 && last(run[at - 1])) return B.flash('A ' + C.PIECES[run[at - 1]].name.toLowerCase() + ' ends the run' + (run[at - 1] === 'M' ? '.' : ': add to its own run instead.'));
      if (last(k) && at < run.length) return B.flash('A ' + C.PIECES[k].name.toLowerCase() + ' can only go at the end of a run.');
      if (k === 'M' && (B.model.start !== 'P' || B.run === 0)) return B.flash(B.run === 0 ? 'Run 1 goes round with Close the loop; Merge back is for the runs after it.' : 'Merge back needs the hand start: a launcher or a drop tower is in the way.');
      run.splice(at, 0, k);
      if (C.PIECES[k].children) for (let j = 0; j < C.PIECES[k].children; j++) { B.model.runs.push([]); B.model.closed.push(false); }
      B.sel = B.sel == null ? null : at;
      B.refresh();
    },
    remove() {
      const run = B.model.runs[B.run];
      const at = B.sel == null ? run.length - 1 : B.sel;
      if (at < 0) return;
      const k = run[at];
      if (C.PIECES[k].children) {
        // take its child runs (and theirs) with it
        const T = C.tree(B.model), drop = new Set();
        const walk = (i) => { for (const c of T.kids[i]) { drop.add(c); walk(c); } };
        for (const c of T.kids[B.run].filter((c) => T.parent[c].piece === at)) { drop.add(c); walk(c); }
        B.model.runs = B.model.runs.filter((r, i) => !drop.has(i)); B.model.closed = B.model.closed.filter((r, i) => !drop.has(i));
      }
      run.splice(at, 1);
      B.sel = B.sel == null ? null : Math.min(at, run.length - 1);
      if (B.sel != null && B.sel < 0) B.sel = null;
      B.refresh();
    },
    flash(msg) { B.status.replaceChildren(h('p', { class: 'warn', text: msg })); },
    copy() {
      const url = location.href.split('#')[0] + '#t.' + C.encode(B.model);
      try { navigator.clipboard.writeText(url).then(() => B.flash('Link copied.'), () => B.flash(url)); } catch (e) { B.flash(url); }
    },

    // ---------------------------------------------------------------- redraw everything
    refresh() {
      const m = B.model, code = C.encode(m), T = C.tree(m);
      if (B.run >= m.runs.length) B.run = 0;
      B.code.value = code;
      B.startBtns.forEach((b, i) => b.setAttribute('aria-pressed', Object.keys(C.STARTS)[i] === m.start ? 'true' : 'false'));
      B.closeBtn.disabled = m.start !== 'P';
      B.power.hidden = m.start !== 'L';
      B.power.value = m.power ? String(m.power) : '';
      B.closeBtn.setAttribute('aria-pressed', m.closed[0] ? 'true' : 'false');
      B.tabs.replaceChildren(...m.runs.map((r, i) => {
        const p = T.parent[i], label = i === 0 ? 'Run 1' : `Run ${i + 1} (${p ? (p.kind === 'J' ? 'catch' : p.branch ? 'right branch' : 'left branch') : 'loose'})`;
        return h('button', { role: 'tab', 'aria-selected': i === B.run ? 'true' : 'false', onclick: () => { B.run = i; B.sel = null; B.refresh(); } }, label);
      }));
      const run = m.runs[B.run];
      B.strip.replaceChildren(...(run.length ? run.map((k, i) => h('button', { class: 'chip' + (i === B.sel ? ' on' : ''), title: C.PIECES[k].name, onclick: () => { B.sel = B.sel === i ? null : i; B.refresh(); } }, h('b', { text: k }), ' ' + C.PIECES[k].name)) : [h('span', { class: 'hint', text: 'Empty: pick pieces below (or type their letters).' })]));
      B.preview();
    },

    preview() {
      const T = window.THREE, scene = HW.render.scene;
      if (B.group) { scene.remove(B.group); B.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      const lines = [];
      let set, L;
      try {
        set = C.toSet(B.model);
        HW.sets.__preview = Object.assign({}, set, { id: '__preview' });
        L = HW.layout.build(HW.config, '__preview');
      } catch (e) {
        B.status.replaceChildren(h('p', { class: 'warn', text: 'These pieces do not fit together: ' + (e.message || e) }));
        return;
      }
      const g = new T.Group();
      g.add(HW.renderTrack.buildGroup(L));
      const props = new T.Group();
      HW.renderProps.build(props, { layout: L, power: { state: { wheelAngle: 0 } } });
      g.add(props);
      // open ends glow red
      const dead = C.deadEnds(B.model);
      const glow = new T.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.55, depthWrite: false });
      for (const i of dead) {
        const tr = L.tracks[i]; if (!tr) continue;
        const f = tr.frame(tr.length, {});
        const s = new T.Mesh(new T.SphereGeometry(3.2, 20, 14), glow);
        s.position.set(f.px, f.py + 1, f.pz);
        g.add(s);
      }
      if (B.model.start !== 'P' && B.model.runs.some((r) => r[r.length - 1] === 'M')) lines.push({ warn: true, text: 'Merge back only works with the hand start: a launcher or drop tower sits where the runs would come back in.' });
      if (dead.length) lines.push({ warn: true, text: `Open end on ${dead.map((i) => 'run ' + (i + 1)).join(', ')}: finish it with Brake + end, a jump, a splitter, or close the loop.` });
      for (const w of L.warnings) lines.push({ warn: true, text: 'Run ' + (1 + +w.track.slice(1)) + ': ' + w.text + '.' });
      scene.add(g);
      B.group = g;
      // frame the preview: keep the whole track in view as it grows, from wherever the camera
      // has been turned to, and (on a wide screen) clear of the builder panel on the left
      const b = L.bounds, c = b.centre, r = Math.max(30, b.radius), cam = HW.render.camera, ctl = HW.cam.controls;
      if (!B.framed) { cam.position.set(c[0] - r * 0.3, r * 1.1, c[2] + r * 1.5); B.framed = true; }
      const dir = cam.position.clone().sub(ctl.target).normalize();
      const tgt = new T.Vector3(c[0], Math.max(2, c[1] * 0.4), c[2]);
      if (innerWidth > 900) tgt.addScaledVector(new T.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), -r * 0.45);
      ctl.target.copy(tgt);
      cam.position.copy(tgt).addScaledVector(dir, r * 2.3);
      ctl.update();
      // test drive, after the edits settle
      clearTimeout(B.testT);
      B.showStatus(lines, { pending: true });
      B.testT = setTimeout(() => {
        const res = C.testRun(set, window.RAPIER || null, 0);
        if (res.fail && res.fail.pos) {
          const mk = new T.Mesh(new T.OctahedronGeometry(2.2), new T.MeshBasicMaterial({ color: 0xffa21a }));
          mk.position.set(res.fail.pos[0], res.fail.pos[1] + 5, res.fail.pos[2]);
          if (B.group === g) g.add(mk);
        }
        B.showStatus(lines, res);
      }, 220);
      HW.render.render(0);
    },

    showStatus(lines, res) {
      const out = [];
      if (res.pending) out.push(h('p', { text: 'Test-driving…' }));
      else if (res.ok) out.push(h('p', { class: 'ok', text: res.laps ? `A test car laps it: ${res.laps} laps in 6 s, top ${Math.round(res.top)} cm/s.`
        : res.back ? `A test car comes back round to the start in ${res.time.toFixed(2)} s, top ${Math.round(res.top)} cm/s.`
        : `A test car makes it: ${res.time != null ? res.time.toFixed(2) + ' s, ' : ''}top ${Math.round(res.top)} cm/s.` }));
      else if (res.fail) {
        const run = B.model.runs[res.fail.run] || [], k = run[res.fail.piece];
        const where = k ? `the ${C.PIECES[k].name.toLowerCase()} (run ${res.fail.run + 1}, piece ${res.fail.piece + 1})` : `run ${res.fail.run + 1}`;
        out.push(h('p', { class: 'warn', text: `A test car ${FAIL[res.fail.kind] || res.fail.kind} at ${where}.` }));
      }
      for (const l of lines) out.push(h('p', { class: l.warn ? 'warn' : '', text: l.text }));
      B.status.replaceChildren(...out);
    },
  });
})(window.HW);
