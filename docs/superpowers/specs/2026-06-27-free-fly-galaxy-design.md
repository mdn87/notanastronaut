# Free-Fly Galaxy Explorer — Design

Date: 2026-06-27
Status: approved (design + reviewer feedback incorporated) → planning

## Goal

Replace the node-snap "rail flythrough" world with a **free-flight galaxy
explorer**: the user pilots the astronaut avatar freely through 3D space with a
jet-booster + inertia feel, around a spiral galaxy that reads like a real
top-down spiral. Restore strong depth via a 3D dot grid and scattered
variable-size depth squares.

The mission/portfolio "node" concept is **hidden from the 3D world but kept in
the codebase, dormant**. `content/nodes.ts`, `travel.ts`, `path.ts`, and
`overview.ts` are not deleted, and the `[list]` / ground-control view remains the
portfolio surface and stays fully working. Two pieces *do* change so nodes can't
leak back in and deep links still work: the **node HUD is not used in free-fly**
(replaced by a minimal flight HUD — see §3a), and **surface/route selection gains
rules** so mission URLs render the list, not an empty world (see §6).

## Non-negotiable visual constraints

- **Background stays white** (`#ffffff`), matching the site's line-art brand.
  NOT black. The reference galaxy image is the *shape/density* spec, tonally
  inverted: dark stardust on white rather than bright stars on black.
- Spiral galaxy reads correctly **from a top-down view** (like the reference):
  dense core, sweeping arms, fade to the edges.
- Cyan-family palette (`#4ab3d4` and deeper navy toward the core); keep the
  existing warm accent only for the thruster flame.

## Components

### 1. Flight model — `src/core/flight.ts` (pure, testable)

The deterministic core (the role `travel.ts` played for node-snap). No three.js,
no wall clock — time enters only through `tick(dt)`. Holds:

- `position: Vec3`, `velocity: Vec3`, `heading: Vec3` (unit forward), and a
  scalar `bank` for visual roll.

Per `tick(dt, input)` where `input = { aimX, aimY, thrust }` (aim in [-1,1] from
pointer offset to screen-center; thrust in [0,1]):

- **Steering**: `aimX`/`aimY` set a desired yaw/pitch *rate*; `heading` eases
  toward the aimed direction (rate-limited turn), and `bank` eases toward a roll
  proportional to yaw rate so the avatar leans into turns.
- **Thrust**: `input.thrust` is a **raw command** (0 or 1 — button state, no
  smoothing in the input layer). `flight.ts` owns an internal `throttle` that
  eases toward `input.thrust`; acceleration along `heading` is that smoothed
  throttle shaped by the booster curve (`jetSpeed`-style), so thrust ignites
  slowly and builds. `velocity += accel*dt`. **All ramping happens here, once**
  — the wire layer never pre-smooths (avoids the double-ramp).
