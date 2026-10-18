# Dense Clustered Field + Barrel-Roll Dodge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the grid with ~1500 loosely-clustered dynamic obstacles (with a greeter clump ahead of spawn), remove the side-thruster sprite, and replace A/D strafe with a chainable barrel-roll + lateral-dodge — keeping 60fps via a reused-buffer per-frame seam.

**Architecture:** Pure `field.ts` generates the clustered field; pure `control.stepRoll` drives the roll spin. The Rapier dart adapter applies a lateral impulse + tracks the roll angle (exposed as `bank`); the render seam streams obstacle positions over one reused `Float32Array`. Scene drops the side-thruster; A/D are edge-triggered in wire.

**Tech Stack:** TypeScript, Vite 6, Vitest, Playwright, three.js 0.165, `@dimforge/rapier3d`.

## Global Constraints

- Rapier imported only under `src/physics/`. Colliders keep `.setDensity(0)` (mass solely from `setAdditionalMass`); dart mass stays 1.
- Field is deterministic (`mulberry32`); a greeter obstacle sits at exactly `(0,0,130)` (collision e2e depends on it). Spawn bubble (`|pos| ≤ 40`) stays clear. `maxObstacles` hard-caps total.
- Obstacle render positions stream over a **reused `Float32Array`** — no per-frame object allocation.
- A/D/Arrow-Left/Right are **edge-triggered** (ignore key-repeat): one barrel roll (±2π) + one lateral impulse per press; no strafe thrust. W/S, aim-steer, right-click boost unchanged.
- `FlightInput.strafe` / `FlightState` shape stay (dormant `flight.ts` + `flight.test.ts` depend on them); the live path just passes `strafe: 0`.
- world JS chunk ≤ 250_000 gzip; no new deps; worldWasm unchanged; nodes non-collidable.
- `master` is LIVE — work on `feat/dense-field-barrel-roll`; **ask before merging.**
- Per-task floor: `npm run typecheck && npm test`. Integration tasks also `npm run build && npm run budgets`; the final task runs `npm run e2e`.

---

### Task 1: Clustered obstacle field (`field.ts`)

**Files:**
- Modify: `src/core/field.ts` (`FieldOpts` + rewrite `makeObstacleField`; keep `obstacleMass`, `densityColor`, `ObstacleSpec`)
- Modify: `tests/field.test.ts` (replace the makeObstacleField tests; keep the `obstacleMass`/`densityColor` tests)

**Interfaces:**
- Produces: `makeObstacleField(seed, opts?): ObstacleSpec[]` — now a clustered field. `FieldOpts` gains optional `clusterCount`, `perClusterMin`, `perClusterMax`, `clusterRadius`, `greeterZ`, `greeterRadius`, `maxObstacles`; `extent` default → 630, `spawnClear` default → 40. `ObstacleSpec`, `obstacleMass`, `densityColor` unchanged.

- [ ] **Step 1: Write the failing tests**

In `tests/field.test.ts`, KEEP the existing `obstacleMass(...)` and `densityColor(...)` tests. REPLACE the `makeObstacleField` describe-block contents with:

```ts
describe('obstacle field (clustered, seeded)', () => {
  const F = () => makeObstacleField(1981); // defaults: clustered, ~1500

  it('generates a dense field within the cap', () => {
    const f = F();
    expect(f.length).toBeGreaterThan(800);
    expect(f.length).toBeLessThanOrEqual(2000); // maxObstacles
  });

  it('keeps the spawn bubble clear and stays within extent', () => {
    for (const o of F()) {
      expect(Math.hypot(o.pos.x, o.pos.y, o.pos.z)).toBeGreaterThan(40 - 1e-6); // spawnClear
      for (const c of [o.pos.x, o.pos.y, o.pos.z]) expect(Math.abs(c)).toBeLessThanOrEqual(630 + 1e-6);
    }
  });

  it('places a greeter obstacle exactly on the +z spawn path', () => {
    expect(F().some((o) => o.pos.x === 0 && o.pos.y === 0 && o.pos.z === 130)).toBe(true);
  });

  it('masses stay within the clamp range', () => {
    for (const o of F()) {
      expect(o.mass).toBeGreaterThanOrEqual(0.1);
      expect(o.mass).toBeLessThanOrEqual(8);
    }
  });

  it('is deterministic for a seed, and varies by seed', () => {
    expect(makeObstacleField(42)).toEqual(makeObstacleField(42));
    expect(makeObstacleField(1)).not.toEqual(makeObstacleField(2));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/field.test.ts`
