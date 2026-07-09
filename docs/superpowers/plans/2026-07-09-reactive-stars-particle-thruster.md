# Reactive Galaxy Stars + Particle Thruster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the rendered galaxy stars exchange mass-based momentum with the ship through a bounded Rapier activation pool, then scatter/fade/respawn, and replace the SVG booster with a pooled tight ion-particle plume.

**Architecture:** `makeSpiralGalaxy()` owns parallel visual and collision arrays. A pure spatial hash selects stars along the ship's predicted swept path; a fixed 96-slot Rapier manager promotes only nearby stars and exposes a typed-array render snapshot. A pure 128-slot thruster simulator feeds one Three.js point cloud. `wire.ts` owns the shared galaxy rotation angle and passes it to physics and rendering.

**Tech Stack:** TypeScript 5.5, Vite 6, Vitest 2, Playwright, three.js 0.165, `@dimforge/rapier3d` 0.14.

---

## File Map

- Modify `src/core/galaxy.ts`: add deterministic `collisionRadii` and `masses` arrays.
- Create `src/core/star-index.ts`: pure spatial hash and swept-capsule query.
- Create `src/core/thruster-particles.ts`: allocation-free fixed particle pool.
- Modify `src/core/flight-types.ts` and `src/core/flight.ts`: add normalized
  `enginePower` to `FlightState` and the legacy deterministic integrator.
- Create `src/physics/star-collisions.ts`: 96 reusable Rapier star bodies, collision lifecycle, render snapshot.
- Modify `src/physics/dart.ts`: ship CCD, event-queue stepping, galaxy-angle input, active-star snapshot.
- Create `src/world/thruster.ts`: Three.js adapter around the pure particle pool.
- Modify `src/world/scene.ts`: mutable base-star alpha, active-star cloud, shared rotation angle, particle thruster; remove SVG/obstacle rendering.
- Modify `src/world/wire.ts`: use the scene's single galaxy field, advance one galaxy angle, forward star snapshots.
- Delete `src/core/field.ts`, `src/physics/obstacles.ts`, and `tests/field.test.ts`: superseded duplicate obstacle system.
- Modify `tests/galaxy.test.ts`, `tests/world-wire.test.ts`, and `e2e/smoke.spec.ts`; create focused tests for the three new modules.

## Global Constraints

- Preserve all unrelated dirty-worktree changes; stage only paths named by the current task.
- Keep Rapier imports under `src/physics/`.
- Use collider density `0`; mass comes only from `setAdditionalMass`.
- Ship group is `0x0001`, star group is `0x0002`; ship/star collide, star/star do not.
- No per-frame creation of particles, star render objects, typed arrays, or Rapier bodies.
- `master` is live. Stay on `feat/star-collision-particle-thruster`; do not merge or push `master`.

---

### Task 0: Restore the declared Rapier dependency locally

**Files:**
- Verify only: `package.json`, `package-lock.json`

- [ ] **Step 1: Install exactly what the existing lockfile declares**

Run:

```bash
npm install
```

Expected: `node_modules/@dimforge/rapier3d` exists. If `package.json` or
`package-lock.json` changes, inspect the diff and retain only changes already
required by the in-progress Rapier work; do not upgrade versions.

- [ ] **Step 2: Record the baseline without fixing unrelated failures**

Run:

```bash
npm run typecheck
npm test
```

Expected: the current free-flight branch either passes or produces a concrete
baseline failure to preserve while the superseded field code is replaced.

---

### Task 1: Add deterministic collision data to galaxy stars

**Files:**
- Modify: `tests/galaxy.test.ts`
- Modify: `src/core/galaxy.ts`

- [ ] **Step 1: Write the failing collision-array tests**

Append inside `describe('makeSpiralGalaxy', ...)`:

```ts
it('returns deterministic collision radius and mass arrays parallel to the stars', () => {
  const a = makeSpiralGalaxy(1981, { count: 1000 });
  const b = makeSpiralGalaxy(1981, { count: 1000 });
  expect(a.collisionRadii).toHaveLength(a.count);
  expect(a.masses).toHaveLength(a.count);
  expect(Array.from(a.collisionRadii)).toEqual(Array.from(b.collisionRadii));
  expect(Array.from(a.masses)).toEqual(Array.from(b.masses));
  for (let i = 0; i < a.count; i++) {
    expect(a.collisionRadii[i]).toBeGreaterThanOrEqual(1.2);
    expect(a.collisionRadii[i]).toBeLessThanOrEqual(3.2);
    expect(a.masses[i]).toBeGreaterThanOrEqual(0.1);
    expect(a.masses[i]).toBeLessThanOrEqual(8);
  }
});

it('makes darker stars denser at equal visual size', () => {
  expect(starMass(2, 1)).toBeGreaterThan(starMass(2, 0));
  expect(starMass(3, 0.5)).toBeGreaterThan(starMass(1, 0.5));
  expect(starMass(1, 1)).toBeGreaterThan(1);
});
```

Change the import to:

```ts
import { makeSpiralGalaxy, GALAXY_MAX_POINTS, starMass } from '../src/core/galaxy';
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run tests/galaxy.test.ts
```

Expected: FAIL because `starMass`, `collisionRadii`, and `masses` do not exist.

- [ ] **Step 3: Implement collision metadata**

In `src/core/galaxy.ts`, extend the interface and add the pure helper:

```ts
export interface SpiralField {
  positions: Float32Array;
  sizes: Float32Array;
  alphas: Float32Array;
  colors: Float32Array;
  collisionRadii: Float32Array;
  masses: Float32Array;
  count: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function starMass(visualSize: number, darkness: number): number {
  const sizeT = clamp01((visualSize - 0.8) / 2.1);
  const sizeFactor = 0.7 + 0.9 * sizeT;
  const densityFactor = 0.4 + 3.6 * clamp01(darkness);
  return Math.max(0.1, Math.min(8, sizeFactor * densityFactor));
}
```

