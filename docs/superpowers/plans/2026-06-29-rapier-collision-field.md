# Rapier Collision v1 — Mass-Varied Dot Field + Snappier Cam — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real mass-based Rapier collision — dynamic grid-intersection dot obstacles (size+density → mass, darker=denser) in a central cube — plus a snappier chase cam; portfolio nodes stay non-collidable.

**Architecture:** A pure seeded `src/core/field.ts` produces the obstacle field spec (positions on the gridline lattice, per-object radius/density/mass/color). The Rapier layer (`src/physics/`) adds a ball collider to the dart and builds the obstacles as dynamic bodies in the *same* Rapier `World`, so one `world.step()` advances everything and momentum exchange is automatic. `scene.ts` renders the obstacles as a live-updated dot cloud and tightens the cam.

**Tech Stack:** TypeScript, Vite 6, Vitest, Playwright, three.js 0.165, `@dimforge/rapier3d` (already installed).

## Global Constraints

- Rapier imported only under `src/physics/` (relaxed from "only `dart.ts`").
- Every Rapier collider is created with `.setDensity(0)` so body mass comes SOLELY from `setAdditionalMass` — dart stays exactly mass **1**, obstacle is exactly **k**.
- Restitution **0.6** on dart + obstacle colliders; obstacle damping **linear 0.8 / angular 0.8**.
- The obstacle field **excludes the origin** (spawn point) so the dart isn't embedded.
- world JS chunk stays `<= 250_000` gzip; **no new dependencies** (Rapier already present); `worldWasm` unchanged.
- Portfolio nodes remain non-collidable.
- `master` is LIVE (Cloudflare prod). Work stays on `feat/rapier-collision-field`; **ask before merging.**
- Per-task floor: `npm run typecheck && npm test`. Tasks touching the build/world also run `npm run build && npm run budgets`; the integration task runs `npm run e2e`.

---

### Task 1: Pure obstacle field (`src/core/field.ts`)

**Files:**
- Create: `src/core/field.ts`
- Test: `tests/field.test.ts`

**Interfaces:**
- Consumes: `Vec3` from `./types`, `mulberry32` from `./rng`.
- Produces:
  - `interface Rgb { r: number; g: number; b: number }`
  - `interface ObstacleSpec { pos: Vec3; radius: number; density: number; mass: number; color: Rgb }`
  - `interface FieldOpts { extent?: number; spacing?: number; spawnClear?: number; minRadius?: number; maxRadius?: number; minDensity?: number; maxDensity?: number; massClampLo?: number; massClampHi?: number }`
  - `densityColor(density: number, minD?: number, maxD?: number): Rgb`
  - `makeObstacleField(seed: number, opts?: FieldOpts): ObstacleSpec[]`

- [ ] **Step 1: Write the failing test**

Create `tests/field.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeObstacleField, densityColor } from '../src/core/field';

const sum = (c: { r: number; g: number; b: number }) => c.r + c.g + c.b;

describe('obstacle field (pure, seeded)', () => {
  it('fills the central lattice minus the spawn origin', () => {
    const f = makeObstacleField(1981, { extent: 180, spacing: 90 });
    expect(f).toHaveLength(124); // 5^3 = 125 lattice points minus the origin
    // no obstacle sits at the spawn origin
    expect(f.some((o) => o.pos.x === 0 && o.pos.y === 0 && o.pos.z === 0)).toBe(false);
    // every position is on the 90-unit lattice within +/-180
    for (const o of f) {
      for (const c of [o.pos.x, o.pos.y, o.pos.z]) {
        expect(c % 90).toBe(0);
        expect(Math.abs(c)).toBeLessThanOrEqual(180);
      }
    }
  });

  it('mass factor stays within the clamp range', () => {
    const f = makeObstacleField(7, { extent: 180, spacing: 90, massClampLo: 0.1, massClampHi: 8 });
    for (const o of f) {
      expect(o.mass).toBeGreaterThanOrEqual(0.1);
      expect(o.mass).toBeLessThanOrEqual(8);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(makeObstacleField(42)).toEqual(makeObstacleField(42));
  });

  it('densityColor is monotonic: denser is darker', () => {
    expect(sum(densityColor(15))).toBeLessThan(sum(densityColor(0.2)));
    // mid density sits between the extremes
    const mid = sum(densityColor(7.5));
    expect(mid).toBeLessThan(sum(densityColor(0.2)));
    expect(mid).toBeGreaterThan(sum(densityColor(15)));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/field.test.ts`
Expected: FAIL — cannot resolve `../src/core/field`.

