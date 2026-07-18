# Rapier Free-Fly "Replace" — Implementation Plan (v1: momentum + boundary)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled flight integrator in the free-fly world path with `@dimforge/rapier3d` owning the dart's translational motion (explicit mass, real linear momentum, damping, true boost) against an analytic boundary; no colliders in v1.

**Architecture:** Pure, three.js-free control math lives in `src/core/control.ts` (unit-tested in vitest). A thin Rapier adapter `src/physics/dart.ts` is the only file that imports Rapier; it owns the `World` + a single dynamic point-mass body with rotations locked, applies forces from the pure helpers each fixed substep, and outputs a `FlightState` the renderer already understands. `flight.ts` is kept dormant; its shared types move to `src/core/flight-types.ts`.

**Tech Stack:** TypeScript, Vite 6, Vitest, Playwright, three.js 0.165, `@dimforge/rapier3d` (WASM) with `vite-plugin-wasm` + `vite-plugin-top-level-await`.

## Global Constraints

- Engine package is **`@dimforge/rapier3d`** (real `.wasm`), never `@dimforge/rapier3d-compat`.
- **Rapier is imported in exactly one file:** `src/physics/dart.ts`.
- World JS chunk must stay **`<= 250_000` gzip bytes** (`LIMITS.world`).
- A **`worldWasm`** budget row must exist; its limit must be set to a **concrete measured gzip value before merge** (no placeholder limit at merge time).
- `flight.ts` is **dormant**: not imported by anything under `src/world/`; its types come from `flight-types.ts`; `flight.test.ts` must still pass unchanged.
- `master` is LIVE (Cloudflare). Work stays on `feat/rapier-freefly-physics`; **ask before merging.**
- Per-task verification floor: `npm run typecheck && npm test`. Tasks touching build output also run `npm run build && npm run budgets`. Tasks touching world behavior also run `npm run e2e`.

## Plan Notes / Deviation from spec

The spec proposed vitest async tests for `dart.ts` via `await import('@dimforge/rapier3d')`. **This plan refines that:** the `@dimforge/rapier3d` build is browser-targeted (loads WASM through `import.meta.url` + top-level await), which is fragile under vitest/node. Instead:

- **All deterministic motion math** (heading, right vector, facing integration + pitch clamp, thrust vector, boost, boundary force) lives in pure `control.ts` and is exhaustively **unit-tested in vitest** (Task 2).
- **The real Rapier integration** is tested in **Playwright e2e** (Task 5), exercising the true production loading path in a real browser — stronger than a node test.

This keeps full determinism coverage on our logic while avoiding the vitest+WASM rabbit hole.

## File Structure

- `src/core/flight-types.ts` *(new)* — `Vec3`, `FlightInput` (adds optional `boost`), `FlightState`, `FlightOpts`. Neutral, no deps. The shared contract.
- `src/core/flight.ts` *(modify)* — remove local type defs; import + **re-export** them from `flight-types.ts`. Class logic untouched. Stays out of the world path.
- `src/world/scene.ts` *(modify)* — one import line: `FlightState` from `../core/flight-types`.
- `src/core/control.ts` *(new)* — pure helpers: `headingFrom`, `rightFrom`, `integrateFacing`, `thrustForce`, `boundaryForce`, `ControlOpts`, `DEFAULT_CONTROL`.
- `tests/control.test.ts` *(new)* — unit tests for the above.
- `scripts/check-budgets.mjs` *(modify)* — `WASM` set, `LIMITS.worldWasm`, `worldWasm` measurement, `budgetRows` line.
- `tests/budgets.test.ts` *(modify)* — add a fake-`.wasm` visibility test.
- `vite.config.ts` *(modify)* — register `vite-plugin-wasm` + `vite-plugin-top-level-await`.
- `src/physics/dart.ts` *(new)* — the only Rapier importer; `DartPhysics` adapter.
- `src/world/wire.ts` *(modify)* — swap `FlightMachine` → `DartPhysics` (async), add `boost` input.
- `src/world/mount.ts` *(modify)* — `await wireWorld(...)`.
- `e2e/smoke.spec.ts` *(modify)* — add a physics movement test.

---

### Task 1: Extract neutral flight types

**Files:**
- Create: `src/core/flight-types.ts`
- Modify: `src/core/flight.ts:1-25` (replace type defs with re-exports)
- Modify: `src/world/scene.ts:3` (import path)
- Test: existing suite (refactor — no new test; green suite is the deliverable)

