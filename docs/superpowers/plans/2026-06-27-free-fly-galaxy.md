# Free-Fly Galaxy Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the node-snap rail world with a free-flight galaxy explorer — pilot the astronaut avatar through a dark-cyan-stardust spiral galaxy with jet-booster inertia, on the white brand background, with a 3D dot grid and scattered depth squares for depth.

**Architecture:** Pure deterministic cores (`flight`, `galaxy`, `grid`, `parallax`) hold all logic and physics with no three.js, unit-tested via `tick(dt, input)`. The `world/scene` adapter renders them with three.js `Points` + a custom `ShaderMaterial`; `world/wire` maps pointer/keyboard input to `flight.tick`. Routing keeps the mission/`[list]` portfolio intact and dormant; only `/` on a fine-pointer device gets the world.

**Tech Stack:** TypeScript (ES2022, strict), three.js ^0.165, Vite 6, Vitest 2, Playwright. Pure cores import only `./types` and `./rng`.

## Global Constraints

- **Background is white (`#ffffff`).** NOT black. Galaxy reads as dark cyan stardust on white.
- **Palette:** brand cyan `#4ab3d4`, deep navy toward the galaxy core; warm accent reserved for the thruster flame only.
- **Pure cores never import three.js or use `Math.random`/`Date.now`** — seeded `mulberry32` only; time enters only via `tick(dt, …)`.
- **`Vec3` = `{ x: number; y: number; z: number }`** (from `src/core/types.ts`).
- **Runtime point cap:** galaxy ≤ 40k, grid ≤ 20k (≤ 60k combined); each generator enforces its cap and is unit-tested.
- **Dormant, do not delete:** `src/core/travel.ts`, `path.ts`, `overview.ts`, `intent.ts`, `content/nodes.ts`, the node HUD code, the `[list]` view.
- **Reuse:** `src/core/ease.ts`, astronaut art, `galaxy-thruster.svg`.
- Commit after every task **with a green typecheck** (`npm run typecheck`) and `npm run test`. Never commit on a red typecheck.

### Build order & atomic commits (resolves the typecheck-vs-commit conflict)

The world adapter (`galaxy`/`router`/`main`/`scene`/`mount`/`wire`) is one mutually
dependent knot — changing any one of those files alone leaves the project failing
`typecheck`. So:

- **Phase 1 — independent, commit each green:** Task 1 (`flight`), Task 2 (`grid`),
  Task 4 (`parallax`), Task 8 (`flight-hud`). These are new/additive files; each
  finishes with a green typecheck + test and its own commit.
- **Phase 2 — ATOMIC world swap (single commit):** Tasks 3 (`galaxy`), 5
  (`router`+`main`), 6 (`scene`+`mount`), 7 (`wire`). Implement **all four**,
  writing each module's unit test as you go (the unit tests pass per-module), but
  run `typecheck` only **after all four are in place**, then make **one** commit
  for the whole group. Do **not** commit between them, and ignore any per-task
  "Step: Commit" inside Tasks 3/5/6/7 — they are replaced by the single Phase-2
  commit below.
- **Phase 3 — commit green:** Task 9 (`e2e`), Task 10 (verify + cleanup).

Phase-2 single commit (after Tasks 3,5,6,7 all implemented and green):

```bash
npm run typecheck && npm run test
git add src/core/galaxy.ts src/router.ts src/main.ts src/world/scene.ts \
  src/world/mount.ts src/world/wire.ts \
  tests/galaxy.test.ts tests/router.test.ts tests/world-wire.test.ts
git commit -m "feat(world): free-fly galaxy world — spiral particles, follow-cam, free-fly input, routing"
```

---

## File structure

| File | Responsibility |
|---|---|
| `src/core/flight.ts` | **new** — pure free-fly physics integrator (`FlightMachine`) |
| `src/core/grid.ts` | **new** — pure 3D dot-lattice generator (`makeDotGrid`) |
| `src/core/galaxy.ts` | **replace** doodle `makeGalaxy` → `makeSpiralGalaxy` (particle arrays) |
| `src/core/parallax.ts` | **add** `makeVolumeBodies` (depth squares in the flyable volume); leave `makeBodies` |
| `src/router.ts` | add `hasFinePointer`/`isHome` to `chooseSurface`; add `detectFinePointer` |
| `src/main.ts` | pass new surface inputs; mount world only for the `world` surface |
| `src/world/mount.ts` | drop nodes from `MountOpts`; pass `{ reducedMotion }` |
| `src/world/scene.ts` | **rewrite** — white bg, galaxy/grid/squares Points, avatar follow-cam, thruster |
| `src/world/wire.ts` | **rewrite** — pointer/keyboard → `flight.tick` → `scene.frame` |
| `src/hud/flight-hud.ts` | **new** — minimal flight HUD (control hint + speed) |
| `tests/flight.test.ts`, `grid.test.ts`, `galaxy.test.ts`, `parallax.test.ts`, `router.test.ts`, `world-wire.test.ts` | tests (galaxy/world-wire/router rewritten) |
| `e2e/smoke.spec.ts` | rewrite world-mode specs for free-fly + deep-link→list |

---

## Task 1: Flight physics core (`flight.ts`)

**Files:**
- Create: `src/core/flight.ts`
- Test: `tests/flight.test.ts`

**Interfaces:**
- Consumes: `Vec3` from `./types`.
- Produces:
  - `interface FlightInput { aimX: number; aimY: number; thrust: number }` — `aim` in [-1,1] (pointer offset to screen center), `thrust` raw 0|1.
  - `interface FlightState { position: Vec3; velocity: Vec3; heading: Vec3; yaw: number; pitch: number; bank: number; throttle: number; speed: number }`.
  - `class FlightMachine { state: FlightState; constructor(opts?: FlightOpts); tick(dt: number, input: FlightInput): void }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/flight.test.ts
import { describe, expect, it } from 'vitest';
import { FlightMachine, type FlightInput } from '../src/core/flight';

const NEUTRAL: FlightInput = { aimX: 0, aimY: 0, thrust: 0 };
const THRUST: FlightInput = { aimX: 0, aimY: 0, thrust: 1 };
const speed = (m: FlightMachine) => m.state.speed;

describe('FlightMachine', () => {
  it('starts at rest at the origin facing +z', () => {
    const m = new FlightMachine();
    expect(m.state.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(m.state.speed).toBe(0);
    expect(m.state.heading.z).toBeCloseTo(1, 6);
    expect(Math.hypot(m.state.heading.x, m.state.heading.y, m.state.heading.z)).toBeCloseTo(1, 6);
  });

  it('ignites slowly — first burst is far below full-throttle acceleration', () => {
    const m = new FlightMachine({ accel: 90 });
    m.tick(0.1, THRUST);
    expect(speed(m)).toBeGreaterThan(0);
    expect(speed(m)).toBeLessThan(0.5 * 90 * 0.1); // throttle still ramping
  });

  it('builds toward, and never exceeds, max speed under sustained thrust', () => {
    const m = new FlightMachine({ maxSpeed: 70 });
    let peak = 0;
    for (let i = 0; i < 200; i++) {
      m.tick(0.05, THRUST);
      expect(speed(m)).toBeLessThanOrEqual(70 + 1e-6);
      peak = Math.max(peak, speed(m));
    }
    // Reaches cruising speed quickly (well before the soft boundary slows it).
    expect(peak).toBeGreaterThan(0.9 * 70);
  });

  it('glides to a near-stop after thrust is released (long but bounded)', () => {
    const m = new FlightMachine();
    for (let i = 0; i < 60; i++) m.tick(0.05, THRUST);
    const cruising = speed(m);
    let prev = cruising;
    for (let i = 0; i < 20; i++) { m.tick(0.05, NEUTRAL); expect(speed(m)).toBeLessThanOrEqual(prev + 1e-9); prev = speed(m); }
    expect(speed(m)).toBeGreaterThan(0);          // still drifting shortly after release
    for (let i = 0; i < 400; i++) m.tick(0.05, NEUTRAL);
    expect(speed(m)).toBeLessThan(0.02 * cruising); // eventually settles
  });

  it('steers: positive aimX turns heading and banks the avatar', () => {
    const m = new FlightMachine();
    for (let i = 0; i < 20; i++) m.tick(0.05, { aimX: 1, aimY: 0, thrust: 0 });
    expect(m.state.yaw).toBeGreaterThan(0);
    expect(m.state.heading.x).toBeGreaterThan(0);
    expect(m.state.bank).toBeLessThan(0); // leans into the turn
  });

  it('clamps pitch so you cannot flip over', () => {
    const m = new FlightMachine({ pitchLimit: 1.3 });
    for (let i = 0; i < 200; i++) m.tick(0.05, { aimX: 0, aimY: 1, thrust: 0 });
    expect(Math.abs(m.state.pitch)).toBeLessThanOrEqual(1.3 + 1e-9);
  });

  it('soft bound pulls a runaway back toward center', () => {
    const m = new FlightMachine({ bound: 100 });
    m.state.position = { x: 160, y: 0, z: 0 };
    m.state.velocity = { x: 20, y: 0, z: 0 };
    for (let i = 0; i < 50; i++) m.tick(0.05, NEUTRAL);
    expect(m.state.velocity.x).toBeLessThan(20); // decelerated / reversed inward
    expect(m.state.position.x).toBeLessThan(160 + 20 * 50 * 0.05); // didn't run away freely
  });

  it('is deterministic and keeps heading unit-length', () => {
    const a = new FlightMachine(), b = new FlightMachine();
    const seq: FlightInput[] = Array.from({ length: 50 }, (_, i) => ({ aimX: Math.sin(i), aimY: Math.cos(i) * 0.5, thrust: i % 2 }));
    for (const inp of seq) { a.tick(0.05, inp); b.tick(0.05, inp); }
    expect(a.state).toEqual(b.state);
    expect(Math.hypot(a.state.heading.x, a.state.heading.y, a.state.heading.z)).toBeCloseTo(1, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/flight.test.ts`
