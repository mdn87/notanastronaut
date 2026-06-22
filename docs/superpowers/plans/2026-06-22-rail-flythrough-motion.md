# Rail Flythrough Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the live world’s discrete star-map travel with a continuous rail flythrough driven by old-site visual assets, while preserving readable content stops, routes, fallback rendering, and deterministic tests.

**Architecture:** Add a deterministic `MotionController` in `src/core` where continuous `progress` is the source of truth. Adapt `src/world/wire.ts` and `src/world/scene.ts` to consume a derived rail motion state, copy curated old-site assets into tracked Vite asset paths, and repurpose the existing overview as a pulled-back route view.

**Tech Stack:** TypeScript, Vite, Three.js sprites/camera, Vitest unit tests, Playwright smoke tests.

---

## File Structure

- Create `src/core/motion.ts`: deterministic continuous rail controller, snap zones, arrival callbacks, and derived motion state.
- Create `tests/motion.test.ts`: focused tests for progress domain, wheel deltas, snapping, overview, reduced motion, and determinism.
- Create `src/core/rail-path.ts`: authored path control points, node progress to path parameter mapping, and scenery anchor metadata.
- Create `tests/rail-path.test.ts`: tests that node anchors map to node positions and between-node path samples create space for sweep objects.
- Modify `src/core/types.ts`: add `RailMotionState` and `MotionPhase` types consumed by world and tests.
- Modify `tests/replay.test.ts`: replay continuous input through `MotionController` instead of `TravelMachine` + `WheelIntent`.
- Modify `src/world/wire.ts`: replace runtime `TravelMachine` and `WheelIntent` usage with `MotionController`.
- Modify `tests/world-wire.test.ts`: update expected `scene.frame()` states, continuous wheel behavior, overview copy, and route arrival behavior.
- Create `src/assets/rail/`: tracked copies of curated old-site assets used by Vite imports.
- Modify `src/world/scene.ts`: render old-site rail scenery, sample authored rail path, bank camera on turns, preserve astronaut anchoring, project labels, and picking.
- Modify `tests/path.test.ts` or add `tests/rail-path.test.ts`: keep legacy `FlightPath` tests and add rail-specific coverage.
- Modify `src/hud/hud.ts`: change overview user-facing copy from star-map language to route/mission language.
- Modify `tests/hud.test.ts`: cover revised overview text if the current tests assert it.
- Modify `tests/galaxy.test.ts` only if unused galaxy code is removed. Prefer leaving galaxy code/tests intact until the prototype is accepted.
- Run validation: `npm test`, `npm run typecheck`, `npm run build`, and Playwright smoke after build when the scene boots locally.

## Task 1: Add Continuous Motion Types

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Add rail motion types**

Append the following exports after `TravelState`:

```ts
export type MotionPhase = 'overview' | 'atNode' | 'inTransit';

export interface RailMotionState {
  phase: MotionPhase;
  progress: number;
  targetProgress: number;
  velocity: number;
  from: number;
  to: number;
  t: number;
  settledIndex: number | null;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS. No code should consume the new type yet.

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(core): add rail motion state types"
```

## Task 2: Build The Deterministic Motion Controller

**Files:**
- Create: `src/core/motion.ts`
- Create: `tests/motion.test.ts`

- [ ] **Step 1: Write failing motion tests**