**Interfaces:**
- Produces: `FlightInput { yawDelta:number; pitchDelta:number; forward:number; strafe:number; boost?:boolean }`, `FlightState { position:Vec3; velocity:Vec3; heading:Vec3; yaw:number; pitch:number; bank:number; throttle:number; speed:number; surge:number; strafe:number }`, `FlightOpts` (unchanged from today).

- [ ] **Step 1: Create the neutral types module**

Create `src/core/flight-types.ts`:

```ts
import type { Vec3 } from './types';
export type { Vec3 };

/**
 * Game-style input. Facing (yaw/pitch) is decoupled from movement: the pointer
 * aims yaw/pitch; W/S drive `forward`, A/D drive `strafe` relative to facing.
 * `boost` (right-click) is first-class so it can mean extra thrust + a raised
 * speed cap, not a synonym for `forward`.
 */
export interface FlightInput {
  yawDelta: number;
  pitchDelta: number;
  forward: number; // -1..1
  strafe: number;  // -1..1
  boost?: boolean; // optional so legacy flight.ts/flight.test.ts are unaffected
}

export interface FlightState {
  position: Vec3; velocity: Vec3; heading: Vec3;
  yaw: number; pitch: number; bank: number; throttle: number; speed: number;
  surge: number; strafe: number; // last movement intents (-1..1), for thruster visuals
}

export interface FlightOpts {
  accel?: number; maxSpeed?: number; drag?: number; throttleEase?: number;
  bankMax?: number; bankEase?: number; bound?: number; boundPush?: number; pitchLimit?: number;
}
```

- [ ] **Step 2: Re-export from `flight.ts`, drop local defs**

In `src/core/flight.ts`, replace the top type-definition block (lines 1-25: the `Vec3` import plus the `FlightInput`/`FlightState`/`FlightOpts` interfaces) with:

```ts
import type { Vec3 } from './types';
import type { FlightInput, FlightState, FlightOpts } from './flight-types';
export type { FlightInput, FlightState, FlightOpts };
```

Leave the rest of the file (the `clamp`/`headingFrom` helpers and the `FlightMachine` class) exactly as-is.

- [ ] **Step 3: Point `scene.ts` at the neutral module**

In `src/world/scene.ts`, change line 3 from:

```ts
import type { FlightState } from '../core/flight';
```

to:

```ts
import type { FlightState } from '../core/flight-types';
```

- [ ] **Step 4: Verify typecheck + tests are green**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all existing tests pass (including `tests/flight.test.ts`, which still imports `FlightInput` from `../src/core/flight` via the re-export).

- [ ] **Step 5: Commit**

```bash
git add src/core/flight-types.ts src/core/flight.ts src/world/scene.ts
git commit -m "refactor(core): extract neutral flight-types module"
```

---

### Task 2: Pure control mapping

**Files:**
- Create: `src/core/control.ts`
- Test: `tests/control.test.ts`

**Interfaces:**
- Consumes: `FlightInput` (Task 1), `Vec3`.
- Produces:
  - `interface ControlOpts { accel:number; boostAccel:number; maxSpeed:number; boostMaxSpeed:number; linearDamping:number; pitchLimit:number; bound:number; boundPush:number }`
  - `const DEFAULT_CONTROL: ControlOpts`
  - `headingFrom(yaw:number, pitch:number): Vec3`
  - `rightFrom(h:Vec3): Vec3`
  - `integrateFacing(yaw:number, pitch:number, input:FlightInput, pitchLimit:number): { yaw:number; pitch:number }`
  - `thrustForce(input:FlightInput, heading:Vec3, right:Vec3, o:ControlOpts): Vec3`
  - `boundaryForce(pos:Vec3, bound:number, boundPush:number): Vec3`

- [ ] **Step 1: Write the failing test**

