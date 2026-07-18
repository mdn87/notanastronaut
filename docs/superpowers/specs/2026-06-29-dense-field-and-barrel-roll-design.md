# Dense Clustered Field + Barrel-Roll Dodge — Design

Date: 2026-06-29
Status: approved for implementation (pending spec review)

## Goal

Three bundled flight-feel changes on top of the shipped Rapier collision field:

- **A. Dense clustered field.** Replace the 124-obstacle central lattice with
  ~1500 loosely-clustered dynamic obstacles filling the whole grid, so they're
  easy to find and run into. (Plus a per-frame perf fix needed at this scale.)
- **B. Remove the side-thruster graphic.** The left/right RCS sprite looks silly;
  delete it.
- **C. Barrel-roll dodge.** A/D (and Left/Right arrows) stop being continuous
  strafe; a single press does a 360° barrel roll in that direction plus a small
  lateral side-step, chainable for a "spinspinspin" feel.

Builds on `field.ts`, `src/physics/`, `src/world/scene.ts`, `src/world/wire.ts`.

## Locked Decisions (from brainstorming)

- Field: **~1500** obstacles, **free-floating clumps**, filling the **±630** grid.
- A guaranteed **"greeter" clump** sits just ahead of spawn (≈ `(0,0,130)`): fixes
  "hard to find" and keeps the collision e2e deterministic (a random clump field
  is too sparse-in-volume for a straight-ahead flight to reliably hit).
- Per-frame obstacle positions move over a **reused `Float32Array`** (no per-frame
  object allocation) — required at 1500 bodies.
- Side-thruster sprite removed.
- A/D = **edge-triggered** barrel roll (one per press, ignore key-repeat; tap to
  chain) + a **lateral physics impulse**; the avatar's `bank` becomes the roll
  angle, spun at constant speed. Strafe thrust removed from the live path.
- W/S, drag-to-steer (aim-based), right-click boost: **unchanged**.

## Tunable Defaults (feel knobs)

| Knob | Default | Notes |
|---|---|---|
| clusterCount | 210 | cluster centers scattered uniformly in ±extent |
| obstacles per cluster | 5–9 (seeded) | total ≈ clusterCount × avg ≈ 1500 |
| clusterRadius | 55 | Gaussian jitter of obstacles around a center |
| extent | 630 | fills to the grid edge (`n·spacing`, 7·90) |
| spawnClear | 40 | drop obstacles within this radius of origin |
| greeter center / radius | (0,0,130) / 70 | guaranteed clump ahead of spawn |
| maxObstacles | 2000 | hard cap (seed-variance safety) |
| ROLL_SPEED | ~16 rad/s | ≈0.4 s per 360°; chaining keeps it spinning |
| SIDESTEP_IMPULSE | ~12 | lateral impulse per roll (mass 1; damped) |

Radius/density ranges, `obstacleMass`, `densityColor`, restitution/damping: unchanged.

## Feature A — Dense clustered field

`makeObstacleField(seed, opts)` is rewritten to generate **free-floating clumps**
instead of one-per-lattice-intersection:

1. Generate `clusterCount` cluster centers uniformly in `[-extent, extent]³`.
2. For each center, a seeded count (5–9) of obstacles, each jittered from the
   center by a Gaussian of σ=`clusterRadius` (reuse the Box–Muller `gauss` style
   already in `galaxy.ts`).
3. Prepend a **greeter** cluster at `(0,0,130)`: one obstacle at the **exact
   center** (on the dart's straight-ahead +z path, so a head-on flight always
   collides — this is what makes the collision e2e deterministic) plus a handful
   jittered within ~70u around it. The center obstacle is given a mid/heavy mass so
   the hit is unmistakable.
4. Drop any obstacle with `|pos| <= spawnClear`; clamp positions into `±extent`.
5. Stop at `maxObstacles`.
6. Each obstacle: seeded radius/density → `obstacleMass` (unchanged) + `densityColor`.

Deterministic (`mulberry32(seed)`), so the field is identical every run — required
for the deterministic collision e2e.

`ObstacleSpec` shape is unchanged. `FieldOpts` gains: `clusterCount`,
`perClusterMin`, `perClusterMax`, `clusterRadius`, `greeterZ`, `greeterRadius`,
`maxObstacles` (all optional, with the defaults above). `extent`/`spawnClear`
defaults change to 630 / 40.

## Feature B — Remove side-thruster graphic

In `scene.ts`: delete the `sideThruster` field, its construction, and the
per-frame strafe-driven update block. The rear thruster (driven by `surge`) and
its shared texture stay. No other behavior changes.

## Feature C — Barrel-roll dodge

