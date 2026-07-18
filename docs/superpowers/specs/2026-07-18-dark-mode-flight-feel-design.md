# Dark mode toggle + nose-pointing flight + tight chase cam — design

Date: 2026-07-18
Status: approved (design conversation 2026-07-18)

## Context

Three user-facing complaints about the free-fly galaxy:

1. No dark mode. The scene is dark-cyan stardust on a white background
   (`BG = 0xffffff` in `src/world/scene.ts`); the user wants a dark-gray
   background with shades of orange replacing the blue/cyan.
2. Hard to fly to a specific point. Thrust pushes along the nose
   (`thrustForce` in `src/core/control.ts`) but existing velocity is never
   redirected, so after a turn the ship keeps sliding on its old vector;
   damping (0.5) lets it glide for hundreds of units.
3. Camera doesn't feel like an avatar cam. The chase cam's turn-follow is
   deliberately gentle (`CAM_TURN = 2` in `src/world/scene.ts`), so when the
   ship turns, the camera stays pointed the old way far too long.

Decisions made with the user:

- Dark mode is a **HUD toggle** (not OS-driven, not a replacement).
  **First visit defaults to LIGHT**; the choice persists in `localStorage`.
- Flight fix is **velocity alignment** ("ship goes where the nose points"),
  not just extra damping, and not click-to-fly autopilot.
- Camera is **tight with slight smoothing** (not a rigid lock).

## Goals

- A `[ dark ]` / `[ light ]` control in the flight HUD that swaps the entire
  look (WebGL scene + DOM HUD) live, without resetting the flight, and
  persists across visits.
- Point the nose at a target, hold W, and arrive: momentum swings toward the
  heading, and release-glide stops in a reasonable distance.
- The camera stays glued behind the ship's facing so turns feel first-person.

## Non-goals

- No `prefers-color-scheme` detection (explicitly declined in favor of a
  plain toggle).
- No autopilot / click-to-fly.
- No re-theming of the SVG artwork files; the thruster flame is already
  orange (`#f7882b`/`#ffd166`) and reads correctly on both themes.
- No changes to obstacle physics, barrel roll, boost, or the boundary force.

## Sequencing / branch plan

`master` is production (Cloudflare) — nothing here touches it.

- **Task 0 (pre-work):** the working tree on `feat/star-collision-particle-thruster`
  holds the entire uncommitted collision-field/barrel-roll implementation.
  Verify it (`npm run typecheck && npm test && npm run build && npm run budgets`)
  and commit it on that branch **before** starting this feature. Scratch files
  (`check-field.ts`, `debug-wasm.mjs`, `tests/_scratch_review_det_check.test.ts`)
  are excluded from that commit; ask the user whether to delete them.
- New work happens on **`feat/dark-mode-flight-feel`**, branched from the
  committed state. Pushing that branch produces a Cloudflare preview deploy;
  merging to `master` requires an explicit user go.

## 1. Theme architecture (approach A: palette module + repaint on toggle)

Chosen over (B) shader-uniform color mixing — O(1) toggle but changes buffer
layouts, pure-core interfaces, and all their tests for an event that happens
rarely — and (C) scene remount, which would reset the flight mid-air.

### Pure core: `src/core/theme.ts`

- `ThemeName = 'light' | 'dark'`.
- `Theme` — named WebGL color slots (see palette table): `bg`, `starArm`,
  `starCore`, `grid`, `square`, `obstacleLo`, `obstacleHi`, `avatarBody`,
  `avatarFins`. Colors as `Rgb` (`{r,g,b}` in 0..1, matching `field.ts`).
- `THEMES: Record<ThemeName, Theme>` with `light` = today's exact values.
- `readStoredTheme(raw: string | null): ThemeName` — pure parse of the
  `localStorage` value, anything unrecognized → `'light'`.
- Storage key: `naa-theme`.

DOM colors are **not** duplicated in the `Theme` object — CSS variables own
them (below). The JS `Theme` covers only what WebGL needs.

### Color-producing cores gain palette parameters (defaults = current values)

- `galaxy.ts`: `SpiralField` gains `mixes: Float32Array` (the per-point
  core-mix `m` already computed internally). New pure
  `paintStarColors(mixes, arm, core): Float32Array` returns a color buffer.
  `makeSpiralGalaxy` still fills `colors` with the light palette, so existing
  consumers/tests are unaffected.