Expected: FAIL — current field is the ±180 lattice (124 objects, no greeter at z=130), so the count/greeter/extent assertions fail.

- [ ] **Step 3: Rewrite the generator**

In `src/core/field.ts`, extend `FieldOpts` and replace `makeObstacleField`. Keep `obstacleMass`, `densityColor`, `ObstacleSpec`, `Rgb` exactly as they are.

```ts
export interface FieldOpts {
  extent?: number; spacing?: number; spawnClear?: number;
  minRadius?: number; maxRadius?: number;
  minDensity?: number; maxDensity?: number;
  sizeMassLo?: number; sizeMassHi?: number;
  densMassLo?: number; densMassHi?: number;
  massClampLo?: number; massClampHi?: number;
  clusterCount?: number; perClusterMin?: number; perClusterMax?: number; clusterRadius?: number;
  greeterZ?: number; greeterRadius?: number; maxObstacles?: number;
}

/**
 * Deterministic free-floating clumps filling the grid volume, plus a guaranteed
 * "greeter" clump on the +z spawn path so obstacles are found immediately (and the
 * collision e2e is deterministic). The spawn bubble is kept clear. Seeded; capped.
 */
export function makeObstacleField(seed: number, opts: FieldOpts = {}): ObstacleSpec[] {
  const extent = opts.extent ?? 630;
  const spawnClear = opts.spawnClear ?? 40;
  const rMin = opts.minRadius ?? 2, rMax = opts.maxRadius ?? 9;
  const dMin = opts.minDensity ?? 0.2, dMax = opts.maxDensity ?? 15;
  const clusterCount = opts.clusterCount ?? 210;
  const perMin = opts.perClusterMin ?? 5, perMax = opts.perClusterMax ?? 9;
  const clusterRadius = opts.clusterRadius ?? 55;
  const greeterZ = opts.greeterZ ?? 130;
  const greeterRadius = opts.greeterRadius ?? 70;
  const maxObstacles = opts.maxObstacles ?? 2000;

  const rnd = mulberry32(seed);
  const gauss = () => { // Box–Muller (matches galaxy.ts)
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const clampAxis = (x: number) => Math.max(-extent, Math.min(extent, x));

  const out: ObstacleSpec[] = [];
  const spec = (pos: Vec3, radius: number, density: number): ObstacleSpec =>
    ({ pos, radius, density, mass: obstacleMass(radius, density, opts), color: densityColor(density, dMin, dMax) });
  const push = (pos: Vec3) => {
    if (out.length >= maxObstacles) return;
    if (Math.hypot(pos.x, pos.y, pos.z) <= spawnClear) return; // keep the spawn bubble clear
    out.push(spec(pos, rMin + (rMax - rMin) * rnd(), dMin + (dMax - dMin) * rnd()));
  };

  // Greeter: a heavy obstacle exactly on the +z spawn path (deterministic head-on),
  // plus a few jittered around it.
  out.push(spec({ x: 0, y: 0, z: greeterZ }, rMax, (dMin + dMax) / 2));
  for (let i = 0; i < 6; i++) {
    push({
      x: clampAxis(gauss() * greeterRadius * 0.5),
      y: clampAxis(gauss() * greeterRadius * 0.5),
      z: clampAxis(greeterZ + gauss() * greeterRadius * 0.5),
    });
  }

  // Free-floating clumps across the volume.
  for (let c = 0; c < clusterCount; c++) {
    const cx = (rnd() * 2 - 1) * extent, cy = (rnd() * 2 - 1) * extent, cz = (rnd() * 2 - 1) * extent;
    const per = perMin + Math.floor(rnd() * (perMax - perMin + 1));
    for (let i = 0; i < per; i++) {
      push({ x: clampAxis(cx + gauss() * clusterRadius), y: clampAxis(cy + gauss() * clusterRadius), z: clampAxis(cz + gauss() * clusterRadius) });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/field.test.ts`
