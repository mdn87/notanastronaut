# Dark Mode Toggle + Nose-Pointing Flight + Tight Chase Cam — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A persisted HUD dark-mode toggle (dark gray + orange), a speed-preserving velocity-alignment steering law so the ship flies where the nose points, and a chase cam glued behind the facing.

**Architecture:** Pure palette module (`src/core/theme.ts`) is the single source of truth for WebGL colors; `galaxy.ts`/`field.ts` take palette params defaulting to `THEMES.light`; a pure `applyTheme(targets, …)` paints every mutable scene slot (unit-testable with fakes); `WorldScene.setTheme` is a thin assembly of real three.js targets, and `setObstacles` re-runs `setTheme` so late obstacles are always painted from the current theme. DOM colors are CSS variables with a `:root[data-theme='dark']` override; a pre-paint inline bootstrap in `index.html` prevents the light flash. Flight gains `alignVelocity` (pure rotation, sense from commanded input) applied per fixed step in `dart.ts`.

**Tech Stack:** Vite + three.js + @dimforge/rapier3d (WASM), vitest (node env, hand-rolled DOM stubs — no jsdom), Playwright e2e, Cloudflare Pages (`master` = production; do NOT merge without explicit user go).

**Spec:** `docs/superpowers/specs/2026-07-18-dark-mode-flight-feel-design.md`

**Execution notes (orchestration):**
- Tasks are ordered for sequential execution with per-task fresh subagents (subagent-driven-development). Dependencies: 2, 3, 8 depend on 1; 4 depends on 2+3; 5 depends on 4; 9 depends on 5+8; 11 depends on 10; 13 depends on 9+11+12. Tasks 6, 7, 10, 12 are independent of the theme chain. Do not parallelize commits on the shared branch.
- Every task ends with `npm run typecheck && npm test` green before its commit (write it, run it, commit it).

---

### Task 0: Verify + commit the pre-existing collision-field work, then branch

The working tree on `feat/star-collision-particle-thruster` holds the whole uncommitted collision-field/barrel-roll implementation. It must be verified and committed BEFORE this feature starts. **Scratch files stay uncommitted:** `check-field.ts`, `debug-wasm.mjs`, `tests/_scratch_review_det_check.test.ts`, and the `.claude/` directory. Do not delete them; ask the user at the end of the project.

**Files:** no source changes; git only.

- [ ] **Step 0.1: Run the verification gate**

```bash
npm run typecheck && npm test && npm run build && npm run budgets
```

Expected: all four pass. **If any fails: STOP. Report the failure to the user; do not commit and do not start Task 1.**

Exception: `tests/_scratch_review_det_check.test.ts` is untracked scratch but matches the vitest glob. If it is the ONLY failure, rename it to `tests/_scratch_review_det_check.test.ts.bak` (still untracked, out of the glob) and re-run — do not fix or commit it.

- [ ] **Step 0.2: Stage exactly the implementation (not the scratch files) and commit**

```bash
git add .gitignore .gitattributes CLAUDE.md docs/DEPLOY.md docs/superpowers \
  e2e/smoke.spec.ts package.json package-lock.json public/artwork/galaxy \
  scripts/check-budgets.mjs src tests/budgets.test.ts tests/control.test.ts \
  tests/ease.test.ts tests/field.test.ts tests/flight-hud.test.ts tests/flight.test.ts \
  tests/galaxy.test.ts tests/grid.test.ts tests/parallax.test.ts tests/router.test.ts \
  tests/world-mount.test.ts tests/world-wire.test.ts vite.config.ts
git status --short   # MUST still show check-field.ts, debug-wasm.mjs, tests/_scratch_review_det_check.test.ts, .claude/ as untracked — nothing else unstaged
git commit -m "feat: rapier collision field, barrel-roll dodge, dense-field world

Accumulated implementation of the 2026-06-28/06-29 physics specs and the
2026-07-09 reactive-stars work, verified via typecheck/test/build/budgets."
```

(`git add public/artwork/galaxy` also stages the two deleted planet SVGs — directory adds include removals.)

- [ ] **Step 0.3: Branch for the new feature**

```bash
git checkout -b feat/dark-mode-flight-feel
```

---

### Task 1: Pure theme core (`src/core/theme.ts`)

`Rgb` moves to `src/core/types.ts` so `theme.ts`, `field.ts`, and `galaxy.ts` share it without cycles. `theme.ts` is the single source of truth for every WebGL hex.

**Files:**
- Modify: `src/core/types.ts` (add `Rgb`)
- Modify: `src/core/field.ts:4` (re-export `Rgb` from types instead of defining it)
- Create: `src/core/theme.ts`
- Create: `tests/theme.test.ts`

- [ ] **Step 1.1: Write the failing test**

Create `tests/theme.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEMES, THEME_KEY, readStoredTheme, getStoredTheme, storeTheme } from '../src/core/theme';

const hex = (c: { r: number; g: number; b: number }) =>
  (Math.round(c.r * 255) << 16) | (Math.round(c.g * 255) << 8) | Math.round(c.b * 255);

describe('THEMES', () => {
  it('light matches the legacy scene colors exactly', () => {
    expect(hex(THEMES.light.bg)).toBe(0xffffff);
    expect(hex(THEMES.light.starArm)).toBe(0x4ab3d4);
    expect(hex(THEMES.light.starCore)).toBe(0x16324a);
    expect(hex(THEMES.light.grid)).toBe(0x4ab3d4);
    expect(hex(THEMES.light.square)).toBe(0x4ab3d4);
    expect(hex(THEMES.light.obstacleLo)).toBe(0x7fc9e0);
    expect(hex(THEMES.light.obstacleHi)).toBe(0x0a141e);
    expect(hex(THEMES.light.avatarBody)).toBe(0x2b7e9e);
    expect(hex(THEMES.light.avatarFins)).toBe(0x184f68);
  });

  it('dark fills every slot light has, each with a different value', () => {
    const slots = Object.keys(THEMES.light) as (keyof typeof THEMES.light)[];
    expect(Object.keys(THEMES.dark).sort()).toEqual([...slots].sort());
    for (const s of slots) expect(hex(THEMES.dark[s])).not.toBe(hex(THEMES.light[s]));
  });
});

describe('theme storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('readStoredTheme: only "dark" is dark; junk and null are light', () => {
    expect(readStoredTheme('dark')).toBe('dark');
    expect(readStoredTheme('light')).toBe('light');
    expect(readStoredTheme('banana')).toBe('light');
    expect(readStoredTheme(null)).toBe('light');
  });

  it('getStoredTheme reads the key; storeTheme writes it', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    expect(getStoredTheme()).toBe('light');
    storeTheme('dark');
    expect(store.get(THEME_KEY)).toBe('dark');
    expect(getStoredTheme()).toBe('dark');
  });

  it('survives storage that throws (disabled) and storage that is absent', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    });
    expect(getStoredTheme()).toBe('light');
    expect(() => storeTheme('dark')).not.toThrow();
    vi.unstubAllGlobals();
    expect(getStoredTheme()).toBe('light'); // node has no localStorage
  });
});
```

- [ ] **Step 1.2: Run it to make sure it fails**

Run: `npx vitest run tests/theme.test.ts`
Expected: FAIL — cannot resolve `../src/core/theme`.

