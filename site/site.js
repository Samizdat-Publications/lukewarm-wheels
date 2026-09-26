// Lukewarm Wheels landing page: the hero reel, clips that play while on screen, and the
// build reel (milestone frames from docs/progress, oldest first).
(function () {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- hero ----------
  const hero = document.getElementById('hero-video');
  const toggle = document.getElementById('hero-toggle');
  function setHero(play) {
    if (play) hero.play().catch(() => setHero(false));
    else hero.pause();
    toggle.textContent = play ? 'Pause video' : 'Play video';
    toggle.setAttribute('aria-pressed', String(!play));
  }
  toggle.addEventListener('click', () => setHero(hero.paused));
  setHero(!reduced);

  // ---------- clips: play while at least a third is on screen ----------
  const clips = [...document.querySelectorAll('video[data-inview]')];
  if (reduced) {
    for (const v of clips) v.controls = true;
  } else if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const v = e.target;
        if (e.isIntersecting) {
          if (v.preload === 'none') v.preload = 'auto';
          v.play().catch(() => { v.controls = true; });
        } else v.pause();
      }
    }, { threshold: 0.35 });
    for (const v of clips) io.observe(v);
  } else for (const v of clips) v.controls = true;

  // ---------- the build, frame by frame ----------
  const REEL = [
    ['01', 'Sep 8', 'First render', 'Hub, four lobes, lighting. The geometry is wrong, and cars leave the track at once.'],
    ['03', 'Sep 8', 'The five castings', 'The 1999 five-pack as meshes, with masses and sizes that feed the physics.'],
    ['05', 'Sep 8', 'First crash', 'Two cars meet at the crossing, which is the whole point of the toy.'],
    ['07', 'Sep 8', 'The real shape', 'Two upright rings and two low sweeps, as the instruction sheet shows. It looked right and did not work.'],
    ['10', 'Sep 13', 'Lobes become loops', 'Banked by the heartline rule, the rear lobes turn into loops a car rides upside down.'],
    ['12', 'Sep 24', 'Version two', 'Cars held to the track exactly; the rigid-body engine only for crashes. It finally laps.'],
    ['13', 'Sep 24', 'Over the top', 'A car inverted at the top of a loop, held on by nothing but its speed.'],
    ['14', 'Sep 24', 'Sets as data', 'The engine becomes a platform: every set is data, built by one track builder.'],
    ['15', 'Sep 24', 'Loop & Leap', 'Spring launcher, double loop, a jump across a gap and a catch ramp.'],
    ['16', 'Sep 24', 'Race Day', 'A gravity drag strip with the force overlay on and a card that explains the result.'],
    ['17', 'Sep 24', 'Kitchen Table GP', 'Our own set: down a table leg, through a box, over the books.'],
    ['19', 'Sep 25', 'A room for it', 'Walls, a window, cabinets: the kitchen gets a kitchen.'],
    ['20', 'Sep 25', 'Jump cam', 'Scored jumps and a slow-motion side camera from the Director.'],
    ['21', 'Sep 25', 'Showroom', 'Each casting on a turning plinth with its card.'],
  ];
  const reel = document.getElementById('reel');
  if (reel) {
    for (const [n, date, title, text] of REEL) {
      const li = document.createElement('li');
      const img = document.createElement('img');
      img.src = 'media/progress/' + n + '.jpg'; img.alt = title; img.loading = 'lazy'; img.decoding = 'async';
      const d = document.createElement('p'); d.className = 'when'; d.textContent = date;
      const h = document.createElement('h3'); h.textContent = title;
      const p = document.createElement('p'); p.textContent = text;
      li.append(img, d, h, p);
      reel.append(li);
    }
  }
})();