- `field.ts`: `densityColor(density, minD, maxD, lo = LIGHT, hi = DARK)` —
  optional palette endpoints, defaults preserve current output. Export the
  generation density defaults (`DENSITY_MIN = 0.2`, `DENSITY_MAX = 15`) so a
  recolor pass can reproduce spec colors from stored `density`.

### Scene adapter: `WorldScene.setTheme(theme: Theme)`

Keeps references it already has (galaxy geometry + `mixes`, obstacle specs,
square/grid materials, avatar materials) and applies:

- `scene.background` ← `theme.bg`.
- Galaxy: `aColor` buffer ← `paintStarColors(mixes, starArm, starCore)`,
  `needsUpdate = true` (~30k points, a few ms, toggle-only).
- Grid: `uColor` uniform ← `theme.grid`.
- Squares: rewrite the flat `aColor` buffer ← `theme.square`.
- Obstacles: rewrite `aColor` ← `densityColor(spec.density, …, obstacleLo,
  obstacleHi)` per spec (scene retains the `ObstacleSpec[]` it received).
- Avatar: body/fin `MeshBasicMaterial.color`.

Constructor takes an initial `Theme` (default light) and the scene retains
it as `currentTheme` (updated by `setTheme`). **`setObstacles` is
theme-aware:** obstacles arrive later (`wireWorld` runs after construction)
with light-baked `spec.color` values, so the scene never uses `spec.color`
directly — it paints from `spec.density` via `densityColor(…, obstacleLo,
obstacleHi)` using `currentTheme`, both at `setObstacles` time and on every
`setTheme`. (`ObstacleSpec.color` remains the pure core's default-light
painting for non-scene consumers/tests.) Without this, a stored dark theme
would render light obstacles until the first manual toggle.

### DOM side: CSS variables only

- `tokens.css`: add a `:root[data-theme="dark"]` block overriding the
  existing variables, plus new variables for values currently hardcoded in
  `hud.css`: panel/strip backgrounds (`--panel-strip`, `--panel-card`),
  label halo (`--halo`,
  today's white text-shadow), readout color + glow (`--readout`,
  `--readout-glow`, today `#38bdf8`), speed text (`--speed`, today
  `#4ab3d4`).
- `hud.css`: replace every hardcoded hex with those variables. No layout
  changes.

### Wiring

- `index.html`: a tiny inline `<script>` in `<head>`, **before** the
  `tokens.css` link, sets `document.documentElement.dataset.theme` from
  `localStorage` inside a `try/catch`. Module scripts (`main.ts`) execute
  after first paint, so only a pre-paint bootstrap guarantees no light
  flash for a stored dark theme. List mode needs nothing else — it inherits
  the CSS variables.
- `theme.ts` also exports guarded storage helpers (`getStoredTheme()` /
  `storeTheme(name)`) that wrap `localStorage` in `try/catch` — access can
  throw when storage is disabled — falling back to `'light'` / a no-op.
  All TS code goes through these; only the inline bootstrap duplicates the
  read (it must be self-contained).
- `mount.ts`: passes `THEMES[getStoredTheme()]` as the initial theme when
  constructing `WorldScene`, so the first rendered frame is already themed.
- `flight-hud.ts`: nav gains a `[ dark ]` / `[ light ]` button (styled like
  `[ list ]`, `pointer-events: auto`) showing the theme you'd switch TO.
  `FlightHud` takes an `onThemeToggle` callback + initial name.
- `wire.ts`: owns `applyTheme(name)` — sets `data-theme`, writes
  storage via `storeTheme` (guarded), calls `scene.setTheme(THEMES[name])`,
  updates the button
  label. Toggling never touches the physics world.

## 2. Palette