Expected: PASS (clustered tests + the retained obstacleMass/densityColor tests).

- [ ] **Step 5: Typecheck, full suite, commit**

Run: `npm run typecheck && npm test`
Expected: green. (`wire.ts` still calls `makeObstacleField(1981, { extent: 180, spacing: 90 })` — valid, just a smaller clustered field until Task 4 finalizes the config.)

```bash
git add src/core/field.ts tests/field.test.ts
git commit -m "feat(core): clustered obstacle field filling the grid + greeter clump"
```

---

### Task 2: Reused-buffer obstacle render seam

**Files:**
- Modify: `src/physics/obstacles.ts` (`states()` → `positions(): Float32Array`)
- Modify: `src/physics/dart.ts` (`obstacleStates()` → `obstaclePositions(): Float32Array`)
- Modify: `src/world/scene.ts` (`frame` obstacle update copies the flat buffer)
- Modify: `src/world/wire.ts` (pass `dart.obstaclePositions()`)
- Modify: `tests/world-wire.test.ts` (stub the new method)

**Interfaces:**
- Produces: `Obstacles.positions(): Float32Array` (reused, length 3·count); `DartPhysics.obstaclePositions(): Float32Array`; `WorldScene.frame(dt, flight, obstaclePositions?: Float32Array)`.

- [ ] **Step 1: Reused buffer in `obstacles.ts`**

Replace the `states()` method (and add a buffer field) in `src/physics/obstacles.ts`:

```ts
export class Obstacles {
  private readonly bodies: RigidBody[] = [];
  private readonly buf: Float32Array;

  constructor(RAPIER: Rapier, world: World, specs: ObstacleSpec[]) {
    this.buf = new Float32Array(specs.length * 3);
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

  /** Live positions as a flat xyz buffer (reused — no per-frame allocation). */
  positions(): Float32Array {
    for (let i = 0; i < this.bodies.length; i++) {
      const t = this.bodies[i]!.translation();
      this.buf[i * 3] = t.x; this.buf[i * 3 + 1] = t.y; this.buf[i * 3 + 2] = t.z;
    }
    return this.buf;
  }
}
```

Remove the now-unused `Vec3` import from `obstacles.ts` if nothing else uses it.

- [ ] **Step 2: `dart.ts` exposes the flat buffer**

In `src/physics/dart.ts`, add a module constant near the top constants:

```ts
const NO_OBSTACLES = new Float32Array(0);
```

Replace `obstacleStates()` (lines ~106-108) with:

```ts
  obstaclePositions(): Float32Array {
    return this.obstacles ? this.obstacles.positions() : NO_OBSTACLES;
  }
```

- [ ] **Step 3: `scene.ts` copies the flat buffer**

In `src/world/scene.ts`, change the `frame` signature and the obstacle-update block. Signature:

```ts
  frame(dt: number, flight: FlightState, obstaclePositions?: Float32Array): void {
```

Replace the existing obstacle-update block (the `if (this.obstacles && this.obstaclePos && obstaclePositions)` loop) with:

```ts
    if (this.obstacles && this.obstaclePos && obstaclePositions) {
      const n = Math.min(obstaclePositions.length, this.obstaclePos.length);
      this.obstaclePos.set(obstaclePositions.subarray(0, n)); // flat copy, no allocation; capped to the render buffer
      (this.obstacles.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
```

- [ ] **Step 4: `wire.ts` passes the buffer**

In `src/world/wire.ts`, change the render call:

```ts
    scene.frame(dt, s, dart.obstaclePositions());
```

- [ ] **Step 5: Update the world-wire stub**