Allocate the new arrays beside the existing typed arrays:

```ts
const collisionRadii = new Float32Array(count);
const masses = new Float32Array(count);
```

After assigning `sizes[i]` and computing `m = coreness * coreness`, assign:

```ts
const sizeT = clamp01((sizes[i]! - 0.8) / 2.1);
collisionRadii[i] = 1.2 + 2 * sizeT;
masses[i] = starMass(sizes[i]!, m);
```

Return all arrays:

```ts
return { positions, sizes, alphas, colors, collisionRadii, masses, count };
```

- [ ] **Step 4: Verify GREEN and commit**

Run:

```bash
npx vitest run tests/galaxy.test.ts
npm run typecheck
git add src/core/galaxy.ts tests/galaxy.test.ts
git commit -m "feat(core): add collision data to galaxy stars"
```

Expected: tests and typecheck pass.

---

### Task 2: Build the pure spatial hash and swept query

**Files:**
- Create: `src/core/star-index.ts`
- Create: `tests/star-index.test.ts`

- [ ] **Step 1: Write failing deterministic query tests**

Create `tests/star-index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { StarIndex } from '../src/core/star-index';

const positions = new Float32Array([
  0, 0, 0,
  2, 0, 12,
  5, 0, 12,
  0, 0, 30,
  20, 0, 12,
]);

describe('StarIndex', () => {
  it('queries a swept segment in deterministic distance/index order', () => {
    const index = new StarIndex(positions, 8, 4);
    expect(index.querySegment(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 20 },
      6,
    )).toEqual([1, 2]);
  });

  it('does not return stars inside the spawn-clear bubble', () => {
    const index = new StarIndex(positions, 8, 4);
    expect(index.querySegment(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 2 },
      4,
    )).toEqual([]);
  });

  it('does not return a far star outside the swept capsule', () => {
    const index = new StarIndex(positions, 8, 4);
    expect(index.querySegment(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 20 },
      3,
    )).toEqual([1]);
  });
});
```

- [ ] **Step 2: Verify RED**

Run `npx vitest run tests/star-index.test.ts`.

Expected: FAIL because `src/core/star-index.ts` does not exist.

- [ ] **Step 3: Implement the index**

Create `src/core/star-index.ts` with these public boundaries:

```ts
import type { Vec3 } from './types';

const key = (x: number, y: number, z: number) => ((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class StarIndex {
  private readonly cells = new Map<number, number[]>();
  private readonly result: number[] = [];
  private ax = 0; private ay = 0; private az = 0;
  private abx = 0; private aby = 0; private abz = 0; private den = 0;
  private readonly compare = (u: number, v: number) => {
    const ut = this.segmentT(u), vt = this.segmentT(v);
    return ut - vt || this.distanceSq(u, ut) - this.distanceSq(v, vt) || u - v;
  };

  constructor(
    private readonly positions: Float32Array,
    private readonly cellSize = 32,
    private readonly spawnClear = 20,
  ) {
    for (let i = 0; i < positions.length / 3; i++) {
      const x = positions[i * 3]!, y = positions[i * 3 + 1]!, z = positions[i * 3 + 2]!;
      if (Math.hypot(x, y, z) <= spawnClear) continue;
      const k = key(Math.floor(x / cellSize), Math.floor(y / cellSize), Math.floor(z / cellSize));
      const bucket = this.cells.get(k) ?? [];
      bucket.push(i);
      this.cells.set(k, bucket);
    }
  }

  querySegment(a: Vec3, b: Vec3, radius: number): readonly number[] {
    this.ax = a.x; this.ay = a.y; this.az = a.z;
    this.abx = b.x - a.x; this.aby = b.y - a.y; this.abz = b.z - a.z;
    this.den = this.abx * this.abx + this.aby * this.aby + this.abz * this.abz;
    this.result.length = 0;
    const minX = Math.floor((Math.min(a.x, b.x) - radius) / this.cellSize);
    const maxX = Math.floor((Math.max(a.x, b.x) + radius) / this.cellSize);
    const minY = Math.floor((Math.min(a.y, b.y) - radius) / this.cellSize);
    const maxY = Math.floor((Math.max(a.y, b.y) + radius) / this.cellSize);
    const minZ = Math.floor((Math.min(a.z, b.z) - radius) / this.cellSize);
    const maxZ = Math.floor((Math.max(a.z, b.z) + radius) / this.cellSize);
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) for (let z = minZ; z <= maxZ; z++) {
      for (const i of this.cells.get(key(x, y, z)) ?? []) {
        const t = this.segmentT(i);
        if (this.distanceSq(i, t) <= radius * radius) this.result.push(i);
      }
    }
    this.result.sort(this.compare);
    return this.result;
  }

  private segmentT(i: number): number {
    if (this.den === 0) return 0;
    const o = i * 3;
    const apx = this.positions[o]! - this.ax;
    const apy = this.positions[o + 1]! - this.ay;
    const apz = this.positions[o + 2]! - this.az;
    return clamp((apx * this.abx + apy * this.aby + apz * this.abz) / this.den, 0, 1);
  }

  private distanceSq(i: number, t: number): number {
    const o = i * 3;
    const dx = this.positions[o]! - (this.ax + this.abx * t);
    const dy = this.positions[o + 1]! - (this.ay + this.aby * t);
    const dz = this.positions[o + 2]! - (this.az + this.abz * t);
    return dx * dx + dy * dy + dz * dz;
  }
}
```

