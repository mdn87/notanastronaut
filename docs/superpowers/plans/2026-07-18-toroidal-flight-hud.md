# Toroidal Flight HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic toroidal ship wrapping at the visible line-grid edge and replace the free-fly HUD with an opaque, geometric minimap/telemetry/compass layout.

**Architecture:** Add a focused pure torus module and shared line-grid constants, then integrate wrapping into the Rapier dart after each fixed substep while preserving velocity and facing. Replace the floating flight XYZ readout with three reusable DOM instrument regions updated from plain flight state; keep the existing gameplay field and unrelated dirty-worktree work intact.

**Tech Stack:** TypeScript, Vitest, Three.js, Rapier 3D, Vite, Playwright.

---

## File map

- Modify `src/core/grid.ts`: export the line-grid spacing/extent/edge source of truth and use it for default line construction.
- Create `src/core/torus.ts`: allocation-free scalar/vector wrapping and nearest-image math.
- Modify `src/core/flight-types.ts`: add the frame-level `wrapped` state flag.
- Modify `src/core/control.ts`: add the optional `wrapEdge` option to the Rapier control options.
- Modify `src/core/flight.ts`: initialize the new flag for the legacy deterministic integrator without changing its existing soft-bound behavior.
- Modify `src/physics/dart.ts`: enable toroidal mode, skip the non-load-bearing soft-bound force in that mode, wrap after each fixed Rapier step, and report the wrap event.
- Modify `src/world/wire.ts`: pass the shared `GRID_EDGE` into physics, update the HUD with plain navigation state, and stop using screen-projected readouts.
- Modify `src/world/scene.ts`: use the shared line-grid constants and remove the now-unused `readout()` adapter method; do not introduce or restore backdrop rendering.
- Modify `src/hud/flight-hud.ts`: render/update the minimap, bottom-centered compass, and right telemetry panel; remove the floating readout API.
- Modify `src/hud/hud.css`: add opaque white/cyan/orange flat HUD geometry and responsive positioning.
- Modify `tests/grid.test.ts`: cover the quantized visible edge source of truth.
- Create `tests/torus.test.ts`: cover wrapping, overshoot, axis independence, and nearest-image deltas.
- Modify `tests/flight.test.ts`: cover the new legacy-state default.
- Create `tests/dart.test.ts`: cover actual Rapier ship wrapping and direction preservation.
- Modify `tests/flight-hud.test.ts`: cover the new DOM regions and navigation updates.
- Modify `tests/world-wire.test.ts`: update the HUD mock contract and verify navigation wiring.
- Modify `e2e/smoke.spec.ts`: rename stale galaxy-specific assertions and verify the live world HUD regions.

The worktree contains unrelated in-progress changes. Stage only the files for
the current task in each commit; do not reset, checkout, or clean other files.
The existing galaxy-related code is not a dependency of this feature and is
not to be expanded or restored.

### Task 0: Record the baseline without changing the dirty worktree

**Files:**
- Verify only: repository status and existing test/build configuration.

- [ ] **Step 1: Inspect the current branch and dirty paths**

Run:

```bash
git status --short
git branch --show-current
git diff --check
```

Expected: the known dirty paths are present, no new changes are introduced by
the plan, and `git diff --check` exits 0.

- [ ] **Step 2: Run the baseline unit/type checks**

Run:

```bash
npm test
npm run typecheck
```

Expected: record any pre-existing failure exactly; do not fix unrelated
failures in this task before the first feature test.

### Task 1: Define the visible grid edge and pure torus math

**Files:**
- Modify: `src/core/grid.ts`
- Create: `src/core/torus.ts`
- Modify: `tests/grid.test.ts`
- Create: `tests/torus.test.ts`

- [ ] **Step 1: Write failing grid-edge tests**

Extend the grid test import and add:

```ts
import {
  GRID_EDGE, GRID_LINE_EXTENT, GRID_LINE_SPACING,
  gridEdge, makeDotGrid, makeGridLines, GRID_MAX_POINTS, GRID_MAX_LINES,
} from '../src/core/grid';

it('derives the seam from the visible line-grid span, not the requested extent', () => {
  expect(gridEdge({ spacing: 90, extent: 700 })).toBe(630);
  expect(GRID_LINE_SPACING).toBe(90);
  expect(GRID_LINE_EXTENT).toBe(700);
  expect(GRID_EDGE).toBe(630);
});
```