| Slot | Light (today, unchanged) | Dark |
|---|---|---|
| Background | `#ffffff` | `#1e2125` (dark gray, not black) |
| Star arms | `#4ab3d4` cyan | `#e8743b` brand orange |
| Star core | `#16324a` navy (denser = darker) | `#ffc98a` amber (denser = hotter) |
| Grid lines | `#4ab3d4` | `#b4562a` burnt orange |
| Depth squares | `#4ab3d4` | `#e8743b` |
| Obstacle, least dense | `#7fc9e0` light cyan | `#6e4630` dim rust |
| Obstacle, most dense | `#0a141e` near-black | `#ffb066` hot amber |
| Avatar body | `#2b7e9e` | `#e8743b` |
| Avatar fins | `#184f68` | `#8a3a12` dark rust |
| CSS `--bg` | `#ffffff` | `#1e2125` |
| CSS `--ink` | `#2f3e4a` | `#e6e1da` warm off-white |
| CSS `--sky` | `#4ab3d4` | `#f09055` |
| CSS `--sky-text` | `#1f6f8a` | `#ffa64d` |
| CSS `--sky-line` | `#cfe4f0` | `#4a3b30` |
| CSS `--sky-faint` | `#e8f1f7` | `#2a2d31` |
| CSS `--accent` / `--accent-text` | `#e8743b` / `#a24116` | `#ff8c4d` / `#ffb27a` |
| CSS `--panel-strip` (`.hud-strip` bg) | `rgba(255,255,255,.92)` | `rgba(30,33,37,.92)` |
| CSS `--panel-card` (`.hud-panel` bg) | `rgba(255,255,255,.94)` | `rgba(30,33,37,.94)` |
| CSS `--halo` (label shadow) | `#ffffff` | `#1e2125` |
| CSS `--readout` | `#38bdf8` | `#ffa64d` |
| CSS `--readout-glow-soft` (`0 0 6px`) | `rgba(56,189,248,.55)` | `rgba(255,166,77,.55)` |
| CSS `--readout-glow-tight` (`0 0 1px`) | `rgba(56,189,248,.9)` | `rgba(255,166,77,.9)` |
| CSS `--speed` | `#4ab3d4` | `#ffa64d` |

The strip and panel keep their distinct opacities (`.92` vs `.94`) as
separate tokens, and the readout keeps both of its current glow layers — the
light column of this table is byte-for-byte today's rendered values.

The light theme paints *denser = darker* on white; dark mode inverts the
luminance direction to *denser = hotter* so density still reads. Exact dark
hexes may shift slightly during in-browser tuning; the slot structure is
fixed. Contrast target: HUD text meets WCAG AA against `--bg` and the
panel tokens.

## 3. Flight: speed-preserving velocity alignment

> Revised after review: the original `alignForce = align·(ĥ·s·dir − v)` had
> two behavioral flaws. (1) Deriving travel sense from `sign(vel·heading)`
> makes alignment die at 90° and actively fight a forward U-turn beyond it —
> exactly the maneuver the feature exists for. (2) The force has a component
> opposite `v` (at 90° misalignment, `d|v|/dt = −align·|v|`), so a hard turn
> scrubbed roughly half the ship's speed before damping. The design is now a
> pure **rotation** of the velocity vector (speed preserved exactly), with
> travel sense taken from **commanded input**, not velocity.

New pure function in `src/core/control.ts`:

```
alignVelocity(vel, heading, sense, align, dt): Vec3
  s = |vel|;  if s < 1e-6           return vel        // at rest: nothing to steer
  target = sense · ĥ                                  // sense ∈ {+1, −1}
  θ = angle(v̂, target)
  if θ ≈ 0                          return vel        // already aligned
  if θ ≈ π (axis ‖ zero)            return vel        // degenerate; thrust breaks the tie
  axis = normalize(v̂ × target)
  return rotate(vel, axis, θ · (1 − e^(−align·dt)))   // |result| == s exactly
```

- **Travel sense comes from input intent:** `sense = input.forward < 0 ? −1
  : +1`, computed in `dart.ts` from the *commanded* thrust. Holding W
  through a U-turn keeps `sense = +1`, so momentum keeps rotating toward the
  nose through 90° and beyond. Holding S aligns toward −heading, so
  braking/reversing still works. Coasting defaults to `+1` — a glide curves
  to where you point, which is the point of the feature.
- **Speed is preserved exactly** — the update rotates `v̂` and rescales by
  the original `s`. The exponential angle ease (`1 − e^(−align·dt)`) is
  deterministic at the fixed timestep.
- The exact-180° anti-parallel case is a deliberate no-op (no unique
  rotation axis); the very next thrust step bends velocity off the axis and
  alignment takes over.
- Applied **every fixed step** in `dart.ts` after `world.step()`, via
  `setLinvel` — the same pattern as the existing speed cap, not `addForce`
  (a force formulation is what caused the speed-scrub flaw).
- Tunables in `ControlOpts` / `DEFAULT_CONTROL`:
  - `align: 3.5` (per-second alignment rate; starting value)
  - `linearDamping: 0.5 → 0.8` (release-glide stops in ~100u instead of
    ~160u at top speed; top speed still governed by the explicit cap since
    accel/damping equilibria stay above `maxSpeed`/`boostMaxSpeed`)