Create `tests/control.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { FlightInput } from '../src/core/flight-types';
import {
  DEFAULT_CONTROL, headingFrom, rightFrom, integrateFacing, thrustForce, boundaryForce,
} from '../src/core/control';

const I = (p: Partial<FlightInput> = {}): FlightInput => ({ yawDelta: 0, pitchDelta: 0, forward: 0, strafe: 0, ...p });
const O = DEFAULT_CONTROL;

describe('control (pure mapping)', () => {
  it('heading is unit-length and faces +z at rest', () => {
    const h = headingFrom(0, 0);
    expect(h).toEqual({ x: 0, y: 0, z: 1 });
    expect(Math.hypot(h.x, h.y, h.z)).toBeCloseTo(1, 6);
  });

  it('yaw 90° faces +x', () => {
    const h = headingFrom(Math.PI / 2, 0);
    expect(h.x).toBeCloseTo(1, 6);
    expect(Math.abs(h.z)).toBeLessThan(1e-6);
  });

  it('right vector is screen-right (perp to heading, no y)', () => {
    const r = rightFrom(headingFrom(0, 0)); // heading +z -> right = -x
    expect(r.x).toBeCloseTo(-1, 6);
    expect(r.y).toBe(0);
    expect(Math.hypot(r.x, r.y, r.z)).toBeCloseTo(1, 6);
  });

  it('integrateFacing adds yaw and clamps pitch', () => {
    const f = integrateFacing(0, 0, I({ yawDelta: 0.2, pitchDelta: -5 }), O.pitchLimit);
    expect(f.yaw).toBeCloseTo(0.2, 6);
    expect(f.pitch).toBeCloseTo(-O.pitchLimit, 6);
  });

  it('forward thrust points along heading; strafe along right', () => {
    const h = headingFrom(0, 0), r = rightFrom(h);
    const fwd = thrustForce(I({ forward: 1 }), h, r, O);
    expect(fwd.z).toBeCloseTo(O.accel, 6);
    const str = thrustForce(I({ strafe: 1 }), h, r, O);
    expect(str.x).toBeCloseTo(-O.accel, 6);
    expect(Math.abs(str.z)).toBeLessThan(1e-6);
  });

  it('boost uses the larger accel', () => {
    const h = headingFrom(0, 0), r = rightFrom(h);
    const normal = thrustForce(I({ forward: 1 }), h, r, O);
    const boosted = thrustForce(I({ forward: 1, boost: true }), h, r, O);
    expect(boosted.z).toBeGreaterThan(normal.z);
    expect(boosted.z).toBeCloseTo(O.boostAccel, 6);
  });

  it('boundary force is zero inside, pulls back outside', () => {
    expect(boundaryForce({ x: 0, y: 0, z: 0 }, O.bound, O.boundPush)).toEqual({ x: 0, y: 0, z: 0 });
    const f = boundaryForce({ x: O.bound + 100, y: 0, z: 0 }, O.bound, O.boundPush);
    expect(f.x).toBeLessThan(0); // pulled back toward center (-x)
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/control.test.ts`
Expected: FAIL — cannot resolve `../src/core/control`.

- [ ] **Step 3: Write the implementation**

Create `src/core/control.ts`:

```ts
import type { Vec3 } from './types';
import type { FlightInput } from './flight-types';

export interface ControlOpts {
  accel: number; boostAccel: number;
  maxSpeed: number; boostMaxSpeed: number;
  linearDamping: number; pitchLimit: number;
  bound: number; boundPush: number;
}

/** Tunables seeded from the legacy FlightMachine feel, plus boost. */
export const DEFAULT_CONTROL: ControlOpts = {
  accel: 110, boostAccel: 200,
  maxSpeed: 80, boostMaxSpeed: 130,
  linearDamping: 0.5, pitchLimit: 1.3,
  bound: 720, boundPush: 220,
};

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function headingFrom(yaw: number, pitch: number): Vec3 {
  return { x: Math.cos(pitch) * Math.sin(yaw), y: Math.sin(pitch), z: Math.cos(pitch) * Math.cos(yaw) };
}

/** Screen-right under the chase cam: cross(heading, worldUp) normalized. */
export function rightFrom(h: Vec3): Vec3 {
  let rx = -h.z, rz = h.x;
  const rl = Math.hypot(rx, rz) || 1;
  return { x: rx / rl, y: 0, z: rz / rl };
}

export function integrateFacing(yaw: number, pitch: number, input: FlightInput, pitchLimit: number) {
  return { yaw: yaw + input.yawDelta, pitch: clamp(pitch + input.pitchDelta, -pitchLimit, pitchLimit) };
}

/** Thrust force (mass is 1, so force == acceleration). Boost raises the magnitude. */
export function thrustForce(input: FlightInput, heading: Vec3, right: Vec3, o: ControlOpts): Vec3 {
  const a = input.boost ? o.boostAccel : o.accel;
  return {
    x: (heading.x * input.forward + right.x * input.strafe) * a,
    y: (heading.y * input.forward) * a,
    z: (heading.z * input.forward + right.z * input.strafe) * a,
  };
}

/** Soft containment: zero inside `bound`, else a centripetal pull toward origin. */
export function boundaryForce(pos: Vec3, bound: number, boundPush: number): Vec3 {
  const dist = Math.hypot(pos.x, pos.y, pos.z);
  if (dist <= bound) return { x: 0, y: 0, z: 0 };
  const k = (boundPush * ((dist - bound) / bound)) / dist;
  return { x: -pos.x * k, y: -pos.y * k, z: -pos.z * k };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/control.test.ts`
