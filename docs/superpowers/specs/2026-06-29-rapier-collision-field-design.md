# Rapier Collision v1 — Mass-Varied Dot Obstacle Field + Snappier Cam — Design

Date: 2026-06-29
Status: approved for implementation (pending spec review)

## Goal

Build on the shipped Rapier free-fly engine by adding real **mass-based collision**.
Grid-intersection "dots" within a central region become **dynamic** obstacle
bodies whose mass comes from per-object **size × density**; Rapier's momentum
conservation then produces the bounce behavior the operator described. Also make
the chase cam follow the craft's orientation more tightly. Portfolio **nodes stay
non-collidable** (deferred).

This is the first slice of sub-project B (collision world). It builds directly on
`src/physics/dart.ts`, `src/core/control.ts`, and the v1 spec
(`2026-06-28-rapier-freefly-physics-design.md`).

## Locked Decisions (from brainstorming)

- **Chase cam:** keep today's steady, centered, level-horizon framing — just
  **snappier** (less trail-lag behind the nose). No roll.
- **Obstacles are DYNAMIC, mass-varied.** Each has a seeded `size` (radius) and
  `density`. **Mass is `clamp(sizeFactor · densFactor)`** — a size term AND a
  density term, each a normalized factor, multiplied. Density is given the WIDER
  range so it can dominate: a small-but-very-dense "core" out-masses a large light
  object and exceeds the ship's mass. (A strict `r³·density` model was rejected
  because the `r³` term makes size dominate, which would make a small dense dot
  always light — contradicting the intended "small dense core is heavy" feel.)
  Rapier momentum exchange then gives: equal-mass → symmetric ricochet; lighter
  object → it flies off, ship barely moves; heavier / denser object → ship bounces
  off, object barely moves.
- **Darker = denser.** Object color encodes density.
- **Central region only.** Obstacles fill a central cube; the outer gridlines
  stay visual-only.
- **Restitution ≈ 0.6** (ricochet). **Nodes excluded.**

## Scope

In scope:
- `src/core/field.ts` (new, pure): deterministic obstacle-field spec + density→color.
- `src/physics/`: dart gains a collider + reference mass; new obstacle bodies;
  expose live obstacle states. Rapier-import rule relaxes from "only `dart.ts`"
  to "only files under `src/physics/`".
- `src/world/scene.ts`: snappier cam constants; render the obstacle dot cloud
  (positions updated each frame; color by density).
- `src/world/wire.ts`: pass the field seed to physics; feed obstacle states to render.

Out of scope (future):
- Collidable portfolio nodes.
- Obstacles returning to a home position; obstacle↔obstacle gameplay; streaming
  colliders for an unbounded field.

## Tunable Defaults (feel knobs — dial after first playtest)

| Knob | Default | Notes |
|---|---|---|
| central extent | ±180 (ticks at 90 → 5³ = **125 objects**) | aligned to existing gridline intersections |
| radius range | [2, 9] | seeded uniform |
| density range | [0.2, 15] | drives the density mass-factor (darker=denser) |
| ship reference mass M₀ | 1 | dart keeps mass 1 so existing thrust feel is unchanged |
| size mass-factor | radius [2,9] → [0.7, 1.6] | size's pull on mass (≈2.3× across the range) |
| density mass-factor | density [0.2,15] → [0.4, 4.0] | density's pull (≈10×) — wider than size so a *small super-dense* core can out-mass a *large light* object and exceed the ship |
| obstacle mass | `clamp(sizeFactor · densFactor, 0.1, 8)` | both terms multiplied; e.g. small+dense 0.7·4.0=2.8 (>ship) vs big+light 1.6·0.4=0.64; `obstacleMass()` is a pure exported helper |
| restitution | 0.6 | on dart + obstacle colliders |
| obstacle damping | linear 0.8, angular 0.8 | knocked objects drift then settle |
| dart collider | ball, r ≈ 1.6 | |
| cam trail rate `CAM_TURN` | 1.5 → ~5 | snappier orientation following; horizon stays level |

The ship keeps mass 1 and `control.ts` forces are unchanged, so flight feel is
preserved; obstacle masses are expressed *relative to the ship* (k), so "equal /
lighter / heavier" map straight onto Rapier's momentum exchange.

## Module Architecture

Rapier stays confined to `src/physics/`.