- [ ] **Step 4: Verify GREEN and commit**

Run:

```bash
npx vitest run tests/star-index.test.ts
npm run typecheck
git add src/core/star-index.ts tests/star-index.test.ts
git commit -m "feat(core): index stars for swept collision activation"
```

Expected: all commands pass.

---

### Task 3: Implement the pure fixed-pool ion particles

**Files:**
- Create: `src/core/thruster-particles.ts`
- Create: `tests/thruster-particles.test.ts`

- [ ] **Step 1: Write failing pool behavior tests**

Create `tests/thruster-particles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ThrusterParticles } from '../src/core/thruster-particles';

const input = (enginePower: number) => ({
  tail: { x: 0, y: 0, z: -2 },
  heading: { x: 0, y: 0, z: 1 },
  velocity: { x: 0, y: 0, z: 10 },
  enginePower,
});

const run = (p: ThrusterParticles, power: number, seconds = 1) => {
  for (let t = 0; t < seconds; t += 1 / 60) p.step(1 / 60, input(power));
};

describe('ThrusterParticles', () => {
  it('does not emit when engine power is zero', () => {
    const p = new ThrusterParticles(32, 7);
    run(p, 0);
    expect(p.aliveCount).toBe(0);
  });

  it('emits more particles under boost than normal thrust', () => {
    const normal = new ThrusterParticles(128, 7);
    const boost = new ThrusterParticles(128, 7);
    run(normal, 0.6, 0.5);
    run(boost, 1, 0.5);
    expect(boost.aliveCount).toBeGreaterThan(normal.aliveCount);
    expect(Math.min(...boost.positions)).toBeLessThan(Math.min(...normal.positions));
  });

  it('drains after thrust stops and never exceeds its fixed cap', () => {
    const p = new ThrusterParticles(16, 7);
    run(p, 1, 1);
    expect(p.aliveCount).toBeLessThanOrEqual(16);
    run(p, 0, 1);
    expect(p.aliveCount).toBe(0);
  });

  it('is deterministic for a seed', () => {
    const a = new ThrusterParticles(32, 9), b = new ThrusterParticles(32, 9);
    run(a, 0.6, 0.25); run(b, 0.6, 0.25);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.alphas)).toEqual(Array.from(b.alphas));
  });
});
```

- [ ] **Step 2: Verify RED**

Run `npx vitest run tests/thruster-particles.test.ts`.

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the fixed pool**

Create `src/core/thruster-particles.ts`. The complete public surface is:

```ts
import type { Vec3 } from './types';
import { mulberry32 } from './rng';

export interface ThrusterInput {
  tail: Vec3;
  heading: Vec3;
  velocity: Vec3;
  enginePower: number;
}

export class ThrusterParticles {
  readonly positions: Float32Array;
  readonly sizes: Float32Array;
  readonly alphas: Float32Array;
  readonly colors: Float32Array;
  private readonly velocities: Float32Array;
  private readonly ages: Float32Array;
  private readonly lifetimes: Float32Array;
  private readonly alive: Uint8Array;
  private readonly rnd: () => number;
  private emission = 0;
  private serial = 0;

  constructor(readonly capacity = 128, seed = 1981) {
    this.positions = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    this.colors = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.ages = new Float32Array(capacity);
    this.lifetimes = new Float32Array(capacity);
    this.alive = new Uint8Array(capacity);
    this.rnd = mulberry32(seed);
  }

  get aliveCount(): number {
    let n = 0;
    for (const v of this.alive) n += v;
    return n;
  }

  step(dt: number, input: ThrusterInput): void {
    if (!(dt > 0)) return;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) continue;
      const age = this.ages[i]! + dt;
      this.ages[i] = age;
      if (age >= this.lifetimes[i]!) {
        this.alive[i] = 0; this.alphas[i] = 0; this.sizes[i] = 0;
        continue;
      }
      const o = i * 3;
      this.positions[o] += this.velocities[o]! * dt;
      this.positions[o + 1] += this.velocities[o + 1]! * dt;
      this.positions[o + 2] += this.velocities[o + 2]! * dt;
      const life = 1 - age / this.lifetimes[i]!;
      this.alphas[i] = life * life;
      this.sizes[i] = (2.2 + (i % 3) * 0.45) * (0.35 + 0.65 * life);
    }
    const power = Math.max(0, Math.min(1, input.enginePower));
    if (power <= 0) return;
    const boostT = Math.max(0, (power - 0.6) / 0.4);
    const rate = power <= 0.6 ? 35 * (power / 0.6) : 35 + 40 * boostT;
    this.emission += rate * dt;
    while (this.emission >= 1) { this.spawn(input, boostT); this.emission -= 1; }
  }

  private spawn(input: ThrusterInput, boostT: number): void {
    let i = -1;
    for (let n = 0; n < this.capacity; n++) {
      const candidate = (this.serial + n) % this.capacity;
      if (!this.alive[candidate]) { i = candidate; break; }
    }
    if (i < 0) {
      let oldest = -1;
      for (let n = 0; n < this.capacity; n++) if (this.ages[n]! > oldest) { oldest = this.ages[n]!; i = n; }
    }
    this.serial = (i + 1) % this.capacity;
    const o = i * 3;
    const jx = (this.rnd() * 2 - 1) * 0.22;
    const jy = (this.rnd() * 2 - 1) * 0.22;
    const jz = (this.rnd() * 2 - 1) * 0.08;
    this.positions[o] = input.tail.x + jx;
    this.positions[o + 1] = input.tail.y + jy;
    this.positions[o + 2] = input.tail.z + jz;
    const exhaust = 18 + 20 * boostT + this.rnd() * 5;
    this.velocities[o] = input.velocity.x - input.heading.x * exhaust + jx * 5;
    this.velocities[o + 1] = input.velocity.y - input.heading.y * exhaust + jy * 5;
    this.velocities[o + 2] = input.velocity.z - input.heading.z * exhaust + jz * 5;
    this.ages[i] = 0;
    this.lifetimes[i] = 0.35 + this.rnd() * 0.3;
    this.sizes[i] = 2.2 + this.rnd() * 0.9 + boostT * 0.5;
    this.alphas[i] = 0.85 + this.rnd() * 0.15;
    const dark = this.rnd() < 0.18;
    this.colors[o] = dark ? 0x16 / 255 : 0x4a / 255;
    this.colors[o + 1] = dark ? 0x32 / 255 : 0xb3 / 255;
    this.colors[o + 2] = dark ? 0x4a / 255 : 0xd4 / 255;
    this.alive[i] = 1;
  }
}
```

