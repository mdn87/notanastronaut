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

Constructor takes an initial `Theme` (default light) so boot renders the
stored choice without a flash of white.

### DOM side: CSS variables only

- `tokens.css`: add a `:root[data-theme="dark"]` block overriding the
  existing variables, plus new variables for values currently hardcoded in
  `hud.css`: panel/strip background (`--panel`), label halo (`--halo`,
  today's white text-shadow), readout color + glow (`--readout`,
  `--readout-glow`, today `#38bdf8`), speed text (`--speed`, today
  `#4ab3d4`).
- `hud.css`: replace every hardcoded hex with those variables. No layout
  changes.

### Wiring

- `main.ts`: before rendering anything, set
  `document.documentElement.dataset.theme = readStoredTheme(localStorage.getItem('naa-theme'))`.
  List mode needs nothing else — it inherits the CSS variables.
- `mount.ts`: passes `THEMES[readStoredTheme(…)]` as the initial theme when
  constructing `WorldScene`, so the first rendered frame is already themed.
- `flight-hud.ts`: nav gains a `[ dark ]` / `[ light ]` button (styled like
  `[ list ]`, `pointer-events: auto`) showing the theme you'd switch TO.
  `FlightHud` takes an `onThemeToggle` callback + initial name.
- `wire.ts`: owns `applyTheme(name)` — sets `data-theme`, writes
  `localStorage`, calls `scene.setTheme(THEMES[name])`, updates the button
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
| CSS `--panel` (strip/panel bg) | `rgba(255,255,255,.92)` | `rgba(30,33,37,.92)` |
| CSS `--halo` (label shadow) | `#ffffff` | `#1e2125` |
| CSS `--readout` | `#38bdf8` | `#ffa64d` |
| CSS `--speed` | `#4ab3d4` | `#ffa64d` |

The light theme paints *denser = darker* on white; dark mode inverts the
luminance direction to *denser = hotter* so density still reads. Exact dark
hexes may shift slightly during in-browser tuning; the slot structure is
fixed. Contrast target: HUD text meets WCAG AA against `--bg`/`--panel`.

## 3. Flight: velocity-alignment steering force

New pure function in `src/core/control.ts`:

```
alignForce(vel, heading, align): Vec3
  s   = |vel|                          // speed
  dir = (vel·heading >= 0) ? +1 : -1   // preserve travel sense
  F   = align * (heading * s * dir - vel)
```

- Redirects momentum toward the heading **axis** without fighting reverse
  flight (S key): flying backward aligns to −heading, so braking/reversing
  still works.
- Zero when velocity is already parallel to the heading; magnitude grows
  with misalignment and speed. Mass is 1, so force = acceleration.
- Applied **every fixed step** in `dart.ts` (`addForce` alongside thrust +
  boundary), including while coasting — a glide curves to where you point,
  which is the point of the feature.
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
- `tests/control.test.ts`: `alignForce` — zero when parallel; converges
  velocity direction to heading under Euler steps with speed roughly
  preserved; aligns to −heading when flying backward; zero vector at rest.
- `tests/flight-hud.test.ts`: toggle button renders, fires callback,
  label swaps.
- `tests/world-wire.test.ts`: `applyTheme` writes `localStorage` + sets
  `data-theme`.
- e2e `smoke.spec.ts`: update if it asserts on background color; add a
  toggle click → body/`data-theme` assertion.
- Full gate before pushing: `npm run typecheck && npm test && npm run build
  && npm run budgets` (+ `npm run e2e`); manual preview pass on both themes
  with screenshots (light + dark, plus flight-feel check).

## Risks

- **Uncommitted pre-work (Task 0) may not pass the gate.** If verification
  fails, stop and report before committing anything; this feature doesn't
  start until the tree is clean.
- **Alignment force vs. Rapier collisions:** the force redirects
  post-collision bounce velocity toward the nose, which slightly softens
  ricochets. Acceptable at `align ≈ 3.5`; revisit if bounces feel dead.
- **Buffer rewrites on toggle** are O(n) over ~34k points — measured cost is
  a few ms, toggle-only; no per-frame cost.
