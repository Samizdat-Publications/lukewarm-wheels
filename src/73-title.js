// 73-title.js - the title screen: the Lukewarm Wheels logo over the live set (Director camera,
// cars running behind it as an attract mode), a card per track set and per featured Track
// Builder track, and the trophy count. It opens on a bare link (no #s. or #t. token), and
// again with Escape or the menu button. Picking a set reloads with its token, like the set
// picker; picking the set already running just closes the screen.
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

  const T = (HW.title = {
    isOpen: false,
    init(sim) {
      T.sim = sim;
      const set = sim.layout.set;
      const cur = set.custom ? 't.' + set.code : 's.' + set.id;
      const go = (tok) => { if (tok === cur) { T.close(); return; } location.hash = tok; location.reload(); };

      const card = (tok, name, tag, thumbKey, extra) => {
        const src = HW.thumbs && HW.thumbs[thumbKey];
        const art = src ? h('img', { src, alt: '', loading: 'lazy', decoding: 'async' }) : h('div', { class: 'ph', text: name[0] });
        const here = tok === cur;
        return h('button', { class: 'tcard' + (here ? ' here' : ''), onclick: () => go(tok), 'aria-label': (here ? 'Continue: ' : 'Play ') + name },
          h('div', { class: 'art' }, art, here ? h('span', { class: 'now', text: 'Now running' }) : ''),
          h('div', { class: 'nm', text: name }), h('div', { class: 'tg', text: tag }), extra || '');
      };
      const sets = Object.values(HW.sets).filter((s) => s && s.id && !s.custom && s.id !== '__test');
      const feats = (HW.builderCodec && HW.builderCodec.FEATURED) || [];

      T.trophyLine = h('span', { class: 'trophies' });
      T.el = h('div', { id: 'title', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Lukewarm Wheels' },
        h('div', { class: 'shade' }),
        h('div', { class: 'wrap' },
          h('div', { class: 'left' },
            h('div', { class: 'kicker', text: 'A die-cast physics simulator' }),
            h('h1', { class: 'logo', html: 'Lukewarm <span>Wheels</span>' }),
            h('p', { class: 'pitch', text: 'Orange plastic track, taken far too seriously. Batteries, motor, foam boosters, gravity and every crash are simulated. None of it is scripted.' }),
            h('div', { class: 'cta' },
              h('button', { class: 'hot big', id: 'title-go', onclick: () => T.close() }, 'Play ', h('b', { text: set.name }), ' ▸'),
              h('button', { onclick: () => { T.close(); HW.ui.toggleHelp(true); } }, 'How it works')),
            h('div', { class: 'foot' }, T.trophyLine,
              h('button', { class: 'link', onclick: () => { T.close(); HW.showroom.open(); } }, 'Showroom'),
              h('button', { class: 'link', onclick: () => { T.close(); HW.builderUI.open(); } }, 'Track Builder')),
            h('p', { class: 'fine', html: 'Keys: Space booster · A add car · C camera · R replay · P photo mode · Y trophies · Esc this menu. A parody, not affiliated with any toy company.' })),
          h('div', { class: 'right' },
            h('div', { class: 'lbl', text: 'Track sets' }),
            h('div', { class: 'grid' }, sets.map((s) => card('s.' + s.id, s.name, s.tag || '', s.id)),
              h('button', { class: 'tcard build', onclick: () => { T.close(); HW.builderUI.open(); }, 'aria-label': 'Open the Track Builder' },
                h('div', { class: 'art' }, h('b', { text: 'Build' })), h('div', { class: 'nm', text: 'Build your own' }),
                h('div', { class: 'tg', text: 'snap pieces together · test-drive · share as a link' }))),
            h('div', { class: 'lbl', text: 'Featured tracks · built from stock pieces in the Track Builder' }),
            h('div', { class: 'grid small' }, feats.map((f) => card('t.' + f.code, f.name, f.tag, 'f-' + f.id))))));
      T.el.hidden = true;
      document.body.append(T.el);
      addEventListener('keydown', (e) => {
        if (!T.isOpen) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); T.close(); }
      }, true);
      // a bare link opens on the title screen; a set or track token goes straight in
      if (!HW.main.bootToken) T.open();
    },

    open() {
      if (T.isOpen || !T.el || HW.showroom.active || (HW.builderUI && HW.builderUI.panel)) return;
      T.isOpen = true;
      T.el.hidden = false;
      document.body.classList.add('titled');
      if (HW.trophies) { const c = HW.trophies.count(); T.trophyLine.textContent = '🏆 ' + c.got + ' / ' + c.all + ' trophies'; }
      T.camBefore = HW.cam.mode;
      if (HW.cam.mode !== 'director') HW.cam.setMode('director');
      setTimeout(() => { const b = document.getElementById('title-go'); if (b) b.focus(); }, 30);
    },
    close() {
      if (!T.isOpen) return;
      T.isOpen = false;
      T.el.hidden = true;
      document.body.classList.remove('titled');
      HW.ui.firstGesture();
      if (T.camBefore && T.camBefore !== 'director') HW.ui.setCam(T.camBefore);
      const st = document.getElementById('stage'); if (st) st.focus();
    },
    toggle() { if (T.isOpen) T.close(); else T.open(); },
  });
})(window.HW);