In `tests/world-wire.test.ts`, change the dart mock's `obstacleStates: vi.fn(() => [])` to:

```ts
    obstaclePositions: vi.fn(() => new Float32Array(0)),
```

(The `scene.frame` stub already ignores extra args; if the test asserts the 3rd arg type, update it to `expect.any(Float32Array)`.)

- [ ] **Step 6: Verify + commit**

Run: `npm run typecheck && npm test && npm run build && npm run budgets`
Expected: green; budgets unchanged (no deps). The existing e2e (renders the world each frame through this seam) confirms it works in Task 4's full run.

```bash
git add src/physics/obstacles.ts src/physics/dart.ts src/world/scene.ts src/world/wire.ts tests/world-wire.test.ts
git commit -m "perf(world): stream obstacle positions over a reused Float32Array (no per-frame alloc)"
```

---

### Task 3: Barrel-roll dodge

**Files:**
- Modify: `src/core/flight-types.ts` (`FlightInput.roll`)
- Modify: `src/core/control.ts` (`stepRoll`)
- Test: `tests/control.test.ts` (stepRoll tests)
- Modify: `src/physics/dart.ts` (roll target/angle + side-step impulse)
- Modify: `src/world/wire.ts` (edge-triggered A/D → roll; strafe → 0)

**Interfaces:**
- Produces: `FlightInput.roll?: -1 | 0 | 1`; `stepRoll(angle, target, speed, dt): number`.

- [ ] **Step 1: Add `roll` to the input contract**

In `src/core/flight-types.ts`, add to `FlightInput` (keep `strafe` for the dormant `flight.ts`):

```ts
  boost?: boolean; // optional so legacy flight.ts/flight.test.ts are unaffected
  roll?: -1 | 0 | 1; // edge event: -1 = roll left (A), +1 = roll right (D); one tick per press
```

- [ ] **Step 2: Write the failing `stepRoll` tests**

In `tests/control.test.ts`, add (import `stepRoll` alongside the others):

```ts
describe('stepRoll (barrel-roll spin)', () => {
  it('snaps to target when within one step', () => {
    expect(stepRoll(0, 0.1, 16, 0.05)).toBeCloseTo(0.1, 9); // max step 0.8 >= 0.1
  });
  it('moves at most speed*dt toward the target (no overshoot)', () => {
    expect(stepRoll(0, 100, 16, 0.05)).toBeCloseTo(0.8, 9); // 16*0.05
    expect(stepRoll(0, -100, 16, 0.05)).toBeCloseTo(-0.8, 9);
  });
  it('converges to a full 2π roll over time', () => {
    let a = 0; const target = 2 * Math.PI;
    for (let i = 0; i < 200; i++) a = stepRoll(a, target, 16, 0.05);
    expect(a).toBeCloseTo(target, 6);
  });
  it('holds at the target', () => {
    expect(stepRoll(2, 2, 16, 0.05)).toBe(2);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/control.test.ts`
Expected: FAIL — `stepRoll` is not exported.

- [ ] **Step 4: Implement `stepRoll`**

In `src/core/control.ts`, add:

```ts
/** Move `angle` toward `target` by at most speed·dt (constant angular speed, no overshoot). */
export function stepRoll(angle: number, target: number, speed: number, dt: number): number {
  const max = speed * dt;
  const d = target - angle;
  if (Math.abs(d) <= max) return target;
  return angle + Math.sign(d) * max;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/control.test.ts`
Expected: PASS (all, including the existing facing/thrust/aim tests).

- [ ] **Step 6: Apply roll in the dart adapter**

In `src/physics/dart.ts`:

(a) Import `stepRoll`:

```ts
import {
  DEFAULT_CONTROL, headingFrom, rightFrom, integrateFacing, thrustForce, boundaryForce, stepRoll,
  type ControlOpts,
} from '../core/control';
```

(b) Add constants near `FIXED`:

```ts
const ROLL_SPEED = 16;       // rad/s — ~0.4s per 360°; chaining keeps it spinning
const SIDESTEP_IMPULSE = 12; // lateral dodge impulse per roll (mass 1; damped)
const TWO_PI = Math.PI * 2;
```

