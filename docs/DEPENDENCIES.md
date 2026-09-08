# Dependencies — verified 2026-09-08

No bundler. ES modules + importmap, loaded from jsDelivr only (Artifact CSP allows
scripts from `https://cdnjs.cloudflare.com` and `https://cdn.jsdelivr.net/npm/` only).

| Package | Version | Notes |
|---|---|---|
| `three` | **0.185.1** (`THREE.REVISION === 185`) | latest stable on npm |
| `@dimforge/rapier3d-compat` | **0.20.0** (`RAPIER.version() === "0.20.0"`) | wasm inlined as base64 — no `.wasm` fetch |

## Importmap (copy-paste, verified working)

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js",
    "three/webgpu": "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.webgpu.js",
    "three/tsl": "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.tsl.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/",
    "@dimforge/rapier3d-compat": "https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.20.0/dist/rapier.mjs"
  }
}
</script>
```

Usage:

```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import RAPIER from '@dimforge/rapier3d-compat';   // DEFAULT export
await RAPIER.init();
```

### Why these exact URLs

- `build/three.module.js` internally does `import ... from './three.core.js'` — a *relative*
  import resolved by jsDelivr, so nothing extra is needed in the importmap. `three.core.js`
  verified 200 / `application/javascript`.
- Addons import from the **bare specifier `'three'`**. OrbitControls literally starts with
  `import { Controls, MOUSE, Quaternion, ... } from 'three';`, so the `"three"` importmap entry
  is mandatory — without it OrbitControls fails to resolve.
- The `"three/addons/"` key MUST keep its trailing slash (it is a prefix mapping).
- Rapier `package.json`: `"module": "dist/rapier.mjs"`, `exports["."].import = "./dist/rapier.mjs"`.
  `dist/rapier.d.ts` is `export * from "./exports"; export default RAPIER;` so both
  `import RAPIER from ...` and `import * as RAPIER from ...` work; the default export is what
  the official docs use.
- `https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.20.0/+esm` also returns valid JS,
  but the raw `dist/rapier.mjs` path is preferred — fewer moving parts, and the jsDelivr
  re-bundle header says not to use SRI with it.
- `build/three.module.min.js` also exists and works if size matters.

## Rapier API notes (confirmed against 0.20.0 typings + live run)

```js
await RAPIER.init();                                 // init(): Promise<void>, must be awaited first
const world = new RAPIER.World({x: 0, y: -981, z: 0}); // gravity Vector
world.timestep;                                       // getter/setter, default 1/60 = 0.016666667
world.step(eventQueue?, hooks?);                      // both args optional
```

Bodies and colliders:

```js
const rb = world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic()          // also .fixed() .kinematicPositionBased() .kinematicVelocityBased()
    .setTranslation(x, y, z)
    .setRotation({x, y, z, w})
    .setLinearDamping(n).setAngularDamping(n)
    .setCcdEnabled(true)
);
const col = world.createCollider(
  RAPIER.ColliderDesc.cuboid(hx, hy, hz)  // HALF extents
    .setRestitution(0.2).setFriction(1.0)
    .setDensity(1.0)                      // or .setMass(m)
    .setTranslation(x, y, z),             // offset relative to the parent body
  rb                                      // parent; omit for a body-less static collider
);
rb.translation();  // {x,y,z}
rb.rotation();     // {x,y,z,w}
```

ColliderDesc factories (exact signatures from `geometry/collider.d.ts`):

```
ball(radius)
capsule(halfHeight, radius)
cuboid(hx, hy, hz)
cylinder(halfHeight, radius)
trimesh(vertices: Float32Array, indices: Uint32Array, flags?: TriMeshFlags)
heightfield(nrows, ncols, heights: Float32Array, scale: Vector, flags?: HeightFieldFlags)
convexHull(points: Float32Array)                               -> ColliderDesc | null
convexMesh(vertices: Float32Array, indices?: Uint32Array|null) -> ColliderDesc | null
```

### Vehicle controller

Class name is **`RAPIER.DynamicRayCastVehicleController`** (`typeof === "function"`, confirmed
in-browser). Do not `new` it — build it from the world:

```js
const vc = world.createVehicleController(chassisRigidBody);
vc.addWheel(chassisConnectionCs, directionCs, axleCs, suspensionRestLength, radius);
// each frame, BEFORE world.step():
vc.setWheelEngineForce(i, force);
vc.setWheelBrake(i, brake);
vc.setWheelSteering(i, radians);
vc.updateVehicle(dt, filterFlags?, filterGroups?, filterPredicate?);
world.step();
```

Full method list (`dist/control/ray_cast_vehicle_controller.d.ts`):

- Lifecycle / query: `free()`, `updateVehicle(dt, …)`, `currentVehicleSpeed()`, `chassis()`,
  `numWheels()`, `addWheel(chassisConnectionCs, directionCs, axleCs, suspensionRestLength, radius)`
- Axes: `indexUpAxis` (get **and** set), `indexForwardAxis` (get) but **`setIndexForwardAxis`** is a SETTER PROPERTY: write `vc.setIndexForwardAxis = 2`, do not call it
  (set) — the asymmetric setter name is a real quirk of the typings, not a typo here.
- Per-wheel get/set pairs (index `i` is the first arg; getters return `number | null`):
  `wheelChassisConnectionPointCs` / `setWheelChassisConnectionPointCs`,
  `wheelSuspensionRestLength` / `setWheelSuspensionRestLength`,
  `wheelMaxSuspensionTravel` / `setWheelMaxSuspensionTravel`,
  `wheelRadius` / `setWheelRadius`,
  `wheelSuspensionStiffness` / `setWheelSuspensionStiffness`,
  `wheelSuspensionCompression` / `setWheelSuspensionCompression`,
  `wheelSuspensionRelaxation` / `setWheelSuspensionRelaxation`,
  `wheelMaxSuspensionForce` / `setWheelMaxSuspensionForce`,
  `wheelBrake` / `setWheelBrake`,
  `wheelSteering` / `setWheelSteering`,
  `wheelEngineForce` / `setWheelEngineForce`,
  `wheelDirectionCs` / `setWheelDirectionCs`,
  `wheelAxleCs` / `setWheelAxleCs`,
  `wheelFrictionSlip` / `setWheelFrictionSlip`,
  `wheelSideFrictionStiffness` / `setWheelSideFrictionStiffness`
- Read-only per-wheel state (for rendering the wheels): `wheelRotation`, `wheelForwardImpulse`,
  `wheelSideImpulse`, `wheelSuspensionForce`, `wheelSuspensionLength`, `wheelContactNormal`,
  `wheelContactPoint`, `wheelHardPoint`, `wheelIsInContact`, `wheelGroundObject`
- Vector-returning getters take an optional `target` Vector to write into (avoids per-frame garbage).

### Contact events

```js
const eq = new RAPIER.EventQueue(true);   // autoDrain
world.step(eq);
eq.drainCollisionEvents((handle1, handle2, started) => { /* collider handles */ });
eq.drainContactForceEvents(event => { /* TempContactForceEvent */ });
```

Colliders must opt in: `.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)`.

### Other world APIs confirmed present

`world.castRay(ray, maxToi, solid, filterFlags?, filterGroups?, filterExcludeCollider?,
filterExcludeRigidBody?, filterPredicate?)`, `world.castRayAndGetNormal(...)`,
`world.createCharacterController(offset)`.

## Gotchas

1. **Units.** The spike used gravity `-981` (cm/s²). Pick a scale and stay in it — Rapier's
   solver is tuned around metres, so very large or tiny scales need tuned `timestep`/damping.
2. **`ColliderDesc.cuboid` takes half-extents**, unlike `THREE.BoxGeometry` which takes full
   sizes. Divide by 2 when mirroring three.js meshes.
3. **`await RAPIER.init()` is required** before touching any Rapier class; it is what decodes
   the inlined base64 wasm. No network fetch occurs — this is exactly why `-compat` is the only
   Rapier build usable under the Artifact CSP (plain `@dimforge/rapier3d` fetches a `.wasm`
   file, which the CSP blocks).
4. **Top-level `await` inside `<script type="module">` works** and is the simplest way to
   sequence `init()`. If avoiding it, wrap in an async IIFE.
5. **`updateVehicle(dt)` must run before `world.step()`** each frame, with `dt` matching
   `world.timestep`.
6. `trimesh` wants `Float32Array` vertices (flat xyz) and `Uint32Array` indices — a
   `THREE.BufferGeometry` index is often `Uint16Array`, so convert with
   `new Uint32Array(geo.index.array)`. Trimesh colliders are hollow and should stay static; use
   `convexHull`/`convexMesh` or compound cuboids for dynamic bodies.
7. `rb.translation()` / `rotation()` allocate a fresh object per call — cache them in hot loops.
8. Under the Artifact CSP there are no external stylesheets, images, fonts or fetch/XHR: inline
   all CSS, and use procedural geometry/materials or `data:` URIs instead of loaded textures.

## Spike

`spike/loader.html` (importmap + smoke test) and `spike/serve.mjs` (static server on port 8765).

Live browser result: `THREE.REVISION = 185`, `typeof OrbitControls = function`,
`RAPIER.version() = 0.20.0`, `world.timestep = 0.016666667`, a 4×4×4 box dropped from y=40 onto
a fixed ground (half-height 1 at y=0) came to rest at **y = 2.9931** after 240 steps — the exact
expected 3.0 — `typeof RAPIER.DynamicRayCastVehicleController = "function"`, zero console errors.