Expected: FAIL — `Cannot find module '../src/core/flight'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/flight.ts
import type { Vec3 } from './types';

export interface FlightInput { aimX: number; aimY: number; thrust: number; }

export interface FlightState {
  position: Vec3; velocity: Vec3; heading: Vec3;
  yaw: number; pitch: number; bank: number; throttle: number; speed: number;
}

export interface FlightOpts {
  turnRate?: number;     // rad/s at full aim
  accel?: number;        // units/s^2 at full throttle
  maxSpeed?: number;     // units/s
  drag?: number;         // fraction of velocity retained per second when coasting
  throttleEase?: number; // how fast throttle eases toward the command (per s)
  bankMax?: number;      // max visual roll (rad)
  bankEase?: number;     // bank easing (per s)
  bound?: number;        // soft boundary radius
  boundPush?: number;    // restoring accel scale beyond the boundary
  pitchLimit?: number;   // max |pitch| (rad)
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const headingFrom = (yaw: number, pitch: number): Vec3 => ({
  x: Math.cos(pitch) * Math.sin(yaw),
  y: Math.sin(pitch),
  z: Math.cos(pitch) * Math.cos(yaw),
});

/**
 * Deterministic free-flight integrator — "jet boosters in space". Steering eases
 * heading toward the pointer aim; a single smoothed `throttle` gives the slow
 * booster ignition; light drag glides you to a near-stop on release; a soft
 * boundary keeps you from getting lost. No three.js, no wall clock.
 */
export class FlightMachine {
  state: FlightState;
  private readonly o: Required<FlightOpts>;

  constructor(opts: FlightOpts = {}) {
    this.o = {
      turnRate: opts.turnRate ?? 1.6,
      accel: opts.accel ?? 90,
      maxSpeed: opts.maxSpeed ?? 70,
      drag: opts.drag ?? 0.6,
      throttleEase: opts.throttleEase ?? 2.2,
      bankMax: opts.bankMax ?? 0.5,
      bankEase: opts.bankEase ?? 3,
      bound: opts.bound ?? 260,
      boundPush: opts.boundPush ?? 140,
      pitchLimit: opts.pitchLimit ?? 1.3,
    };
    this.state = {
      position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
      heading: headingFrom(0, 0), yaw: 0, pitch: 0, bank: 0, throttle: 0, speed: 0,
    };
  }

  tick(dt: number, input: FlightInput): void {
    if (!(dt > 0)) return;
    const o = this.o, s = this.state;
    const ease = (cur: number, tgt: number, rate: number) => cur + (tgt - cur) * Math.min(1, rate * dt);

    // Steering (yaw/pitch angles -> heading).
    s.yaw += input.aimX * o.turnRate * dt;
    s.pitch = clamp(s.pitch - input.aimY * o.turnRate * dt, -o.pitchLimit, o.pitchLimit);
    s.heading = headingFrom(s.yaw, s.pitch);
    s.bank = ease(s.bank, -clamp(input.aimX, -1, 1) * o.bankMax, o.bankEase);

    // Single booster ramp: throttle eases toward the raw command.
    s.throttle = ease(s.throttle, clamp(input.thrust, 0, 1), o.throttleEase);

    // Thrust along heading.
    const a = o.accel * s.throttle * dt;
    s.velocity.x += s.heading.x * a; s.velocity.y += s.heading.y * a; s.velocity.z += s.heading.z * a;

    // Light drag -> long inertial glide.
    const keep = Math.pow(o.drag, dt);
    s.velocity.x *= keep; s.velocity.y *= keep; s.velocity.z *= keep;

    // Soft boundary: restoring acceleration past the radius.
    const { x: px, y: py, z: pz } = s.position;
    const dist = Math.hypot(px, py, pz);
    if (dist > o.bound) {
      const k = (o.boundPush * ((dist - o.bound) / o.bound) * dt) / dist;
      s.velocity.x -= px * k; s.velocity.y -= py * k; s.velocity.z -= pz * k;
    }

    // Speed cap.
    let sp = Math.hypot(s.velocity.x, s.velocity.y, s.velocity.z);
    if (sp > o.maxSpeed) { const f = o.maxSpeed / sp; s.velocity.x *= f; s.velocity.y *= f; s.velocity.z *= f; sp = o.maxSpeed; }

    // Integrate.
    s.position.x += s.velocity.x * dt; s.position.y += s.velocity.y * dt; s.position.z += s.velocity.z * dt;
    s.speed = sp;
  }
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run tests/flight.test.ts`
Expected: PASS (8 tests). If the "ignites slowly" bound is too tight, the cause is a real bug — do not loosen the assertion without understanding why.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/core/flight.ts tests/flight.test.ts
git commit -m "feat(core): free-fly flight physics integrator"
```

---

## Task 2: 3D dot-grid generator (`grid.ts`)

**Files:**
- Create: `src/core/grid.ts`
- Test: `tests/grid.test.ts`

**Interfaces:**
- Produces: `function makeDotGrid(opts?: { spacing?: number; extent?: number }): Float32Array` (flat xyz triples); `const GRID_MAX_POINTS = 30000`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/grid.test.ts
import { describe, expect, it } from 'vitest';
import { makeDotGrid, GRID_MAX_POINTS } from '../src/core/grid';

describe('makeDotGrid', () => {
  it('builds a cubic lattice of (2n+1)^3 points on the spacing', () => {
    const g = makeDotGrid({ spacing: 50, extent: 100 }); // n = 2 -> 5^3 = 125
    expect(g).toBeInstanceOf(Float32Array);
    expect(g.length).toBe(125 * 3);
    for (let i = 0; i < g.length; i++) {
      expect(Number.isFinite(g[i]!)).toBe(true);
      expect(Math.abs(g[i]!)).toBeLessThanOrEqual(100);
      expect(Number.isInteger(g[i]! / 50)).toBe(true); // multiple of spacing (-0-safe)
    }
  });

  it('is deterministic', () => {
    expect(Array.from(makeDotGrid({ spacing: 40, extent: 80 })))
      .toEqual(Array.from(makeDotGrid({ spacing: 40, extent: 80 })));
  });

  it('refuses a lattice denser than the cap', () => {
    expect(() => makeDotGrid({ spacing: 1, extent: 1000 })).toThrow(/too dense/);
    const defaults = makeDotGrid();
    expect(defaults.length / 3).toBeLessThanOrEqual(GRID_MAX_POINTS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/grid.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/grid.ts
export const GRID_MAX_POINTS = 20000;

/** Regular x/y/z dot lattice filling the flyable volume. Flat xyz Float32Array. */
export function makeDotGrid(opts: { spacing?: number; extent?: number } = {}): Float32Array {
  const spacing = opts.spacing ?? 26;
  const extent = opts.extent ?? 260;
  const n = Math.floor(extent / spacing);
  const side = 2 * n + 1;
  const total = side * side * side;
  if (total > GRID_MAX_POINTS) throw new Error(`grid too dense: ${total} > ${GRID_MAX_POINTS}`);
  const out = new Float32Array(total * 3);
  let k = 0;
  for (let ix = -n; ix <= n; ix++)
    for (let iy = -n; iy <= n; iy++)
      for (let iz = -n; iz <= n; iz++) {
        out[k++] = ix * spacing; out[k++] = iy * spacing; out[k++] = iz * spacing;
      }
  return out;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run tests/grid.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/core/grid.ts tests/grid.test.ts
git commit -m "feat(core): 3D dot-grid generator"
```