- [ ] **Step 3: Write the implementation**

Create `src/core/field.ts`:

```ts
import type { Vec3 } from './types';
import { mulberry32 } from './rng';

export interface Rgb { r: number; g: number; b: number }

export interface ObstacleSpec { pos: Vec3; radius: number; density: number; mass: number; color: Rgb }

export interface FieldOpts {
  extent?: number; spacing?: number; spawnClear?: number;
  minRadius?: number; maxRadius?: number;
  minDensity?: number; maxDensity?: number;
  massClampLo?: number; massClampHi?: number;
}

// Low density -> light cyan; high density -> near-black. Denser = darker.
const LIGHT: Rgb = { r: 0x7f / 255, g: 0xc9 / 255, b: 0xe0 / 255 };
const DARK: Rgb = { r: 0x0a / 255, g: 0x14 / 255, b: 0x1e / 255 };

/** Denser -> darker. Monotonic lerp from LIGHT (minD) to DARK (maxD). */
export function densityColor(density: number, minD = 0.2, maxD = 15): Rgb {
  const t = Math.max(0, Math.min(1, (density - minD) / (maxD - minD)));
  return {
    r: LIGHT.r + (DARK.r - LIGHT.r) * t,
    g: LIGHT.g + (DARK.g - LIGHT.g) * t,
    b: LIGHT.b + (DARK.b - LIGHT.b) * t,
  };
}

/**
 * Deterministic dynamic-obstacle field on the gridline lattice within a central
 * cube. Each obstacle gets a seeded radius + density; mass is (volume*density)
 * normalized so the median object ~= the ship's mass (1), clamped. The origin
 * (the dart's spawn point) is excluded so the dart is never embedded.
 */
export function makeObstacleField(seed: number, opts: FieldOpts = {}): ObstacleSpec[] {
  const extent = opts.extent ?? 180;
  const spacing = opts.spacing ?? 90;
  const spawnClear = opts.spawnClear ?? 0.5;
  const rMin = opts.minRadius ?? 2, rMax = opts.maxRadius ?? 9;
  const dMin = opts.minDensity ?? 0.2, dMax = opts.maxDensity ?? 15;
  const kLo = opts.massClampLo ?? 0.1, kHi = opts.massClampHi ?? 8;

  const n = Math.floor(extent / spacing);
  const rnd = mulberry32(seed);
  const vol = (r: number) => (4 / 3) * Math.PI * r * r * r;
  const refRaw = vol((rMin + rMax) / 2) * ((dMin + dMax) / 2); // median object -> k ~= 1

  const out: ObstacleSpec[] = [];
  for (let ix = -n; ix <= n; ix++)
    for (let iy = -n; iy <= n; iy++)
      for (let iz = -n; iz <= n; iz++) {
        const pos = { x: ix * spacing, y: iy * spacing, z: iz * spacing };
        if (Math.hypot(pos.x, pos.y, pos.z) <= spawnClear) continue; // skip spawn point
        const radius = rMin + (rMax - rMin) * rnd();
        const density = dMin + (dMax - dMin) * rnd();
        const mass = Math.max(kLo, Math.min(kHi, (vol(radius) * density) / refRaw));
        out.push({ pos, radius, density, mass, color: densityColor(density, dMin, dMax) });
      }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/field.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + full suite, then commit**

Run: `npm run typecheck && npm test`
Expected: green.

```bash
git add src/core/field.ts tests/field.test.ts
git commit -m "feat(core): pure seeded obstacle field (size/density -> mass, darker=denser)"
```

---

### Task 2: Physics — dart collider + dynamic obstacles

**Files:**
- Create: `src/physics/obstacles.ts`
- Modify: `src/physics/dart.ts`

**Interfaces:**
- Consumes: `ObstacleSpec` (Task 1), the Rapier `World`/types already used in `dart.ts`.
- Produces:
  - `class Obstacles` with `constructor(RAPIER, world, specs: ObstacleSpec[])` and `states(): { pos: Vec3 }[]` (index-aligned to `specs`).
  - `DartPhysics.create(opts?, obstacleSpecs?: ObstacleSpec[]): Promise<DartPhysics>` (new 2nd arg).
  - `DartPhysics.obstacleStates(): { pos: Vec3 }[]`.

- [ ] **Step 1: Create the obstacle bodies module**

Create `src/physics/obstacles.ts`:

```ts
import type { Vec3 } from '../core/types';
import type { ObstacleSpec } from '../core/field';

type Rapier = typeof import('@dimforge/rapier3d');
type World = InstanceType<Rapier['World']>;
type RigidBody = ReturnType<World['createRigidBody']>;