- [ ] **Step 4: Verify GREEN and commit**

Run:

```bash
npx vitest run tests/thruster-particles.test.ts
npm run typecheck
git add src/core/thruster-particles.ts tests/thruster-particles.test.ts
git commit -m "feat(core): add pooled ion thruster particles"
```

Expected: all commands pass.

---

### Task 4: Add the pooled Rapier star-collision manager

**Files:**
- Create: `src/physics/star-collisions.ts`
- Create: `tests/star-collisions.test.ts`

- [ ] **Step 1: Write failing real-physics tests**

Create `tests/star-collisions.test.ts` with a one-star `SpiralField` fixture and
three tests. Use the real Rapier module, not mocks:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import type { SpiralField } from '../src/core/galaxy';
import { StarCollisions } from '../src/physics/star-collisions';

let RAPIER: typeof import('@dimforge/rapier3d');
beforeAll(async () => { RAPIER = await import('@dimforge/rapier3d'); });

const field = (mass: number): SpiralField => ({
  positions: new Float32Array([0, 0, 28]),
  sizes: new Float32Array([2]),
  alphas: new Float32Array([1]),
  colors: new Float32Array([0.29, 0.7, 0.83]),
  collisionRadii: new Float32Array([2]),
  masses: new Float32Array([mass]),
  count: 1,
});

function scenario(mass: number) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = 1 / 120;
  const ship = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 0, 0).lockRotations().setAdditionalMass(1).setCcdEnabled(true));
  const shipCollider = world.createCollider(
    RAPIER.ColliderDesc.ball(1.6).setDensity(0).setRestitution(0.7)
      .setCollisionGroups(0x00010002), ship,
  );
  const stars = new StarCollisions(RAPIER, world, shipCollider.handle, field(mass), { capacity: 1 });
  stars.prepare({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 32 }, 0);
  ship.setLinvel({ x: 0, y: 0, z: 40 }, true);
  for (let i = 0; i < 60; i++) {
    world.step(stars.events);
    stars.afterStep(1 / 120, ship.translation());
  }
  return { world, ship, stars };
}

describe('StarCollisions', () => {
  it('launches a light star and records the hit', () => {
    const s = scenario(0.2);
    expect(s.stars.snapshot().hitCount).toBe(1);
    expect(s.stars.snapshot().positions[2]).toBeGreaterThan(28);
    s.stars.dispose(); s.world.free();
  });

  it('a heavy star slows the ship more than a light star', () => {
    const light = scenario(0.2), heavy = scenario(6);
    expect(heavy.ship.linvel().z).toBeLessThan(light.ship.linvel().z);
    light.stars.dispose(); heavy.stars.dispose(); light.world.free(); heavy.world.free();
  });

  it('fades and releases a scattered star', () => {
    const s = scenario(0.2);
    for (let i = 0; i < 240; i++) s.stars.afterStep(1 / 120, s.ship.translation());
    expect(s.stars.snapshot().starIndices[0]).toBe(-1);
    expect(s.stars.snapshot().alphas[0]).toBe(0);
    s.stars.dispose(); s.world.free();
  });
});
```

- [ ] **Step 2: Verify RED**

Run `npx vitest run tests/star-collisions.test.ts`.

Expected: FAIL because `StarCollisions` does not exist.

- [ ] **Step 3: Implement the bounded pool**

Create `src/physics/star-collisions.ts` with:

```ts
import type { SpiralField } from '../core/galaxy';
import { StarIndex } from '../core/star-index';
import type { Vec3 } from '../core/types';

type Rapier = typeof import('@dimforge/rapier3d');
type World = InstanceType<Rapier['World']>;
type RigidBody = ReturnType<World['createRigidBody']>;
type Collider = ReturnType<World['createCollider']>;

export interface ActiveStarSnapshot {
  starIndices: Int32Array;
  positions: Float32Array;
  alphas: Float32Array;
  hitCount: number;
}

interface Slot {
  body: RigidBody;
  collider: Collider;
  starIndex: number;
  phase: 'free' | 'armed' | 'scattered';
  age: number;
}

const ACTIVE_RADIUS = 35;
const RELEASE_RADIUS = 55;
const HOLD = 0.9;
const FADE = 0.6;

const rotateYInto = (p: Vec3, angle: number, out: Vec3): Vec3 => {
  const c = Math.cos(angle), s = Math.sin(angle);
  out.x = p.x * c + p.z * s; out.y = p.y; out.z = -p.x * s + p.z * c;
  return out;
};