**Input contract** (`flight-types.ts`): add `roll?: -1 | 0 | 1` to `FlightInput`
(−1 = roll left / A / ArrowLeft, +1 = roll right / D / ArrowRight; one tick per
press). `strafe` stays in the type (the dormant `flight.ts` and `flight.test.ts`
still use it) but the live path no longer drives it (wire passes `strafe: 0`).

**Input wiring** (`wire.ts`): A/D/Arrow-Left/Right detected on the **keydown edge**
(ignore browser auto-repeat via `e.repeat`), emitting a single `roll` value for one
frame. They no longer contribute to `strafe()`.

**Roll math** (`control.ts`, new pure helper): `stepRoll(angle, target, speed, dt)`
moves `angle` toward `target` by `speed·dt` without overshoot (constant angular
speed → steady spin). Pure, tested.

**Physics/state** (`dart.ts`): track `rollTarget` and `rollAngle`. On a non-zero
`roll` input: `rollTarget += roll·2π` and `body.applyImpulse(right · roll ·
SIDESTEP_IMPULSE)` (a real, damped lateral dodge; `right = rightFrom(heading)`).
Each step: `rollAngle = stepRoll(rollAngle, rollTarget, ROLL_SPEED, dt)`.
`state().bank = rollAngle` (so the avatar shows the spin). `surge` still set;
`strafe` is left at 0.

**Visual** (`scene.ts`): `avatar.rotateZ(flight.bank)` is unchanged — `bank` now
carries the barrel-roll spin instead of a strafe lean. Strafe thrust is gone from
`thrustForce`'s effect because the live path passes `strafe: 0`.

## Per-frame perf seam

At ~1500 bodies, today's `obstacleStates(): {pos}[]` allocates ~1500 wrapper +
1500 `pos` objects every frame (GC churn). Change the seam to a reused buffer:

- `obstacles.ts`: hold a private `Float32Array(3·count)`; `positions(): Float32Array`
  fills and returns it each call (no allocation).
- `dart.ts`: `obstacleStates()` → `obstaclePositions(): Float32Array` (empty
  `Float32Array(0)` when no obstacles).
- `scene.ts`: `frame(dt, flight, obstaclePositions?: Float32Array)` copies the flat
  array into the render position buffer via `.set()` (capped to the buffer length,
  preserving the Task-3 bounds guard). `setObstacles` unchanged in shape.
- `wire.ts`: passes `dart.obstaclePositions()`.

## Determinism & Tests

- `control.ts`: add `stepRoll` unit tests (reaches target in ≈|Δ|/speed, no
  overshoot, zero at target, deterministic). Existing facing/thrust/boundary/mass
  tests unchanged.
- `field.ts`: tests updated for the clustered model — total within
  `[~target, maxObstacles]`, all positions within `±extent` (+ jitter tolerance)
  and outside `spawnClear`, the greeter region is populated, masses within clamp,
  deterministic for a seed. (The old one-per-lattice assertions are replaced.)
- `tests/world-wire.test.ts`: stub updated for the `Float32Array` seam and the
  edge-triggered roll (no behavior weakened).
- e2e (`smoke.spec.ts`): the **collision** test (fly +z) now hits the greeter
  clump — stays deterministic. Add a **barrel-roll** test: a single `d` keydown
  shifts the dart's lateral (x) position by more than a threshold within ~1s (the
  side-step impulse), versus ~0 with no input — a deterministic, observable check
  of the dodge. (The roll visual is verified manually.)

## Out of Scope

- Collidable nodes (still deferred). Obstacle home-spring / static-far perf
  optimization (only if 1500 dynamic bodies strain the frame budget).

## Acceptance Criteria

- `npm run typecheck && npm test && npm run build && npm run budgets && npm run e2e` green.
- Field generates ≈1500 (≤ `maxObstacles`) clustered obstacles filling ±630, with a
  populated greeter ahead of spawn and a clear spawn bubble; deterministic.
- No per-frame object allocation in the obstacle render path (reused `Float32Array`).
- Side-thruster sprite gone; no `sideThruster` references remain.
- A/D/arrows: one barrel roll + lateral dodge per press, chainable; no strafe thrust;
  W/S + drag-steer + boost unchanged.
- world JS chunk ≤ 250 KB gzip; worldWasm unchanged; nodes non-collidable.
- Perf: 60fps holds with ~1500 bodies (verified in-browser); flag if not.

## Verification

- `npm run typecheck` · `npm test` · `npm run build` · `npm run budgets` · `npm run e2e`
- Manual browser: fly forward into the greeter + dense field (easy to find/hit);
  tap A/D to barrel-roll + dodge, chain taps for a continuous spin; confirm the
  side rocket graphic is gone and framerate holds.