const RESTITUTION = 0.6;
const LIN_DAMP = 0.8;
const ANG_DAMP = 0.8;

/**
 * Dynamic obstacle bodies in a shared Rapier World. Each is a ball with mass set
 * SOLELY by setAdditionalMass (collider density 0), so Rapier's momentum exchange
 * with the dart depends only on the spec masses. Damped so a knocked obstacle
 * drifts then settles.
 */
export class Obstacles {
  private readonly bodies: RigidBody[] = [];

  constructor(RAPIER: Rapier, world: World, specs: ObstacleSpec[]) {
    for (const s of specs) {
      const desc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(s.pos.x, s.pos.y, s.pos.z)
        .setLinearDamping(LIN_DAMP)
        .setAngularDamping(ANG_DAMP)
        .setAdditionalMass(s.mass);
      const body = world.createRigidBody(desc);
      const col = RAPIER.ColliderDesc.ball(s.radius).setRestitution(RESTITUTION).setDensity(0);
      world.createCollider(col, body);
      this.bodies.push(body);
    }
  }

  /** Live positions, index-aligned to the specs passed in. */
  states(): { pos: Vec3 }[] {
    return this.bodies.map((b) => {
      const t = b.translation();
      return { pos: { x: t.x, y: t.y, z: t.z } };
    });
  }
}
```

- [ ] **Step 2: Give the dart a collider and host the obstacles**

In `src/physics/dart.ts`:

(a) Add imports near the top (after the existing imports):

```ts
import type { ObstacleSpec } from '../core/field';
import { Obstacles } from './obstacles';
```

(b) Add a field to the class (next to `private readonly body: RigidBody;`):

```ts
  private readonly obstacles: Obstacles | null = null;
```

(c) Change `create` to accept and forward the specs:

```ts
  static async create(opts: Partial<ControlOpts> = {}, obstacleSpecs: ObstacleSpec[] = []): Promise<DartPhysics> {
    const RAPIER = await import('@dimforge/rapier3d');
    return new DartPhysics(RAPIER, { ...DEFAULT_CONTROL, ...opts }, obstacleSpecs);
  }
```

(d) Change the constructor signature and body. The existing constructor builds the world + dart body; ADD a dart collider (density 0 so mass stays 1) and build the obstacles. New constructor:

```ts
  private constructor(RAPIER: Rapier, private readonly o: ControlOpts, obstacleSpecs: ObstacleSpec[]) {
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 }); // deep space: no gravity
    this.world.timestep = FIXED;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 0, 0)
      .setLinearDamping(this.o.linearDamping)
      .lockRotations()        // Rapier integrates translation only
      .setAdditionalMass(1);  // explicit mass; collider density 0 keeps it exactly 1
    this.body = this.world.createRigidBody(desc);
    // Ball collider so the dart physically collides with obstacles; density 0 so it
    // adds no mass (mass stays the v1 reference of 1, preserving thrust feel).
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(1.6).setRestitution(0.6).setDensity(0),
      this.body,
    );
    if (obstacleSpecs.length > 0) {
      this.obstacles = new Obstacles(RAPIER, this.world, obstacleSpecs);
    }
  }
```

(e) Add a method next to `state()`:

```ts
  obstacleStates(): { pos: import('../core/types').Vec3 }[] {
    return this.obstacles ? this.obstacles.states() : [];
  }
```

- [ ] **Step 3: Verify typecheck + build (no unit test for the WASM layer)**

Run: `npm run typecheck && npm run build && npm test`
Expected: typecheck clean; build emits as before; existing 110 unit tests still pass (no test imports Rapier). The collision behavior is exercised by the e2e in Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/physics/obstacles.ts src/physics/dart.ts
git commit -m "feat(physics): dart ball collider + dynamic mass-varied obstacle bodies"
```

---

### Task 3: Render obstacles + snappier cam (`src/world/scene.ts`)

**Files:**
- Modify: `src/world/scene.ts`