- [ ] **Step 2: Run the grid test to verify it fails for the missing API**

Run:

```bash
npx vitest run tests/grid.test.ts
```

Expected: FAIL because the shared constants and `gridEdge` do not yet exist.

- [ ] **Step 3: Add the shared line-grid constants and edge helper**

In `src/core/grid.ts`, add the following before `makeGridLines` and change its
default options to use the constants:

```ts
export const GRID_LINE_SPACING = 90;
export const GRID_LINE_EXTENT = 700;

export function gridEdge(opts: { spacing?: number; extent?: number } = {}): number {
  const spacing = opts.spacing ?? GRID_LINE_SPACING;
  const extent = opts.extent ?? GRID_LINE_EXTENT;
  if (!(spacing > 0) || !(extent >= 0)) throw new Error('grid spacing and extent must be positive');
  return Math.floor(extent / spacing) * spacing;
}

export const GRID_EDGE = gridEdge();
```

Use `gridEdge({ spacing, extent })` for `span` inside `makeGridLines` so the
line endpoints and the physics seam cannot diverge.

- [ ] **Step 4: Write the failing pure torus tests**

Create `tests/torus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nearestImageDeltaInto, wrapPositionInto, wrapScalar } from '../src/core/torus';

describe('toroidal coordinates', () => {
  it('wraps positive and negative values into the canonical interval', () => {
    expect(wrapScalar(631, 630)).toBe(-629);
    expect(wrapScalar(-631, 630)).toBe(629);
    expect(wrapScalar(630, 630)).toBe(-630);
    expect(wrapScalar(-630, 630)).toBe(-630);
  });

  it('preserves overshoot beyond more than one full period', () => {
    expect(wrapScalar(630 + 1260 + 7, 630)).toBe(-623);
    expect(wrapScalar(-630 - 1260 - 7, 630)).toBe(623);
  });

  it('wraps each position axis independently and reports whether anything crossed', () => {
    const out = { x: 0, y: 0, z: 0 };
    expect(wrapPositionInto({ x: 631, y: -700, z: 0 }, 630, out)).toBe(true);
    expect(out).toEqual({ x: -629, y: 560, z: 0 });
    expect(wrapPositionInto({ x: 10, y: 20, z: 30 }, 630, out)).toBe(false);
    expect(out).toEqual({ x: 10, y: 20, z: 30 });
  });

  it('chooses the short nearest-image delta across a seam', () => {
    const out = { x: 0, y: 0, z: 0 };
    nearestImageDeltaInto({ x: 629, y: 0, z: 0 }, { x: -629, y: 0, z: 0 }, 630, out);
    expect(out).toEqual({ x: 2, y: 0, z: 0 });
  });
});
```

- [ ] **Step 5: Run the torus test to verify it fails for the missing module**

Run:

```bash
npx vitest run tests/torus.test.ts
```

Expected: FAIL because `src/core/torus.ts` does not yet exist.

- [ ] **Step 6: Implement the minimal allocation-free torus helpers**

Create `src/core/torus.ts`:

```ts
import type { Vec3 } from './types';

export function wrapScalar(value: number, edge: number): number {
  if (!(edge > 0)) throw new Error('torus edge must be positive');
  const period = edge * 2;
  return ((value + edge) % period + period) % period - edge;
}

export function wrapPositionInto(position: Vec3, edge: number, out: Vec3): boolean {
  const x = wrapScalar(position.x, edge);
  const y = wrapScalar(position.y, edge);
  const z = wrapScalar(position.z, edge);
  out.x = x; out.y = y; out.z = z;
  return x !== position.x || y !== position.y || z !== position.z;
}

export function nearestImageDeltaInto(from: Vec3, to: Vec3, edge: number, out: Vec3): void {
  out.x = wrapScalar(to.x - from.x, edge);
  out.y = wrapScalar(to.y - from.y, edge);
  out.z = wrapScalar(to.z - from.z, edge);
}
```