- Both values are tuned live in the dev-server preview during
  implementation; final numbers get recorded in the plan and commit message.

## 4. Camera: tight follow

Constant tuning in `src/world/scene.ts` (structure unchanged — same
exponential smoothing, same pitch cap so the lookAt up-vector never flips):

- `CAM_TURN` 2 → **7** (camera swings behind the new facing almost
  immediately; this is the main "avatar feel" fix)
- `CAM_LAG` 5 → **12** (position catches up faster)
- `CAM_LOOK_LAG` 12 → **20** (ship stays pinned to screen center)

Starting values; tuned live with the physics until turns feel first-person
without steering wobble shaking the frame.

## 5. Testing

- `tests/theme.test.ts` (new): `readStoredTheme` parsing; `THEMES.light`
  matches the legacy hexes exactly; every `Theme` slot present in both
  themes.
- `tests/galaxy.test.ts`: `mixes` length/range; `paintStarColors` endpoints
  (mix 0 → arm color, mix 1 → core color); existing determinism tests
  unchanged.
- `tests/field.test.ts`: `densityColor` default palette unchanged; custom
  palette endpoints honored.
- `tests/control.test.ts`: `alignVelocity` —
  - no-op when parallel, at rest, and at exact 180° anti-parallel;
  - **speed preserved**: `|result| == |vel|` within 1e-4 relative, per call
    and accumulated across a full simulated 90° realignment;
  - **forward U-turn across 90°** (the P1 regression): `vel = +Z`,
    `heading = −Z`, `sense = +1` — the angle to heading strictly decreases
    every step until parallel; alignment never stalls or reverses past 90°;
  - `sense = −1` aligns toward −heading (reverse flight);
  - convergence: at `align = 3.5`, a 90° misalignment closes to < 5° within
    2 simulated seconds of 120 Hz steps.
- **Scene integration** (new `tests/world-scene.test.ts` or extension of
  `world-mount`): after `setTheme(dark)`, assert **every mutable slot**
  changed — background, galaxy `aColor` endpoints, grid `uColor`, square
  colors, obstacle colors, avatar body/fin materials — so a forgotten
  buffer fails a test, not a manual QA pass. Include the ordering
  regression: construct with dark initial theme, call `setObstacles`
  *afterwards*, assert the obstacle colors are dark-palette (item: stored
  dark must not render light obstacles).
- **Dart integration** (`tests/dart.test.ts`, new): a turn/coast sequence
  through `DartPhysics.step` — thrust +Z, yaw 90°+, coast — asserting the
  velocity direction converges to the new heading with speed within bounds,
  proving `dart.ts` actually applies `alignVelocity`. This needs Rapier
  WASM under vitest, which is unproven in this repo; the plan task attempts
  it first, and if wasm loading is infeasible falls back to an e2e
  assertion (drag a ~90° turn, release, assert the readout trajectory
  curves toward the new heading instead of continuing straight).
- `tests/flight-hud.test.ts`: toggle button renders, fires callback,
  label swaps.
- `tests/world-wire.test.ts`: `applyTheme` writes storage via the guarded
  helper + sets `data-theme` on `document.documentElement`.
- e2e `smoke.spec.ts`: update if it asserts on background color; add a
  toggle click → `html[data-theme="dark"]` assertion (the attribute lives
  on `documentElement`, matching the wiring), and a reload → still-dark
  persistence check.
- Full gate before pushing: `npm run typecheck && npm test && npm run build
  && npm run budgets` (+ `npm run e2e`); manual preview pass on both themes
  with screenshots (light + dark, plus flight-feel check).

## Risks

- **Uncommitted pre-work (Task 0) may not pass the gate.** If verification
  fails, stop and report before committing anything; this feature doesn't
  start until the tree is clean.
- **Velocity alignment vs. Rapier collisions:** the per-step rotation also
  swings post-collision bounce velocity toward the nose, which slightly
  softens ricochets (speed is preserved, so bounces lose direction, not
  energy). Acceptable at `align ≈ 3.5`; revisit if bounces feel dead.
- **Rapier under vitest is unproven** — the dart integration test has a
  specified e2e fallback (see Testing) so coverage of the dart↔alignment
  wiring doesn't silently evaporate if wasm won't load in node.
- **Buffer rewrites on toggle** are O(n) over ~34k points — measured cost is
  a few ms, toggle-only; no per-frame cost.
