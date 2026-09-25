// 35-sets.js - the track sets, as plain data. 33-track-build.js turns one into a layout.
//
// A set: { id, name, blurb, params (set-specific geometry), props, tracks, start, view }.
// A track: { id, closed, from: { at, heading, pitch }, vIn, pieces: [...], end, start }.
// Piece types: straight {len}, bend {angle, radius}, pitch {angle, radius},
// join {to, heading, pitch}, gate {kind}; plus prop pieces (hubLane, lobe).
// See 31-track-pieces.js for conventions (heading 0 = north = -Z, bends + = left).
(function (HW) {
  const S = (HW.sets = HW.sets || {});

  // ---------------------------------------------------------------- #1 Criss Cross Crash
  // Mattel V2791 (2010). One continuous circuit through the red hub: two tall loops at the
  // back, two low banked sweeps at the front, the four hub lanes crossing in a #.
  S.crissCross = {
    id: 'crissCross', name: 'Criss Cross Crash', year: 2010, floor: 'rug',
    tag: 'Mattel V2791 · 1999 five-pack · live physics',
    blurb: 'The 2010 Hot Wheels <b>Criss Cross Crash</b> (Mattel V2791) with the 1999 five-pack. One continuous circuit runs through a red hub, two tall loops and two low banked sweeps. The four lanes in the hub cross in a <b>#</b>: four crash points.',
    params: {
      hubLane: 3.0,        // [E] lane centreline offset from the hub axes (lanes 6 cm apart)
      hubHalf: 14.5,       // [E] hub arm half-length: lanes leave the hub at +-14.5 cm
      deckH: 4.5,          // [E] height of the hub lane deck above the floor
      nipGap: 2.0,         // [E] gap between foam surface and far wall; a car narrower than this is not driven
      boosterAt: 7.7,      // [E] booster wheel centre, distance from the hub centre along its arm
      // lobes: each is two quintic-Hermite halves meeting at an apex (32-v2791.js)
      // q = the solved handle lengths (node tools/simtest.mjs solve); delete q to re-solve at load
      loop:  { ux: 30, yx: 26.0, beta: 70, Rt: 11, floorY: 0.8, q: [27.4072, 13.233, 163.4464, -319.8317] },  // rear pair: tall loops, inverted at the apex
      sweep: { ux: 34, yx: 2.0, beta: 0, Rt: 14, floorY: 1.5, q: [23.628, 16.5105, 48.7158, -170.9126] },     // front pair: low banked sweeps near the floor
      bankVRef: 380,       // [E] design speed (cm/s) at the lobe entry for the heartline bank
      bankLossG: 0.06,     // [E] assumed mean drag (g) along a lobe when estimating the design speed
      sweepMaxBank: 62,    // [E] bank cap on the front sweeps (deg); the rest is carried by the outer wall
    },
    props: [{ kind: 'hub-v2791' }],
    tracks: [{
      id: 'main', closed: true,
      pieces: [
        { type: 'hubLane', lane: 'C' }, { type: 'lobe', id: 'NW', shape: 'loop', turn: 0 },
        { type: 'hubLane', lane: 'A' }, { type: 'lobe', id: 'NE', shape: 'loop', turn: 1 },
        { type: 'hubLane', lane: 'D' }, { type: 'lobe', id: 'SE', shape: 'sweep', turn: 2 },
        { type: 'hubLane', lane: 'B' }, { type: 'lobe', id: 'SW', shape: 'sweep', turn: 3 },
      ],
    }],
    // START HERE: lane C, south arm, just before the S booster (instruction sheet)
    start: { booster: 'S/C', offset: -4.2 },
    view: { look: [0, 7, 0], wide: [118, 62], wide2: [92, 38], cross: { centre: [0, 4.5, 0], r: 30, h: 11 }, orbit: [0, 6, 4], bound: 40, hero: 'posts' },
    selfRunning: true,
  };

  // ---------------------------------------------------------------- #2 Drop & Jump
  // The smallest set that proves the platform: two open runs and a gap between them. A
  // car rolls off a drop tower, leaves the kicker lip as a free rigid body, flies, lands
  // in the catch ramp (recaptured into the channel if it lands upright and moving), and
  // crosses a finish gate into a buffer. The hand carries it back to the top.
  S.dropJump = {
    id: 'dropJump', name: 'Drop & Jump', year: 2026, floor: 'rug',
    tag: 'drop tower · jump · catch · finish',
    blurb: 'A drop tower, a kicker and a catch ramp: the smallest set that shows what this engine does differently. In the channel a car follows the track exactly; off the lip it is a free rigid body that flies, and it is caught again only if it lands upright and moving. Too slow and it drops into the gap; the hand carries every car back to the top.',
    tracks: [
      {
        id: 'drop', name: 'drop tower', vIn: 0,
        from: { at: [-75, 45, 0], heading: 90, pitch: -50 },
        pieces: [
          { type: 'straight', len: 28, id: 'tower' },
          { type: 'pitch', angle: 50, radius: 22, id: 'swoop' },
          { type: 'straight', len: 40, id: 'run' },
          { type: 'pitch', angle: 18, radius: 30, id: 'kicker' },
          { type: 'straight', len: 3, id: 'lip' },
        ],
        end: 'fly',
      },
      {
        id: 'catch', name: 'catch ramp',
        from: { rel: 'drop', forward: 25, up: -1, pitch: -18 },       // across the gap from the lip
        pieces: [
          { type: 'straight', len: 26, id: 'landing' },
          { type: 'pitch', angle: 18, radius: 40, id: 'flare' },
          { type: 'straight', len: 24, id: 'runout' },
          { type: 'gate', kind: 'finish' },
          { type: 'straight', len: 45, id: 'brake' },
        ],
        start: 'fly',                                                   // open behind: no buffer to land on
        end: 'stop',
      },
    ],
    start: { track: 'drop', s: 2 },
    autoStart: { cars: 3, every: 2.2 },
    view: { look: [0, 14, 0], wide: [150, 70], wide2: [110, 40], cross: null, orbit: [0, 12, 0], bound: 80, camera: [-40, 70, 140] },
  };
})(window.HW);