- [ ] **Step 7: Run the focused tests and commit the pure core**

Run:

```bash
npx vitest run tests/grid.test.ts tests/torus.test.ts
```

Expected: all focused grid/torus tests pass.

Commit:

```bash
git add src/core/grid.ts src/core/torus.ts tests/grid.test.ts tests/torus.test.ts
git commit -m "feat(core): add toroidal grid coordinates"
```

### Task 2: Integrate ship wrapping into fixed Rapier flight

**Files:**
- Modify: `src/core/flight-types.ts`
- Modify: `src/core/control.ts`
- Modify: `src/core/flight.ts`
- Modify: `src/physics/dart.ts`
- Modify: `tests/flight.test.ts`
- Create: `tests/dart.test.ts`

- [ ] **Step 1: Add the failing state/integration tests**

Add the legacy-state assertion to `tests/flight.test.ts`:

```ts
it('starts with no wrap event', () => {
  expect(new FlightMachine().state.wrapped).toBe(false);
});
```

Create `tests/dart.test.ts` with a small seam so the test crosses quickly:

```ts
import { describe, expect, it } from 'vitest';
import { DartPhysics } from '../src/physics/dart';
import type { FlightInput } from '../src/core/flight-types';

const input = (patch: Partial<FlightInput> = {}): FlightInput => ({
  yawDelta: 0, pitchDelta: 0, forward: 0, strafe: 0, ...patch,
});

describe('DartPhysics toroidal mode', () => {
  it('wraps the ship and preserves forward velocity when crossing the seam', async () => {
    const dart = await DartPhysics.create({
      wrapEdge: 10, accel: 160, maxSpeed: 20, linearDamping: 0,
    });
    try {
      let wrapped = false;
      let state = dart.state();
      for (let i = 0; i < 80 && !wrapped; i++) {
        dart.step(0.05, input({ forward: 1 }));
        state = dart.state();
        wrapped = state.wrapped;
      }
      expect(wrapped).toBe(true);
      expect(state.position.z).toBeLessThan(-9);
      expect(state.velocity.z).toBeGreaterThan(0);
      expect(state.heading).toEqual({ x: 0, y: 0, z: 1 });
    } finally {
      dart.dispose();
    }
  });
});
```

- [ ] **Step 2: Run the focused tests to verify the new assertions fail**

Run:

```bash
npx vitest run tests/flight.test.ts tests/dart.test.ts
```

Expected: the new `wrapped` assertion fails to compile or the Dart test fails
because toroidal state and wrapping are not implemented.

- [ ] **Step 3: Extend the shared flight state/options without changing legacy feel**

In `src/core/flight-types.ts`, add `wrapped: boolean` to `FlightState`. In
`src/core/control.ts`, add `wrapEdge?: number` to `ControlOpts`; keep it absent
from `DEFAULT_CONTROL` so legacy callers remain soft-bound by default.
Initialize `wrapped: false` in the `FlightMachine` state in `src/core/flight.ts`
and reset it to `false` at the start of every legacy `tick`; do not add
wrapping to `FlightMachine`, whose existing bound tests remain valid.

- [ ] **Step 4: Add fixed-step wrapping to `DartPhysics`**

Import `wrapPositionInto` from `src/core/torus`. Add a reusable
`wrappedPosition` scratch vector, a `ZERO` force constant, and a `wrapped` flag.
At the beginning of each outer `step`, reset the flag. Inside the fixed-step
loop, apply the existing boundary force only when
`this.o.wrapEdge === undefined`; then call `world.step()` and immediately wrap
the body translation when toroidal mode is enabled:

```ts
const ZERO = { x: 0, y: 0, z: 0 };

const t = this.body.translation();
const bnd = this.o.wrapEdge === undefined
  ? boundaryForce(t, this.o.bound, this.o.boundPush)
  : ZERO;
this.body.resetForces(false);
this.body.addForce({
  x: thr.x * this.throttle + bnd.x,
  y: thr.y * this.throttle + bnd.y,
  z: thr.z * this.throttle + bnd.z,
}, true);
this.world.step();

if (this.o.wrapEdge !== undefined) {
  const translated = this.body.translation();
  if (wrapPositionInto(translated, this.o.wrapEdge, this.wrappedPosition)) {
    this.body.setTranslation(this.wrappedPosition, true);
    this.wrapped = true;
  }
}
```

