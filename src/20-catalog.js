// 20-catalog.js — the 1999 Criss Cross Crash 5-Pack (Hot Wheels toy #21081).
// Colour / tampo / base / window / interior / wheel type are CONFIRMED from the Hot
// Wheels Wiki page "Criss Cross Crash 5-Pack (1999)" (fetched via the MediaWiki API —
// see docs/CATALOG-SOURCES.md). Dimensions (cm) and masses (g) are ESTIMATES.
// Field names are load-bearing: the physics (41-cars.js) reads massG, lengthCm, widthCm,
// heightCm, wheelbaseCm, trackCm, wheelRadiusCm, crr, cgFrac.
(function (HW) {
  // Per-wheel-type radius (cm) and rolling-resistance coefficient. Radii are within the
  // real 9.5-11.5 mm diameter band for 1:64 wheels; crr is an ESTIMATE (docs/RESEARCH.md s4).
  const WHEELS = {
    '5SP':  { radius: 0.50, crr: 0.022, name: '5-Spoke',   rim: '5sp'  },
    '5DOT': { radius: 0.50, crr: 0.020, name: '5-Dot',     rim: '5dot' },
    '3SP':  { radius: 0.50, crr: 0.022, name: '3-Spoke',   rim: '3sp'  },
    'SB':   { radius: 0.55, crr: 0.026, name: 'Saw Blade', rim: 'sb'   },
  };
  HW.wheelTypes = WHEELS;

  // pack metadata (used by the collector card / showroom)
  HW.pack = { name: 'Criss Cross Crash 5-Pack', year: 1999, toyNumber: '21081', madeIn: 'Thailand or Malaysia' };

  // `body` drives the procedural mesh in 51-render-cars.js:
  //   style   silhouette family
  //   cabin   { x0, x1 } greenhouse start/end as fractions of length measured from the NOSE,
  //           height = greenhouse height as a fraction of total height
  //   rakeF/rakeR  windscreen / backlight rake as a fraction of the cabin length
  //   hoodDrop how far the nose top drops below the beltline, fraction of lower-body height
  //   spoiler  rear wing;  bed  open pickup bed behind the cabin
  HW.catalog = [
    { id: 'porsche959', name: 'Porsche 959', year: 1999, color: '#b9bcc2', accent: '#d9261c',
      wheelCode: '5DOT', base: 'metal, unpainted', tint: 'blue', interior: 'black',
      massG: 44, lengthCm: 6.4, widthCm: 2.45, heightCm: 1.7, wheelbaseCm: 4.6, trackCm: 2.25,
      body: { style: 'supercar', cabin: { x0: 0.30, x1: 0.74, height: 0.44 }, rakeF: 0.34, rakeR: 0.16,
              hoodDrop: 0.20, spoiler: true, bed: false },
      livery: { style: 'stripe', text: '959', sub: 'TWIN TURBO',
                colors: ['#d9261c', '#111111', '#f2f4f8'],
                tampo: 'Red, black and white "959" / "Twin Turbo" side graphics' } },

    { id: 'aeroflash', name: 'Aeroflash', year: 1999, color: '#149c46', accent: '#d9261c',
      wheelCode: '3SP', base: 'metal, black', tint: 'clear', interior: 'black',
      massG: 37, lengthCm: 7.0, widthCm: 2.35, heightCm: 1.5, wheelbaseCm: 4.9, trackCm: 2.15,
      body: { style: 'wedge', cabin: { x0: 0.36, x1: 0.70, height: 0.34 }, rakeF: 0.46, rakeR: 0.10,
              hoodDrop: 0.34, spoiler: true, bed: false },
      livery: { style: 'number', text: '3', sub: 'AEROFLASH',
                colors: ['#111111', '#d9261c', '#f2f4f8'],
                tampo: 'Black, red and white markings with race number "3"' } },

    { id: 'fordgt90', name: 'Ford GT-90', year: 1999, color: '#f5c400', accent: '#d9261c',
      wheelCode: '3SP', base: 'metal, unpainted', tint: 'clear', interior: 'black',
      massG: 39, lengthCm: 6.6, widthCm: 2.55, heightCm: 1.5, wheelbaseCm: 4.7, trackCm: 2.35,
      body: { style: 'supercar', cabin: { x0: 0.32, x1: 0.72, height: 0.40 }, rakeF: 0.40, rakeR: 0.14,
              hoodDrop: 0.24, spoiler: false, bed: false },
      livery: { style: 'number', text: '15', sub: 'GT-90',
                colors: ['#d9261c', '#f2f4f8', '#111111'],
                tampo: 'White, yellow, red and black "15" race graphics' } },

    { id: 'chevystocker', name: 'Chevy Stocker', year: 1999, color: '#6a2bbf', accent: '#f07a13',
      wheelCode: 'SB', base: 'metal, unpainted', tint: 'black', interior: 'none',
      massG: 42, lengthCm: 6.8, widthCm: 2.5, heightCm: 1.85, wheelbaseCm: 4.8, trackCm: 2.3,
      body: { style: 'stocker', cabin: { x0: 0.34, x1: 0.80, height: 0.56 }, rakeF: 0.30, rakeR: 0.30,
              hoodDrop: 0.10, spoiler: true, bed: false },
      livery: { style: 'race-stripe', text: '4777', sub: 'STOCKER',
                colors: ['#f07a13', '#f2f4f8', '#111111'],
                tampo: 'Orange, white and black stripes with "4777" on the sides' } },

    { id: 'chevy1500', name: 'Chevy 1500', year: 1999, color: '#f26a1b', accent: '#f2f4f8',
      wheelCode: '5DOT', base: 'metal, unpainted', tint: 'smoke', interior: 'black',
      massG: 46, lengthCm: 7.2, widthCm: 2.55, heightCm: 2.3, wheelbaseCm: 5.0, trackCm: 2.35,
      body: { style: 'pickup', cabin: { x0: 0.26, x1: 0.56, height: 0.50 }, rakeF: 0.26, rakeR: 0.14,
              hoodDrop: 0.10, spoiler: false, bed: true },
      livery: { style: 'oval', text: '1500', sub: 'CHEVY',
                colors: ['#111111', '#f2f4f8'],
                tampo: 'Black and white oval graphics' } },
  ];

  for (const c of HW.catalog) {
    const w = WHEELS[c.wheelCode] || WHEELS['5SP'];
    c.wheelRadiusCm = w.radius; c.crr = w.crr;
    // [E] centre of mass height as a fraction of body height: die-cast body + metal base
    // put it low; the pickup is the tallest and tippiest.
    c.cgFrac = c.cgFrac || (c.body.style === 'pickup' ? 0.42 : 0.38);
  }
  HW.catalogById = (id) => HW.catalog.find((c) => c.id === id);
})(window.HW);