Expected: PASS (all 7).

- [ ] **Step 5: Typecheck + full suite, then commit**

Run: `npm run typecheck && npm test`
Expected: green.

```bash
git add src/core/control.ts tests/control.test.ts
git commit -m "feat(core): pure control mapping (heading, facing, thrust, boost, boundary)"
```

---

### Task 3: Budget integrity — `worldWasm` row + visibility test

**Files:**
- Modify: `scripts/check-budgets.mjs` (`LIMITS`, a `WASM` set, `measureBudgets`, `budgetRows`)
- Test: `tests/budgets.test.ts` (add one test)

**Interfaces:**
- Produces: `measureBudgets()` returns an extra field `worldWasm:number`; `LIMITS.worldWasm:number`; a new `budgetRows` line `['world wasm (rapier)', sizes.worldWasm, limits.worldWasm, '<=']`.

- [ ] **Step 1: Write the failing test**

In `tests/budgets.test.ts`, add this test inside the `describe('budget checker', ...)` block (after the existing first test):

```ts
  it('counts a world-chunk .wasm asset in the worldWasm row', () => {
    const dist = makeDist();
    const files = {
      'index.html': '<script type="module" src="/assets/index-a.js"></script>',
      'assets/index-a.js': 'console.log("entry");',
      'assets/chunk-alpha.js': 'console.log("world mount");',
      'assets/physics.wasm': 'fake-wasm-bytes-fake-wasm-bytes-fake-wasm-bytes',
    };
    for (const [name, text] of Object.entries(files)) writeFile(dist, name, text);
    writeFile(dist, '.vite/manifest.json', JSON.stringify({
      'index.html': {
        file: 'assets/index-a.js',
        isEntry: true,
        dynamicImports: ['src/world/mount.ts'],
      },
      'src/world/mount.ts': {
        file: 'assets/chunk-alpha.js',
        isDynamicEntry: true,
        assets: ['assets/physics.wasm'],
      },
    }));

    expect(measureBudgets({ dist }).worldWasm).toBe(gz(files['assets/physics.wasm']));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/budgets.test.ts`
Expected: FAIL — `measureBudgets(...).worldWasm` is `undefined`.

- [ ] **Step 3: Implement the worldWasm measurement**

In `scripts/check-budgets.mjs`:

(a) After the `JS_CSS` set (line 13), add:

```js
const WASM = new Set(['.wasm']);
```

(b) In `LIMITS` (lines 6-11), add a `worldWasm` entry. **This is a provisional ceiling — Task 4's acceptance requires replacing it with the measured value:**

```js
export const LIMITS = {
  fallback: 150_000,
  world: 250_000,
  worldWasm: 600_000, // PROVISIONAL — tighten to the measured Rapier gzip before merge
  totalJsCss: 400_000,
  homepageMedia: 300_000,
};
```

(c) In `measureBudgets`, initialize and accumulate `worldWasm` alongside the existing loop. Replace the accumulation block (lines 188-198) with:

```js
  let fallback = gzipBytes(homepage);
  let world = 0;
  let worldWasm = 0;
  let totalJsCss = 0;

  for (const [name, size] of fileSizes) {
    const ext = extname(name);
    if (WASM.has(ext)) {
      if (worldAssets.has(name) && !fallbackAssets.has(name)) worldWasm += size;
      continue;
    }
    if (!JS_CSS.has(ext)) continue;
    totalJsCss += size;
    if (fallbackAssets.has(name)) fallback += size;
    if (worldAssets.has(name) && !fallbackAssets.has(name)) world += size;
  }
```

(d) Add `worldWasm` to the returned object (line 212):

```js
  return { fallback, world, worldWasm, totalJsCss, homepageMedia };
```

(e) In `budgetRows` (lines 215-222), add the row after the `world` row:

```js
    ['world chunk (three + world adapters)', sizes.world, limits.world, '<='],
    ['world wasm (rapier)', sizes.worldWasm, limits.worldWasm, '<='],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/budgets.test.ts`
Expected: PASS (existing budget tests + the new worldWasm test).

- [ ] **Step 5: Typecheck + full suite, then commit**

Run: `npm run typecheck && npm test`
Expected: green.

```bash
git add scripts/check-budgets.mjs tests/budgets.test.ts
git commit -m "feat(budgets): add worldWasm row so the rapier wasm payload stays visible"
```

---

### Task 4: Vite WASM plumbing + Rapier adapter

**Files:**
- Modify: `package.json` (deps) via npm
- Modify: `vite.config.ts` (plugins)
- Create: `src/physics/dart.ts`

**Interfaces:**
- Consumes: `control.ts` exports (Task 2), `FlightState`/`FlightInput` (Task 1).
- Produces: `class DartPhysics` with `static create(opts?: Partial<ControlOpts>): Promise<DartPhysics>`, `step(dt:number, input:FlightInput): void`, `state(): FlightState`, `dispose(): void`.

- [ ] **Step 1: Install dependencies**

Run:

```bash
npm install @dimforge/rapier3d@^0.14.0
npm install -D vite-plugin-wasm@^3.3.0 vite-plugin-top-level-await@^1.4.4
```

Expected: packages added; `@dimforge/rapier3d` under `dependencies`, the two plugins under `devDependencies`.

- [ ] **Step 2: Register the Vite plugins**

Replace `vite.config.ts` with:

```ts
import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [wasm(), topLevelAwait()],
  build: {
    manifest: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Write the Rapier adapter**

Create `src/physics/dart.ts`. **This is the only file allowed to import Rapier.**

```ts
import type { FlightInput, FlightState } from '../core/flight-types';
import {
  DEFAULT_CONTROL, headingFrom, rightFrom, integrateFacing, thrustForce, boundaryForce,
  type ControlOpts,
} from '../core/control';

type Rapier = typeof import('@dimforge/rapier3d');
type World = InstanceType<Rapier['World']>;
type RigidBody = ReturnType<World['createRigidBody']>;

const MAX_STEP = 0.05;
const FIXED = 1 / 120;

/**
 * Rapier-owned dart. A single dynamic point mass (mass = 1, rotations locked):
 * Rapier integrates translation; orientation is control-state (yaw/pitch),
 * exposed via FlightState for the renderer. Boundary is an analytic force, no
 * collider shapes in v1.
 */
export class DartPhysics {
  static async create(opts: Partial<ControlOpts> = {}): Promise<DartPhysics> {
    const RAPIER = await import('@dimforge/rapier3d');
    return new DartPhysics(RAPIER, { ...DEFAULT_CONTROL, ...opts });
  }

  private readonly world: World;
  private readonly body: RigidBody;
  private yaw = 0; private pitch = 0; private bank = 0; private throttle = 0;
  private surge = 0; private strafeIntent = 0; private acc = 0;