- [ ] **Step 1.3: Implement**

Add to `src/core/types.ts`:

```ts
export interface Rgb { r: number; g: number; b: number }
```

In `src/core/field.ts`, replace the `export interface Rgb { … }` line with:

```ts
import type { Rgb } from './types';
export type { Rgb };
```

(Keep the existing `import type { Vec3 } from './types';` — merge into one import if you like. All existing `import { type Rgb } from './field'` consumers keep working.)

Create `src/core/theme.ts`:

```ts
import type { Rgb } from './types';

export type ThemeName = 'light' | 'dark';

/**
 * WebGL color slots only — DOM colors live in CSS variables (tokens.css).
 * This module is the single source of truth for scene hexes; galaxy.ts and
 * field.ts default their palettes from THEMES.light.
 */
export interface Theme {
  bg: Rgb;
  starArm: Rgb; starCore: Rgb;
  grid: Rgb; square: Rgb;
  obstacleLo: Rgb; obstacleHi: Rgb;
  avatarBody: Rgb; avatarFins: Rgb;
}

export const THEME_KEY = 'naa-theme';

const rgb = (hex: number): Rgb =>
  ({ r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 });

/** Light = the legacy look, byte-for-byte. Dark inverts luminance direction: denser = hotter. */
export const THEMES: Record<ThemeName, Theme> = {
  light: {
    bg: rgb(0xffffff),
    starArm: rgb(0x4ab3d4), starCore: rgb(0x16324a),
    grid: rgb(0x4ab3d4), square: rgb(0x4ab3d4),
    obstacleLo: rgb(0x7fc9e0), obstacleHi: rgb(0x0a141e),
    avatarBody: rgb(0x2b7e9e), avatarFins: rgb(0x184f68),
  },
  dark: {
    bg: rgb(0x1e2125),
    starArm: rgb(0xe8743b), starCore: rgb(0xffc98a),
    grid: rgb(0xb4562a), square: rgb(0xe8743b),
    obstacleLo: rgb(0x6e4630), obstacleHi: rgb(0xffb066),
    avatarBody: rgb(0xe8743b), avatarFins: rgb(0x8a3a12),
  },
};

/** Pure parse of a stored value; anything unrecognized -> 'light' (the default theme). */
export function readStoredTheme(raw: string | null): ThemeName {
  return raw === 'dark' ? 'dark' : 'light';
}

/** Guarded read — localStorage can throw when storage access is disabled. */
export function getStoredTheme(): ThemeName {
  try { return readStoredTheme(globalThis.localStorage?.getItem(THEME_KEY) ?? null); } catch { return 'light'; }
}

/** Guarded write — a failed write silently keeps the session-only theme. */
export function storeTheme(name: ThemeName): void {
  try { globalThis.localStorage?.setItem(THEME_KEY, name); } catch { /* storage disabled */ }
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `npx vitest run tests/theme.test.ts && npm run typecheck`
Expected: PASS (and typecheck clean — the `Rgb` move must not break `field.ts` consumers).

- [ ] **Step 1.5: Commit**

```bash
git add src/core/types.ts src/core/field.ts src/core/theme.ts tests/theme.test.ts
git commit -m "feat: pure theme core — palette slots, guarded storage"
```

---

### Task 2: Galaxy exposes `mixes` + `paintStarColors`

**Files:**
- Modify: `src/core/galaxy.ts`
- Test: `tests/galaxy.test.ts`

- [ ] **Step 2.1: Write the failing tests** (append to `tests/galaxy.test.ts`; add imports)

```ts
import { makeSpiralGalaxy, paintStarColors, GALAXY_MAX_POINTS } from '../src/core/galaxy';
import { THEMES } from '../src/core/theme';
```

```ts
describe('paintStarColors / mixes', () => {
  it('exposes per-point mixes in [0,1]; colors are exactly the light paint of mixes', () => {
    const f = makeSpiralGalaxy(7, { count: 4000 });
    expect(f.mixes.length).toBe(4000);
    for (const m of f.mixes) { expect(m).toBeGreaterThanOrEqual(0); expect(m).toBeLessThanOrEqual(1); }
    const repaint = paintStarColors(f.mixes, THEMES.light.starArm, THEMES.light.starCore);
    expect(Array.from(f.colors)).toEqual(Array.from(repaint));
  });

  it('paintStarColors endpoints: mix 0 -> arm, mix 1 -> core; 0.5 between', () => {
    const arm = { r: 0.1, g: 0.2, b: 0.3 }, core = { r: 0.9, g: 0.8, b: 0.7 };
    const out = paintStarColors(new Float32Array([0, 1, 0.5]), arm, core);
    expect(out[0]).toBeCloseTo(0.1, 6); expect(out[1]).toBeCloseTo(0.2, 6); expect(out[2]).toBeCloseTo(0.3, 6);
    expect(out[3]).toBeCloseTo(0.9, 6); expect(out[4]).toBeCloseTo(0.8, 6); expect(out[5]).toBeCloseTo(0.7, 6);
    expect(out[6]).toBeCloseTo(0.5, 6); expect(out[7]).toBeCloseTo(0.5, 6); expect(out[8]).toBeCloseTo(0.5, 6);
  });
});
```

- [ ] **Step 2.2: Run to verify failure**

Run: `npx vitest run tests/galaxy.test.ts`
Expected: FAIL — `paintStarColors` not exported / `mixes` undefined.

- [ ] **Step 2.3: Implement in `src/core/galaxy.ts`**

Replace the `CYAN`/`NAVY` constants and the color-lerp block with a stored mix + a shared painter. Full delta:

```ts
// at top, replace the import + CYAN/NAVY consts:
import { mulberry32 } from './rng';
import type { Rgb } from './types';
import { THEMES } from './theme';

export interface SpiralField {
  positions: Float32Array; sizes: Float32Array; alphas: Float32Array;
  colors: Float32Array; mixes: Float32Array; count: number;
}
```

```ts
/** Lerp arm->core per point by mix (m = coreness²). Pure; used for live re-theming. */
export function paintStarColors(mixes: Float32Array, arm: Rgb, core: Rgb): Float32Array {
  const out = new Float32Array(mixes.length * 3);
  for (let i = 0; i < mixes.length; i++) {
    const m = mixes[i]!;
    out[i * 3] = arm.r + (core.r - arm.r) * m;
    out[i * 3 + 1] = arm.g + (core.g - arm.g) * m;
    out[i * 3 + 2] = arm.b + (core.b - arm.b) * m;
  }
  return out;
}
```

Inside `makeSpiralGalaxy`: allocate `const mixes = new Float32Array(count);`, delete the `colors` allocation and the three `colors[i * 3…] = …` lines in the loop, and store the mix instead:

```ts
    mixes[i] = coreness * coreness;
```

After the loop, paint once (light defaults — behavior unchanged for existing consumers):

```ts
  const colors = paintStarColors(mixes, THEMES.light.starArm, THEMES.light.starCore);
  return { positions, sizes, alphas, colors, mixes, count };
