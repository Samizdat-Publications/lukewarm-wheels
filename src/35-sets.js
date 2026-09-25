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
    view: { look: [0, 7, 0], wide: [118, 62], wide2: [92, 38], cross: { centre: [0, 4.5, 0], r: 30, h: 11 }, orbit: [0, 6, 4], bound: 40, hero: 'posts', camera: [-18, 78, 112] },
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
  };

  // ---------------------------------------------------------------- #3 Loop & Leap
  // The stunt set, after Hot Wheels' Loop & Launch / Double Loop Dare / Stunt Kicker. A spring
  // launcher fires a car through a double loop and off a kicker; it flies a gap into a funnel
  // catch ramp, swings round, gets a push from a two-wheel booster, rolls through a corkscrew,
  // dodges a swinging hammer and crosses the finish. Too weak and it drops off a loop top or
  // short into the gap; too strong and it sails over the catch. The strength is random each
  // shot unless you set it.
  S.loopLeap = {
    id: 'loopLeap', name: 'Loop & Leap', year: 2026, floor: 'rug',
    tag: 'launcher · double loop · jump · corkscrew · hammer',
    blurb: 'A spring launcher, a double loop, a jump, a corkscrew and a swinging hammer. The launcher puts ½kx² into the car and its plunger, so a light casting leaves faster than a heavy one. Too weak and a car drops off a loop top or falls short into the gap; too strong and it sails right over the catch. Off the kicker every car is a free rigid body until it lands upright in the funnel.',
    tracks: [
      {
        id: 'launch', name: 'launch lane', vIn: 330,
        from: { at: [-110, 1.2, 34], heading: 90 },
        pieces: [
          { type: 'launcher', len: 14, id: 'launcher' },
          { type: 'straight', len: 12, id: 'runup' },
          { type: 'loop', radius: 12.5, lateral: 6.5, v: 330, id: 'loop1' },
          { type: 'straight', len: 12, id: 'between' },
          { type: 'loop', radius: 12.5, lateral: 6.5, v: 310, id: 'loop2' },
          { type: 'straight', len: 18, id: 'approach' },
          { type: 'pitch', angle: 24, radius: 30, id: 'kicker' },
          { type: 'straight', len: 8, id: 'lip' },
        ],
        end: 'fly',
      },
      {
        id: 'catch', name: 'catch ramp', vIn: 250,
        from: { rel: 'launch', forward: 40, up: -0.5, pitch: -8 },
        pieces: [
          { type: 'straight', len: 34, width: [8, 3.6], id: 'funnel' },
          { type: 'pitch', angle: 8, radius: 40, width: [3.6, 3.175], id: 'flare' },
          { type: 'bend', angle: 180, radius: 22, id: 'hairpin' },
          { type: 'booster', len: 12, id: 'booster' },
          { type: 'straight', len: 8, id: 'feed' },
          { type: 'corkscrew', radius: 7, advance: 34, dir: 'right', v: 330, id: 'corkscrew' },
          { type: 'straight', len: 40, id: 'hammerRow' },
          { type: 'gate', kind: 'finish' },
          { type: 'brake', len: 44, id: 'runout' },
        ],
        start: 'fly',
        end: 'stop',
      },
    ],
    hazards: [{ type: 'hammer', track: 'catch', piece: 'hammerRow', offset: -4, period: 2.2, amp: 40, arm: 16 }],
    start: { launcher: 'launcher' },
    autoStart: { cars: 3, every: 3.0 },
  };

  // ---------------------------------------------------------------- #4 Race Day
  // A four-lane gravity drag strip, like the Hot Wheels drag race sets and a Pinewood Derby
  // track: a start gate on a steep hill, a long flat, a timing gate with a light per lane, a
  // brake run. Nothing drives the cars but gravity, so what separates them is what the model
  // already knows about each casting: its wheels' rolling resistance, its mass against its
  // frontal area, and how straight it runs.
  const lane = (i) => ({
    id: 'lane' + (i + 1), name: 'lane ' + (i + 1), vIn: 0,
    from: { at: [-120, 42, -8.25 + 5.5 * i], heading: 90, pitch: -40 },
    pieces: [
      { type: 'straight', len: 12, id: 'startGate' },
      { type: 'straight', len: 30, id: 'hill' },
      { type: 'pitch', angle: 40, radius: 60, id: 'dip' },
      { type: 'straight', len: 183, id: 'flat' },
      { type: 'gate', kind: 'finish' },
      { type: 'brake', len: 50, mu: 0.4, id: 'brake' },
    ],
    start: 'stop', end: 'stop',
  });
  S.dragStrip = {
    id: 'dragStrip', name: 'Race Day', year: 2026, floor: 'rug',
    tag: '4-lane gravity drag strip · timing gate · tuner · knockout',
    blurb: 'A four-lane gravity drag strip. Nothing drives the cars but gravity: the start gate drops, they roll down the hill and across the timing gate. What separates them is what the model knows about each casting: how freely its wheels roll, its mass against its frontal area (air drag), and how straight it runs. After each heat the stats card says why the winner won. Tune a car (coins for weight, other wheels, paint) and run a knockout.',
    tracks: [lane(0), lane(1), lane(2), lane(3)],
    start: { track: 'lane1', s: 4 },
    race: { lanes: ['lane1', 'lane2', 'lane3', 'lane4'], hold: 4 },
    view: { camera: [-150, 60, 90], orbit: [-20, 8, 0], look: [-20, 10, 0] },
  };

  // ---------------------------------------------------------------- #5 Kitchen Table Grand Prix
  // Our own set, built through the room the app already renders. The hand drops a car on the
  // kitchen table; it spirals down a table leg to the floor, runs through a cardboard-box
  // tunnel, gets a push, climbs a stack of books and jumps to another, lands in a funnel,
  // loops between the legs of a chair and is boosted back up a long ramp onto the table.
  // One continuous circuit across two tracks (the jump splits it), every mechanic in the box.
  const TABLE = 75, ON_TABLE = TABLE + 0.25;           // [M] kitchen table height; track running surface on it
  S.kitchenGP = {
    id: 'kitchenGP', name: 'Kitchen Table Grand Prix', year: 2026, floor: 'rug', room: 'kitchen',
    tag: 'table · spiral · box tunnel · book jump · chair loop · booster ramp',
    blurb: 'Our own set, through the kitchen. A car leaves the kitchen table in a spiral down a table leg, runs through a cardboard-box tunnel, gets a push from a booster, climbs a stack of books and jumps the gap to the next stack, loops under a chair, and two boosters drive it back up a long ramp onto the table. The challenge: get all five cars round without losing one, and beat the lap record.',
    tracks: [
      {
        id: 'table', name: 'table, spiral and book jump', vIn: 250,
        from: { at: [-70, ON_TABLE, -30], heading: 90 },
        pieces: [
          { type: 'straight', len: 3, id: 'startLine' },
          { type: 'gate', kind: 'lap' },
          { type: 'straight', len: 27.5, id: 'tableRun' },
          { type: 'straight', len: 20, id: 'toEdge' },
          { type: 'spiral', radius: 12, turns: 4, drop: 18.5, dir: 'left', v: 260, id: 'spiral' },
          { type: 'straight', len: 20, id: 'floor1' },
          { type: 'straight', len: 30.5, id: 'tunnel' },
          { type: 'straight', len: 12, id: 'floor2' },
          { type: 'booster', len: 12, id: 'boost1' },
          { type: 'straight', len: 12, id: 'floor3' },
          { type: 'bend', angle: -90, radius: 26, id: 'turnSouth' },
          { type: 'straight', len: 10, id: 'approach' },
          { type: 'pitch', angle: 16, radius: 40, id: 'bookRamp' },
          { type: 'straight', len: 18, id: 'bookClimb' },
          { type: 'pitch', angle: -8, radius: 130, id: 'bookLip' },
          { type: 'straight', len: 9, id: 'lip' },
        ],
        start: { to: 'catch' }, end: 'fly',
      },
      {
        id: 'catch', name: 'catch, chairs and the climb home', vIn: 280,
        from: { rel: 'table', forward: 24, up: -1.5, pitch: -6 },
        pieces: [
          { type: 'straight', len: 30, width: [8, 3.6], id: 'funnel' },
          { type: 'pitch', angle: 6, radius: 40, width: [3.6, 3.175], id: 'bookB' },
          { type: 'straight', len: 6, id: 'bookBtop' },
          { type: 'pitch', angle: -12, radius: 120, id: 'offBooks' },
          { type: 'straight', len: 8, id: 'bookSlope' },
          { type: 'pitch', angle: 12, radius: 40, id: 'toFloor' },
          { type: 'straight', len: 39, id: 'southRun' },
          { type: 'bend', angle: -90, radius: 26, id: 'turnWest' },
          { type: 'straight', len: 20, id: 'westRun' },
          { type: 'booster', len: 12, id: 'boost2' },
          { type: 'straight', len: 20, id: 'toChair' },
          { type: 'loop', radius: 12.5, lateral: 6.5, v: 400, id: 'chairLoop' },
          { type: 'straight', len: 30.5, id: 'westRun2' },
          { type: 'straight', len: 30.5, id: 'westRun3' },
          { type: 'straight', len: 28, id: 'westRun4' },
          { type: 'bend', angle: -90, radius: 26, id: 'turnNorth' },
          { type: 'booster', len: 12, id: 'rampBoost0' },
          { type: 'pitch', angle: 32, radius: 35, id: 'rampFoot' },
          { type: 'booster', len: 12, id: 'rampBoost1' },
          { type: 'straight', len: 26, id: 'ramp1' },
          { type: 'straight', len: 26, id: 'ramp2' },
          { type: 'straight', len: 19.7, id: 'ramp3' },
          // a long crest: a car coming over at speed must not take off (v^2 < g R cos 32)
          { type: 'pitch', angle: -32, radius: 150, id: 'rampTop' },
          { type: 'straight', len: 40.5, id: 'onTable' },
          { type: 'bend', angle: -90, radius: 20, id: 'toStart' },
          { type: 'join', to: [-70, ON_TABLE, -30], heading: 90, id: 'merge' },
        ],
        start: 'fly', end: { to: 'table', s: 0 },
      },
    ],
    props: [{
      kind: 'furniture', seed: 7, items: [
        { type: 'table', leg: { track: 'table', piece: 'spiral' }, corner: 'ne', size: [120, 76], top: TABLE },
        { type: 'box', around: { track: 'table', piece: 'tunnel' }, width: 17, height: 11 },
        { type: 'books', under: { track: 'table', piece: 'lip', at: 'end', offset: -6 }, size: [17, 24] },
        { type: 'books', under: { track: 'catch', piece: 'bookBtop', at: 'mid', offset: -8 }, size: [17, 26] },
        { type: 'chair', over: { track: 'catch', piece: 'chairLoop', at: 'apex' }, size: 42, seat: 46 },
        { type: 'mug', at: [-30, 18] },
      ],
    }],
    start: { track: 'table', s: 8 }, startV: 250,
    autoStart: { cars: 3, every: 3 },
    challenge: { cars: 5, laps: 3 },
    view: { camera: [280, 170, 150], orbit: [0, 20, 95], look: [0, 20, 95], bound: 150 },
  };
})(window.HW);