  private constructor(RAPIER: Rapier, private readonly o: ControlOpts) {
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 }); // deep space: no gravity
    this.world.timestep = FIXED;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 0, 0)
      .setLinearDamping(this.o.linearDamping)
      .lockRotations()        // Rapier integrates translation only
      .setAdditionalMass(1);  // explicit mass: a collider-less dynamic body is otherwise mass 0
    this.body = this.world.createRigidBody(desc);
  }

  step(dt: number, input: FlightInput): void {
    if (!(dt > 0)) return;
    const f = integrateFacing(this.yaw, this.pitch, input, this.o.pitchLimit);
    this.yaw = f.yaw; this.pitch = f.pitch;
    const heading = headingFrom(this.yaw, this.pitch);
    const right = rightFrom(heading);

    this.surge = Math.max(-1, Math.min(1, input.forward));
    this.strafeIntent = Math.max(-1, Math.min(1, input.strafe));
    const moving = Math.hypot(input.forward, input.strafe) > 1e-6;
    this.throttle += ((moving ? 1 : 0) - this.throttle) * Math.min(1, 6 * dt);
    this.bank += ((-this.strafeIntent * 0.5) - this.bank) * Math.min(1, 3 * dt);

    const cap = input.boost ? this.o.boostMaxSpeed : this.o.maxSpeed;
    this.acc += Math.min(dt, MAX_STEP);
    while (this.acc >= FIXED) {
      const t = this.body.translation();
      const thr = thrustForce(input, heading, right, this.o);
      const bnd = boundaryForce(t, this.o.bound, this.o.boundPush);
      this.body.resetForces(false);
      this.body.addForce({
        x: thr.x * this.throttle + bnd.x,
        y: thr.y * this.throttle + bnd.y,
        z: thr.z * this.throttle + bnd.z,
      }, true);
      this.world.step();
      const v = this.body.linvel();
      const sp = Math.hypot(v.x, v.y, v.z);
      if (sp > cap) { const k = cap / sp; this.body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true); }
      this.acc -= FIXED;
    }
  }

  state(): FlightState {
    const t = this.body.translation();
    const v = this.body.linvel();
    return {
      position: { x: t.x, y: t.y, z: t.z },
      velocity: { x: v.x, y: v.y, z: v.z },
      heading: headingFrom(this.yaw, this.pitch),
      yaw: this.yaw, pitch: this.pitch, bank: this.bank, throttle: this.throttle,
      speed: Math.hypot(v.x, v.y, v.z), surge: this.surge, strafe: this.strafeIntent,
    };
  }

  dispose(): void {
    this.world.free();
  }
}
```

- [ ] **Step 4: Typecheck, build, and confirm the wasm is measured**

Run: `npm run typecheck && npm run build && npm run budgets`
Expected: typecheck clean; build emits a `.wasm` asset; `npm run budgets` prints a `world wasm (rapier)` row with a **non-zero** size. (The adapter is not wired into the world yet, so the wasm may not be in the world chunk until Task 5 — if the `world wasm` row reads `0.0 KB` here, that is expected and becomes non-zero after Task 5.)

- [ ] **Step 5: Record the measured wasm size and tighten the limit**

After Task 5 wires Rapier in, run `npm run budgets`, read the actual `world wasm (rapier)` gzip KB, and set `LIMITS.worldWasm` in `scripts/check-budgets.mjs` to a snug ceiling (measured + ~10% headroom). Replace the `600_000` provisional value. (Tracked here; performed at the end of Task 5.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/physics/dart.ts
git commit -m "feat(physics): rapier dart adapter + vite wasm plumbing"
```

---

### Task 5: Wire the adapter into the world + boost input + e2e

**Files:**
- Modify: `src/world/wire.ts` (swap to `DartPhysics`, add boost, become async)
- Modify: `src/world/mount.ts:22-23` (`await wireWorld`)
- Modify: `scripts/check-budgets.mjs` (`LIMITS.worldWasm` → measured value)
- Test: `e2e/smoke.spec.ts` (add a movement test)

**Interfaces:**
- Consumes: `DartPhysics` (Task 4).
- Produces: `wireWorld(scene, opts): Promise<() => void>`.

- [ ] **Step 1: Write the failing e2e test**

In `e2e/smoke.spec.ts`, add at the end of the top-level tests (before the `test.describe('mobile ...')` block):

```ts
test('rapier physics: holding W accelerates the dart, releasing glides it back to rest', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?mode=world');
  await expect(page.locator('canvas#scene')).toBeVisible();

  const speed = page.locator('.flight-speed');
  await expect(speed).toHaveText('0 u/s'); // at rest

  await page.locator('body').click(); // focus the document for key events
  await page.keyboard.down('w');
  await expect(async () => {
    const txt = await speed.textContent();
    expect(parseInt(txt ?? '0', 10)).toBeGreaterThan(5);
  }).toPass({ timeout: 4000 });

  await page.keyboard.up('w');
  await expect(async () => {
    const txt = await speed.textContent();
    expect(parseInt(txt ?? '999', 10)).toBeLessThan(2);
  }).toPass({ timeout: 8000 });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run e2e -- smoke.spec.ts -g "rapier physics"`
Expected: FAIL — the dart never moves (world still uses the legacy `FlightMachine`, and right-click—not W—is the only thrust today is irrelevant; the point is the new adapter is not wired yet). Most likely the speed stays `0 u/s` and the first `toPass` times out.

- [ ] **Step 3: Swap `wire.ts` to the Rapier adapter and add boost**

In `src/world/wire.ts`:

(a) Replace the import (line 2):

```ts
import { DartPhysics } from '../physics/dart';
```

(b) Make `wireWorld` async and build the adapter (replace lines 9-11):

