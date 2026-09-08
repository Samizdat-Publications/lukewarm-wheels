// 20-catalog.js — the 1999 Criss Cross Crash 5-Pack (#21081). PLACEHOLDER data
// written by Fable for the physics; T12 (Opus) replaces liveries/wheel codes/base
// details from the Hot Wheels Wiki and keeps the field names.
// Dimensions cm, mass g. Crr per wheel type is an ESTIMATE (docs/RESEARCH.md s4).
(function (HW) {
  const WHEELS = {
    '5SP':  { radius: 0.50, crr: 0.022, name: '5-Spoke' },
    '5DOT': { radius: 0.48, crr: 0.020, name: '5-Dot' },
    '3SP':  { radius: 0.50, crr: 0.022, name: '3-Spoke' },
    'SB':   { radius: 0.60, crr: 0.026, name: 'Saw Blade' },
  };
  HW.wheelTypes = WHEELS;

  HW.catalog = [
    { id: 'porsche959', name: 'Porsche 959', year: 1999, color: '#c0c4cc', accent: '#d9261c',
      wheelCode: '5SP', base: 'metal, unpainted', tint: 'smoke', interior: 'black',
      massG: 44, lengthCm: 6.4, widthCm: 2.45, heightCm: 1.7, wheelbaseCm: 4.6, trackCm: 2.2,
      livery: { style: 'stripe', text: '959' } },
    { id: 'aeroflash', name: 'Aeroflash', year: 1999, color: '#7a1fd6', accent: '#ffd400',
      wheelCode: '3SP', base: 'plastic, black', tint: 'yellow', interior: 'black',
      massG: 35, lengthCm: 7.0, widthCm: 2.35, heightCm: 1.3, wheelbaseCm: 4.9, trackCm: 2.1,
      livery: { style: 'flames', text: 'AEROFLASH' } },
    { id: 'fordgt90', name: 'Ford GT-90', year: 1999, color: '#f2c200', accent: '#111111',
      wheelCode: '5SP', base: 'plastic, black', tint: 'smoke', interior: 'black',
      massG: 38, lengthCm: 6.6, widthCm: 2.6, heightCm: 1.5, wheelbaseCm: 4.7, trackCm: 2.35,
      livery: { style: 'stripe', text: 'GT-90' } },
    { id: 'chevystocker', name: 'Chevy Stocker', year: 1999, color: '#1f4fd6', accent: '#ffffff',
      wheelCode: '5DOT', base: 'plastic, black', tint: 'clear', interior: 'gray',
      massG: 42, lengthCm: 6.8, widthCm: 2.5, heightCm: 1.9, wheelbaseCm: 4.8, trackCm: 2.3,
      livery: { style: 'number', text: '24' } },
    { id: 'chevy1500', name: 'Chevy 1500', year: 1999, color: '#1a8f3c', accent: '#ffffff',
      wheelCode: 'SB', base: 'plastic, black', tint: 'smoke', interior: 'black',
      massG: 47, lengthCm: 7.2, widthCm: 2.6, heightCm: 2.4, wheelbaseCm: 5.0, trackCm: 2.35,
      livery: { style: 'side-band', text: '1500' } },
  ];
  for (const c of HW.catalog) {
    const w = WHEELS[c.wheelCode] || WHEELS['5SP'];
    c.wheelRadiusCm = w.radius; c.crr = w.crr;
  }
  HW.catalogById = (id) => HW.catalog.find((c) => c.id === id);
})(window.HW);