```

- [ ] **Step 2.4: Run tests**

Run: `npx vitest run tests/galaxy.test.ts && npm run typecheck`
Expected: PASS, including the pre-existing determinism tests (positions/sizes/alphas draw from the same RNG sequence — the color change touches no `rnd()` calls).

- [ ] **Step 2.5: Commit**

```bash
git add src/core/galaxy.ts tests/galaxy.test.ts
git commit -m "feat: galaxy exposes per-point mixes + paintStarColors for re-theming"
```

---

### Task 3: `densityColor` takes a palette; export density bounds

**Files:**
- Modify: `src/core/field.ts:19-31,62` 
- Test: `tests/field.test.ts`

- [ ] **Step 3.1: Write the failing tests** (append to the `densityColor(...)` describe in `tests/field.test.ts`; extend the import line with `DENSITY_MIN, DENSITY_MAX`)

```ts
  it('default palette is unchanged (legacy light values at the endpoints)', () => {
    const lo = densityColor(DENSITY_MIN), hi = densityColor(DENSITY_MAX);
    expect(Math.round(lo.r * 255)).toBe(0x7f); expect(Math.round(lo.g * 255)).toBe(0xc9); expect(Math.round(lo.b * 255)).toBe(0xe0);
    expect(Math.round(hi.r * 255)).toBe(0x0a); expect(Math.round(hi.g * 255)).toBe(0x14); expect(Math.round(hi.b * 255)).toBe(0x1e);
  });

  it('honors a custom palette: endpoints hit lo/hi exactly', () => {
    const lo = { r: 1, g: 0.5, b: 0 }, hi = { r: 0, g: 0, b: 1 };
    expect(densityColor(0.2, 0.2, 15, lo, hi)).toEqual(lo);
    expect(densityColor(15, 0.2, 15, lo, hi)).toEqual(hi);
  });
```

- [ ] **Step 3.2: Run to verify failure**

Run: `npx vitest run tests/field.test.ts`
Expected: FAIL — `DENSITY_MIN` not exported.

- [ ] **Step 3.3: Implement in `src/core/field.ts`**

Replace the `LIGHT`/`DARK` consts + `densityColor` with:

```ts
import { THEMES } from './theme';

/** Generation-range density defaults — exported so re-theming can reproduce spec colors from stored density. */
export const DENSITY_MIN = 0.2;
export const DENSITY_MAX = 15;

/** Denser -> closer to `hi`. Monotonic lerp; default palette = light theme (denser = darker). */
export function densityColor(
  density: number, minD = DENSITY_MIN, maxD = DENSITY_MAX,
  lo: Rgb = THEMES.light.obstacleLo, hi: Rgb = THEMES.light.obstacleHi,
): Rgb {
  const t = Math.max(0, Math.min(1, (density - minD) / (maxD - minD)));
  return { r: lo.r + (hi.r - lo.r) * t, g: lo.g + (hi.g - lo.g) * t, b: lo.b + (hi.b - lo.b) * t };
}
```

Also replace the two magic `0.2`/`15` defaults inside `makeObstacleField` (`opts.minDensity ?? 0.2`, `opts.maxDensity ?? 15`) with `?? DENSITY_MIN` / `?? DENSITY_MAX` (both occurrences: `obstacleMass` defaults at lines 42 and field defaults at line 62 — keep values identical).

- [ ] **Step 3.4: Run tests**

Run: `npx vitest run tests/field.test.ts && npm run typecheck`
Expected: PASS including legacy monotonicity test.

- [ ] **Step 3.5: Commit**

```bash
git add src/core/field.ts tests/field.test.ts
git commit -m "feat: densityColor takes a palette; export density bounds for re-theming"
```

---

### Task 4: Pure scene painter (`src/world/scene-theme.ts`)

Every mutable scene slot lives in one `ThemeTargets` interface; `applyTheme` writes a `Theme` into it. Unit-tested with plain fakes — no three.js.

**Files:**
- Create: `src/world/scene-theme.ts`
- Create: `tests/world-scene-theme.test.ts`

- [ ] **Step 4.1: Write the failing test**

Create `tests/world-scene-theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyTheme, type ThemeTargets } from '../src/world/scene-theme';
import { paintStarColors } from '../src/core/galaxy';
import { densityColor, DENSITY_MIN, DENSITY_MAX, type ObstacleSpec } from '../src/core/field';
import { THEMES } from '../src/core/theme';

const fakeColor = () => {
  const c = { r: -1, g: -1, b: -1, setRGB(r: number, g: number, b: number) { c.r = r; c.g = g; c.b = b; return c; } };
  return c;
};
const fakeAttr = (n: number) => ({ array: new Float32Array(n * 3), needsUpdate: false });

const spec = (density: number): ObstacleSpec =>
  ({ pos: { x: 0, y: 0, z: 0 }, radius: 3, density, mass: 1, color: densityColor(density) });

function makeTargets(obstacles: boolean): ThemeTargets {
  return {
    background: fakeColor(), gridColor: fakeColor(), avatarBody: fakeColor(), avatarFins: fakeColor(),
    galaxyColor: fakeAttr(4), squareColor: fakeAttr(3), obstacleColor: obstacles ? fakeAttr(2) : null,
  };
}

describe('applyTheme paints every mutable scene slot', () => {
  const mixes = new Float32Array([0, 0.5, 1, 0.25]);
  const obstacles = [spec(DENSITY_MIN), spec(DENSITY_MAX)];

  it('dark theme lands in all seven slots', () => {
    const t = makeTargets(true);
    applyTheme(t, THEMES.dark, { mixes, obstacles });

    const d = THEMES.dark;
    expect(t.background).toMatchObject({ r: d.bg.r, g: d.bg.g, b: d.bg.b });
    expect(t.gridColor).toMatchObject({ r: d.grid.r, g: d.grid.g, b: d.grid.b });
    expect(t.avatarBody).toMatchObject({ r: d.avatarBody.r, g: d.avatarBody.g, b: d.avatarBody.b });
    expect(t.avatarFins).toMatchObject({ r: d.avatarFins.r, g: d.avatarFins.g, b: d.avatarFins.b });

    expect(Array.from(t.galaxyColor.array)).toEqual(Array.from(paintStarColors(mixes, d.starArm, d.starCore)));
    expect(t.galaxyColor.needsUpdate).toBe(true);

    for (let i = 0; i < t.squareColor.array.length; i += 3) {
      expect(t.squareColor.array[i]).toBeCloseTo(d.square.r, 6);
      expect(t.squareColor.array[i + 1]).toBeCloseTo(d.square.g, 6);
      expect(t.squareColor.array[i + 2]).toBeCloseTo(d.square.b, 6);
    }
    expect(t.squareColor.needsUpdate).toBe(true);

    // Obstacles painted from DENSITY, not from the light-baked spec.color:
    const oc = t.obstacleColor!;
    const lo = densityColor(DENSITY_MIN, DENSITY_MIN, DENSITY_MAX, d.obstacleLo, d.obstacleHi);
    const hi = densityColor(DENSITY_MAX, DENSITY_MIN, DENSITY_MAX, d.obstacleLo, d.obstacleHi);
    expect(oc.array[0]).toBeCloseTo(lo.r, 6); expect(oc.array[1]).toBeCloseTo(lo.g, 6); expect(oc.array[2]).toBeCloseTo(lo.b, 6);
    expect(oc.array[3]).toBeCloseTo(hi.r, 6); expect(oc.array[4]).toBeCloseTo(hi.g, 6); expect(oc.array[5]).toBeCloseTo(hi.b, 6);
    expect(oc.needsUpdate).toBe(true);
  });

  it('light and dark produce different values in every slot', () => {
    const a = makeTargets(true), b = makeTargets(true);
    applyTheme(a, THEMES.light, { mixes, obstacles });
    applyTheme(b, THEMES.dark, { mixes, obstacles });
    expect(a.background.r).not.toBe(b.background.r);
    expect(a.gridColor.r).not.toBe(b.gridColor.r);
    expect(a.avatarBody.r).not.toBe(b.avatarBody.r);
    expect(a.avatarFins.r).not.toBe(b.avatarFins.r);
    expect(Array.from(a.galaxyColor.array)).not.toEqual(Array.from(b.galaxyColor.array));
    expect(Array.from(a.squareColor.array)).not.toEqual(Array.from(b.squareColor.array));
    expect(Array.from(a.obstacleColor!.array)).not.toEqual(Array.from(b.obstacleColor!.array));
  });

  it('tolerates a missing obstacle cloud (before setObstacles)', () => {
    const t = makeTargets(false);
    expect(() => applyTheme(t, THEMES.dark, { mixes, obstacles: [] })).not.toThrow();
  });
});
```

- [ ] **Step 4.2: Run to verify failure**

Run: `npx vitest run tests/world-scene-theme.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4.3: Implement**

