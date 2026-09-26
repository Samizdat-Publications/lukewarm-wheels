// 76-photo.js - photo mode (P): the HUD goes away, the camera stays free (drag to orbit, or
// follow a car), time can be frozen, and Save writes the canvas to a PNG. The canvas is read
// straight after a render in the same task, so it works without preserveDrawingBuffer.
(function (HW) {
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null && c !== '') el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  };

  const P = (HW.photo = {
    on: false, n: 0,
    init(sim) {
      P.sim = sim;
      P.freezeBtn = h('button', { 'aria-pressed': 'false', onclick: () => P.freeze(), title: 'Stop time (F)' }, 'Freeze');
      P.bar = h('div', { id: 'photobar', class: 'panel', role: 'toolbar', 'aria-label': 'Photo mode' },
        h('span', { class: 'lbl', text: 'Photo mode · drag to frame' }),
        P.freezeBtn,
        h('button', { class: 'hot', onclick: () => P.save(), title: 'Save a PNG (Enter)' }, 'Save photo'),
        h('button', { onclick: () => P.toggle(false), title: 'Back to the game (P or Esc)' }, 'Done'));
      P.bar.hidden = true;
      document.body.append(P.bar);
      addEventListener('keydown', (e) => {
        if (!P.on || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
        const k = e.key.toLowerCase();
        if (k === 'f') { e.stopImmediatePropagation(); P.freeze(); }
        else if (k === 'enter') { e.preventDefault(); e.stopImmediatePropagation(); P.save(); }
      }, true);
    },
    toggle(force) {
      P.on = force != null ? !!force : !P.on;
      document.body.classList.toggle('photo', P.on);
      P.bar.hidden = !P.on;
      if (!P.on && P.frozen) P.freeze(false);
      HW.ui.firstGesture();
    },
    freeze(force) {
      P.frozen = force != null ? !!force : !P.frozen;
      HW.main.paused = P.frozen;
      P.freezeBtn.setAttribute('aria-pressed', P.frozen ? 'true' : 'false');
      P.freezeBtn.classList.toggle('hot', P.frozen);
    },
    save() {
      const cv = document.getElementById('stage');
      let url;
      try { HW.render.render(0); url = cv.toDataURL('image/png'); } catch (e) { console.warn(e); return; }
      const name = 'lukewarm-wheels-' + (P.sim.layout.set.id || 'track') + '-' + (++P.n) + '.png';
      const a = h('a', { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      if (HW.trophies) HW.trophies.earn('cheese');
      P.bar.classList.add('flash'); setTimeout(() => P.bar.classList.remove('flash'), 300);
    },
  });
})(window.HW);