Create `tests/motion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MotionController } from '../src/core/motion';

describe('MotionController', () => {
  it('starts settled at node 0', () => {
    const m = new MotionController(6);
    expect(m.snapshot()).toMatchObject({
      phase: 'atNode',
      progress: 0,
      targetProgress: 0,
      settledIndex: 0,
    });
  });

  it('uses node-unit progress including overview at -1', () => {
    const m = new MotionController(6, { reducedMotion: true });
    m.back();
    m.tick(0.016);
    expect(m.snapshot()).toMatchObject({ phase: 'overview', progress: -1, settledIndex: -1 });
    m.advance();
    m.tick(0.016);
    expect(m.snapshot()).toMatchObject({ phase: 'atNode', progress: 0, settledIndex: 0 });
  });

  it('wheel deltas create continuous progress before settling', () => {
    const m = new MotionController(6, { wheelScale: 0.002, snapRadius: 0.08 });
    m.nudge(120);
    m.tick(0.05);
    const s = m.snapshot();
    expect(s.progress).toBeGreaterThan(0);
    expect(s.progress).toBeLessThan(1);
    expect(s.phase).toBe('inTransit');
  });

  it('snaps to a nearby node when velocity decays', () => {
    const m = new MotionController(6, { snapRadius: 0.18, damping: 14 });
    m.jumpTo(1);
    for (let i = 0; i < 90; i++) m.tick(1 / 60);
    expect(m.snapshot()).toMatchObject({ phase: 'atNode', progress: 1, settledIndex: 1 });
  });

  it('strong wheel intent can pass through a snap zone', () => {
    const m = new MotionController(6, { wheelScale: 0.02, snapRadius: 0.25, passThroughVelocity: 0.9 });
    m.setProgress(0.9);
    m.nudge(240);
    m.tick(0.05);
    expect(m.snapshot().targetProgress).toBeGreaterThan(1);
  });

  it('fires arrival once per settled node', () => {
    const m = new MotionController(6, { reducedMotion: true });
    const arrivals: number[] = [];
    m.onArrive((i) => arrivals.push(i));
    m.jumpTo(2);
    m.tick(0.016);
    m.tick(0.016);
    expect(arrivals).toEqual([2]);
  });

  it('is deterministic for identical dt and input streams', () => {
    const session = (m: MotionController) => {
      m.nudge(180); m.tick(0.04);
      m.tick(0.12);
      m.nudge(90); m.tick(0.08);
      m.back(); m.tick(0.3);
      m.jumpTo(4);
      for (let i = 0; i < 30; i++) m.tick(1 / 60);
      return m.snapshot();
    };
    expect(session(new MotionController(6))).toEqual(session(new MotionController(6)));
  });

  it('rejects invalid jump targets', () => {
    const m = new MotionController(6);
    expect(m.jumpTo(Number.NaN)).toBe(false);
    expect(m.jumpTo(1.5)).toBe(false);
    expect(m.jumpTo(-2)).toBe(false);
    expect(m.jumpTo(6)).toBe(false);
    expect(m.snapshot().progress).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/motion.test.ts`

Expected: FAIL with an import error for `../src/core/motion`.

- [ ] **Step 3: Implement `MotionController`**

Create `src/core/motion.ts`:

```ts
import type { RailMotionState } from './types';

export interface MotionOpts {
  reducedMotion?: boolean;
  wheelScale?: number;
  stepDuration?: number;
  damping?: number;
  snapRadius?: number;
  snapStrength?: number;
  maxVelocity?: number;
  passThroughVelocity?: number;
  settleEpsilon?: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smoothstep = (t: number) => t * t * (3 - 2 * t);

export class MotionController {
  private readonly nodeCount: number;
  private readonly minProgress = -1;
  private readonly maxProgress: number;
  private readonly reducedMotion: boolean;
  private readonly wheelScale: number;
  private readonly stepDuration: number;
  private readonly damping: number;
  private readonly snapRadius: number;
  private readonly snapStrength: number;
  private readonly maxVelocity: number;
  private readonly passThroughVelocity: number;
  private readonly settleEpsilon: number;
  private progressValue = 0;
  private targetValue = 0;
  private velocityValue = 0;
  private lastArrived: number | null = 0;
  private arriveCbs: Array<(index: number) => void> = [];

  constructor(nodeCount: number, opts: MotionOpts = {}) {
    if (!Number.isInteger(nodeCount) || nodeCount < 1) throw new Error('MotionController needs >= 1 node');
    this.nodeCount = nodeCount;
    this.maxProgress = nodeCount - 1;
    this.reducedMotion = opts.reducedMotion ?? false;
    this.wheelScale = opts.wheelScale ?? 0.003;
    this.stepDuration = opts.stepDuration ?? 1.2;
    this.damping = opts.damping ?? 10;
    this.snapRadius = opts.snapRadius ?? 0.16;
    this.snapStrength = opts.snapStrength ?? 7;
    this.maxVelocity = opts.maxVelocity ?? 2.8;
    this.passThroughVelocity = opts.passThroughVelocity ?? 0.65;
    this.settleEpsilon = opts.settleEpsilon ?? 0.003;
  }

  onArrive(cb: (index: number) => void): () => void {
    this.arriveCbs.push(cb);
    return () => { this.arriveCbs = this.arriveCbs.filter((c) => c !== cb); };
  }

  snapshot(): RailMotionState {
    const nearest = Math.round(this.progressValue);
    const atInteger = Math.abs(this.progressValue - nearest) <= this.settleEpsilon
      && Math.abs(this.velocityValue) <= this.settleEpsilon
      && Math.abs(this.targetValue - nearest) <= this.snapRadius;
    const settledIndex = atInteger ? clamp(nearest, this.minProgress, this.maxProgress) : null;
    const from = clamp(Math.floor(this.progressValue), this.minProgress, this.maxProgress);
    const to = clamp(Math.ceil(this.progressValue), this.minProgress, this.maxProgress);
    const local = from === to ? 1 : (this.progressValue - from) / (to - from);
    return {
      phase: settledIndex === -1 ? 'overview' : settledIndex !== null ? 'atNode' : 'inTransit',
      progress: this.progressValue,
      targetProgress: this.targetValue,
      velocity: this.velocityValue,
      from,
      to,
      t: smoothstep(clamp(local, 0, 1)),
      settledIndex,
    };
  }

  setProgress(progress: number): void {
    const next = this.clampProgress(progress);
    this.progressValue = next;
    this.targetValue = next;
    this.velocityValue = 0;
    this.notifyArriveIfSettled();
  }

  advance(): boolean {
    return this.jumpTo(Math.min(this.maxProgress, Math.floor(this.targetValue) + 1));
  }

  back(): boolean {
    return this.jumpTo(Math.max(this.minProgress, Math.ceil(this.targetValue) - 1));
  }

  jumpTo(index: number): boolean {
    if (!Number.isInteger(index) || index < this.minProgress || index > this.maxProgress) return false;
    if (index === this.targetValue && this.snapshot().settledIndex === index) return false;
    this.targetValue = index;
    if (this.reducedMotion) {
      this.progressValue = index;
      this.velocityValue = 0;
      this.notifyArriveIfSettled();
    }
    return true;
  }

  nudge(deltaY: number): void {
    if (!Number.isFinite(deltaY) || deltaY === 0) return;
    const next = this.clampProgress(this.targetValue + deltaY * this.wheelScale);
    this.targetValue = next;
    if (this.reducedMotion) return;
    this.velocityValue = clamp(this.velocityValue + deltaY * this.wheelScale * 4, -this.maxVelocity, this.maxVelocity);
    this.lastArrived = null;
  }

  tick(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.reducedMotion) {
      this.progressValue = this.targetValue;
      this.velocityValue = 0;
      this.notifyArriveIfSettled();
      return;
    }

    const nearestTarget = Math.round(this.targetValue);
    const nearSnap = Math.abs(this.targetValue - nearestTarget) <= this.snapRadius;
    if (nearSnap && Math.abs(this.velocityValue) < this.passThroughVelocity) {
      this.targetValue += (nearestTarget - this.targetValue) * clamp(dt * this.snapStrength, 0, 1);
    }

    const desiredVelocity = clamp((this.targetValue - this.progressValue) / Math.max(this.stepDuration, dt), -this.maxVelocity, this.maxVelocity);
    const ease = 1 - Math.exp(-this.damping * dt);
    this.velocityValue += (desiredVelocity - this.velocityValue) * ease;
    this.progressValue = this.clampProgress(this.progressValue + this.velocityValue * dt);

    if (Math.abs(this.targetValue - this.progressValue) <= this.settleEpsilon && Math.abs(this.velocityValue) <= this.settleEpsilon * 8) {
      const nearest = Math.round(this.targetValue);
      if (Math.abs(this.targetValue - nearest) <= this.snapRadius) {
        this.progressValue = clamp(nearest, this.minProgress, this.maxProgress);
        this.targetValue = this.progressValue;
        this.velocityValue = 0;
      }
    }
    this.notifyArriveIfSettled();
  }

  private clampProgress(progress: number): number {
    return clamp(Number.isFinite(progress) ? progress : 0, this.minProgress, this.maxProgress);
  }

  private notifyArriveIfSettled(): void {
    const settled = this.snapshot().settledIndex;
    if (settled === null || settled === this.lastArrived) return;
    this.lastArrived = settled;
    for (const cb of [...this.arriveCbs]) cb(settled);
  }
}
```

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/motion.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/motion.ts tests/motion.test.ts
git commit -m "feat(core): add continuous rail motion controller"
```

## Task 3: Add Authored Rail Path Mapping

**Files:**
- Create: `src/core/rail-path.ts`
- Create: `tests/rail-path.test.ts`

- [ ] **Step 1: Write failing rail path tests**

Create `tests/rail-path.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NODES } from '../src/content/nodes';
import { makeRailPath } from '../src/core/rail-path';