`setTranslation` must not call `setLinvel`; Rapier therefore preserves the
velocity that proves direction continuity. Add `wrapped` to `state()`.

- [ ] **Step 5: Run focused flight/Dart tests and typecheck**

Run:

```bash
npx vitest run tests/flight.test.ts tests/dart.test.ts
npm run typecheck
```

Expected: focused flight and Rapier tests pass and TypeScript reports no
missing `wrapped` properties.

- [ ] **Step 6: Commit the physics integration**

```bash
git add src/core/flight-types.ts src/core/flight.ts src/physics/dart.ts tests/flight.test.ts tests/dart.test.ts
git commit -m "feat(physics): wrap the ship across the grid seam"
```

### Task 3: Replace the floating readout with the geometric Flight HUD

**Files:**
- Modify: `src/hud/flight-hud.ts`
- Modify: `src/hud/hud.css`
- Modify: `tests/flight-hud.test.ts`

- [ ] **Step 1: Write failing HUD tests for the three instrument regions**

Replace the existing floating-readout tests with assertions for the new API:

```ts
it('renders the minimap, bottom compass, and telemetry regions', () => {
  const { root } = makeRoot();
  new FlightHud(root, { edge: 630 });
  expect(root.innerHTML).toContain('flight-minimap');
  expect(root.innerHTML).toContain('flight-compass');
  expect(root.innerHTML).toContain('flight-telemetry');
  expect(root.innerHTML).not.toContain('flight-readout');
});

it('updates telemetry, minimap position, compass, and wrap state from plain navigation data', () => {
  const { root, el } = makeRoot();
  const hud = new FlightHud(root, { edge: 630 });
  hud.setNavigation({
    speed: 42.4,
    position: { x: 12, y: -34, z: 120 },
    heading: { x: 1, y: 0, z: 0 },
    yaw: Math.PI / 2,
    pitch: 0.2,
    wrapped: true,
  });
  expect(el('.flight-speed').textContent).toBe('42 u/s');
  expect(el('.flight-xyz').textContent).toBe('X +012  Y -034  Z +120');
  expect(el('.flight-wrap').textContent).toMatch(/GRID WRAP/);
  expect(el('.flight-wrap').classList.contains('is-wrapped')).toBe(true);
  expect(el('.flight-minimap-marker').style.transform).toMatch(/translate/);
  expect(el('.flight-compass-band').style.transform).toMatch(/translateX/);
  expect(el('.flight-gimbal').style.transform).toMatch(/rotate/);
});

it('clears wrap feedback on the next non-wrap navigation frame', () => {
  const { root, el } = makeRoot();
  const hud = new FlightHud(root, { edge: 630 });
  const nav = {
    speed: 0, position: { x: 0, y: 0, z: 0 },
    heading: { x: 0, y: 0, z: 1 }, yaw: 0, pitch: 0,
  };
  hud.setNavigation({ ...nav, wrapped: true });
  hud.setNavigation({ ...nav, wrapped: false });
  expect(el('.flight-wrap').textContent).toBe('GRID OK');
  expect(el('.flight-wrap').classList.contains('is-wrapped')).toBe(false);
});
```

- [ ] **Step 2: Run the HUD tests to verify they fail**

Run:

```bash
npx vitest run tests/flight-hud.test.ts
```

Expected: FAIL because the constructor/options, markup, and `setNavigation`
method do not yet exist.

- [ ] **Step 3: Implement the minimal FlightHud structure and update API**

Define:

```ts
export interface FlightNavigation {
  speed: number;
  position: { x: number; y: number; z: number };
  heading: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  wrapped: boolean;
}
```

Give the constructor the signature `constructor(root: HTMLElement, opts:
{ edge: number })`. Render one opaque instrument region for each of these
selectors: `.flight-minimap`, `.flight-minimap-marker`,
`.flight-minimap-vector`, `.flight-compass`, `.flight-compass-band`,
`.flight-gimbal`, `.flight-wrap`, `.flight-speed`, and `.flight-xyz`.