```
src/core/field.ts        (new, pure) makeObstacleField(seed, opts) -> ObstacleSpec[]; densityColor(density) -> {r,g,b}
src/physics/obstacles.ts (new, Rapier) build dynamic obstacle bodies from specs into a shared World; read back live transforms
src/physics/dart.ts      (modify)  dart gains a ball collider + restitution (mass stays 1, rotations stay locked); World now also hosts obstacles
src/world/scene.ts       (modify)  snappier cam; render obstacle dot cloud (per-frame positions, color by density)
src/world/wire.ts        (modify)  create physics with the field; pass obstacle states into scene.frame
```

- **`ObstacleSpec`** = `{ pos: Vec3; radius: number; density: number; mass: number; color: {r,g,b} }` — pure, deterministic from a seed.
- **`field.ts`** reuses the grid tick math so obstacle positions land exactly on
  gridline intersections (single source of truth with the visual grid). It
  **excludes lattice points within `spawnClear` of the origin** (default: just the
  origin itself, since the next point is 90 units out) so the dart — which spawns
  at `(0,0,0)` — is never embedded inside an obstacle. (±180 → 5³ = 125 lattice
  points, minus the origin → **124 obstacles**.)
- **The dart and all obstacles live in ONE Rapier `World`** (created in `dart.ts`).
  `obstacles.ts` is handed `(RAPIER, world, specs)` and creates the bodies; one
  `world.step()` advances dart + obstacles together. The physics layer exposes:
  - `state(): FlightState` (dart, unchanged surface)
  - `obstacleStates(): { pos: Vec3 }[]` (live positions, index-aligned to the specs)
- **Mass model:** the dart uses `setAdditionalMass(1)` + `lockRotations()` + a ball
  collider with restitution. Each obstacle is a dynamic body with
  `setAdditionalMass(k)` + a ball collider (radius `r`, restitution) + linear/
  angular damping. Mass is set explicitly (not collider-derived) for the same
  reason as v1 (predictable, decoupled from collider density).
  **Critical:** every collider is created with **density 0** (`ColliderDesc.ball(r)
  .setDensity(0)`), so a body's mass comes SOLELY from `setAdditionalMass` — the
  dart stays exactly mass 1 (preserving the v1 thrust feel) and an obstacle is
  exactly `k`. Otherwise Rapier's default collider density (1.0) would add
  collider-volume mass on top, silently changing both the dart's acceleration and
  the obstacle mass ratios.

## Rendering

`scene.ts` adds an **obstacle dot cloud** (`THREE.Points`, round mask, reusing the
existing point shader): one vertex per obstacle, `aSize` from radius, `aColor`
from `densityColor`. Each frame it copies live positions from `obstacleStates()`
into the position buffer (`needsUpdate = true`). The outer **visual gridlines stay
as-is**. The camera change is constants only.

## Determinism & Tests

- **`field.ts` (pure) → vitest:** object count for a given extent/spacing; every
  position lies on the lattice; seeded mass/k within clamped range and
  deterministic (same seed → same field); `densityColor` is monotonic (denser →
  darker) and deterministic. Mirrors the existing pure-core test style.
- **Collision → Playwright e2e:** fly the dart straight into the central field and
  assert observable deflection — the dart's `.flight-speed` / position-readout
  trajectory changes versus an obstacle-free baseline, and/or a rendered obstacle
  moves. (Soft but real; the precise momentum math is Rapier's, exercised in the
  real runtime.)
- Single-platform fixed-step keeps unit results reproducible.

## Known v1 Limits (acceptable)

- A hard enough hit can drift an obstacle out of the central cube (damping
  mitigates; no home-return spring yet).
- ~125 dynamic bodies sleep when at rest (Rapier auto-sleep), so steady-state cost
  is low; a chain reaction wakes only the involved neighbors.
- Obstacles are rendered as billboarded dots, so their (free) rotation is not shown.

## Acceptance Criteria

- `npm run typecheck && npm test && npm run build && npm run budgets` green; e2e passes.
- `field.ts` unit tests cover lattice alignment, seeded mass range + determinism,
  and density→darker color.
- Dart + obstacles share one Rapier World; `obstacleStates()` index-aligns to specs.
- A collision visibly exchanges momentum per mass ratio (verified in e2e and/or a
  manual browser check): equal→symmetric, lighter→object flies, heavier→ship bounces.
- Rapier imported only under `src/physics/`.
- world JS chunk stays `<= 250_000` gzip; `worldWasm` unchanged (no new engine).
- Nodes remain non-collidable.

## Verification

- `npm run typecheck` · `npm test` · `npm run build` · `npm run budgets` · `npm run e2e`
- Manual browser: fly into a light dot (it scatters), an equal dot (both bounce),
  a dark/dense dot (ship ricochets); confirm the snappier cam tracks the nose.