(c) Add a field next to `private bank = 0;`:

```ts
  private rollTarget = 0;
```

(d) In `step()`, REPLACE the bank-from-strafe line
`this.bank += ((-this.strafeIntent * 0.5) - this.bank) * Math.min(1, 3 * dt);`
with the roll handling (after `const right = rightFrom(heading);` and the surge/throttle lines):

```ts
    const roll = input.roll ?? 0;
    if (roll !== 0) {
      this.rollTarget += roll * TWO_PI; // one full barrel roll per press; chaining keeps it spinning
      this.body.applyImpulse({ x: right.x * roll * SIDESTEP_IMPULSE, y: 0, z: right.z * roll * SIDESTEP_IMPULSE }, true); // lateral dodge
    }
    this.bank = stepRoll(this.bank, this.rollTarget, ROLL_SPEED, dt); // bank now carries the barrel-roll spin
```

(Leave `this.strafeIntent = Math.max(-1, Math.min(1, input.strafe));` and the `moving`/`throttle` lines as they are — `input.strafe` is 0 in the live path, so `moving` reduces to `|forward| > 0`.)

- [ ] **Step 7: Edge-triggered A/D in `wire.ts`**

In `src/world/wire.ts`:

(a) Add roll state near the other input state:

```ts
  let rollEvent: -1 | 0 | 1 = 0; // set on a fresh A/D keydown, consumed next frame
```

(b) In `onKeyDown`, detect the roll edge (ignore browser auto-repeat) — replace the handler body:

```ts
  const onKeyDown = (e: { key: string; repeat?: boolean; preventDefault?: () => void }) => {
    const k = norm(e.key);
    if (isMoveKey(k)) {
      keys.add(k);
      if (!e.repeat) {
        if (k === 'a' || k === 'ArrowLeft') rollEvent = -1;
        else if (k === 'd' || k === 'ArrowRight') rollEvent = 1;
      }
      e.preventDefault?.();
    } else if (k === 'Escape' || k === 'l') location.href = `?mode=list`;
  };
```

(c) `strafe()` no longer drives movement — A/D are rolls now. Change it to a constant 0 (kept so the input shape is stable):

```ts
  const strafe = () => 0;
```

(d) In the loop, pass `roll` and consume the edge. Change the `dart.step(...)` call:

```ts
    dart.step(dt, { yawDelta, pitchDelta, forward: forward(), strafe: strafe(), boost: boost(), roll: rollEvent });
    rollEvent = 0; // consume the one-frame edge
```

- [ ] **Step 8: Verify + commit**

Run: `npm run typecheck && npm test && npm run build && npm run budgets`
Expected: green. (Roll visual + impulse are verified by the e2e dodge test in Task 4 and manually.)

```bash
git add src/core/flight-types.ts src/core/control.ts tests/control.test.ts src/physics/dart.ts src/world/wire.ts
git commit -m "feat(world): barrel-roll dodge on A/D (chainable spin + lateral impulse), drop strafe"
```

---

### Task 4: Remove side-thruster, finalize field config, e2e

**Files:**
- Modify: `src/world/scene.ts` (remove `sideThruster`)
- Modify: `src/world/wire.ts` (field config → defaults)
- Modify: `e2e/smoke.spec.ts` (barrel-roll dodge test; collision test now hits the greeter)

**Interfaces:**
- Consumes: clustered field defaults (Task 1), `roll` input (Task 3).

- [ ] **Step 1: Write the failing barrel-roll e2e**

In `e2e/smoke.spec.ts`, add at the end of the top-level tests (before the mobile `describe`):