Extend the test double's element shape with a minimal `classList` implementing
`add`, `remove`, and `contains`; use that classList in the assertions above so
the test exercises the same mechanism as production CSS.

`setNavigation` must:

- format XYZ with the existing signed three-digit convention;
- map X/Z from `[-edge, edge]` into the minimap's inner 10–90% range;
- rotate the minimap vector with `Math.atan2(heading.x, heading.z)`;
- rotate the cardinal band from `yaw` and tilt the gimbal from `pitch`;
- set `GRID WRAP` and add the `is-wrapped` class only when `wrapped` is true;
- otherwise set `GRID OK` and remove the `is-wrapped` class.

Do not rebuild `root` after construction and do not retain the old
`setReadout` method. Keep `dispose()` clearing the owned root.

- [ ] **Step 4: Add the flat, opaque HUD CSS**

Add CSS rules with these fixed layout contracts:

```css
.flight-minimap,
.flight-compass,
.flight-telemetry {
  position: fixed;
  background: var(--bg);
  border: 1px solid var(--sky);
  color: var(--sky-text);
  pointer-events: none;
}
.flight-minimap { left: 16px; bottom: 16px; width: 96px; height: 96px; }
.flight-compass { left: 50%; bottom: 16px; width: min(240px, 42vw); height: 72px; transform: translateX(-50%); }
.flight-telemetry { right: 16px; bottom: 16px; min-width: 142px; padding: 8px 10px; }
.flight-wrap.is-wrapped { color: var(--accent-text); border-color: var(--accent); }
```

Use only solid borders/lines, white backgrounds, cyan structure, and orange
indicator states. Use media queries to shrink the side blocks below 520px while
keeping the compass centered at the bottom. Do not add a translucent overlay,
text glow, or full-screen background panel.

- [ ] **Step 5: Run HUD tests, typecheck, and commit**

Run:

```bash
npx vitest run tests/flight-hud.test.ts
npm run typecheck
```

Expected: all focused HUD tests pass and the new selectors/types compile.

Commit:

```bash
git add src/hud/flight-hud.ts src/hud/hud.css tests/flight-hud.test.ts
git commit -m "feat(hud): add geometric flight instruments"
```

### Task 4: Wire navigation state and remove dead screen-projection code

**Files:**
- Modify: `src/world/wire.ts`
- Modify: `src/world/scene.ts`
- Modify: `tests/world-wire.test.ts`

- [ ] **Step 1: Update the wire test mock before implementation**

Change the `FlightHud` test double to expose `setNavigation` instead of
`setSpeed`/`setReadout`, and change the fake scene to expose only the methods
still used by `wireWorld`. Update the mocked `dart.state()` return object to
include `wrapped: false`. Add an assertion that one animation frame forwards
the plain navigation state, including `wrapped`, to the HUD.

- [ ] **Step 2: Run the wire test to verify the mock/API mismatch fails**

Run:

```bash
npx vitest run tests/world-wire.test.ts
```

Expected: FAIL because `wire.ts` still calls the old HUD methods.

- [ ] **Step 3: Pass the shared edge and navigation state through `wire.ts`**

Import `GRID_EDGE` from `src/core/grid`, construct physics with
`DartPhysics.create({ wrapEdge: GRID_EDGE }, field)`, construct the HUD with
`new FlightHud(document.getElementById('hud-root')!, { edge: GRID_EDGE })`, and
replace the frame-loop calls with:

```ts
const s = dart.state();
scene.frame(dt, s, dart.obstaclePositions());
hud.setNavigation({
  speed: s.speed,
  position: s.position,
  heading: s.heading,
  yaw: s.yaw,
  pitch: s.pitch,
  wrapped: s.wrapped,
});
```

Remove the stale `bound: 720, boundPush: 220` live override. The line-grid
constants now own the live seam.

- [ ] **Step 4: Make the scene use shared grid constants and remove `readout()`**

In `src/world/scene.ts`, replace the literal line-grid options with
`makeGridLines({ spacing: GRID_LINE_SPACING, extent: GRID_LINE_EXTENT })`,
import the constants from `src/core/grid`, and delete the `readout()` method
and its projection-only code. Keep the existing camera, ship, grid, and
gameplay-field rendering intact; do not add or restore a galaxy backdrop as
part of this task.