```ts
export async function wireWorld(scene: WorldScene, _opts: { reducedMotion: boolean }): Promise<() => void> {
  const dart = await DartPhysics.create({ bound: 720, boundPush: 220 });
  const hud = new FlightHud(document.getElementById('hud-root')!);
```

(c) Split boost out of `forward` (replace lines 21-22):

```ts
  const forward = () => (has('w', 'ArrowUp') ? 1 : 0) - (has('s', 'ArrowDown') ? 1 : 0);
  const strafe = () => (has('d', 'ArrowRight') ? 1 : 0) - (has('a', 'ArrowLeft') ? 1 : 0);
  const boost = () => rightHeld;
```

(d) Feed the adapter and render its state (replace the `flight.tick(...)` + `scene.frame(...)` lines 60-61):

```ts
    dart.step(dt, { yawDelta, pitchDelta, forward: forward(), strafe: strafe(), boost: boost() });
    scene.frame(dt, dart.state());
```

(e) Dispose the world in the cleanup (add inside the returned cleanup, alongside `hud.dispose()` near line 78):

```ts
    hud.dispose();
    dart.dispose();
```

- [ ] **Step 4: Await `wireWorld` in `mount.ts`**

In `src/world/mount.ts`, change line 23 from:

```ts
    cleanupWire = wireWorld(scene, opts);
```

to:

```ts
    cleanupWire = await wireWorld(scene, opts);
```

(`wireWorld` is already reached via `await import('./wire')`, and `mountWorld` is already `async`, so a WASM-init failure rejects and is caught at `mount.ts:34`, falling back to list mode at `main.ts:26`.)

- [ ] **Step 5: Verify the full gate**

Run: `npm run typecheck && npm test && npm run build && npm run budgets && npm run e2e -- smoke.spec.ts -g "rapier physics"`
Expected: all green; the new e2e movement test passes; `npm run budgets` shows a non-zero `world wasm (rapier)` row.

- [ ] **Step 6: Tighten the wasm budget to the measured value (Task 4 Step 5)**

Read the `world wasm (rapier)` KB from the `npm run budgets` output, then set `LIMITS.worldWasm` in `scripts/check-budgets.mjs` to that value + ~10% (replacing `600_000`). Re-run `npm run budgets`; expected: the row reads `OK`.

- [ ] **Step 7: Full suite + commit**

Run: `npm run typecheck && npm test && npm run build && npm run budgets && npm run e2e`
Expected: green across the board.

```bash
git add src/world/wire.ts src/world/mount.ts scripts/check-budgets.mjs e2e/smoke.spec.ts
git commit -m "feat(world): replace flight integrator with rapier dart + real right-click boost"
```

---

## Self-Review

**Spec coverage:**
- Package = `@dimforge/rapier3d`, dynamic import, no `init()` → Task 4 Step 1-3. ✓
- Explicit mass/inertia (collider-less body) → `setAdditionalMass(1)`, Task 4 Step 3. ✓
- Neutral types module; scene.ts one-line change; flight.ts dormant re-export → Task 1. ✓
- Boost as a first-class input → `FlightInput.boost` (Task 1) + `boost()` wiring (Task 5). ✓
- Orientation = control-state, rotations locked → `lockRotations()` + control-state yaw/pitch, Task 4 Step 3. ✓
- Boundary = analytic force, no colliders → `boundaryForce`, Task 2/4. ✓
- Determinism/tests → pure control unit tests (Task 2) + Playwright integration (Task 5); deviation noted. ✓
- worldWasm budget row + fake-wasm test + measured limit before merge → Task 3 + Task 4 Step 5 / Task 5 Step 6. ✓
- Fallback to list on WASM failure → relies on existing `mount.ts`/`main.ts` try-catch, made reachable by `await wireWorld` (Task 5 Step 4). ✓
- flight.test.ts still passes → re-export preserves its import path (Task 1 Step 2/4). ✓

**Placeholder scan:** The only intentional provisional value is `LIMITS.worldWasm = 600_000`, explicitly flagged and replaced with a measured value as a hard step (Task 4 Step 5 / Task 5 Step 6) before merge. No other TBDs.

**Type consistency:** `DartPhysics.step(dt, input)` / `state()` / `create()` / `dispose()` names match between Task 4 (definition) and Task 5 (use). `ControlOpts` fields used in `thrustForce`/`boundaryForce`/`DartPhysics` match the Task 2 definition. `FlightState`/`FlightInput` field names match across Tasks 1, 4, 5 and existing `scene.ts`.