---

## Task 3: Spiral galaxy generator (`galaxy.ts`)

Replaces the doodle `makeGalaxy` (and its `GalaxyKind`/`KIND_CLEARANCE` API) with a particle-field generator. The old abstract-sprite SVGs become orphaned (cleaned up in Task 10).

**Files:**
- Modify (replace contents): `src/core/galaxy.ts`
- Test: replace `tests/galaxy.test.ts`

**Interfaces:**
- Consumes: `mulberry32` from `./rng`.
- Produces:
  - `interface SpiralField { positions: Float32Array; sizes: Float32Array; alphas: Float32Array; colors: Float32Array; count: number }`
  - `function makeSpiralGalaxy(seed: number, opts?: { count?; arms?; radius?; thickness?; twist?; coreFraction? }): SpiralField`
  - `const GALAXY_MAX_POINTS = 40000`

- [ ] **Step 1: Replace the test file**

```ts
// tests/galaxy.test.ts
import { describe, expect, it } from 'vitest';
import { makeSpiralGalaxy, GALAXY_MAX_POINTS } from '../src/core/galaxy';

describe('makeSpiralGalaxy', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = makeSpiralGalaxy(7), b = makeSpiralGalaxy(7), c = makeSpiralGalaxy(8);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.positions)).not.toEqual(Array.from(c.positions));
  });

  it('returns parallel typed arrays of the requested count', () => {
    const f = makeSpiralGalaxy(1, { count: 5000 });
    expect(f.count).toBe(5000);
    expect(f.positions.length).toBe(5000 * 3);
    expect(f.sizes.length).toBe(5000);
    expect(f.alphas.length).toBe(5000);
    expect(f.colors.length).toBe(5000 * 3);
  });

  it('produces a flat disk (thin in y) spanning a wide radius — a galaxy, not a ball', () => {
    const f = makeSpiralGalaxy(2026, { count: 8000, radius: 200, thickness: 10 });
    let maxR = 0, minR = Infinity, maxY = 0;
    for (let i = 0; i < f.count; i++) {
      const x = f.positions[i * 3]!, y = f.positions[i * 3 + 1]!, z = f.positions[i * 3 + 2]!;
      const r = Math.hypot(x, z);
      maxR = Math.max(maxR, r); minR = Math.min(minR, r); maxY = Math.max(maxY, Math.abs(y));
    }
    expect(maxR).toBeGreaterThan(120);   // arms reach out
    expect(minR).toBeLessThan(20);       // dense core near center
    expect(maxY).toBeLessThan(maxR * 0.4); // clearly flattened in y
  });

  it('keeps all outputs finite and clamps to the point cap', () => {
    const f = makeSpiralGalaxy(3, { count: 999999 });
    expect(f.count).toBe(GALAXY_MAX_POINTS);
    for (const v of f.positions) expect(Number.isFinite(v)).toBe(true);
    for (const a of f.alphas) { expect(a).toBeGreaterThan(0); expect(a).toBeLessThanOrEqual(1); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/galaxy.test.ts`
Expected: FAIL — `makeSpiralGalaxy` is not exported.

- [ ] **Step 3: Replace `src/core/galaxy.ts`**

```ts
// src/core/galaxy.ts
import { mulberry32 } from './rng';

export interface SpiralField {
  positions: Float32Array; sizes: Float32Array; alphas: Float32Array; colors: Float32Array; count: number;
}
export interface SpiralOpts {
  count?: number; arms?: number; radius?: number; thickness?: number; twist?: number; coreFraction?: number;
}

export const GALAXY_MAX_POINTS = 40000;

// Brand cyan (arms) -> deep navy (core).
const CYAN = { r: 0x4a / 255, g: 0xb3 / 255, b: 0xd4 / 255 };
const NAVY = { r: 0x16 / 255, g: 0x32 / 255, b: 0x4a / 255 };

/**
 * Dark-stardust spiral galaxy as point arrays for a BufferGeometry. A flattened
 * logarithmic-spiral disk (N arms) plus a dense core bulge; per-point size/alpha
 * scale with "coreness" so density paints the spiral on white. Pure + seeded.
 */
export function makeSpiralGalaxy(seed: number, opts: SpiralOpts = {}): SpiralField {
  const count = Math.min(GALAXY_MAX_POINTS, Math.max(0, Math.floor(opts.count ?? 22000)));
  const arms = Math.max(1, Math.floor(opts.arms ?? 2));
  const radius = opts.radius ?? 200;
  const thickness = opts.thickness ?? 10;
  const twist = opts.twist ?? 2.4;
  const coreFraction = opts.coreFraction ?? 0.28;
  const rnd = mulberry32(seed);
  const gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const core = rnd() < coreFraction;
    let r: number, theta: number, y: number, coreness: number;
    if (core) {
      r = radius * 0.18 * Math.pow(rnd(), 0.6);
      theta = rnd() * Math.PI * 2;
      y = gauss() * thickness * 1.6;
      coreness = 1 - r / (radius * 0.18);
    } else {
      r = radius * (0.08 + 0.92 * Math.pow(rnd(), 0.5));
      const base = Math.floor(rnd() * arms) * ((Math.PI * 2) / arms);
      theta = base + twist * Math.log(1 + (r / radius) * 8) + gauss() * 0.18;
      y = gauss() * thickness * (1 - 0.5 * (r / radius));
      coreness = Math.max(0, 1 - r / radius);
    }
    positions[i * 3] = Math.cos(theta) * r;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(theta) * r;
    sizes[i] = 1.4 + 2.6 * coreness + rnd() * 0.8;
    alphas[i] = Math.min(1, 0.16 + 0.5 * coreness + rnd() * 0.06);
    const m = coreness * coreness;
    colors[i * 3] = CYAN.r + (NAVY.r - CYAN.r) * m;
    colors[i * 3 + 1] = CYAN.g + (NAVY.g - CYAN.g) * m;
    colors[i * 3 + 2] = CYAN.b + (NAVY.b - CYAN.b) * m;
  }
  return { positions, sizes, alphas, colors, count };
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run tests/galaxy.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Do NOT commit yet — this is part of the Phase-2 atomic world swap**

`scene.ts` still imports the retired `makeGalaxy`, so a project-wide `typecheck`
is red until Task 6. Per **Build order & atomic commits**, leave Task 3
uncommitted and continue into Tasks 5, 6, 7; the whole group lands in one green
commit. (`npx vitest run tests/galaxy.test.ts` already passes in isolation — the
generator + its test are self-contained.)

---

## Task 4: Depth-squares volume field (`parallax.ts`)

**Files:**
- Modify: `src/core/parallax.ts` (add `makeVolumeBodies`; leave `makeBodies` + its tests untouched)
- Test: `tests/parallax.test.ts` (append a describe block)

**Interfaces:**
- Produces: `interface VolumeBody { pos: Vec3; size: number }`; `function makeVolumeBodies(seed: number, opts?: { count?; extent?; minSize?; maxSize? }): VolumeBody[]`.

- [ ] **Step 1: Append the failing test**

```ts
// tests/parallax.test.ts  (add at the end, keep existing imports/tests)
import { makeVolumeBodies } from '../src/core/parallax';