export class StarCollisions {
  readonly events: InstanceType<Rapier['EventQueue']>;
  private readonly index: StarIndex;
  private readonly slots: Slot[] = [];
  private readonly assigned = new Set<number>();
  private readonly colliderSlots = new Map<number, number>();
  private readonly out: ActiveStarSnapshot;
  private readonly localFrom: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly localTo: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly localStar: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly worldStar: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly onCollision = (h1: number, h2: number, started: boolean) => {
    if (!started) return;
    const starHandle = h1 === this.shipColliderHandle ? h2 : h2 === this.shipColliderHandle ? h1 : -1;
    const slotIndex = this.colliderSlots.get(starHandle);
    if (slotIndex === undefined) return;
    const slot = this.slots[slotIndex]!;
    if (slot.phase === 'armed') {
      slot.phase = 'scattered'; slot.age = 0; this.out.hitCount++;
    }
  };

  constructor(
    private readonly RAPIER: Rapier,
    private readonly world: World,
    private readonly shipColliderHandle: number,
    private readonly field: SpiralField,
    opts: { capacity?: number } = {},
  ) {
    const capacity = opts.capacity ?? 96;
    this.events = new RAPIER.EventQueue(true);
    this.index = new StarIndex(field.positions, 32, 20);
    this.out = {
      starIndices: new Int32Array(capacity).fill(-1),
      positions: new Float32Array(capacity * 3),
      alphas: new Float32Array(capacity),
      hitCount: 0,
    };
    for (let i = 0; i < capacity; i++) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setLinearDamping(0.25).lockRotations().setAdditionalMass(1));
      const collider = world.createCollider(RAPIER.ColliderDesc.ball(1)
        .setDensity(0).setRestitution(0.7)
        .setCollisionGroups(0x00020001)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
      body.setEnabled(false);
      this.slots.push({ body, collider, starIndex: -1, phase: 'free', age: 0 });
      this.colliderSlots.set(collider.handle, i);
    }
  }

  prepare(fromWorld: Vec3, toWorld: Vec3, galaxyAngle: number): void {
    rotateYInto(fromWorld, -galaxyAngle, this.localFrom);
    rotateYInto(toWorld, -galaxyAngle, this.localTo);
    for (const starIndex of this.index.querySegment(this.localFrom, this.localTo, ACTIVE_RADIUS)) {
      if (this.assigned.has(starIndex)) continue;
      let slot: Slot | undefined;
      for (let i = 0; i < this.slots.length; i++) {
        if (this.slots[i]!.phase === 'free') { slot = this.slots[i]; break; }
      }
      if (!slot) break;
      this.localStar.x = this.field.positions[starIndex * 3]!;
      this.localStar.y = this.field.positions[starIndex * 3 + 1]!;
      this.localStar.z = this.field.positions[starIndex * 3 + 2]!;
      rotateYInto(this.localStar, galaxyAngle, this.worldStar);
      slot.starIndex = starIndex; slot.phase = 'armed'; slot.age = 0;
      slot.body.setEnabled(true);
      slot.body.setTranslation(this.worldStar, true);
      slot.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      slot.body.setAdditionalMass(this.field.masses[starIndex]!, true);
      slot.collider.setShape(new this.RAPIER.Ball(this.field.collisionRadii[starIndex]!));
      this.assigned.add(starIndex);
    }
  }

  afterStep(dt: number, shipPosition: Vec3): void {
    this.events.drainCollisionEvents(this.onCollision);
    for (const slot of this.slots) {
      if (slot.phase === 'free') continue;
      if (slot.phase === 'armed') {
        const p = slot.body.translation();
        if (Math.hypot(p.x - shipPosition.x, p.y - shipPosition.y, p.z - shipPosition.z) > RELEASE_RADIUS) this.release(slot);
      } else {
        slot.age += dt;
        if (slot.age >= HOLD + FADE) this.release(slot);
      }
    }
    this.syncSnapshot();
  }

  snapshot(): ActiveStarSnapshot { return this.out; }
  dispose(): void { this.events.free(); }

  private release(slot: Slot): void {
    this.assigned.delete(slot.starIndex);
    slot.starIndex = -1; slot.phase = 'free'; slot.age = 0;
    slot.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    slot.body.setEnabled(false);
  }

  private syncSnapshot(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]!;
      this.out.starIndices[i] = slot.starIndex;
      if (slot.phase === 'free') { this.out.alphas[i] = 0; continue; }
      const p = slot.body.translation(), o = i * 3;
      this.out.positions[o] = p.x; this.out.positions[o + 1] = p.y; this.out.positions[o + 2] = p.z;
      const base = this.field.alphas[slot.starIndex]!;
      this.out.alphas[i] = slot.phase === 'scattered' && slot.age > HOLD
        ? base * Math.max(0, 1 - (slot.age - HOLD) / FADE)
        : base;
    }
  }
}
```

- [ ] **Step 4: Verify GREEN and commit**

Run:

```bash
npx vitest run tests/star-collisions.test.ts
npm run typecheck
git add src/physics/star-collisions.ts tests/star-collisions.test.ts
git commit -m "feat(physics): pool reactive galaxy star bodies"
```

Expected: real light/heavy collision tests pass. Rapier 0.14 declares
`Collider.setShape(shape: Shape)`, `new Ball(radius)`, and
`RigidBody.setAdditionalMass(mass, wakeUp)`; use those exact pinned APIs.

---

### Task 5: Integrate star collisions and engine power into the dart

**Files:**
- Modify: `src/core/flight-types.ts`
- Modify: `src/core/flight.ts`
- Modify: `src/physics/dart.ts`
- Create: `tests/dart-physics.test.ts`
- Modify: `tests/flight.test.ts`
- Delete: `src/physics/obstacles.ts`

- [ ] **Step 1: Write the failing DartPhysics contract test**

Create `tests/dart-physics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeSpiralGalaxy } from '../src/core/galaxy';
import { DartPhysics } from '../src/physics/dart';