Create `src/world/scene-theme.ts`:

```ts
// Pure "paint" half of scene theming: writes a Theme into plain color/attribute
// targets. Unit-testable with object fakes — no three.js, no WebGL. WorldScene
// assembles ThemeTargets from its real three objects and calls applyTheme.
import type { ObstacleSpec } from '../core/field';
import { densityColor, DENSITY_MIN, DENSITY_MAX } from '../core/field';
import { paintStarColors } from '../core/galaxy';
import type { Theme } from '../core/theme';

export interface ColorTarget { setRGB(r: number, g: number, b: number): unknown }
export interface AttrTarget { array: Float32Array; needsUpdate: boolean }

/** Every mutable color slot in the scene. A new themed slot MUST be added here (the unit test covers each). */
export interface ThemeTargets {
  background: ColorTarget;
  gridColor: ColorTarget;
  avatarBody: ColorTarget;
  avatarFins: ColorTarget;
  galaxyColor: AttrTarget;
  squareColor: AttrTarget;
  obstacleColor: AttrTarget | null; // null until setObstacles builds the cloud
}

export function applyTheme(
  t: ThemeTargets, theme: Theme,
  ctx: { mixes: Float32Array; obstacles: readonly ObstacleSpec[] },
): void {
  t.background.setRGB(theme.bg.r, theme.bg.g, theme.bg.b);
  t.gridColor.setRGB(theme.grid.r, theme.grid.g, theme.grid.b);
  t.avatarBody.setRGB(theme.avatarBody.r, theme.avatarBody.g, theme.avatarBody.b);
  t.avatarFins.setRGB(theme.avatarFins.r, theme.avatarFins.g, theme.avatarFins.b);

  t.galaxyColor.array.set(paintStarColors(ctx.mixes, theme.starArm, theme.starCore));
  t.galaxyColor.needsUpdate = true;

  const sq = t.squareColor.array;
  for (let i = 0; i < sq.length; i += 3) { sq[i] = theme.square.r; sq[i + 1] = theme.square.g; sq[i + 2] = theme.square.b; }
  t.squareColor.needsUpdate = true;

  // Paint obstacles from stored DENSITY with the theme's palette — never from
  // spec.color, which is light-baked at generation time.
  if (t.obstacleColor) {
    const oc = t.obstacleColor.array;
    ctx.obstacles.forEach((s, i) => {
      const c = densityColor(s.density, DENSITY_MIN, DENSITY_MAX, theme.obstacleLo, theme.obstacleHi);
      oc[i * 3] = c.r; oc[i * 3 + 1] = c.g; oc[i * 3 + 2] = c.b;
    });
    t.obstacleColor.needsUpdate = true;
  }
}
```

- [ ] **Step 4.4: Run tests**

Run: `npx vitest run tests/world-scene-theme.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 4.5: Commit**

```bash
git add src/world/scene-theme.ts tests/world-scene-theme.test.ts
git commit -m "feat: pure applyTheme painter covering every mutable scene slot"
```

---

### Task 5: Wire theming into `WorldScene` + `mountWorld`

`WorldScene` gains `setTheme` and a theme-aware `setObstacles` (which ends by re-running `setTheme`, so late obstacles are structurally always painted from `currentTheme`). Constructor takes an initial theme; `mount.ts` passes the stored one. No new unit tests here (the adapter is untestable in node — the painter was tested in Task 4; visuals are covered by e2e in Task 13); the existing `world-mount` tests must stay green (they mock `WorldScene`).

**Files:**
- Modify: `src/world/scene.ts`
- Modify: `src/world/mount.ts:17`

- [ ] **Step 5.1: Modify `src/world/scene.ts`**

Imports — add:

```ts
import { THEMES, type Theme } from '../core/theme';
import { applyTheme, type ThemeTargets, type AttrTarget } from './scene-theme';
```

Delete the `const BG = 0xffffff;` line (line 12). Update the shader factory's stale comment `dark-on-white` to `theme-painted`.

Fields — add/replace:

```ts
  private readonly bgColor = new THREE.Color(0xffffff);
  private readonly bodyMat: THREE.MeshBasicMaterial;
  private readonly finMat: THREE.MeshBasicMaterial;
  private readonly galaxyMixes: Float32Array;
  private obstacleSpecs: ObstacleSpec[] = [];
  private currentTheme: Theme;