describe('makeVolumeBodies', () => {
  it('fills the flyable cube with variable-size bodies, deterministically', () => {
    const a = makeVolumeBodies(5, { count: 120, extent: 200, minSize: 1, maxSize: 8 });
    const b = makeVolumeBodies(5, { count: 120, extent: 200, minSize: 1, maxSize: 8 });
    expect(a).toEqual(b);
    expect(a).toHaveLength(120);
    for (const body of a) {
      expect(Math.abs(body.pos.x)).toBeLessThanOrEqual(200);
      expect(Math.abs(body.pos.y)).toBeLessThanOrEqual(200);
      expect(Math.abs(body.pos.z)).toBeLessThanOrEqual(200);
      expect(body.size).toBeGreaterThanOrEqual(1);
      expect(body.size).toBeLessThanOrEqual(8);
    }
    const sizes = new Set(a.map((b) => b.size));
    expect(sizes.size).toBeGreaterThan(50); // genuinely varied
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parallax.test.ts`
Expected: FAIL — `makeVolumeBodies` not exported.

- [ ] **Step 3: Add the implementation**

```ts
// src/core/parallax.ts  (append; keep the existing file contents above)
export interface VolumeBody { pos: Vec3; size: number; }

/** Variable-size "depth squares" scattered through the flyable cube (radius `extent`). */
export function makeVolumeBodies(
  seed: number,
  opts: { count?: number; extent?: number; minSize?: number; maxSize?: number } = {},
): VolumeBody[] {
  const count = Math.min(MAX_BODIES, Math.max(0, Math.floor(opts.count ?? 140)));
  const extent = opts.extent ?? 260;
  const minSize = opts.minSize ?? 0.8;
  const maxSize = opts.maxSize ?? 9;
  const rnd = mulberry32(seed);
  const out: VolumeBody[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      pos: { x: (rnd() * 2 - 1) * extent, y: (rnd() * 2 - 1) * extent, z: (rnd() * 2 - 1) * extent },
      size: minSize + Math.pow(rnd(), 1.8) * (maxSize - minSize),
    });
  }
  return out;
}
```

(`MAX_BODIES`, `mulberry32`, and `Vec3` are already imported/defined at the top of `parallax.ts`.)

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run tests/parallax.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/core/parallax.ts tests/parallax.test.ts
git commit -m "feat(core): volume-filling depth-square field"
```

---

## Task 5: Routing — fine-pointer + home-only world (`router.ts`, `main.ts`)

**Files:**
- Modify: `src/router.ts`
- Modify: `src/main.ts`
- Test: replace `tests/router.test.ts` surface cases

**Interfaces:**
- Produces: `interface SurfaceInputs { forced: Surface|null; reducedMotion: boolean; webgl: boolean; hasFinePointer: boolean; isHome: boolean }`; `chooseSurface(s: SurfaceInputs): Surface`; `detectFinePointer(): boolean`.

- [ ] **Step 1: Update the test**

```ts
// tests/router.test.ts — replace the chooseSurface cases with these (keep routeToIndex tests)
import { describe, expect, it } from 'vitest';
import { chooseSurface, type SurfaceInputs } from '../src/router';

const base: SurfaceInputs = { forced: null, reducedMotion: false, webgl: true, hasFinePointer: true, isHome: true };

describe('chooseSurface', () => {
  it('world only when home + fine pointer + webgl + motion', () => {
    expect(chooseSurface(base)).toBe('world');
  });
  it('forced list always wins; forced world still requires the home route', () => {
    expect(chooseSurface({ ...base, forced: 'list' })).toBe('list');
    expect(chooseSurface({ ...base, isHome: true, forced: 'world' })).toBe('world');
    expect(chooseSurface({ ...base, isHome: false, forced: 'world' })).toBe('list'); // never hide the portfolio
  });
  it('reduced motion, no webgl, coarse pointer, or non-home => list', () => {
    expect(chooseSurface({ ...base, reducedMotion: true })).toBe('list');
    expect(chooseSurface({ ...base, webgl: false })).toBe('list');
    expect(chooseSurface({ ...base, hasFinePointer: false })).toBe('list');
    expect(chooseSurface({ ...base, isHome: false })).toBe('list');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/router.test.ts`
Expected: FAIL — `SurfaceInputs` lacks `hasFinePointer`/`isHome`.

- [ ] **Step 3: Update `src/router.ts`**

Replace the `SurfaceInputs` interface and `chooseSurface`, and add `detectFinePointer`:

```ts
export interface SurfaceInputs {
  forced: Surface | null;
  reducedMotion: boolean;
  webgl: boolean;
  hasFinePointer: boolean;
  isHome: boolean;
}

/**
 * forced 'list' always wins; forced 'world' applies ONLY on the home route (so a
 * mission deep-link can never hide the portfolio behind an empty free-fly scene).
 * Otherwise world needs home + a fine pointer + WebGL + motion.
 */
export function chooseSurface(s: SurfaceInputs): Surface {
  if (s.forced === 'list') return 'list';
  if (s.forced === 'world') return s.isHome ? 'world' : 'list';
  if (s.reducedMotion) return 'list';
  if (!s.webgl) return 'list';
  if (!s.hasFinePointer) return 'list';
  if (!s.isHome) return 'list';
  return 'world';
}

export function detectFinePointer(): boolean {
  try { return matchMedia('(hover: hover) and (pointer: fine)').matches; }
  catch { return false; }
}
```

- [ ] **Step 4: Update `src/main.ts`**

```ts
// src/main.ts — replace the surface-selection + mount block
import { NODES, SITE } from './content/nodes';
import { renderListPage } from './fallback/render';
import { chooseSurface, detectWebgl, detectFinePointer, type Surface } from './router';

const content = document.getElementById('content')!;

const params = new URLSearchParams(location.search);
const forced = (['world', 'list'] as const).find((m) => params.get('mode') === m) ?? null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isHome = location.pathname === '/' || location.pathname === '';
const surface: Surface = chooseSurface({
  forced, reducedMotion, webgl: detectWebgl(), hasFinePointer: detectFinePointer(), isHome,
});

if (!content.querySelector('section')) {
  content.innerHTML = renderListPage(NODES, SITE);
}

document.body.dataset.mode = surface;

if (surface === 'world') {
  content.setAttribute('hidden', '');
  import('./world/mount')
    .then(({ mountWorld }) => mountWorld({ reducedMotion }))
    .catch((err) => {
      console.error('world failed to boot - switching to ground control', err);
      content.removeAttribute('hidden');
      document.body.dataset.mode = 'list';
    });
}
```

- [ ] **Step 5: Run the router unit test (do NOT commit — Phase-2 atomic group)**

Run: `npx vitest run tests/router.test.ts`
Expected: PASS in isolation. Project `typecheck` is red until `mount.ts`/`scene.ts`
land (Task 6) — that is expected; this task commits as part of the Phase-2 group.

---

## Task 6: World scene rewrite (`scene.ts`, `mount.ts`)

Visual/integration task. No unit test (WebGL); verified in the preview. Renders the cores: white bg, galaxy + grid + depth-square Points, avatar follow-cam, thruster.

**Files:**
- Replace: `src/world/scene.ts`
- Modify: `src/world/mount.ts`

**Interfaces:**
- Consumes: `FlightState` (Task 1), `makeSpiralGalaxy`/`SpiralField` (Task 3), `makeDotGrid` (Task 2), `makeVolumeBodies` (Task 4).
- Produces: `class WorldScene { renderer: THREE.WebGLRenderer; constructor(canvas: HTMLCanvasElement, opts?: { seed?: number }); frame(dt: number, flight: FlightState): void; readout(): { x: number; y: number; pos: Vec3; visible: boolean }; resize(): void; dispose(): void }`.

- [ ] **Step 1: Replace `src/world/scene.ts`**

```ts
// src/world/scene.ts
import * as THREE from 'three';
import type { FlightState } from '../core/flight';
import type { Vec3 } from '../core/types';
import { makeSpiralGalaxy } from '../core/galaxy';
import { makeDotGrid } from '../core/grid';
import { makeVolumeBodies } from '../core/parallax';
import astronautUrl from '../assets/astronaut-alpha.png';

// galaxy-thruster.svg lives in public/ — reference it by URL, never `import` it.
const THRUSTER_URL = '/artwork/galaxy/galaxy-thruster.svg';
const BG = 0xffffff;
const ASTRONAUT_ASPECT = 517 / 773, ASTRONAUT_HEIGHT = 2.6;
const THRUSTER_ASPECT = 80 / 120;
const CAM_BACK = 10, CAM_UP = 3.2, CAM_LAG = 4, LOOK_AHEAD = 8;
const GALAXY_SPIN = 0.015; // rad/s, top-down (about y)
const EXTENT = 260;        // matches flight bound

const v = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);

/** Custom point shader: per-vertex size + alpha, soft round mask, dark-on-white. */
function pointsMaterial(square: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    uniforms: { uPixelRatio: { value: Math.min(devicePixelRatio, 2) }, uAvatar: { value: new THREE.Vector3() }, uFade: { value: 320 } },
    vertexShader: `
      attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
      varying float vAlpha; varying vec3 vColor;
      uniform float uPixelRatio; uniform vec3 uAvatar; uniform float uFade;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float fade = clamp(1.0 - distance(position, uAvatar) / uFade, 0.0, 1.0);
        vAlpha = aAlpha * (uFade > 0.0 ? fade : 1.0);
        gl_PointSize = aSize * uPixelRatio * (300.0 / max(-mv.z, 1.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vAlpha; varying vec3 vColor;
      void main() {
        ${square
          ? 'float mask = 1.0;'
          : 'float r = length(gl_PointCoord - vec2(0.5)); float mask = 1.0 - smoothstep(0.18, 0.5, r); if (mask <= 0.0) discard;'}
        gl_FragColor = vec4(vColor, vAlpha * mask);
      }`,
  });
}

function setAttrs(geom: THREE.BufferGeometry, pos: Float32Array, size: Float32Array, alpha: Float32Array, color: Float32Array) {
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geom.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geom.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
}

export class WorldScene {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly galaxy: THREE.Points;
  private readonly grid: THREE.Points;
  private readonly squares: THREE.Points;
  private readonly avatar: THREE.Sprite;
  private readonly thruster: THREE.Sprite;
  private readonly gridMat: THREE.ShaderMaterial;
  private readonly squareMat: THREE.ShaderMaterial;
  private readonly camPos = new THREE.Vector3(0, CAM_UP, -CAM_BACK);
  private readonly lookAt = new THREE.Vector3(0, 0, 0);

  constructor(canvas: HTMLCanvasElement, opts: { seed?: number } = {}) {
    const seed = opts.seed ?? 1981;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene.background = new THREE.Color(BG);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 4000);

    // Galaxy (round points, no distance fade).
    const gf = makeSpiralGalaxy(seed, {});
    const gg = new THREE.BufferGeometry();
    setAttrs(gg, gf.positions, gf.sizes, gf.alphas, gf.colors);
    const galaxyMat = pointsMaterial(false);
    galaxyMat.uniforms.uFade.value = 0; // galaxy never fades by distance
    this.galaxy = new THREE.Points(gg, galaxyMat);
    this.scene.add(this.galaxy);

    // Dot grid (round, faint cyan, fades with distance).
    const gpos = makeDotGrid({});
    const gn = gpos.length / 3;
    const gsize = new Float32Array(gn).fill(1.1);
    const galpha = new Float32Array(gn).fill(0.5);
    const gcol = new Float32Array(gn * 3);
    for (let i = 0; i < gn; i++) { gcol[i * 3] = 0x4a / 255; gcol[i * 3 + 1] = 0xb3 / 255; gcol[i * 3 + 2] = 0xd4 / 255; }
    const gridGeom = new THREE.BufferGeometry();
    setAttrs(gridGeom, gpos, gsize, galpha, gcol);
    this.gridMat = pointsMaterial(false);
    this.grid = new THREE.Points(gridGeom, this.gridMat);
    this.scene.add(this.grid);

    // Depth squares (square points, varied size, faint, distance fade).
    const bodies = makeVolumeBodies(seed ^ 0x9e37, { extent: EXTENT });
    const sn = bodies.length;
    const spos = new Float32Array(sn * 3), ssize = new Float32Array(sn), salpha = new Float32Array(sn), scol = new Float32Array(sn * 3);
    bodies.forEach((b, i) => {
      spos[i * 3] = b.pos.x; spos[i * 3 + 1] = b.pos.y; spos[i * 3 + 2] = b.pos.z;
      ssize[i] = b.size; salpha[i] = 0.22;
      scol[i * 3] = 0x4a / 255; scol[i * 3 + 1] = 0xb3 / 255; scol[i * 3 + 2] = 0xd4 / 255;
    });
    const sqGeom = new THREE.BufferGeometry();
    setAttrs(sqGeom, spos, ssize, salpha, scol);
    this.squareMat = pointsMaterial(true);
    this.squares = new THREE.Points(sqGeom, this.squareMat);
    this.scene.add(this.squares);

    // Avatar + thruster.
    const aTex = new THREE.TextureLoader().load(astronautUrl); aTex.colorSpace = THREE.SRGBColorSpace;
    this.avatar = new THREE.Sprite(new THREE.SpriteMaterial({ map: aTex, transparent: true, depthWrite: false, depthTest: false }));
    this.avatar.scale.set(ASTRONAUT_HEIGHT * ASTRONAUT_ASPECT, ASTRONAUT_HEIGHT, 1);
    this.avatar.renderOrder = 10;
    this.scene.add(this.avatar);

    const tTex = new THREE.TextureLoader().load(THRUSTER_URL); tTex.colorSpace = THREE.SRGBColorSpace;
    this.thruster = new THREE.Sprite(new THREE.SpriteMaterial({ map: tTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
    this.thruster.renderOrder = 9; this.thruster.visible = false;
    this.scene.add(this.thruster);

    this.resize();
  }

  resize(): void {
    const w = this.renderer.domElement.clientWidth || innerWidth;
    const h = this.renderer.domElement.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame(dt: number, flight: FlightState): void {
    const pos = v(flight.position);
    const head = v(flight.heading).normalize();

    // Follow-cam: trail behind + above, lerped so it banks through turns.
    const want = pos.clone().addScaledVector(head, -CAM_BACK).add(new THREE.Vector3(0, CAM_UP, 0));
    const a = 1 - Math.exp(-CAM_LAG * dt);
    this.camPos.lerp(want, a);
    this.lookAt.lerp(pos.clone().addScaledVector(head, LOOK_AHEAD), a);
    this.camera.position.copy(this.camPos);
    this.camera.up.set(Math.sin(flight.bank), Math.cos(flight.bank), 0); // roll into turns
    this.camera.lookAt(this.lookAt);

    // Avatar pinned at flight position, rolled by bank.
    this.avatar.position.copy(pos);
    this.avatar.material.rotation = flight.bank;

    // Thruster behind/under the avatar, scaled by throttle.
    const thrust = flight.throttle;
    if (thrust > 0.02) {
      const camUp = this.camera.up.clone().normalize();
      const flameH = ASTRONAUT_HEIGHT * (0.5 + 1.25 * thrust);
      this.thruster.scale.set(flameH * THRUSTER_ASPECT, flameH, 1);
      this.thruster.position.copy(pos)
        .addScaledVector(camUp, -(ASTRONAUT_HEIGHT * 0.42 + flameH * 0.5))
        .addScaledVector(head, -0.4 * thrust);
      this.thruster.material.opacity = 0.4 + 0.55 * thrust;
      this.thruster.visible = true;
    } else {
      this.thruster.visible = false;
    }

    // Galaxy turns slowly; grid/squares fade around the avatar.
    this.galaxy.rotation.y += dt * GALAXY_SPIN;
    this.gridMat.uniforms.uAvatar.value.copy(pos);
    this.squareMat.uniforms.uAvatar.value.copy(pos);

    this.renderer.render(this.scene, this.camera);
  }

  /** Avatar's screen position + world coords, for the floating position readout. */
  readout(): { x: number; y: number; pos: Vec3; visible: boolean } {
    const el = this.renderer.domElement;
    const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight;
    const ndc = this.avatar.position.clone().project(this.camera);
    return {
      x: (ndc.x * 0.5 + 0.5) * w,
      y: (-ndc.y * 0.5 + 0.5) * h,
      pos: { x: this.avatar.position.x, y: this.avatar.position.y, z: this.avatar.position.z },
      visible: ndc.z < 1,
    };
  }

  dispose(): void {
    const geoms = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>(), texs = new Set<THREE.Texture>();
    this.scene.traverse((o) => {
      const g = (o as { geometry?: THREE.BufferGeometry }).geometry; if (g) geoms.add(g);
      const m = (o as { material?: THREE.Material | THREE.Material[] }).material;
      for (const mm of Array.isArray(m) ? m : m ? [m] : []) {
        mats.add(mm);
        const map = (mm as THREE.Material & { map?: THREE.Texture }).map; if (map) texs.add(map);
      }
    });
    for (const g of geoms) g.dispose();
    for (const t of texs) t.dispose();
    for (const m of mats) m.dispose();
    this.renderer.dispose();
  }
}
```

- [ ] **Step 2: Update `src/world/mount.ts`** to drop nodes from the options:

```ts
// src/world/mount.ts
import { WorldScene } from './scene';

export interface MountOpts { reducedMotion: boolean; }
export type WorldCleanup = () => void;

export async function mountWorld(opts: MountOpts): Promise<WorldCleanup> {
  const canvas = document.createElement('canvas');
  canvas.id = 'scene';
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block;';
  canvas.setAttribute('aria-hidden', 'true');

  let scene: WorldScene | null = null;
  let onResize: (() => void) | null = null;
  let cleanupWire: WorldCleanup | null = null;
  try {
    scene = new WorldScene(canvas, {});
    onResize = () => scene?.resize();
    document.body.prepend(canvas);
    addEventListener('resize', onResize);

    const { wireWorld } = await import('./wire');
    cleanupWire = wireWorld(scene, opts);

    let cleaned = false;
    return () => {
      if (cleaned) return;
      cleaned = true;
      cleanupWire?.();
      if (onResize) removeEventListener('resize', onResize);
      scene?.dispose();
      canvas.remove();
    };
  } catch (err) {
    cleanupWire?.();
    if (onResize) removeEventListener('resize', onResize);
    scene?.dispose();
    canvas.remove();
    throw err;
  }
}
```

- [ ] **Step 3: Do NOT commit yet — continue the Phase-2 atomic world swap**

`wire.ts` still references the old node API, so project `typecheck` stays red
until Task 7. Continue into Task 7; the group lands in the single Phase-2 commit.

---

## Task 7: Free-fly input wiring (`wire.ts`)

**Files:**
- Replace: `src/world/wire.ts`
- Replace: `tests/world-wire.test.ts`

**Interfaces:**
- Consumes: `FlightMachine` (Task 1), `WorldScene.frame` (Task 6), `FlightHud` (Task 8 — import lazily / construct after Task 8; for this task stub the speed readout call behind a guard).
- Produces: `function wireWorld(scene: WorldScene, opts: { reducedMotion: boolean }): () => void`.

> Build order note: Task 8 (`FlightHud`) is tiny and has no deps — do Task 8 **before** Task 7's Step 3 so the import resolves. The test below mocks `FlightHud`.

- [ ] **Step 1: Replace the test**

```ts
// tests/world-wire.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldScene } from '../src/world/scene';

const hudMocks = vi.hoisted(() => {
  const instances: Array<{ setSpeed: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }> = [];
  const FlightHud = vi.fn(function (this: { setSpeed: ReturnType<typeof vi.fn>; setReadout: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }) {
    this.setSpeed = vi.fn(); this.setReadout = vi.fn(); this.dispose = vi.fn(); instances.push(this);
  });
  return { FlightHud, instances };
});
vi.mock('../src/hud/flight-hud', () => ({ FlightHud: hudMocks.FlightHud }));

import { wireWorld } from '../src/world/wire';

function makeEventTarget() {
  const listeners = new Map<string, Set<(e: Record<string, unknown>) => void>>();
  const addEventListener = vi.fn((t: string, fn: (e: Record<string, unknown>) => void) => {
    const set = listeners.get(t) ?? new Set(); set.add(fn); listeners.set(t, set);
  });
  const removeEventListener = vi.fn((t: string, fn: (e: Record<string, unknown>) => void) => listeners.get(t)?.delete(fn));
  const dispatch = (t: string, e: Record<string, unknown> = {}) => [...(listeners.get(t) ?? [])].forEach((fn) => fn(e));
  const count = () => [...listeners.values()].reduce((s, set) => s + set.size, 0);
  return { addEventListener, removeEventListener, dispatch, count };
}

function installFrame() {
  const cbs = new Map<number, FrameRequestCallback>(); let id = 1;
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => { const i = id++; cbs.set(i, cb); return i; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((i: number) => cbs.delete(i)));
  return { cbs };
}

function makeScene(): WorldScene {
  return { frame: vi.fn(), resize: vi.fn(), dispose: vi.fn(),
    readout: vi.fn(() => ({ x: 0, y: 0, pos: { x: 0, y: 0, z: 0 }, visible: false })),
    renderer: { domElement: { clientWidth: 800, clientHeight: 600 } } } as unknown as WorldScene;
}

describe('wireWorld (free-fly)', () => {
  let win: ReturnType<typeof makeEventTarget>;
  beforeEach(() => {
    hudMocks.instances.length = 0; hudMocks.FlightHud.mockClear();
    win = makeEventTarget();
    vi.stubGlobal('addEventListener', win.addEventListener);
    vi.stubGlobal('removeEventListener', win.removeEventListener);
    vi.stubGlobal('innerWidth', 800); vi.stubGlobal('innerHeight', 600);
    vi.stubGlobal('document', { getElementById: () => ({}) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('drives scene.frame every animation frame', () => {
    const { cbs } = installFrame();
    const scene = makeScene();
    const cleanup = wireWorld(scene, { reducedMotion: false });
    cbs.get(1)!(performance.now() + 16); // first frame
    expect(scene.frame).toHaveBeenCalledTimes(1);
    expect(scene.frame).toHaveBeenCalledWith(expect.any(Number), expect.objectContaining({ position: expect.any(Object) }));
    cleanup();
  });

  it('thrusts while a thrust key is held and stops on release', () => {
    const { cbs } = installFrame();
    const scene = makeScene();
    const cleanup = wireWorld(scene, { reducedMotion: false });
    win.dispatch('keydown', { key: 'w' });
    const t0 = performance.now();
    for (let f = 1; f <= 30; f++) cbs.get(f)!(t0 + f * 16);
    const movedState = (scene.frame as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1];
    expect(movedState.speed).toBeGreaterThan(0);
    cleanup();
  });

  it('cleanup cancels the loop and removes every listener', () => {
    const { cbs } = installFrame();
    const cleanup = wireWorld(makeScene(), { reducedMotion: false });
    cbs.get(1)!(performance.now() + 16);
    const before = win.count();
    expect(before).toBeGreaterThan(0);
    cleanup();
    expect(win.count()).toBe(0);
    expect(hudMocks.instances[0]!.dispose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world-wire.test.ts`
Expected: FAIL — old `wireWorld` signature / behavior.

- [ ] **Step 3: Replace `src/world/wire.ts`**

```ts
// src/world/wire.ts
import { FlightMachine } from '../core/flight';
import { FlightHud } from '../hud/flight-hud';
import type { WorldScene } from './scene';

const MAX_DT = 0.05;

export function wireWorld(scene: WorldScene, _opts: { reducedMotion: boolean }): () => void {
  const flight = new FlightMachine();
  const hud = new FlightHud(document.getElementById('hud-root')!);
  let aimX = 0, aimY = 0;
  // Track each thrust source independently so releasing one (e.g. W) doesn't
  // cut thrust while another (mouse) is still held.
  let keyThrust = false, pointerThrust = false;
  const thrust = () => (keyThrust || pointerThrust ? 1 : 0);

  const onPointerMove = (e: { clientX: number; clientY: number }) => {
    const w = innerWidth, h = innerHeight;
    aimX = Math.max(-1, Math.min(1, (e.clientX - w / 2) / (w / 2)));
    aimY = Math.max(-1, Math.min(1, (e.clientY - h / 2) / (h / 2)));
  };
  const isThrustKey = (k: string) => k === 'w' || k === 'W' || k === ' ' || k === 'ArrowUp';
  const onKeyDown = (e: { key: string; preventDefault?: () => void }) => {
    if (isThrustKey(e.key)) { keyThrust = true; e.preventDefault?.(); }
    else if (e.key === 'Escape' || e.key === 'l' || e.key === 'L') {
      location.href = `?mode=list`; // escape hatch back to the portfolio list
    }
  };
  const onKeyUp = (e: { key: string }) => { if (isThrustKey(e.key)) keyThrust = false; };
  const onPointerDown = (e: { button?: number }) => { if ((e.button ?? 0) === 0) pointerThrust = true; };
  const onPointerUp = () => { pointerThrust = false; };

  addEventListener('pointermove', onPointerMove as EventListener);
  addEventListener('keydown', onKeyDown as EventListener);
  addEventListener('keyup', onKeyUp as EventListener);
  addEventListener('pointerdown', onPointerDown as EventListener);
  addEventListener('pointerup', onPointerUp as EventListener);

  let last = performance.now(), frameId = 0, stopped = false;
  const loop = (now: number) => {
    if (stopped) return;
    const dt = Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
    last = now;
    flight.tick(dt, { aimX, aimY, thrust: thrust() });
    scene.frame(dt, flight.state);
    hud.setSpeed(flight.state.speed);
    hud.setReadout(scene.readout());      // floating position readout follows the avatar
    frameId = requestAnimationFrame(loop);
  };
  frameId = requestAnimationFrame(loop);

  return () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frameId);
    removeEventListener('pointermove', onPointerMove as EventListener);
    removeEventListener('keydown', onKeyDown as EventListener);
    removeEventListener('keyup', onKeyUp as EventListener);
    removeEventListener('pointerdown', onPointerDown as EventListener);
    removeEventListener('pointerup', onPointerUp as EventListener);
    hud.dispose();
  };
}
```

- [ ] **Step 4: Run the full gate — the world swap is now complete**

Run: `npm run typecheck && npm run test`
Expected: PASS (the whole project type-checks now that galaxy/router/main/scene/mount/wire are all consistent).

- [ ] **Step 5: Make the single Phase-2 atomic commit**

```bash
git add src/core/galaxy.ts src/router.ts src/main.ts src/world/scene.ts \
  src/world/mount.ts src/world/wire.ts \
  tests/galaxy.test.ts tests/router.test.ts tests/world-wire.test.ts
git commit -m "feat(world): free-fly galaxy world — spiral particles, follow-cam, free-fly input, routing"
```

---

## Task 8: Minimal flight HUD (`flight-hud.ts`)

**Do this before Task 7 Step 3.** Tiny, no deps.

**Files:**
- Create: `src/hud/flight-hud.ts`
- Test: `tests/flight-hud.test.ts`

**Interfaces:**
- Produces: `class FlightHud { constructor(root: HTMLElement); setSpeed(speed: number): void; setReadout(r: { x: number; y: number; pos: { x: number; y: number; z: number }; visible: boolean }): void; dispose(): void }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/flight-hud.test.ts
import { describe, expect, it, vi } from 'vitest';
import { FlightHud } from '../src/hud/flight-hud';

/** Root whose querySelector returns a persistent element per selector, so writes are observable. */
function makeRoot() {
  const els = new Map<string, { textContent: string; style: Record<string, string> }>();
  const root = {
    innerHTML: '',
    querySelector: vi.fn((sel: string) => {
      if (!els.has(sel)) els.set(sel, { textContent: '', style: {} });
      return els.get(sel)!;
    }),
    replaceChildren: vi.fn(),
  };
  return { root: root as unknown as HTMLElement, el: (sel: string) => els.get(sel)! };
}

describe('FlightHud', () => {
  it('renders the control hint', () => {
    const { root } = makeRoot();
    new FlightHud(root);
    expect((root as unknown as { innerHTML: string }).innerHTML).toMatch(/steer/i);
  });

  it('updates the speed readout text', () => {
    const { root, el } = makeRoot();
    const hud = new FlightHud(root);
    hud.setSpeed(42.4);
    expect(el('.flight-speed').textContent).toBe('42 u/s');
  });

  it('formats the floating position readout and positions it near the avatar', () => {
    const { root, el } = makeRoot();
    const hud = new FlightHud(root);
    hud.setReadout({ x: 100, y: 200, pos: { x: 12, y: -34, z: 120 }, visible: true });
    const r = el('.flight-readout');
    expect(r.textContent).toBe('X +012  Y -034  Z +120');
    expect(r.style.opacity).toBe('1');
    expect(r.style.transform).toMatch(/translate\(/);
  });

  it('hides the readout when the avatar is off-screen', () => {
    const { root, el } = makeRoot();
    const hud = new FlightHud(root);
    hud.setReadout({ x: 0, y: 0, pos: { x: 0, y: 0, z: 0 }, visible: false });
    expect(el('.flight-readout').style.opacity).toBe('0');
  });

  it('clears the root on dispose', () => {
    const { root } = makeRoot();
    new FlightHud(root).dispose();
    expect((root as unknown as { replaceChildren: ReturnType<typeof vi.fn> }).replaceChildren).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/flight-hud.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/hud/flight-hud.ts
import './hud.css';

const sign = (n: number) => (n >= 0 ? '+' : '-') + String(Math.round(Math.abs(n))).padStart(3, '0');

/**
 * Minimal free-fly HUD: a control hint, a faint speed readout, and a floating
 * blue-digital position readout that tracks the avatar on screen. No nodes.
 */
export class FlightHud {
  private readonly root: HTMLElement;
  private readonly speedEl: HTMLElement;
  private readonly readoutEl: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-brand"><span class="hi">HI.</span> <span class="name">I’m Matt</span></div>
      <nav class="hud-nav" aria-label="Mode"><a href="?mode=list">[ list ]</a></nav>
      <div class="flight-readout" aria-hidden="true"></div>
      <div class="hud-strip">
        <span class="status">drag to steer · hold W to boost · Esc for list</span>
        <span class="hint flight-speed">0 u/s</span>
      </div>`;
    this.speedEl = root.querySelector('.flight-speed')!;
    this.readoutEl = root.querySelector('.flight-readout')!;
  }

  setSpeed(speed: number): void {
    this.speedEl.textContent = `${Math.round(speed)} u/s`;
  }

  /** Floating coordinate readout, positioned just off the avatar's shoulder. */
  setReadout(r: { x: number; y: number; pos: { x: number; y: number; z: number }; visible: boolean }): void {
    if (!r.visible) { this.readoutEl.style.opacity = '0'; return; }
    this.readoutEl.textContent = `X ${sign(r.pos.x)}  Y ${sign(r.pos.y)}  Z ${sign(r.pos.z)}`;
    this.readoutEl.style.opacity = '1';
    this.readoutEl.style.transform = `translate(${(r.x + 28).toFixed(1)}px, ${(r.y - 10).toFixed(1)}px)`;
  }

  dispose(): void {
    this.root.replaceChildren();
  }
}
```

- [ ] **Step 4: Add the blue-digital readout styles to `src/hud/hud.css`**

Append:

```css
/* Free-fly HUD: floating blue-digital position readout + monospace speed. */
.flight-readout {
  position: fixed; left: 0; top: 0; pointer-events: none;
  font: 600 13px/1 ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;
  letter-spacing: 0.12em; color: #38bdf8;
  text-shadow: 0 0 6px rgba(56, 189, 248, 0.55), 0 0 1px rgba(56, 189, 248, 0.9);
  opacity: 0; transition: opacity 120ms linear; white-space: nowrap;
  will-change: transform, opacity;
}
.hud-strip .flight-speed { font-family: ui-monospace, Menlo, Consolas, monospace; color: #4ab3d4; }
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `npx vitest run tests/flight-hud.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
npm run typecheck
git add src/hud/flight-hud.ts src/hud/hud.css tests/flight-hud.test.ts
git commit -m "feat(hud): free-fly HUD with floating blue-digital position readout"
```

---

## Task 9: e2e smoke rewrite (`smoke.spec.ts`)

**Files:**
- Modify: `e2e/smoke.spec.ts` (replace the world-mode + deep-link specs; keep the list/axe/prerender specs)

**Interfaces:** none (black-box).

- [ ] **Step 1: Replace the world-mode + deep-link tests**

```ts
// e2e/smoke.spec.ts — replace the first two `test(...)` blocks with these; keep the rest
test('home in world mode boots the free-fly galaxy canvas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?mode=world');
  await expect(body(page)).toHaveAttribute('data-mode', 'world');
  await expect(page.locator('canvas#scene')).toBeVisible();
  await expect(page.locator('.hud-strip .status')).toContainText(/steer/i);
});

test('a mission deep-link renders the list surface (portfolio intact)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/missions/maker-bay'); // not the home route -> list
  await expect(body(page)).toHaveAttribute('data-mode', 'list');
  await expect(sections(page)).toHaveCount(6);
  await expect(page.locator('main#content')).toBeVisible();
});

test('the world canvas actually renders the galaxy (non-blank)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?mode=world');
  await expect(page.locator('canvas#scene')).toBeVisible();
  // Sample the WebGL buffer across a few frames; the dark stardust must mark the white page.
  const darkPixels = await page.evaluate(async () => {
    const c = document.getElementById('scene') as HTMLCanvasElement;
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext;
    const W = c.width, H = c.height;
    const px = new Uint8Array(W * H * 4);
    let best = 0;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); // read in-frame (no preserveDrawingBuffer)
      let dark = 0;
      for (let p = 0; p < px.length; p += 4) if (px[p]! < 230 || px[p + 1]! < 230 || px[p + 2]! < 230) dark++;
      best = Math.max(best, dark);
    }
    return best;
  });
  expect(darkPixels).toBeGreaterThan(500);
});

test.describe('mobile / coarse pointer', () => {
  test.use({ ...devices['iPhone 13'] });
  test('falls back to the list surface (no free-fly without a fine pointer)', async ({ page }) => {
    await page.goto('/'); // default rules: coarse pointer -> list
    await expect(body(page)).toHaveAttribute('data-mode', 'list');
    await expect(sections(page)).toHaveCount(6);
    await expect(page.locator('main#content')).toBeVisible();
  });
});
```

Add `devices` to the Playwright import at the top of the file:
`import { expect, test, devices, type Page } from '@playwright/test';`

(The existing helpers `body`, `sections` and the `list toggle`, `reduced motion`, `axe scan`, and `prerendered route` tests stay as-is. Delete the old `world mode advances through all six nodes…` and `deep link to maker bay in world mode spawns node 04` tests — that behavior is gone.)

- [ ] **Step 2: Run e2e**

Run: `npm run e2e`
Expected: PASS (all specs). Playwright Chromium reports a fine pointer, so `/?mode=world` yields the world surface.

- [ ] **Step 3: Commit**

```bash
git add e2e/smoke.spec.ts
git commit -m "test(e2e): free-fly world boot + mission deep-link → list"
```

---

## Task 10: Full verification + orphaned-art cleanup

**Files:**
- Delete (permission-gated): retired art + the stray probe test.

- [ ] **Step 1: Full suite**

Run: `npm run typecheck && npm run test && npm run build && npm run budgets && npm run e2e`
Expected: all green.

- [ ] **Step 2: Preview-verify the feel** (manual)

Start the dev server (`npm run dev` via the preview tool), open `/?mode=world`, and confirm:
- White background; dark-cyan spiral galaxy reads as a spiral, dense core, fading arms.
- Holding **W** ignites slowly, accelerates, and releasing glides to a stop; the thruster flame fires while boosting.
- Moving the pointer steers and banks; the dot grid + depth squares give clear 3D depth/parallax.
- 60fps (no jank) while flying.
Tune constants if needed: `flight.ts` feel (`accel`/`drag`/`turnRate`/`maxSpeed`), `scene.ts` (`CAM_BACK`/`CAM_UP`/`GALAXY_SPIN`/point alphas), `galaxy.ts` (`count`/`twist`/`coreFraction`).

- [ ] **Step 3: Remove now-orphaned art (ask before deleting — global guardrail)**

These are unused after this work; request approval, then delete and rebuild:
`public/artwork/galaxy/galaxy-{star,diamond,triangle,plus,hexagon,swirl,constellation,node,bubble,cloud,sparkle,planet,planet-outline}.svg` (keep `galaxy-thruster.svg`), and the stray `tests/__probe.test.ts`.

```bash
npm run build && npm run budgets   # confirm nothing references the removed assets
git add -A && git commit -m "chore(world): remove node/doodle art retired by free-fly galaxy"
```

---

## Self-review notes (spec coverage)

- Flight model (§1) → Task 1. Input wiring (§2) → Task 7. Camera/avatar/thruster (§3) → Task 6. Flight HUD (§3a) → Task 8. Spiral galaxy + ShaderMaterial (§4) → Tasks 3 + 6. Dot grid + depth squares (§5) → Tasks 2, 4, 6. Route & surface (§6) → Task 5. Reuse/retire → Tasks 3, 6, 10. Determinism/perf caps → Tasks 1-4 tests + Task 10. All spec sections covered.