const I = (forward: number, boost = false) => ({
  yawDelta: 0, pitchDelta: 0, forward, strafe: 0, boost,
});

describe('DartPhysics reactive stars', () => {
  it('reports engine power only for positive forward thrust', async () => {
    const d = await DartPhysics.create({}, makeSpiralGalaxy(1981, { count: 100 }));
    d.step(0.1, I(-1), 0); expect(d.state().enginePower).toBe(0);
    d.step(0.1, I(1), 0); expect(d.state().enginePower).toBeGreaterThan(0);
    d.step(0.1, I(1, true), 0); expect(d.state().enginePower).toBeGreaterThan(0.6);
    d.dispose();
  });

  it('returns a fixed active-star snapshot', async () => {
    const d = await DartPhysics.create({}, makeSpiralGalaxy(1981, { count: 100 }));
    expect(d.activeStars().starIndices).toHaveLength(96);
    expect(d.activeStars().positions).toHaveLength(96 * 3);
    d.dispose();
  });
});
```

- [ ] **Step 2: Verify RED**

Run `npx vitest run tests/dart-physics.test.ts`.

Expected: FAIL because the new method/signature/state field do not exist.

- [ ] **Step 3: Replace obstacle integration with star integration**

In `src/core/flight-types.ts`, add this field to `FlightState`:

```ts
enginePower: number;
```

In `src/core/flight.ts`, initialize `enginePower: 0` and update it immediately
after the throttle calculation:

```ts
s.enginePower = s.surge > 0 ? s.throttle * (input.boost ? 1 : 0.6) : 0;
```

Extend the existing booster test in `tests/flight.test.ts` with:

```ts
expect(m.state.enginePower).toBeGreaterThan(0);
run(m, I({ forward: -1 }), 10);
expect(m.state.enginePower).toBe(0);
```

In `src/physics/dart.ts`:

- Replace `ObstacleSpec`/`Obstacles` imports with `SpiralField` and
  `StarCollisions`/`ActiveStarSnapshot`.
- Change `create` and the constructor to receive `galaxy: SpiralField`.
- Keep a `boosting` boolean and create `StarCollisions` after the ship collider.
- Give the ship collider groups `0x00010002`, restitution `0.7`, and give its
  rigid-body descriptor `.setCcdEnabled(true)`.
- Add one reusable prediction field:

```ts
private readonly predicted = { x: 0, y: 0, z: 0 };
```

- Change the public step signature to:

```ts
step(dt: number, input: FlightInput, galaxyAngle: number): void
```

Inside each fixed substep, before `world.step(...)`, predict and prepare:

```ts
const t = this.body.translation();
const v = this.body.linvel();
this.predicted.x = t.x + v.x * FIXED + (thr.x * this.throttle) * FIXED * FIXED * 0.5;
this.predicted.y = t.y + v.y * FIXED + (thr.y * this.throttle) * FIXED * FIXED * 0.5;
this.predicted.z = t.z + v.z * FIXED + (thr.z * this.throttle) * FIXED * FIXED * 0.5;
this.stars.prepare(t, this.predicted, galaxyAngle);
```

Replace `this.world.step()` with:

```ts
this.world.step(this.stars.events);
this.stars.afterStep(FIXED, this.body.translation());
```

Before substeps, retain the current input state:

```ts
this.boosting = Boolean(input.boost);
```

Return engine power in `state()`:

```ts
enginePower: this.surge > 0 ? this.throttle * (this.boosting ? 1 : 0.6) : 0,
```

Replace `obstaclePositions()` with:

```ts
activeStars(): ActiveStarSnapshot { return this.stars.snapshot(); }
```

Update disposal order so the manually-owned event queue is released before its
world:

```ts
dispose(): void {
  this.stars.dispose();
  this.world.free();
}
```

Delete `src/physics/obstacles.ts` after no imports remain.

- [ ] **Step 4: Update existing FlightState fixtures**

Use `rg "throttle:" tests src` to confirm the only remaining literal
`FlightState` fixture is the Dart mock in `tests/world-wire.test.ts`; Task 7 adds
`enginePower: 0` there. Do not change assertions unrelated to engine output.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
npx vitest run tests/dart-physics.test.ts tests/control.test.ts tests/flight.test.ts
npm run typecheck
git add src/core/flight-types.ts src/core/flight.ts src/physics/dart.ts tests/dart-physics.test.ts tests/flight.test.ts
git commit -m "feat(physics): connect dart to reactive galaxy stars"
```

Expected: focused tests and typecheck pass.

---

### Task 6: Render active stars and the tight ion plume

**Files:**
- Create: `src/world/thruster.ts`
- Modify: `src/world/scene.ts`
- Create: `tests/thruster-view.test.ts`
- Delete: `src/core/field.ts`, `tests/field.test.ts`
- Delete: `public/artwork/galaxy/galaxy-thruster.svg`

- [ ] **Step 1: Write a failing adapter test**

Create `tests/thruster-view.test.ts` using a minimal DOM/WebGL-independent check
of the public adapter surface:

```ts
import { describe, expect, it } from 'vitest';
import { ThrusterView } from '../src/world/thruster';

describe('ThrusterView', () => {
  it('owns one fixed 128-particle Points object', () => {
    const view = new ThrusterView(1981);
    expect(view.points.geometry.getAttribute('position').count).toBe(128);
    view.dispose();
  });
});
```

- [ ] **Step 2: Verify RED**

Run `npx vitest run tests/thruster-view.test.ts`.

Expected: FAIL because `src/world/thruster.ts` does not exist.

- [ ] **Step 3: Implement the Three.js adapter**

Create `src/world/thruster.ts`:

```ts
import * as THREE from 'three';
import { ThrusterParticles } from '../core/thruster-particles';
import type { FlightState } from '../core/flight-types';

export class ThrusterView {
  readonly points: THREE.Points;
  private readonly sim: ThrusterParticles;
  private readonly tail = new THREE.Vector3();
  private readonly heading = new THREE.Vector3();

  constructor(seed = 1981) {
    this.sim = new ThrusterParticles(128, seed);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.sim.positions, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.sim.sizes, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.sim.alphas, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.sim.colors, 3));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false,
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
        varying float vAlpha; varying vec3 vColor;
        void main(){ vAlpha=aAlpha; vColor=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize=min(aSize*(120.0/max(-mv.z,1.0)),18.0); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `
        varying float vAlpha; varying vec3 vColor;
        void main(){ float r=length(gl_PointCoord-vec2(.5)); float mask=1.0-smoothstep(.15,.5,r);
          if(mask<=0.0) discard; gl_FragColor=vec4(vColor,vAlpha*mask); }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 9;
  }

  frame(dt: number, flight: FlightState, tailDistance: number): void {
    this.heading.set(flight.heading.x, flight.heading.y, flight.heading.z);
    this.tail.set(flight.position.x, flight.position.y, flight.position.z)
      .addScaledVector(this.heading, -tailDistance);
    this.sim.step(dt, {
      tail: this.tail,
      heading: flight.heading,
      velocity: flight.velocity,
      enginePower: flight.enginePower,
    });
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
  }

  get aliveCount(): number { return this.sim.aliveCount; }
  dispose(): void { this.points.geometry.dispose(); (this.points.material as THREE.Material).dispose(); }
}
```

- [ ] **Step 4: Replace scene obstacle/sprite rendering**

In `src/world/scene.ts`:

- Remove `ObstacleSpec`, `THRUSTER_URL`, `THRUSTER_ASPECT`, sprite fields, texture
  loading, and `setObstacles()`.
- Expose the generated field as `readonly galaxyField: SpiralField` and use that
  exact object to create the base galaxy geometry.
- Preserve `baseGalaxyAlphas = galaxyField.alphas.slice()`.
- Create a 96-slot active-star geometry and point material. Initialize its
  `starIndices` cache to `-1`.
- Add `ThrusterView`, add `thruster.points` to the scene, and call
  `thruster.frame(dt, flight, ARROW_LEN * 0.55)`.
- Change the frame signature to:

```ts
frame(dt: number, flight: FlightState, active: ActiveStarSnapshot, galaxyAngle: number): void
```

- Set `this.galaxy.rotation.y = galaxyAngle`; remove `+= dt * GALAXY_SPIN`.
- Add these reusable fields:

```ts
private readonly baseGalaxyAlphas: Float32Array;
private readonly activePoints: THREE.Points;
private readonly activeIndices = new Int32Array(96).fill(-1);
private readonly activePos = new Float32Array(96 * 3);
private readonly activeSize = new Float32Array(96);
private readonly activeAlpha = new Float32Array(96);
private readonly activeColor = new Float32Array(96 * 3);
private readonly thruster: ThrusterView;
```

In the constructor, bind `galaxyField.alphas` to the base geometry, keep its
copy in `baseGalaxyAlphas`, bind the four active arrays to a second geometry via
`setAttrs`, set its point material's `uFade` to `0`, and add both
`activePoints` and `thruster.points` to the scene.

Use this exact synchronization method:

```ts
private syncActiveStars(active: ActiveStarSnapshot): number {
  let baseChanged = false, activeCount = 0;
  for (let i = 0; i < this.activeIndices.length; i++) {
    const previous = this.activeIndices[i]!;
    const next = active.starIndices[i]!;
    if (previous !== next) {
      if (previous >= 0) this.galaxyField.alphas[previous] = this.baseGalaxyAlphas[previous]!;
      if (next >= 0) this.galaxyField.alphas[next] = 0;
      this.activeIndices[i] = next;
      baseChanged = true;
    }
    const o = i * 3;
    if (next < 0) {
      this.activeAlpha[i] = 0;
      this.activeSize[i] = 0;
      continue;
    }
    activeCount++;
    this.activePos[o] = active.positions[o]!;
    this.activePos[o + 1] = active.positions[o + 1]!;
    this.activePos[o + 2] = active.positions[o + 2]!;
    this.activeAlpha[i] = active.alphas[i]!;
    this.activeSize[i] = this.galaxyField.sizes[next]!;
    this.activeColor[o] = this.galaxyField.colors[next * 3]!;
    this.activeColor[o + 1] = this.galaxyField.colors[next * 3 + 1]!;
    this.activeColor[o + 2] = this.galaxyField.colors[next * 3 + 2]!;
  }
  if (baseChanged) (this.galaxy.geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  (this.activePoints.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  (this.activePoints.geometry.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
  (this.activePoints.geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  (this.activePoints.geometry.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
  return activeCount;
}
```

Call it once per frame and reuse the returned count for the dataset.
- Set canvas observability after rendering:

```ts
this.renderer.domElement.dataset.activeStars = String(activeCount);
this.renderer.domElement.dataset.starHits = String(active.hitCount);
this.renderer.domElement.dataset.thrusterParticles = String(this.thruster.aliveCount);
```

- Keep `WorldScene.dispose()` as the single disposer for every geometry/material
  in its scene traversal; do not additionally call `thruster.dispose()` there.

Delete the superseded field files and SVG after imports are removed.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
npx vitest run tests/thruster-view.test.ts tests/galaxy.test.ts
npm run typecheck
npm run build
git add src/world/thruster.ts src/world/scene.ts tests/thruster-view.test.ts
git commit -m "feat(world): render reactive stars and ion exhaust"
```

Expected: tests, typecheck, and build pass; the SVG is absent from build assets.

---

### Task 7: Wire one galaxy field and one rotation angle

**Files:**
- Modify: `src/world/wire.ts`
- Modify: `tests/world-wire.test.ts`
- Modify: `e2e/smoke.spec.ts`

- [ ] **Step 1: Rewrite the failing wire assertions**

Update the Dart mock to expose `activeStars()` and include `enginePower: 0` in
its state. The mock snapshot is:

```ts
const active = {
  starIndices: new Int32Array(96).fill(-1),
  positions: new Float32Array(96 * 3),
  alphas: new Float32Array(96),
  hitCount: 0,
};
```

Change the first test's assertions to:

```ts
expect(scene.frame).toHaveBeenCalledWith(
  expect.any(Number),
  expect.objectContaining({ position: expect.any(Object) }),
  active,
  expect.any(Number),
);
expect(dartMocks.DartPhysics.create).toHaveBeenCalledWith(
  expect.anything(),
  (scene as unknown as { galaxyField: object }).galaxyField,
);
```

Update `makeScene()` to include one deterministic `galaxyField` from
`makeSpiralGalaxy(1981, { count: 100 })` and remove `setObstacles`.

- [ ] **Step 2: Verify RED**

Run `npx vitest run tests/world-wire.test.ts`.

Expected: FAIL because `wire.ts` still creates/passes the obstacle field and uses
the old frame signature.

- [ ] **Step 3: Implement shared data and rotation**

In `src/world/wire.ts`:

- Remove `makeObstacleField` and `scene.setObstacles`.
- Construct physics with `scene.galaxyField`.
- Add `let galaxyAngle = 0` beside loop state.
- Each frame, before stepping, use:

```ts
galaxyAngle += dt * 0.015;
const input = { yawDelta, pitchDelta, forward: forward(), strafe: strafe(), boost: boost(), roll: rollEvent };
dart.step(dt, input, galaxyAngle);
rollEvent = 0;
const s = dart.state();
scene.frame(dt, s, dart.activeStars(), galaxyAngle);
```

Keep input, HUD, cleanup, and listener behavior unchanged.

- [ ] **Step 4: Replace the weak collision e2e with observable star lifecycle checks**

Replace the speed-drop collision test with:

```ts
test('visible galaxy stars collide, scatter, and enter the fade lifecycle', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?mode=world');
  const canvas = page.locator('canvas#scene');
  await expect(canvas).toBeVisible();
  await canvas.click();
  await page.keyboard.down('w');
  await expect(async () => {
    expect(Number(await canvas.getAttribute('data-star-hits'))).toBeGreaterThan(0);
  }).toPass({ timeout: 5000 });
  await page.keyboard.up('w');
  await expect(async () => {
    expect(Number(await canvas.getAttribute('data-active-stars'))).toBeGreaterThan(0);
  }).toPass({ timeout: 1000 });
});
```

Add the thruster lifecycle e2e:

```ts
test('forward thrust emits pooled ion particles and releasing drains them', async ({ page }) => {
  await page.goto('/?mode=world');
  const canvas = page.locator('canvas#scene');
  await canvas.click();
  await page.keyboard.down('w');
  await expect(async () => {
    expect(Number(await canvas.getAttribute('data-thruster-particles'))).toBeGreaterThan(0);
  }).toPass({ timeout: 2000 });
  await page.keyboard.up('w');
  await expect(canvas).toHaveAttribute('data-thruster-particles', '0', { timeout: 2000 });
});
```

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
npx vitest run tests/world-wire.test.ts
npm run typecheck
npm run build
npm run e2e
git add src/world/wire.ts tests/world-wire.test.ts e2e/smoke.spec.ts
git commit -m "feat(world): wire reactive stars and thruster lifecycle"
```

Expected: unit and browser tests pass.

---

### Task 8: Full regression, performance, and manual visual verification

**Files:**
- Modify only if a verification failure points to an in-scope defect.

- [ ] **Step 1: Verify no superseded references remain**

Run:

```bash
rg -n "makeObstacleField|ObstacleSpec|setObstacles|obstaclePositions|galaxy-thruster" src tests e2e public || true
rg -n "@dimforge/rapier3d" src -g '!src/physics/**'
```

Expected: first command prints nothing; second prints nothing.

- [ ] **Step 2: Run the complete required validation**

Run:

```bash
npm run typecheck && npm test && npm run build && npm run budgets && npm run e2e
```

Expected: every command exits `0`; the world JS and WASM rows remain within the
existing configured budgets.

- [ ] **Step 3: Run the manual browser check**

Run `npm run dev`, open `/?mode=world`, then verify:

1. Hold W: a compact cyan plume appears directly behind the tail.
2. Hold W + right mouse: plume density and speed visibly increase.
3. Release W while coasting: no new exhaust emits and existing particles drain.
4. Hit a light star: it launches, fades, and later reappears in the rotating base field.
5. Hit a dark/heavy star: the ship deflects more and the star moves less.
6. No separate obstacle-dot cloud or SVG flame remains.

- [ ] **Step 4: Inspect scope and commit verification fixes, if any**

Run:

```bash
git status --short
git diff --check
```

If verification required an in-scope correction, stage only its named files and
commit with `fix: correct reactive star verification issue`. If no correction
was needed, do not create an empty commit.

---

## Completion Gate

Before reporting completion, invoke `superpowers:verification-before-completion`
and cite the fresh output of the full validation command. Then invoke
`superpowers:requesting-code-review` for a final requirements/code-quality review.
Do not merge to `master`; merging deploys production and requires explicit user
approval.