- **Inertia / glide**: when `thrust` is released, velocity persists with a very
  light damping coefficient so you **coast to a near-stop** ("glide into place
  because you're in space"). Damping is small enough that drift is long but
  bounded.
- **Speed cap**: clamp `|velocity|` to a max so flight stays controllable.
- **Soft bounds**: beyond radius `R_BOUND` from origin, apply a gentle restoring
  acceleration toward the center (no hard wall) so the player can't get lost in
  empty space.

Deterministic and framerate-independent; unit-tested (ignition is slow, release
glides to rest, bounds pull back, speed clamps, heading normalizes).

Reuses: `src/core/ease.ts` (`jetEase`/`jetSpeed`) for the thrust ramp,
`src/core/rng.ts` for any seeded scatter.

### 2. Input wiring — `src/world/wire.ts` (rewritten for free-fly)

Replaces wheel→advance/back node controls:

- `pointermove` → `aimX/aimY` from offset to viewport center.
- Hold **W** or **Space** (or hold primary mouse button) → `input.thrust = 1`
  (raw button state); release → `0`. The wire layer does **no** smoothing;
  `flight.ts` owns the throttle ramp.
- Optional: Shift = brake (extra damping). Esc/`L` still reaches the list view.
- Each animation frame: read input → `flight.tick(dt, input)` → `scene.frame(dt,
  flightState)`.
- Node-snap handlers (wheel advance/back, swipe, click-to-jump, popstate→jump)
  are removed from the world path. `travel.ts`/`TravelMachine` left in the tree,
  unused.

### 3. Camera & avatar — `src/world/scene.ts`

- **Third-person follow-cam**: target = `avatar.position`; camera trails behind
  and slightly above along `-heading`, position + look lerped each frame so it
  banks and eases through turns (no rigid snapping).
- The astronaut billboard **is** the avatar, positioned at `flight.position`,
  rolled by `bank`, oriented to face roughly camera-ward (billboard) while
  reading as "piloting forward."
- **Thruster flame** (existing `galaxy-thruster.svg`) fires while `thrust > 0`,
  scaled/faded by thrust — same component already built, now driven by live
  throttle instead of transit `t`.

### 3a. HUD in free-fly — `src/hud/flight-hud.ts` (new)

The current HUD is entirely node-centric (floating mission labels, the node
status strip, the mission panel, "click a planet" hints) — none of it applies
without nodes. In free-fly the world mounts a **new minimal `FlightHud`**: a
small fixed control hint ("drag to steer · hold W to boost · Esc for list"), a
faint speed readout, and a **floating position readout** — blue digital-looking
monospace text (e.g. `X +012  Y -034  Z +120`) that tracks the avatar on screen
and updates as it moves, projected from the avatar's world position each frame.
The node `Hud` code stays untouched in `hud.ts` for the dormant node path; the
world simply constructs `FlightHud` instead.

### 4. Spiral galaxy — `THREE.Points` particle field

White background; the galaxy is **dark stardust**.

- Generation (pure, seeded) produces ~15–30k point positions on a **flattened
  logarithmic-spiral disk**: assign each point to one of N arms (2–4), radius `r`
  with a core-weighted distribution, angle `= armBase + b*ln(r) + jitter`, and a
  thin gaussian `z` (disk thickness). A central **bulge** cluster gives the dense
  core. Per-point size and opacity scale by radius (bigger/denser core, fading
  arms).
- Rendering: `THREE.Points` with a **custom `ShaderMaterial`** — plain
  `THREE.PointsMaterial` cannot consume per-vertex size or alpha, which this
  design needs. The vertex shader sets `gl_PointSize` from an `aSize` attribute
  (with distance attenuation); the fragment shader samples a soft round mask and
  outputs the per-point color with `alpha = mask * aAlpha`, using
  **NormalBlending** on white (additive would vanish on white) so dense dark
  points darken the page. Color from brand cyan `#4ab3d4` deepening to navy near
  the core; the density of overlapping faint points creates the tonal gradient —
  core reads deep, arms read as cyan dust, gaps stay white.
- The disk **rotates ever so slowly** about its axis for life.
- You fly through/above/below it; no collision (it's stars).

Alternative considered: keep sprite-doodle field — rejected, cannot reach the
density/look of the reference.

`src/core/galaxy.ts` is repurposed to `makeSpiralGalaxy(seed, opts)` returning
typed arrays (positions, sizes, alphas, colors) for a BufferGeometry. The old
doodle `makeGalaxy` and its abstract-sprite art are retired from the world (art
files left on disk).

### 5. Depth — two layers

- **3D dot grid** — pure generator builds a regular x/y/z lattice of points at
  spacing `S` over the flyable volume (kept to a sane count, e.g. ~20³). Rendered
  as faint cyan `THREE.Points`, **dimming with distance** from the avatar so near
  dots are crisp and far ones fade — a holodeck-style spatial reference that
  makes motion read as real 3D travel.
- **Depth squares** — restore the scattered, randomly-sized square sprites at
  varied depths for strong parallax (the depth that was lost). Distinct from the
  regular grid: organic, irregular, faint cyan/gray outlined squares. Reuses
  `src/core/parallax.ts` (`makeBodies`), but **re-parameterized to the flyable
  volume**: its current constants are shaped around the old rail corridor, so the
  generator must fill the sphere/cube of radius `R_BOUND` (the soft-bound volume)
  and surround the player everywhere they can fly — otherwise you outrun the
  depth layer. Pass volume extents into `makeBodies` (or fork a volume-filling
  variant).

### 6. Route & surface behavior — `router.ts` + `main.ts` (updated, not unchanged)

`chooseSurface` gains two rules beyond today's forced / reduced-motion / WebGL
checks:

- **Fine pointer required for world.** Add a capability input
  `hasFinePointer = matchMedia('(hover: hover) and (pointer: fine)').matches`.
  Free-fly needs a real pointer to steer, so touch / coarse-pointer devices
  (even with WebGL and no reduced-motion) get the `list` surface. Reduced motion
  still → list.
- **Only `/` gets the world.** Free-fly is the homepage galaxy. Any other route —
  the mission/content deep links such as `/missions/maker-bay` — renders the
  `list` surface so the portfolio content shows. This makes deep links work and
  removes today's bug where world mode hides `#content` for a mission URL.

`main.ts` therefore hides `#content` and mounts the world **only** when the
chosen surface is `world` (root + fine pointer + WebGL + motion); for any content
route it shows the list. Overrides: `?mode=list` always wins; `?mode=world`
applies **only on the home route** (forcing world on a mission route would hide
the portfolio behind an empty free-fly scene, so it falls back to the list
instead). No `popstate → node-jump` is needed: the world has no nodes, and route
changes that land on a content route re-render the list.

## Reuse vs retire (prior session work)

The previous session's node-snap + spiral-doodle changes are largely superseded.
Rather than a blunt `git revert` (which would also drop the reusable booster
pieces), the implementation supersedes them in place:

- **Reuse**: `src/core/ease.ts` (`jetEase`/`jetSpeed`) for the thrust ramp; the
  astronaut art; the thruster flame (`galaxy-thruster.svg`).
- **Retire from the world**: the doodle `makeGalaxy` + abstract sprite SVGs
  (`galaxy-star/diamond/triangle/plus/hexagon/swirl/constellation`), the node
  marker `galaxy-node.svg` + per-accent tinting, and the node-snap rail
  rendering. The now-orphaned art files are removed in a cleanup pass (deletion
  is permission-gated).
- **Dormant**: `travel.ts`, `path.ts`, `overview.ts`, `intent.ts`.

## File-level plan

| File | Change |
|---|---|
| `src/core/flight.ts` | **new** — pure free-fly physics integrator + tests |
| `src/core/galaxy.ts` | repurpose → `makeSpiralGalaxy` (particle field arrays) |
| `src/core/grid.ts` | **new** — pure 3D dot-lattice generator + tests |
| `src/core/parallax.ts` | reuse `makeBodies`, re-parameterized to the flyable volume (`R_BOUND`) |
| `src/world/scene.ts` | rewrite world: white bg, particle galaxy, grid, squares, avatar follow-cam, thruster |
| `src/world/wire.ts` | rewrite: pointer/keyboard free-fly input → `flight.tick` |
| `src/core/ease.ts` | reuse `jetSpeed` for thrust ramp |
| `src/router.ts` | add fine-pointer detection + "only `/` gets world" rule (§6) |
| `src/main.ts` | hide `#content`/mount world only for the `world` surface; content routes show list |
| `src/hud/hud.ts` | node HUD not used in free-fly; add a minimal flight HUD (§3a) |
| `travel.ts`, `path.ts`, `overview.ts`, `intent.ts` | left dormant (no world use, not deleted) |
| `content/nodes.ts`, fallback `render.ts`, `[list]` view | untouched (portfolio + list surface) |

## Determinism & testing

- `flight.ts`: deterministic given `(dt, input)` sequence — tests for slow
  ignition, inertial glide to rest, speed clamp, soft-bound restoring force,
  heading stays unit-length.
- `galaxy.ts` / `grid.ts`: deterministic for a seed; tests for counts, finite
  outputs, spiral structure (arc/arm winding), grid spacing/extent.
- Tests that change: `world-wire.test.ts` (rewritten for free-fly input);
  `router.test.ts` (new fine-pointer + route→surface rules — `chooseSurface`
  gains an input); the `e2e` smoke (today it advances through nodes in world
  mode — that behavior is gone, so the world-mode specs are rewritten for
  free-fly, and the mission deep-link specs now assert the **list** surface).
- Stay green, untouched: `travel`, `path`, `overview`, `content`, `prerender`,
  `render`, `hud` (node-HUD code unchanged — the minimal flight HUD is additive),
  and the budget checker.
- Budgets & runtime perf: the gzipped **asset** budget (code + the small point
  sprite texture, if any) stays within the existing world-chunk limit — but the
  particle buffers are **runtime GPU memory**, which the budget script does not
  measure. Add a separate guard: a configured **total point-count cap** (galaxy +
  grid, target ≤ ~60k) enforced in the generators, a unit test asserting the
  generators stay under it, and a 60fps target verified by hand in the preview.

## Defaults the user can tune later

- Grid density/spacing and fade distance (default: faint, evenly spaced, fades
  with distance).
- Galaxy point count, arm count, core deepness, rotation speed.
- Damping/turn-rate/speed-cap feel constants in `flight.ts`.

## Out of scope (for now)

- Touch/mobile free-fly controls (mobile keeps the list view).
- Re-introducing missions as fly-to destinations in the galaxy (possible later;
  the dormant node code makes it easy).