- [ ] **Step 5: Run focused wire tests and commit the adapter cleanup**

Run:

```bash
npx vitest run tests/world-wire.test.ts tests/flight-hud.test.ts
npm run typecheck
```

Expected: the wire forwards navigation state, the dead projection method is
gone, and the focused tests/typecheck pass.

Commit:

```bash
git add src/world/wire.ts src/world/scene.ts tests/world-wire.test.ts
git commit -m "feat(world): wire toroidal navigation HUD"
```

### Task 5: Update browser smoke coverage for the live surface

**Files:**
- Modify: `e2e/smoke.spec.ts`

- [ ] **Step 1: Replace stale galaxy-specific test wording and selectors**

Rename the tests that describe a “free-fly galaxy canvas” or “renders the
galaxy” to describe the live world canvas/grid surface. Keep the existing
non-blank canvas assertion only as a render smoke check; it must not assert a
galaxy shape or a galaxy asset.

- [ ] **Step 2: Add HUD layout assertions**

In the world boot test, after the status is visible, assert:

```ts
await expect(page.locator('.flight-minimap')).toBeVisible();
await expect(page.locator('.flight-compass')).toBeVisible();
await expect(page.locator('.flight-telemetry')).toBeVisible();
await expect(page.locator('.flight-readout')).toHaveCount(0);
```

Add one geometry check through `page.evaluate` that reads the three bounding
rectangles and verifies the compass center is within two pixels of the viewport
center and its bottom edge aligns with the bottom edges of both side
instruments within two pixels. Also verify the
computed background color of all three panels is opaque white (`rgb(255, 255,
255)`).

Update the existing barrel-roll dodge test in the same file to use
`page.locator('.flight-xyz')` in place of `.flight-readout` for both the
physics-liveness wait and the signed-X parsing. The telemetry keeps the same
`X +012` format, so the existing `/X/` wait and `X\s*([+-]\d+)` extraction
remain valid.

- [ ] **Step 3: Run the focused Playwright smoke test**

Run:

```bash
npm run build
npx playwright test e2e/smoke.spec.ts -g "world|canvas|HUD|free-fly"
```

Expected: the world canvas boots, the HUD regions are visible, the floating
readout is absent, and no galaxy-specific assertion remains.

- [ ] **Step 4: Commit the browser coverage**

```bash
git add e2e/smoke.spec.ts
git commit -m "test(e2e): cover toroidal flight HUD"
```

### Task 6: Full verification and requirement audit

**Files:**
- Verify all task files; do not stage unrelated dirty paths.

- [ ] **Step 1: Run the complete non-destructive validation suite**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run budgets
npm run e2e
```

Expected: all unit tests, typecheck, build/prerender, budgets, and Playwright
smoke tests pass with exit code 0.

- [ ] **Step 2: Inspect the final diff for scope and whitespace**

Run:

```bash
git diff --check HEAD~5..HEAD
git status --short
git diff --stat HEAD~5..HEAD
```

Confirm that the feature commits contain only the planned torus/HUD/test paths
and that unrelated pre-existing dirty files remain untouched.

- [ ] **Step 3: Verify the acceptance criteria against code and tests**

Check each item explicitly:

- `GRID_EDGE` is derived from the visible line-grid span and equals 630.
- Toroidal `DartPhysics` wraps after fixed Rapier steps without mutating
  velocity/facing and does not apply the legacy soft-bound force.
- The HUD has only the left minimap, bottom-center compass, and right telemetry
  regions; it has no floating `.flight-readout`.
- The panels have opaque white backgrounds and use cyan/orange geometry only.
- Nearest-image math is covered as proximity math, not misrepresented as
  cross-seam Rapier collision response.
- The existing list fallback and unrelated portfolio routes still pass smoke
  coverage.

- [ ] **Step 4: Make the final implementation commit only after fresh evidence**

Do not claim completion or create any additional integration commit until the
commands in Step 1 have completed successfully and the final diff has been
reviewed against the acceptance list.