**Interfaces:**
- Consumes: `ObstacleSpec` (Task 1); obstacle positions `{ pos: Vec3 }[]` (Task 2's `obstacleStates()`).
- Produces:
  - `WorldScene.setObstacles(specs: ObstacleSpec[]): void` — builds the dot cloud.
  - `WorldScene.frame(dt, flight, obstaclePositions?: { pos: Vec3 }[]): void` — optional 3rd arg updates obstacle positions.

- [ ] **Step 1: Snappier chase cam**

In `src/world/scene.ts`, find the camera constants line (currently
`const CAM_BACK = 11, CAM_UP = 3.4, CAM_LAG = 5, CAM_LOOK_LAG = 12, CAM_TURN = 1.5;`)
and raise `CAM_TURN` so the trail swings behind the nose faster:

```ts
const CAM_BACK = 11, CAM_UP = 3.4, CAM_LAG = 5, CAM_LOOK_LAG = 12, CAM_TURN = 5;
```

(Leave horizon level — do not touch `camera.up`.)

- [ ] **Step 2: Add obstacle-cloud fields + setObstacles + per-frame update**

(a) Add imports at the top of `scene.ts`:

```ts
import type { ObstacleSpec } from '../core/field';
```

(b) Add private fields to the `WorldScene` class (near the other `private readonly` decls — note these are mutable, assigned in `setObstacles`):

```ts
  private obstacles: THREE.Points | null = null;
  private obstaclePos: Float32Array | null = null;
```

(c) Add a `setObstacles` method (place it after the constructor, before `resize`):

```ts
  /** Build the dynamic-obstacle dot cloud. Positions update each frame; size and
   *  color (denser = darker) are fixed from the spec. */
  setObstacles(specs: ObstacleSpec[]): void {
    const n = specs.length;
    if (n === 0) return;
    const pos = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n), color = new Float32Array(n * 3);
    specs.forEach((s, i) => {
      pos[i * 3] = s.pos.x; pos[i * 3 + 1] = s.pos.y; pos[i * 3 + 2] = s.pos.z;
      size[i] = s.radius;
      alpha[i] = 0.9;
      color[i * 3] = s.color.r; color[i * 3 + 1] = s.color.g; color[i * 3 + 2] = s.color.b;
    });
    const geom = new THREE.BufferGeometry();
    setAttrs(geom, pos, size, alpha, color);
    const mat = pointsMaterial(false);
    mat.uniforms.uFade!.value = 0; // obstacles never distance-fade (you must see them to dodge)
    this.obstacles = new THREE.Points(geom, mat);
    this.scene.add(this.obstacles);
    this.obstaclePos = pos;
  }
```

(d) Update `frame` to accept and apply live positions. Change the signature and add the update near the end (after the squares/grid uniform updates, before `this.renderer.render(...)`):

```ts
  frame(dt: number, flight: FlightState, obstaclePositions?: { pos: Vec3 }[]): void {
```

and add:

```ts
    // Obstacles move when hit — stream live positions into the cloud.
    if (this.obstacles && this.obstaclePos && obstaclePositions) {
      const buf = this.obstaclePos;
      for (let i = 0; i < obstaclePositions.length; i++) {
        const p = obstaclePositions[i]!.pos;
        buf[i * 3] = p.x; buf[i * 3 + 1] = p.y; buf[i * 3 + 2] = p.z;
      }
      (this.obstacles.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
```

- [ ] **Step 3: Verify typecheck + existing render tests**

Run: `npm run typecheck && npm test`
Expected: green. `obstaclePositions` is optional, so existing `scene.frame(dt, state)` callers (and `tests/render.test.ts`) are unaffected.

- [ ] **Step 4: Commit**

```bash
git add src/world/scene.ts
git commit -m "feat(world): render dynamic obstacle dot cloud + snappier chase cam"
```

---

### Task 4: Wire the field through + collision e2e

**Files:**
- Modify: `src/world/wire.ts`
- Modify: `tests/world-wire.test.ts` (its fake scene needs the new optional `frame` arg / `setObstacles`)
- Modify: `e2e/smoke.spec.ts` (add a collision-perturbation test)

**Interfaces:**
- Consumes: `makeObstacleField` (Task 1), `DartPhysics.create(opts, specs)` + `obstacleStates()` (Task 2), `scene.setObstacles` + `scene.frame(dt, state, positions)` (Task 3).

- [ ] **Step 1: Write the failing e2e test**

In `e2e/smoke.spec.ts`, add at the end of the top-level tests (before the `test.describe('mobile ...')` block):

```ts
test('collision: flying into the dot field perturbs the dart (it does not sail through cleanly)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?mode=world');
  await expect(page.locator('canvas#scene')).toBeVisible();
  const speed = page.locator('.flight-speed');
  await expect(speed).toHaveText('0 u/s');

  await page.locator('canvas#scene').click();
  await page.keyboard.down('w');

  // Sample speed for ~4s. Open space => ramp up then hold. A collision in the
  // central field => a visible drop from a prior peak. Assert a post-peak dip.
  let peak = 0, maxDrop = 0;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(200);
    const v = parseInt((await speed.textContent())?.replace(/[^\d-]/g, '') ?? '0', 10);
    peak = Math.max(peak, v);
    maxDrop = Math.max(maxDrop, peak - v);
  }
  await page.keyboard.up('w');
  expect(peak).toBeGreaterThan(5);     // it did accelerate
  expect(maxDrop).toBeGreaterThan(8);  // ...and a collision knocked the speed down
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run e2e -- smoke.spec.ts -g "collision"`
Expected: FAIL — with no obstacles wired in yet, the dart accelerates smoothly and never dips (`maxDrop` stays ~0).

- [ ] **Step 3: Wire the field into `wire.ts`**

In `src/world/wire.ts`:

(a) Add the import (next to the `DartPhysics` import):

```ts
import { makeObstacleField } from '../core/field';
```

(b) Replace the `DartPhysics.create(...)` line with a version that builds + passes the field, and register the cloud with the scene:

```ts
  const field = makeObstacleField(1981, { extent: 180, spacing: 90 });
  const dart = await DartPhysics.create({ bound: 720, boundPush: 220 }, field);
  scene.setObstacles(field);
```

(c) In the render loop, pass live obstacle positions to `scene.frame`. Replace the existing `scene.frame(dt, s);` (the cached-state line from v1) so it includes obstacle states:

```ts
    dart.step(dt, { yawDelta, pitchDelta, forward: forward(), strafe: strafe(), boost: boost() });
    const s = dart.state();
    scene.frame(dt, s, dart.obstacleStates());
    hud.setSpeed(s.speed);
```

- [ ] **Step 4: Update the world-wire unit test's fake scene**

In `tests/world-wire.test.ts`, the fake `WorldScene` must tolerate the new calls. Ensure its stub object has a `setObstacles` no-op and that its `frame` accepts the optional 3rd argument. Add/adjust the stub so it includes:

```ts
    setObstacles: () => {},
    frame: () => {},
```

(Keep whatever other stub methods the test already defines — `readout`, `dispose`, etc. — unchanged; only ensure `setObstacles` exists and `frame` ignores extra args.)

- [ ] **Step 5: Run the focused e2e + unit suite**

Run: `npm run typecheck && npm test && npm run e2e -- smoke.spec.ts -g "collision"`
Expected: typecheck clean; unit suite green; the collision e2e now PASSES (the dart accelerates then takes a measurable speed hit from the field).

- [ ] **Step 6: Full gate + commit**

Run: `npm run typecheck && npm test && npm run build && npm run budgets && npm run e2e`
Expected: all green; budgets unchanged (no new deps); world JS still ≤ 250 KB.

```bash
git add src/world/wire.ts tests/world-wire.test.ts e2e/smoke.spec.ts
git commit -m "feat(world): wire the obstacle field into flight + collision e2e"
```

---

## Self-Review

**Spec coverage:**
- Mass-varied dynamic obstacles (size+density→mass, normalized to ship mass 1, clamped) → Task 1 `makeObstacleField` + Task 2 `setAdditionalMass(mass)`. ✓
- Darker = denser → Task 1 `densityColor` (tested monotonic) + Task 3 `aColor`. ✓
- Central region only, origin excluded → Task 1 (`extent 180`, `spawnClear`). ✓
- Dart collider, colliders density 0 so mass stays 1 / k → Task 2. ✓
- Restitution 0.6, obstacle damping 0.8/0.8 → Task 2. ✓
- One shared World, momentum exchange automatic → Task 2 (obstacles built into `this.world`). ✓
- Live obstacle rendering (positions per frame, color by density) → Task 3. ✓
- Snappier cam, level horizon → Task 3 (`CAM_TURN` 1.5→5, `camera.up` untouched). ✓
- Rapier only under `src/physics/` → `field.ts` is pure; Rapier in `dart.ts` + `obstacles.ts` only. ✓
- Nodes excluded → nothing makes nodes collidable. ✓
- Collision verified → Task 4 e2e perturbation test + manual. ✓

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `ObstacleSpec`/`Rgb` defined in Task 1 and consumed verbatim in Tasks 2 (`obstacleSpecs: ObstacleSpec[]`) and 3 (`setObstacles(specs: ObstacleSpec[])`). `obstacleStates()` (Task 2) returns `{ pos: Vec3 }[]`, matching `scene.frame`'s optional `obstaclePositions?: { pos: Vec3 }[]` (Task 3) and the `dart.obstacleStates()` call (Task 4). `DartPhysics.create(opts, specs)` signature consistent between Task 2 (def) and Task 4 (use).