```ts
test('barrel-roll dodge: a single D press side-steps the dart laterally', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?mode=world');
  await expect(page.locator('canvas#scene')).toBeVisible();
  const readout = page.locator('.flight-readout');
  await page.locator('canvas#scene').click();
  await page.keyboard.press('d'); // one barrel roll + side-step (no forward thrust)
  await page.waitForTimeout(900);
  const x = parseInt((await readout.textContent())?.match(/X\s*([+-]\d+)/)?.[1] ?? '0', 10);
  expect(Math.abs(x)).toBeGreaterThan(2); // dodged sideways from the lateral impulse
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run e2e -- smoke.spec.ts -g "barrel-roll"`
Expected: FAIL — A/D currently strafe (held), a single press barely moves; and `wire` is wired before Task 3/4 land in the built app. (If Task 3 already landed, the dodge may move it — but the side-thruster/field config below still need doing; run it to confirm RED relative to the built state.)

- [ ] **Step 3: Remove the side-thruster sprite**

In `src/world/scene.ts`:
- Delete the field declaration `private readonly sideThruster: THREE.Sprite;`.
- Delete its construction in the constructor (the `this.sideThruster = new THREE.Sprite(...)`, its `renderOrder`, `visible`, and `this.scene.add(this.sideThruster)` lines).
- Delete the per-frame side-thruster block in `frame()` — the `if (Math.abs(flight.strafe) > 0.02) { ... this.sideThruster ... } else { this.sideThruster.visible = false; }` block.
- Leave the rear `thruster` (driven by `surge`) and the shared texture load intact.

- [ ] **Step 4: Finalize the field config in `wire.ts`**

In `src/world/wire.ts`, change the field generation to use the new clustered defaults:

```ts
  const field = makeObstacleField(1981);
```

(Drops the old `{ extent: 180, spacing: 90 }`; defaults now give the ~1500 clustered field with the greeter.)

- [ ] **Step 5: Run the dodge e2e + collision e2e**

Run: `npm run typecheck && npm test && npm run e2e -- smoke.spec.ts -g "barrel-roll|collision"`
Expected: typecheck + unit green; the barrel-roll dodge test PASSES (a D press side-steps the dart); the collision test PASSES (flying +z hits the greeter at (0,0,130)).

- [ ] **Step 6: Full gate + commit**

Run: `npm run typecheck && npm test && npm run build && npm run budgets && npm run e2e`
Expected: all green; world JS ≤ 250 KB; worldWasm unchanged; 12 e2e (11 + new dodge).

```bash
git add src/world/scene.ts src/world/wire.ts e2e/smoke.spec.ts
git commit -m "feat(world): remove side-thruster sprite + fill grid with the dense clustered field"
```

---

## Self-Review

**Spec coverage:**
- Dense ~1500 clustered field filling ±630 + greeter + spawn-clear + cap → Task 1. ✓
- Greeter obstacle exactly on +z path (e2e determinism) → Task 1 Step 3 + Task 4 collision e2e. ✓
- Reused-buffer per-frame seam (no allocation) → Task 2. ✓
- Side-thruster removed → Task 4 Step 3. ✓
- Barrel-roll: edge-triggered A/D, ±2π roll via `stepRoll`, lateral impulse, chainable; strafe dropped → Task 3 (+ wire edge) ✓.
- `bank` carries the roll; `avatar.rotateZ(bank)` unchanged (scene) → Task 3 dart + existing scene. ✓
- `FlightInput.strafe`/`FlightState` kept for dormant flight.ts; live passes `strafe: 0` → Task 3. ✓
- Determinism, clamp, budgets, nodes excluded → Tasks 1/2/4. ✓
- e2e: collision (greeter) + barrel-roll dodge → Task 4. ✓

**Placeholder scan:** none — pure code (field, stepRoll) is complete; integration steps give exact before/after edits.

**Type consistency:** `obstaclePositions(): Float32Array` defined in Task 2 (dart) matches `scene.frame(..., obstaclePositions?: Float32Array)` (Task 2) and the `wire` call (Task 2). `FlightInput.roll?: -1|0|1` (Task 3) matches `wire`'s `rollEvent: -1|0|1` and `dart` `input.roll ?? 0` (Task 3). `stepRoll(angle, target, speed, dt)` consistent between Task 3 def and dart use. `makeObstacleField` defaults (Task 1) match the `wire` call (Task 4) and the field tests.