```

Constructor — signature and body changes:

```ts
  constructor(canvas: HTMLCanvasElement, opts: { seed?: number; theme?: Theme } = {}) {
```

- `this.scene.background = new THREE.Color(BG);` → `this.scene.background = this.bgColor;`
- After building the galaxy geometry: `this.galaxyMixes = gf.mixes;`
- Avatar materials become fields (same hexes; overwritten by the initial `setTheme` anyway):

```ts
    this.bodyMat = new THREE.MeshBasicMaterial({ color: 0x2b7e9e });
    arrow.add(new THREE.Mesh(bodyGeo, this.bodyMat));
    const finGeo = new THREE.BoxGeometry(0.1, 1.7, 1.3);
    this.finMat = new THREE.MeshBasicMaterial({ color: 0x184f68 });
    const finV = new THREE.Mesh(finGeo, this.finMat); finV.position.z = -ARROW_LEN * 0.32;
```

- Last lines of the constructor (before `this.resize()`):

```ts
    this.currentTheme = opts.theme ?? THEMES.light;
    this.setTheme(this.currentTheme);
    this.resize();
```

New methods (after `setObstacles`):

```ts
  /** Repaint every themed slot live — no scene rebuild, flight state untouched. */
  setTheme(theme: Theme): void {
    this.currentTheme = theme;
    applyTheme(this.targets(), theme, { mixes: this.galaxyMixes, obstacles: this.obstacleSpecs });
  }

  private targets(): ThemeTargets {
    const attr = (g: THREE.BufferGeometry) => g.getAttribute('aColor') as unknown as AttrTarget;
    return {
      background: this.bgColor,
      gridColor: this.gridMat.uniforms.uColor!.value as THREE.Color,
      avatarBody: this.bodyMat.color,
      avatarFins: this.finMat.color,
      galaxyColor: attr(this.galaxy.geometry),
      squareColor: attr(this.squares.geometry),
      obstacleColor: this.obstacles ? attr(this.obstacles.geometry) : null,
    };
  }
```

`setObstacles` — first line stores the specs, last line re-themes (this is the ordering fix — obstacles arrive after construction, possibly under a stored dark theme):

```ts
  setObstacles(specs: ObstacleSpec[]): void {
    const n = specs.length;
    if (n === 0) return;
    this.obstacleSpecs = specs;
    …existing buffer building unchanged…
    this.obstaclePos = pos;
    this.setTheme(this.currentTheme); // paint the new cloud from the CURRENT theme (specs carry light-baked colors)
  }
```

- [ ] **Step 5.2: Modify `src/world/mount.ts`**

```ts
import { WorldScene } from './scene';
import { THEMES, getStoredTheme } from '../core/theme';
```

```ts
    scene = new WorldScene(canvas, { theme: THEMES[getStoredTheme()] });
```

- [ ] **Step 5.3: Run the full unit suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: PASS — `world-mount` tests mock `WorldScene`/`wireWorld`, so the new opts flow through untouched.

- [ ] **Step 5.4: Commit**

```bash
git add src/world/scene.ts src/world/mount.ts
git commit -m "feat: WorldScene.setTheme + theme-aware setObstacles; mount passes stored theme"
```

---

### Task 6: CSS variables — dark override block + HUD de-hardcoding

**Files:**
- Modify: `src/brand/tokens.css`
- Modify: `src/hud/hud.css`

- [ ] **Step 6.1: Extend `src/brand/tokens.css`**

Append the new tokens inside the existing `:root { … }` block (keep every existing value untouched):

```css
  --panel-strip: rgba(255, 255, 255, 0.92);
  --panel-card: rgba(255, 255, 255, 0.94);
  --halo: #ffffff;
  --readout: #38bdf8;
  --readout-glow-soft: rgba(56, 189, 248, 0.55);
  --readout-glow-tight: rgba(56, 189, 248, 0.9);
  --speed: #4ab3d4;
```

Then append after the `:root` block:

```css
/* Dark mode — HUD toggle, persisted (naa-theme). Dark gray + shades of orange;
   the scene inverts density reading to denser = hotter (see src/core/theme.ts). */
:root[data-theme='dark'] {
  --bg: #1e2125;
  --ink: #e6e1da;
  --sky: #f09055;
  --sky-text: #ffa64d;
  --sky-line: #4a3b30;
  --sky-faint: #2a2d31;
  --accent: #ff8c4d;
  --accent-text: #ffb27a;
  --panel-strip: rgba(30, 33, 37, 0.92);
  --panel-card: rgba(30, 33, 37, 0.94);
  --halo: #1e2125;
  --readout: #ffa64d;
  --readout-glow-soft: rgba(255, 166, 77, 0.55);
  --readout-glow-tight: rgba(255, 166, 77, 0.9);
  --speed: #ffa64d;
}
```

- [ ] **Step 6.2: Replace hardcoded hexes in `src/hud/hud.css`**

- `.node-label` text-shadow → `text-shadow: 0 0 6px var(--halo), 0 0 6px var(--halo), 0 1px 0 var(--halo);`
- `.hud-strip` background → `background: var(--panel-strip);`
- `.hud-panel` background → `background: var(--panel-card);`
- `.flight-readout` color → `color: var(--readout);` and text-shadow → `text-shadow: 0 0 6px var(--readout-glow-soft), 0 0 1px var(--readout-glow-tight);`
- `.hud-strip .flight-speed` color → `color: var(--speed);`

After the edit: `grep -nE '#[0-9a-fA-F]{3,8}|rgba\(' src/hud/hud.css` must return nothing.

- [ ] **Step 6.3: Verify + commit**

Run: `npm run build` (CSS syntax gate).

```bash
git add src/brand/tokens.css src/hud/hud.css
git commit -m "feat: dark CSS token block; HUD colors fully variable-driven"
```

---

### Task 7: Pre-paint theme bootstrap in `index.html`

**Files:**
- Modify: `index.html` (inside `<head>`, immediately BEFORE the `tokens.css` link)

- [ ] **Step 7.1: Insert the bootstrap**

```html
    <script>/* pre-paint theme bootstrap: module scripts run after first paint, so only this prevents a light flash */
    try { if (localStorage.getItem('naa-theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch (e) {}</script>
```

(Light needs no attribute — absence of `data-theme` IS light, matching `wire.ts` which deletes the attribute on switch-to-light.)

- [ ] **Step 7.2: Verify + commit**

Run: `npm run build` — then `grep -c 'naa-theme' dist/index.html` prints ≥ 1 (the prerender pipeline templates from index.html, so the bootstrap must survive into dist).

```bash
git add index.html
git commit -m "feat: pre-paint dark-theme bootstrap in <head>"
```

---

### Task 8: HUD theme toggle button

**Files:**
- Modify: `src/hud/flight-hud.ts`
- Test: `tests/flight-hud.test.ts`

- [ ] **Step 8.1: Write the failing test** (append inside the `FlightHud` describe)

```ts
  it('theme toggle shows the theme you would switch TO and fires the callback', () => {
    const { root, el } = makeRoot();
    const onThemeToggle = vi.fn();
    const hud = new FlightHud(root, { theme: 'light', onThemeToggle });
    const t = el('.theme-toggle') as unknown as { textContent: string; onclick: (e: { preventDefault(): void }) => void };
    expect(t.textContent).toBe('[ dark ]');
    t.onclick({ preventDefault: () => {} });
    expect(onThemeToggle).toHaveBeenCalledTimes(1);
    hud.setTheme('dark');
    expect(t.textContent).toBe('[ light ]');
  });

  it('renders without theme opts (legacy construction)', () => {
    const { root, el } = makeRoot();
    new FlightHud(root);
    expect((el('.theme-toggle') as unknown as { textContent: string }).textContent).toBe('[ dark ]');
  });
```

- [ ] **Step 8.2: Run to verify failure**

Run: `npx vitest run tests/flight-hud.test.ts`
Expected: FAIL — constructor takes one arg / no `.theme-toggle`.

- [ ] **Step 8.3: Implement in `src/hud/flight-hud.ts`**

```ts
import './hud.css';
import type { ThemeName } from '../core/theme';

export interface FlightHudOpts { theme: ThemeName; onThemeToggle: () => void }
```

Constructor: `constructor(root: HTMLElement, opts?: FlightHudOpts)`. In the template, the nav becomes:

```html
      <nav class="hud-nav" aria-label="Mode"><a href="#" class="theme-toggle" role="button"></a><a href="?mode=list">[ list ]</a></nav>
```

After the existing `querySelector` lines:

```ts
    this.toggleEl = root.querySelector('.theme-toggle')!;
    this.setTheme(opts?.theme ?? 'light');
    (this.toggleEl as HTMLElement & { onclick: ((e: { preventDefault?: () => void }) => void) | null }).onclick =
      (e) => { e.preventDefault?.(); opts?.onThemeToggle(); };
```

Field: `private readonly toggleEl: HTMLElement;`. New method:

```ts
  /** Label shows the theme you'd switch TO ([ dark ] while light is active). */
  setTheme(name: ThemeName): void {
    this.toggleEl.textContent = name === 'light' ? '[ dark ]' : '[ light ]';
  }
```

- [ ] **Step 8.4: Run tests**

Run: `npx vitest run tests/flight-hud.test.ts && npm run typecheck`
Expected: PASS including all legacy FlightHud tests.

- [ ] **Step 8.5: Commit**

```bash
git add src/hud/flight-hud.ts tests/flight-hud.test.ts
git commit -m "feat: HUD theme toggle button ([ dark ]/[ light ])"
```

---

### Task 9: `wire.ts` applies the theme end-to-end

**Files:**
- Modify: `src/world/wire.ts`
- Test: `tests/world-wire.test.ts`

- [ ] **Step 9.1: Write the failing test**

In `tests/world-wire.test.ts`: add `setTheme: vi.fn()` to the hud mock instance (line 8) and to `makeScene()`'s object (after `setObstacles: vi.fn(),`). Add to imports: `import { THEMES } from '../src/core/theme';`. Append:

```ts
  it('theme toggle rethemes scene + DOM + storage, and back', async () => {
    installFrame();
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    const documentElement = { dataset: {} as Record<string, string> };
    vi.stubGlobal('document', { getElementById: () => ({}), documentElement });
    const scene = makeScene();
    const cleanup = await wireWorld(scene, { reducedMotion: false });

    const opts = hudMocks.FlightHud.mock.calls[0]![1] as { theme: string; onThemeToggle: () => void };
    expect(opts.theme).toBe('light');

    opts.onThemeToggle();
    expect(documentElement.dataset.theme).toBe('dark');
    expect(store.get('naa-theme')).toBe('dark');
    expect(scene.setTheme).toHaveBeenCalledWith(THEMES.dark);
    expect(hudMocks.instances[0]!.setTheme).toHaveBeenCalledWith('dark');

    opts.onThemeToggle();
    expect(documentElement.dataset.theme).toBeUndefined();
    expect(store.get('naa-theme')).toBe('light');
    expect(scene.setTheme).toHaveBeenLastCalledWith(THEMES.light);
    cleanup();
  });
```

(`makeScene`'s cast means TS needs `setTheme` on the returned object — also update the `WorldScene` type usage: the mock is `as unknown as WorldScene`, so just add the `vi.fn()`.)

- [ ] **Step 9.2: Run to verify failure**

Run: `npx vitest run tests/world-wire.test.ts`
Expected: FAIL — FlightHud called without opts / no toggle handling.

- [ ] **Step 9.3: Implement in `src/world/wire.ts`**

```ts
import { THEMES, getStoredTheme, storeTheme, type ThemeName } from '../core/theme';
```

Replace the `const hud = new FlightHud(…)` line with:

```ts
  let themeName: ThemeName = getStoredTheme();
  const applyThemeName = (name: ThemeName) => {
    themeName = name;
    if (name === 'dark') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    storeTheme(name);
    scene.setTheme(THEMES[name]);
    hud.setTheme(name);
  };
  const hud = new FlightHud(document.getElementById('hud-root')!, {
    theme: themeName,
    onThemeToggle: () => applyThemeName(themeName === 'light' ? 'dark' : 'light'),
  });
```

(No boot-time `applyThemeName` call: the `<head>` bootstrap owns the DOM attribute and `mount.ts` owns the scene's initial theme. `hud` is referenced inside `applyThemeName` before its declaration — that's fine, the closure only runs on click, long after `const hud` initializes; TS accepts the closure reference.)

- [ ] **Step 9.4: Run tests**

Run: `npx vitest run tests/world-wire.test.ts && npm run typecheck`
Expected: PASS including the three legacy wire tests.

- [ ] **Step 9.5: Commit**

```bash
git add src/world/wire.ts tests/world-wire.test.ts
git commit -m "feat: wire theme toggle — DOM attr, guarded storage, scene + HUD repaint"
```

---

### Task 10: `alignVelocity` — speed-preserving rotation (pure core)

**Files:**
- Modify: `src/core/control.ts` (new function + `align` tunable + damping retune)
- Test: `tests/control.test.ts`

- [ ] **Step 10.1: Write the failing tests** (append to `tests/control.test.ts`; extend the import with `alignVelocity`; add `import type { Vec3 } from '../src/core/types';`)

```ts
describe('alignVelocity (speed-preserving rotation)', () => {
  const DT = 1 / 120;
  const speed = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
  const angleTo = (v: Vec3, h: Vec3, sense: 1 | -1) =>
    Math.acos(Math.max(-1, Math.min(1, ((v.x * h.x + v.y * h.y + v.z * h.z) * sense) / speed(v))));

  it('no-op when parallel, at rest, and at exact 180° anti-parallel', () => {
    const h = { x: 0, y: 0, z: 1 };
    expect(alignVelocity({ x: 0, y: 0, z: 30 }, h, 1, 3.5, DT)).toEqual({ x: 0, y: 0, z: 30 });
    expect(alignVelocity({ x: 0, y: 0, z: 0 }, h, 1, 3.5, DT)).toEqual({ x: 0, y: 0, z: 0 });
    // no unique rotation axis at 180° — deliberate no-op; the next thrust step breaks the tie
    expect(alignVelocity({ x: 0, y: 0, z: -30 }, h, 1, 3.5, DT)).toEqual({ x: 0, y: 0, z: -30 });
  });

  it('preserves speed through a full 90° realignment and converges < 5° in 2s', () => {
    const h = { x: 1, y: 0, z: 0 };
    let v: Vec3 = { x: 0, y: 0, z: 80 };
    for (let i = 0; i < 240; i++) {
      v = alignVelocity(v, h, 1, 3.5, DT);
      expect(speed(v)).toBeCloseTo(80, 4); // spec bound: 1e-4 relative
    }
    expect(angleTo(v, h, 1)).toBeLessThan((5 * Math.PI) / 180);
  });

  it('forward U-turn past 90° keeps aligning — P1 regression: sense from input, not sign(v·h)', () => {
    const h = headingFrom(Math.PI * 0.75, 0); // nose 135° away from the velocity
    let v: Vec3 = { x: 0, y: 0, z: 60 };
    let prev = angleTo(v, h, 1);
    expect(prev).toBeGreaterThan(Math.PI / 2);
    for (let i = 0; i < 600; i++) {
      v = alignVelocity(v, h, 1, 3.5, DT);
      const a = angleTo(v, h, 1);
      expect(a).toBeLessThanOrEqual(prev + 1e-9); // never stalls, never reverses
      prev = a;
    }
    expect(prev).toBeLessThan((5 * Math.PI) / 180);
    expect(speed(v)).toBeCloseTo(60, 4);
  });

  it('sense −1 aligns toward −heading (reverse flight stays reverse)', () => {
    const h = { x: 0, y: 0, z: 1 };
    let v: Vec3 = { x: 30, y: 0, z: -30 };
    for (let i = 0; i < 600; i++) v = alignVelocity(v, h, -1, 3.5, DT);
    expect(v.z).toBeLessThan(0);
    expect(Math.abs(v.x)).toBeLessThan(1);
    expect(speed(v)).toBeCloseTo(Math.hypot(30, 30), 4);
  });
});
```

- [ ] **Step 10.2: Run to verify failure**

Run: `npx vitest run tests/control.test.ts`
Expected: FAIL — `alignVelocity` not exported.

- [ ] **Step 10.3: Implement in `src/core/control.ts`**

`ControlOpts` gains `align: number;`. `DEFAULT_CONTROL` becomes:

```ts
export const DEFAULT_CONTROL: ControlOpts = {
  accel: 110, boostAccel: 200,
  maxSpeed: 80, boostMaxSpeed: 130,
  linearDamping: 0.8, pitchLimit: 1.3,
  align: 3.5,
  bound: 720, boundPush: 220,
};
```

(`linearDamping` 0.5 → 0.8: release-glide stops in ~100u instead of ~160u; thrust/damping equilibria — 110/0.8 ≈ 137, 200/0.8 = 250 — stay above the 80/130 caps, so top speed is still governed by the explicit clamp. Both `align` and `linearDamping` get a live-tuning pass in Task 14.)

New function (after `stepRoll`):

```ts
/**
 * Rotate `vel` toward `sense`·`heading` by an exponential angular ease
 * (1 − e^(−align·dt)) — SPEED IS PRESERVED EXACTLY. `sense` is the COMMANDED
 * travel direction (+1 forward/coast, −1 while reverse is held): deriving it
 * from sign(v·h) would stall alignment at 90° and fight a forward U-turn.
 * Exact anti-parallel (θ = π) is a deliberate no-op — no unique rotation
 * axis; the next thrust step bends velocity off the axis. Pure.
 */
export function alignVelocity(vel: Vec3, heading: Vec3, sense: 1 | -1, align: number, dt: number): Vec3 {
  const s = Math.hypot(vel.x, vel.y, vel.z);
  if (s < 1e-6) return vel;
  const tx = heading.x * sense, ty = heading.y * sense, tz = heading.z * sense;
  const vx = vel.x / s, vy = vel.y / s, vz = vel.z / s;
  const dot = Math.max(-1, Math.min(1, vx * tx + vy * ty + vz * tz));
  if (dot > 1 - 1e-9) return vel; // already aligned
  let ax = vy * tz - vz * ty, ay = vz * tx - vx * tz, az = vx * ty - vy * tx;
  const al = Math.hypot(ax, ay, az);
  if (al < 1e-9) return vel;      // anti-parallel: no unique axis
  ax /= al; ay /= al; az /= al;
  const step = Math.acos(dot) * (1 - Math.exp(-align * dt));
  const c = Math.cos(step), si = Math.sin(step);
  // Rodrigues: v' = v·c + (k×v)·s + k(k·v)(1−c); k⊥v by construction so the last term ~0, kept for float safety
  const ka = ax * vx + ay * vy + az * vz;
  const rx = vx * c + (ay * vz - az * vy) * si + ax * ka * (1 - c);
  const ry = vy * c + (az * vx - ax * vz) * si + ay * ka * (1 - c);
  const rz = vz * c + (ax * vy - ay * vx) * si + az * ka * (1 - c);
  const rl = Math.hypot(rx, ry, rz) || 1; // renormalize float drift, then restore the exact speed
  return { x: (rx / rl) * s, y: (ry / rl) * s, z: (rz / rl) * s };
}
```

- [ ] **Step 10.4: Run tests**

Run: `npx vitest run tests/control.test.ts && npm run typecheck`
Expected: PASS (all legacy control tests too — `DEFAULT_CONTROL` gained a key and changed damping; no existing assertion pins `linearDamping`; if one does, update it to 0.8 with a comment).

- [ ] **Step 10.5: Commit**

```bash
git add src/core/control.ts tests/control.test.ts
git commit -m "feat: alignVelocity — speed-preserving nose alignment; damping 0.5->0.8"
```

---

### Task 11: Apply alignment in `DartPhysics` (+ Rapier-under-vitest attempt)

**Files:**
- Modify: `src/physics/dart.ts:65-103`
- Create (attempt): `tests/dart.test.ts`

- [ ] **Step 11.1: Write the integration test**

Create `tests/dart.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DartPhysics } from '../src/physics/dart';
import { headingFrom } from '../src/core/control';

/**
 * Rapier WASM under vitest (node). If `DartPhysics.create` fails here with a
 * wasm-loading error, the DOCUMENTED FALLBACK is: delete this file and rely on
 * the e2e coast-curve test (Task 13) — do not stub Rapier.
 */
describe('DartPhysics + velocity alignment', () => {
  it('a coasting dart curves toward the nose after a yaw turn', async () => {
    const dart = await DartPhysics.create({}, []);
    const I = { yawDelta: 0, pitchDelta: 0, forward: 0, strafe: 0 };
    for (let i = 0; i < 60; i++) dart.step(1 / 60, { ...I, forward: 1 });          // thrust +z, 1s
    for (let i = 0; i < 30; i++) dart.step(1 / 60, { ...I, yawDelta: Math.PI / 60 }); // release, yaw 90° over 0.5s
    for (let i = 0; i < 90; i++) dart.step(1 / 60, I);                              // coast 1.5s
    const s = dart.state();
    expect(s.speed).toBeGreaterThan(1); // still gliding (damping hasn't killed it)
    const h = headingFrom(s.yaw, s.pitch);
    const dot = (s.velocity.x * h.x + s.velocity.y * h.y + s.velocity.z * h.z) / s.speed;
    expect(dot).toBeGreaterThan(0.98); // velocity swung to within ~11° of the nose WHILE COASTING
    dart.dispose();
  });
});
```

- [ ] **Step 11.2: Run to verify failure mode**

Run: `npx vitest run tests/dart.test.ts`
- If it fails with `dot ≈ 0` (loads Rapier, alignment missing): perfect — proceed.
- If it fails with a **wasm loading error** (`ENOENT ….wasm`, `__wbg_set_wasm`, `WebAssembly.instantiate`, import resolution): the vitest route is infeasible. Delete `tests/dart.test.ts`, note "Rapier-under-vitest infeasible — e2e fallback active (spec §Testing)" in the Task 11 commit message, and rely on the Task 13 e2e coast-curve test.

- [ ] **Step 11.3: Implement in `src/physics/dart.ts`**

Import: add `alignVelocity` to the `../core/control` import list.

In `step()`, before the fixed-step loop (next to the `cap` line):

```ts
    const sense: 1 | -1 = input.forward < 0 ? -1 : 1; // commanded travel sense; coasting = forward
```

Replace the post-`world.step()` cap block inside the loop:

```ts
      this.world.step();
      const v = this.body.linvel();
      // Alignment (speed-preserving rotation toward the nose), then the hard cap.
      const av = alignVelocity({ x: v.x, y: v.y, z: v.z }, heading, sense, this.o.align, FIXED);
      let sp = Math.hypot(av.x, av.y, av.z);
      if (sp > cap) { const k = cap / sp; av.x *= k; av.y *= k; av.z *= k; sp = cap; }
      if (av.x !== v.x || av.y !== v.y || av.z !== v.z) this.body.setLinvel(av, true);
      this.acc -= FIXED;
```

- [ ] **Step 11.4: Run tests**

Run: `npx vitest run tests/dart.test.ts` (if kept) then `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 11.5: Commit**

```bash
git add src/physics/dart.ts tests/dart.test.ts   # drop the test path if deleted in 11.2
git commit -m "feat: dart applies nose-alignment each fixed step (sense from commanded input)"
```

---

### Task 12: Tight chase cam constants

**Files:**
- Modify: `src/world/scene.ts:17`

- [ ] **Step 12.1: Retune**

```ts
// Chase cam: CAM_TURN swings the trail behind the new facing (high = avatar-cam
// tight); CAM_LOOK_LAG keeps the avatar pinned near screen center.
const CAM_BACK = 11, CAM_UP = 3.4, CAM_LAG = 12, CAM_LOOK_LAG = 20, CAM_TURN = 7;
```

(Starting values from the spec; Task 14 tunes them live and updates this line if the feel demands it.)

- [ ] **Step 12.2: Verify + commit**

Run: `npm run typecheck && npm test`

```bash
git add src/world/scene.ts
git commit -m "feat: tight chase cam (CAM_TURN 7, CAM_LAG 12, CAM_LOOK_LAG 20)"
```

---

### Task 13: e2e — dark toggle + persistence + nose-pointing coast curve

**Files:**
- Modify: `e2e/smoke.spec.ts`

- [ ] **Step 13.1: Append the theme test**

```ts
test('dark mode: toggle rethemes the galaxy and persists across reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?mode=world');
  await expect(page.locator('canvas#scene')).toBeVisible();
  await expect(page.locator('.hud-strip .status')).toContainText(/move/i, { timeout: 10_000 });
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');

  await page.locator('.theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // The WebGL scene actually rethemes: dark-gray background dominates, warm (orange-family) pixels appear.
  const { darkBg, warm } = await page.evaluate(async () => {
    const c = document.getElementById('scene') as HTMLCanvasElement;
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext;
    const W = c.width, H = c.height;
    const px = new Uint8Array(W * H * 4);
    let darkBg = 0, warm = 0;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let d = 0, w = 0;
      for (let p = 0; p < px.length; p += 4) {
        const r = px[p]!, g = px[p + 1]!, b = px[p + 2]!;
        if (r < 60 && g < 60 && b < 60) d++;
        if (r > 120 && r > b + 30) w++;
      }
      darkBg = Math.max(darkBg, d); warm = Math.max(warm, w);
    }
    return { darkBg, warm };
  });
  expect(darkBg).toBeGreaterThan(10_000);
  expect(warm).toBeGreaterThan(200);

  await page.reload(); // stored theme + pre-paint bootstrap + late obstacles under dark
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('canvas#scene')).toBeVisible();
});
```

- [ ] **Step 13.2: Append the nose-pointing test** (keep even if `tests/dart.test.ts` exists — this is the user-facing promise; it is REQUIRED if Task 11 fell back)

```ts
test('nose-pointing: a coasting dart curves toward where you point', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?mode=world');
  const readout = page.locator('.flight-readout');
  await page.locator('canvas#scene').click();
  await expect(readout).toHaveText(/X/, { timeout: 8000 });

  await page.keyboard.down('w');
  await page.waitForTimeout(1500);
  await page.keyboard.up('w'); // coast from ~60 u/s

  const size = page.viewportSize()!;
  const cx = size.width / 2, cy = size.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 320, cy, { steps: 8 }); // drag right: yaw the nose ~90°
  await page.waitForTimeout(1200);

  const xAt = async () => parseInt((await readout.textContent())?.match(/X\s*([+-]\d+)/)?.[1] ?? '0', 10);
  const x1 = await xAt();
  await page.waitForTimeout(1500); // still coasting, no thrust keys
  const x2 = await xAt();
  await page.mouse.up();
  expect(Math.abs(x2 - x1)).toBeGreaterThan(4); // momentum curved onto the new heading without thrust
});
```

- [ ] **Step 13.3: Run e2e**

Run: `npm run build && npm run e2e`
Expected: ALL e2e pass — the new two AND the legacy ones (glide-to-rest now stops faster with damping 0.8: still `< 2 u/s` within its 8s window; the collision-dip and barrel-roll tests are unaffected by theming). If the legacy non-blank test fails, light mode regressed — debug the theme default, do not touch the test.

- [ ] **Step 13.4: Commit**

```bash
git add e2e/smoke.spec.ts
git commit -m "test: e2e dark-toggle persistence + coast-curve nose-pointing"
```

---

### Task 14: Full gate + live tuning pass (both themes, flight feel, camera)

**Files:** possibly retune `src/core/control.ts` (`align`, `linearDamping`) and `src/world/scene.ts` (CAM_*) — nothing else.

- [ ] **Step 14.1: Full gate**

```bash
npm run typecheck && npm test && npm run build && npm run budgets && npm run e2e
```

Expected: all green. Budgets: the world chunk grows by ~1-2 KB (theme + scene-theme modules) against a 250 KB limit — if it fails, something is wrong; investigate, don't raise limits.

- [ ] **Step 14.2: Live tuning in the browser preview** (main session, not a subagent — needs the Browser pane)

Start the dev server, then in the preview:
1. Light theme first visit (no `data-theme`, white scene, cyan HUD) — screenshot.
2. Click `[ dark ]`: dark-gray bg, orange stars/grid/avatar, amber readout — screenshot. Reload: still dark, no white flash.
3. Flight feel: W-thrust, drag a hard 135° turn while coasting — the dart should visibly curve onto the new heading within ~1s. If it feels slugglish raise `align` toward 5; if twitchy lower toward 2.5. Glide-to-stop should feel < ~3s from top speed; adjust `linearDamping` 0.7–1.0.
4. Camera: hard turns should feel first-person without wobble amplification. Adjust CAM_TURN 5–9 if needed.
5. List mode dark: `?mode=list` with dark stored — legible warm-on-dark text (base.css is fully var-driven). Spot-check contrast (spec target WCAG AA): `--ink` #e6e1da and `--sky-text` #ffa64d on #1e2125 both clear 7:1; if any tuning darkens a text token below AA, lighten it.

- [ ] **Step 14.3: If constants changed, re-run the gate and commit the tuning**

```bash
npm run typecheck && npm test && npm run build && npm run budgets && npm run e2e
git add src/core/control.ts src/world/scene.ts
git commit -m "tune: flight alignment/damping + chase cam from live preview pass"
```

(Skip the commit if nothing changed. Record final values in the commit body.)

---

### Task 15: Push the branch (preview deploy) + report

- [ ] **Step 15.1: Push**

```bash
git push -u origin feat/dark-mode-flight-feel
```

Cloudflare builds a **preview** deploy — production (`master`) untouched. **Do NOT merge to master; merging deploys to notanastronaut.com and requires the user's explicit go.**

- [ ] **Step 15.2: Report to the user**

Screenshots (light + dark), final tuning values, gate results, preview URL if available, and the open question: delete the scratch files (`check-field.ts`, `debug-wasm.mjs`, `tests/_scratch_review_det_check.test.ts`)?