describe('makeRailPath', () => {
  it('maps every integer progress value to its node position', () => {
    const rail = makeRailPath(NODES);
    NODES.forEach((node, i) => {
      expect(rail.sampleProgress(i)).toEqual(node.pos);
    });
  });

  it('creates authored control points between nodes', () => {
    const rail = makeRailPath(NODES);
    expect(rail.points.length).toBeGreaterThan(NODES.length);
    expect(rail.nodeParams).toHaveLength(NODES.length);
    for (let i = 1; i < rail.nodeParams.length; i++) {
      expect(rail.nodeParams[i]).toBeGreaterThan(rail.nodeParams[i - 1]!);
    }
  });

  it('clamps overview progress to first rail sample for flythrough path sampling', () => {
    const rail = makeRailPath(NODES);
    expect(rail.sampleProgress(-1)).toEqual(NODES[0]!.pos);
  });

  it('places between-node samples away from the straight midpoint', () => {
    const rail = makeRailPath(NODES);
    const sample = rail.sampleProgress(0.5);
    const a = NODES[0]!.pos;
    const b = NODES[1]!.pos;
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    expect(Math.hypot(sample.x - midpoint.x, sample.y - midpoint.y)).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/rail-path.test.ts`

Expected: FAIL with an import error for `../src/core/rail-path`.

- [ ] **Step 3: Implement rail path**

Create `src/core/rail-path.ts`:

```ts
import type { NodeDef, Vec3 } from './types';
import { FlightPath } from './path';

export interface RailPath {
  points: Vec3[];
  nodeParams: number[];
  sampleProgress(progress: number): Vec3;
  progressToParam(progress: number): number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function makeRailPath(nodes: NodeDef[]): RailPath {
  if (nodes.length < 2) throw new Error('makeRailPath needs >= 2 nodes');
  const points: Vec3[] = [];
  const nodePointIndexes: number[] = [];

  for (let i = 0; i < nodes.length; i++) {
    nodePointIndexes.push(points.length);
    points.push({ ...nodes[i]!.pos });
    if (i < nodes.length - 1) {
      const a = nodes[i]!.pos;
      const b = nodes[i + 1]!.pos;
      const side = i % 2 === 0 ? 1 : -1;
      points.push({
        x: (a.x + b.x) / 2 + side * 9,
        y: (a.y + b.y) / 2 + side * 4,
        z: (a.z + b.z) / 2,
      });
    }
  }

  const path = new FlightPath(points);
  const maxPointIndex = points.length - 1;
  const nodeParams = nodePointIndexes.map((i) => i / maxPointIndex);

  const progressToParam = (progress: number): number => {
    const maxProgress = nodes.length - 1;
    const p = clamp(progress, 0, maxProgress);
    const lo = Math.floor(p);
    const hi = Math.ceil(p);
    if (lo === hi) return nodeParams[lo]!;
    const local = p - lo;
    return nodeParams[lo]! + (nodeParams[hi]! - nodeParams[lo]!) * local;
  };

  return {
    points,
    nodeParams,
    progressToParam,
    sampleProgress(progress: number): Vec3 {
      return path.sample(progressToParam(progress));
    },
  };
}
```

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/rail-path.test.ts tests/path.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/rail-path.ts tests/rail-path.test.ts
git commit -m "feat(core): add authored rail path mapping"
```

## Task 4: Update Replay Tests To Continuous Motion

**Files:**
- Modify: `tests/replay.test.ts`

- [ ] **Step 1: Replace replay fixture with MotionController session**

Replace the contents of `tests/replay.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { MotionController } from '../src/core/motion';

type Event =
  | { kind: 'wheel'; deltaY: number }
  | { kind: 'key'; dir: 1 | -1 }
  | { kind: 'jump'; to: number }
  | { kind: 'tick'; dt: number };

function replay(events: Event[]): { state: unknown; arrivals: number[] } {
  const m = new MotionController(6, { reducedMotion: false });
  const arrivals: number[] = [];
  m.onArrive((i) => arrivals.push(i));
  for (const e of events) {
    if (e.kind === 'wheel') m.nudge(e.deltaY);
    else if (e.kind === 'key') e.dir === 1 ? m.advance() : m.back();
    else if (e.kind === 'jump') m.jumpTo(e.to);
    else m.tick(e.dt);
  }
  return { state: m.snapshot(), arrivals };
}

describe('replay', () => {
  it('a recorded continuous session always lands in the same place', () => {
    const session: Event[] = [
      { kind: 'wheel', deltaY: 140 },
      { kind: 'tick', dt: 0.2 },
      { kind: 'wheel', deltaY: 140 },
      { kind: 'tick', dt: 0.4 },
      { kind: 'key', dir: 1 },
      { kind: 'tick', dt: 1.5 },
      { kind: 'jump', to: 5 },
      { kind: 'tick', dt: 1.5 },
      { kind: 'key', dir: -1 },
      { kind: 'tick', dt: 1.5 },
    ];
    const a = replay(session);
    const b = replay(session);
    expect(a).toEqual(b);
    expect(a.state).toMatchObject({ phase: 'atNode', progress: 4, settledIndex: 4 });
    expect(a.arrivals.at(-1)).toBe(4);
  });
});
```

- [ ] **Step 2: Run replay tests**

Run: `npm test -- tests/replay.test.ts tests/motion.test.ts`

Expected: PASS. If the final progress is still easing, increase the last tick to `2.5` seconds and re-run.

- [ ] **Step 3: Commit**

```bash
git add tests/replay.test.ts
git commit -m "test: replay continuous rail motion"
```

## Task 5: Wire MotionController Into The World Adapter

**Files:**
- Modify: `src/world/wire.ts`
- Modify: `tests/world-wire.test.ts`

- [ ] **Step 1: Update world-wire test mocks for `RailMotionState`**

In `tests/world-wire.test.ts`, update the HUD mock instance type to include `setOverview` because the existing mock omits it:

```ts
setOverview: ReturnType<typeof vi.fn>;
```

and assign it inside the `Hud` mock constructor:

```ts
this.setOverview = vi.fn();
```

- [ ] **Step 2: Update the first-frame route assertion**

Change the first test’s `scene.frame` assertion from:

```ts
expect(scene.frame).toHaveBeenCalledWith(expect.any(Number), { kind: 'atNode', index: 3 });
```

to:

```ts
expect(scene.frame).toHaveBeenCalledWith(expect.any(Number), expect.objectContaining({
  phase: 'atNode',
  progress: 3,
  settledIndex: 3,
}));
```

- [ ] **Step 3: Update wheel route test expectations**

In the wheel test, keep `reducedMotion: true` and replace the final frame assertion with:

```ts
expect(scene.frame).toHaveBeenCalledWith(expect.any(Number), expect.objectContaining({
  phase: 'atNode',
  progress: 1,
  settledIndex: 1,
}));
```

Keep this assertion:

```ts
expect(history.pushState).toHaveBeenCalledWith(null, '', '/missions/agent-ops?mode=world');
```

- [ ] **Step 4: Update popstate and navigation tests**

Replace every assertion that expects `{ kind: 'atNode', index: N }` with:

```ts
expect.objectContaining({ phase: 'atNode', progress: N, settledIndex: N })
```

Keep the listener-count assertions unchanged.

- [ ] **Step 5: Run tests and verify failure**

Run: `npm test -- tests/world-wire.test.ts`

Expected: FAIL because `src/world/wire.ts` still passes legacy `TravelState`.

- [ ] **Step 6: Replace `TravelMachine` and `WheelIntent` in `src/world/wire.ts`**

Change the imports at the top:

```ts
import { MotionController } from '../core/motion';
```

Remove:

```ts
import { WheelIntent } from '../core/intent';
import { TravelMachine } from '../core/travel';
```

Replace the controller setup:

```ts
const motion = new MotionController(nodes.length, {
  reducedMotion,
});
```

Replace `depart`, `advance`, `back`, `jumpTo`, `settleTransitWithoutHistoryPush`, and `syncToCurrentRoute` with:

```ts
const setTransitFromSnapshot = () => {
  const s = motion.snapshot();
  if (s.phase === 'inTransit') hud.setTransit(s.to);
};
const advance = () => {
  if (motion.advance()) setTransitFromSnapshot();
};
const back = () => {
  if (motion.back()) setTransitFromSnapshot();
};
const jumpTo = (index: number) => {
  if (motion.jumpTo(index)) setTransitFromSnapshot();
};
const settleWithoutHistoryPush = (index: number) => {
  suppressHistoryPush = true;
  try {
    motion.setProgress(index);
  } finally {
    suppressHistoryPush = false;
  }
};
const syncToCurrentRoute = () => {
  const index = routeToIndex(location.pathname, nodes);
  if (index === null) return;
  if (motion.snapshot().settledIndex === index) {
    hud.setAtNode(index);
    return;
  }
  settleWithoutHistoryPush(index);
};
```

Replace start-index setup:

```ts
const startIndex = routeToIndex(location.pathname, nodes) ?? 0;
motion.setProgress(startIndex);
hud.setAtNode(startIndex);
```

Replace arrival listener:

```ts
const unlistenArrive = motion.onArrive((index) => {
  if (index < 0) { hud.setOverview(); return; }
  hud.setAtNode(index);
  const route = nodes[index]?.route;
  const nextUrl = route ? `${route}${location.search}` : null;
  if (!suppressHistoryPush && nextUrl && `${location.pathname}${location.search}` !== nextUrl) {
    history.pushState(null, '', nextUrl);
  }
});
```

Replace `onWheel`:

```ts
const onWheel = (event: WheelEvent) => {
  if (reducedMotion) {
    if (event.deltaY > 0) advance();
    else if (event.deltaY < 0) back();
    return;
  }
  motion.nudge(event.deltaY);
  setTransitFromSnapshot();
};
```

Replace the animation loop body:

```ts
motion.tick(dt);
const motionState = motion.snapshot();
scene.frame(dt, motionState);
hud.setLabels(scene.labels());
```

- [ ] **Step 7: Run focused wire tests**

Run: `npm test -- tests/world-wire.test.ts tests/motion.test.ts tests/replay.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/world/wire.ts tests/world-wire.test.ts
git commit -m "feat(world): drive world with continuous rail motion"
```

## Task 6: Copy Curated Old-Site Assets Into Tracked Build Paths

**Files:**
- Create directory: `src/assets/rail/`
- Copy assets from: `notanastronaut.net/img/`
- Modify: no TypeScript files in this task

- [ ] **Step 1: Copy rail assets**

Run:

```bash
mkdir -p src/assets/rail
cp notanastronaut.net/img/planet1-375x250.png src/assets/rail/planet1.png
cp notanastronaut.net/img/planet1-375x250-alt.png src/assets/rail/planet1-alt.png
cp notanastronaut.net/img/planet2-200x175.png src/assets/rail/planet2.png
cp notanastronaut.net/img/comet2-325x150.png src/assets/rail/comet-long.png
cp notanastronaut.net/img/comet-125x100.png src/assets/rail/comet-small.png
cp notanastronaut.net/img/cloud-200x85.png src/assets/rail/cloud.png
cp notanastronaut.net/img/star-75x75.png src/assets/rail/star-large.png
cp notanastronaut.net/img/star2-25x25.png src/assets/rail/star-small.png
cp notanastronaut.net/img/lunar-surface.png src/assets/rail/lunar-surface.png
cp notanastronaut.net/img/proj1.png src/assets/rail/proj1.png
cp notanastronaut.net/img/proj2.png src/assets/rail/proj2.png
cp notanastronaut.net/img/proj3.png src/assets/rail/proj3.png
cp notanastronaut.net/img/motion.png src/assets/rail/motion.png
```

- [ ] **Step 2: Verify files exist**

Run:

```bash
find src/assets/rail -maxdepth 1 -type f | sort
```

Expected output includes exactly these filenames:

```text
src/assets/rail/cloud.png
src/assets/rail/comet-long.png
src/assets/rail/comet-small.png
src/assets/rail/lunar-surface.png
src/assets/rail/motion.png
src/assets/rail/planet1-alt.png
src/assets/rail/planet1.png
src/assets/rail/planet2.png
src/assets/rail/proj1.png
src/assets/rail/proj2.png
src/assets/rail/proj3.png
src/assets/rail/star-large.png
src/assets/rail/star-small.png
```

- [ ] **Step 3: Check build asset budget**

Run: `npm run budgets`

Expected: PASS. If it fails because copied PNGs exceed existing limits, stop and inspect `scripts/check-budgets.mjs` before changing limits.

- [ ] **Step 4: Commit**

```bash
git add src/assets/rail
git commit -m "feat(assets): add old-site rail sprites"
```

## Task 7: Render Rail Scenery In WorldScene

**Files:**
- Modify: `src/world/scene.ts`
- Modify: `src/core/types.ts` only if TypeScript imports need adjustment

- [ ] **Step 1: Change `WorldScene.frame` signature**

In `src/world/scene.ts`, replace the `TravelState` import with `RailMotionState`:

```ts
import type { NodeDef, RailMotionState, Vec3 } from '../core/types';
```

Change:

```ts
frame(dt: number, travel: TravelState): void {
```

to:

```ts
frame(dt: number, motion: RailMotionState): void {
```

- [ ] **Step 2: Import rail path and assets**

Add imports:

```ts
import { makeRailPath } from '../core/rail-path';
import planet1Url from '../assets/rail/planet1.png';
import planet1AltUrl from '../assets/rail/planet1-alt.png';
import planet2Url from '../assets/rail/planet2.png';
import cometLongUrl from '../assets/rail/comet-long.png';
import cometSmallUrl from '../assets/rail/comet-small.png';
import cloudUrl from '../assets/rail/cloud.png';
import starLargeUrl from '../assets/rail/star-large.png';
import starSmallUrl from '../assets/rail/star-small.png';
import lunarSurfaceUrl from '../assets/rail/lunar-surface.png';
import proj1Url from '../assets/rail/proj1.png';
import proj2Url from '../assets/rail/proj2.png';
import proj3Url from '../assets/rail/proj3.png';
import motionUrl from '../assets/rail/motion.png';
```

- [ ] **Step 3: Replace galaxy fields with rail fields**

Add these class fields:

```ts
private readonly rail: ReturnType<typeof makeRailPath>;
private readonly railScenery: THREE.Sprite[] = [];
private readonly nearScenery: THREE.Sprite[] = [];
```

Inside the constructor, immediately after `this.nodes = nodes;`, add:

```ts
this.rail = makeRailPath(nodes);
```

Remove the `pieces` field and its spin loop when galaxy sprites are removed. Keep `flyFades` only if the dashed route line remains visible in rail mode.

- [ ] **Step 4: Add texture helper for PNGs**

Add near `svgTexture`:

```ts
function imageTexture(url: string): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
```

- [ ] **Step 5: Replace node planet texture selection**

Replace the current single SVG planet texture:

```ts
const planetTex = svgTexture('/artwork/galaxy/galaxy-planet.svg', 1024, 804);
```

with:

```ts
const nodeTextures = [imageTexture(proj1Url), imageTexture(proj2Url), imageTexture(proj3Url), imageTexture(motionUrl)];
```

Inside `nodes.forEach`, set:

```ts
const tex = n.kind === 'intro' || n.kind === 'contact'
  ? imageTexture(n.kind === 'intro' ? planet1Url : planet1AltUrl)
  : nodeTextures[(i - 1) % nodeTextures.length]!;
const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
```

Keep `sprite.userData.nodeIndex`, `baseW`, and `baseH`.

- [ ] **Step 6: Add rail scenery setup**

After node sprites are created, add:

```ts
const sceneryDefs = [
  { url: cloudUrl, progress: 0.35, x: -10, y: 5, z: 0, h: 3.2, near: false },
  { url: cometLongUrl, progress: 0.7, x: 12, y: -3, z: 0, h: 2.4, near: true },
  { url: starLargeUrl, progress: 1.3, x: -9, y: 7, z: 0, h: 1.8, near: false },
  { url: planet2Url, progress: 1.75, x: 11, y: 4, z: 0, h: 3.5, near: false },
  { url: lunarSurfaceUrl, progress: 2.2, x: -6, y: -7, z: 0, h: 1.1, near: true },
  { url: cometSmallUrl, progress: 2.6, x: 10, y: 6, z: 0, h: 1.6, near: false },
  { url: cloudUrl, progress: 3.25, x: -13, y: -4, z: 0, h: 3.1, near: true },
  { url: starSmallUrl, progress: 3.8, x: 8, y: 7, z: 0, h: 1.2, near: false },
  { url: planet1AltUrl, progress: 4.4, x: -12, y: 5, z: 0, h: 3.8, near: true },
];
for (const def of sceneryDefs) {
  const tex = imageTexture(def.url);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  const p = v3(this.rail.sampleProgress(def.progress));
  sprite.position.set(p.x + def.x, p.y + def.y, p.z + def.z);
  const image = tex.image as HTMLImageElement | undefined;
  const aspect = image?.width && image?.height ? image.width / image.height : 1;
  sprite.scale.set(def.h * aspect, def.h, 1);
  sprite.userData.near = def.near;
  sprite.userData.spin = def.near ? 0.04 : 0.015;
  this.railScenery.push(sprite);
  if (def.near) this.nearScenery.push(sprite);
  this.scene.add(sprite);
}
```

- [ ] **Step 7: Update camera pose to sample rail progress**

Replace `flyPose(u: number)` with:

```ts
private flyPose(progress: number): { pos: THREE.Vector3; look: THREE.Vector3; bank: number } {
  const ahead = Math.min(this.nodes.length - 1, progress + 0.08);
  const behind = Math.max(0, progress - 0.18);
  const eye = this.rail.sampleProgress(behind);
  const look = this.rail.sampleProgress(ahead);
  const tangent = v3(look).sub(v3(eye)).normalize();
  const bank = Math.max(-0.16, Math.min(0.16, tangent.x * -0.12));
  return {
    pos: new THREE.Vector3(eye.x, eye.y + CAM_UP, eye.z - CAM_DEPTH),
    look: v3(look),
    bank,
  };
}
```

In `frame`, compute:

```ts
const ov = motion.phase === 'overview' ? 1 : Math.max(0, Math.min(1, -motion.progress));
const railProgress = Math.max(0, motion.progress);
const np = this.flyPose(railProgress);
```

Use `np.pos`, `np.look`, and set camera roll after `lookAt`:

```ts
this.camera.rotation.z += this.idle ? np.bank : 0;
```

- [ ] **Step 8: Update astronaut placement**

Replace `here = v3(this.path.sample(flyU))` with:

```ts
const here = v3(this.rail.sampleProgress(railProgress));
```

Set opacity:

```ts
this.astronaut.material.opacity = 1 - ov * 0.75;
```

- [ ] **Step 9: Update labels and title focus**

Replace calls to `this.titleFocus(i, travel)` with:

```ts
const focus = this.titleFocus(i, motion) * (1 - ov);
```

Replace `titleFocus` with:

```ts
private titleFocus(i: number, motion: RailMotionState): number {
  const distance = Math.abs(motion.progress - i);
  return Math.max(0, Math.min(1, 1 - distance / 0.7));
}
```

- [ ] **Step 10: Remove unused galaxy-specific imports**

Remove imports from `src/world/scene.ts` that are no longer referenced:

```ts
import { FlightPath, nodeParam } from '../core/path';
import { makeGalaxy, type GalaxyKind } from '../core/galaxy';
import { OVERVIEW_INDEX } from '../core/travel';
```

Keep `overviewPose` if the repurposed overview camera still uses it.

- [ ] **Step 11: Run typecheck**

Run: `npm run typecheck`

Expected: PASS. Fix any unused imports or type mismatches before continuing.

- [ ] **Step 12: Run focused tests**

Run: `npm test -- tests/world-wire.test.ts tests/rail-path.test.ts tests/render.test.ts`

Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add src/world/scene.ts src/core/types.ts
git commit -m "feat(world): render old-site rail flythrough scene"
```

## Task 8: Update HUD Overview Copy And Safe-Zone Rules

**Files:**
- Modify: `src/hud/hud.ts`
- Modify: `src/hud/hud.css`
- Modify: `tests/hud.test.ts`

- [ ] **Step 1: Update overview copy**

In `src/hud/hud.ts`, replace `setOverview()` body text:

```ts
this.status.textContent = `★ ROUTE VIEW · ${pad(this.nodes.length)} STOPS`;
this.hint.textContent = 'scroll ↓ to enter · click a stop';
```

- [ ] **Step 2: Keep labels readable**

In `src/hud/hud.css`, update `.node-label` to add a stronger backing glow without adding a visible card:

```css
.node-label {
  position: absolute; top: 0; left: 0; opacity: 0; white-space: nowrap;
  transform-origin: right center;
  font-family: var(--font-sans); font-weight: 800; font-size: 1.5rem;
  letter-spacing: 0; color: var(--sky-text);
  text-shadow: 0 0 8px #fff, 0 0 8px #fff, 0 0 14px #fff, 0 1px 0 #fff;
}
```

- [ ] **Step 3: Update HUD tests**

Open `tests/hud.test.ts`. If it asserts `STAR MAP`, replace that expected text with `ROUTE VIEW`. If it asserts the old hint, replace it with `scroll ↓ to enter · click a stop`.

- [ ] **Step 4: Run HUD tests**

Run: `npm test -- tests/hud.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hud/hud.ts src/hud/hud.css tests/hud.test.ts
git commit -m "feat(hud): repurpose overview as route view"
```

## Task 9: Validate Build And Browser Motion

**Files:**
- Modify only files needed to fix validation failures found in this task.

- [ ] **Step 1: Run full unit suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Run budget check**

Run: `npm run budgets`

Expected: PASS.

- [ ] **Step 5: Run Playwright smoke**

Run: `npm run e2e`

Expected: PASS. If Playwright requires the preview server, run `npm run preview` in a separate terminal session and re-run `npm run e2e`.

- [ ] **Step 6: Start dev server for manual motion review**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL such as `http://127.0.0.1:5173/`.

- [ ] **Step 7: Manual browser checks**

Open the local URL and verify:

- The scene is nonblank.
- The astronaut remains visually anchored while moving.
- Trackpad/wheel input moves continuously rather than only firing one discrete step.
- Motion eases/snaps near content nodes.
- Backing up from the first node reaches the route overview.
- Near-field objects sweep by the viewport edges.
- The HUD panel and labels remain readable at node rest.
- `?mode=list` still shows the list fallback.

- [ ] **Step 8: Commit validation fixes**

If Step 1 through Step 7 required fixes, commit them:

```bash
git add src tests e2e package.json package-lock.json
git commit -m "fix: stabilize rail flythrough prototype"
```

If no fixes were needed, do not create an empty commit.

## Task 10: Motion Review Handoff

**Files:**
- Modify: none unless manual review reveals a defect.

- [ ] **Step 1: Capture current git status**

Run: `git status --short`

Expected: only unrelated untracked old-site inputs may remain:

```text
?? notanastronaut.net.zip
?? notanastronaut.net/
```

- [ ] **Step 2: Summarize verification evidence**

Record the exact commands run and their result in the final implementation response:

```text
npm test — pass
npm run typecheck — pass
npm run build — pass
npm run budgets — pass
npm run e2e — pass
manual browser review — URL and notes
```

- [ ] **Step 3: Ask for human motion review**

End implementation with a concrete review request:

```text
The prototype is running at <local URL>. Please try wheel/trackpad movement, arrow movement, first-node back to route view, and node readability at rest. The remaining acceptance gate is whether the motion feels like the reference.
```

Do not claim the motion quality is accepted until the human review confirms it.

---

## Plan Self-Review Notes

- Spec coverage: continuous `progress`, overview `-1`, deterministic core, authored rail path, old-site assets, wheel/trackpad deltas, snap zones, reduced motion, readable labels, and manual motion review are all covered by tasks.
- Scope: this plan keeps Three.js, fallback rendering, current content, and legacy `TravelMachine` code. It does not attempt final illustration polish or a neighborhood rebuild.
- Commit sequence: each task has a focused commit. Asset intake is isolated from behavior changes.
