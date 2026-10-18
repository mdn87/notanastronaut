# Rapier Free-Fly "Replace" — Design (v1: momentum + boundary)

Date: 2026-06-28
Status: approved for implementation (pending spec review)

## Goal

Replace the hand-rolled deterministic flight integrator in the free-fly world
path with a real physics engine (Rapier). The arrow-dart becomes a dynamic
rigid body with explicit mass and real linear momentum, damping, and a true
boost. v1 proves the *feel* of engine-owned motion against a containing
boundary — no obstacle colliders yet.

This is the first slice of the `physics-engine-research` lane
(`docs/source-packs/physics-engine-research/`). Engine selection (Rapier over
cannon-es) was decided on the merits of the main experience only.

## Locked Decisions (from brainstorming)

- **Architecture:** Replace. Rapier owns the dart's translational motion.
- **Engine + package:** `@dimforge/rapier3d` (real `.wasm`), NOT
  `@dimforge/rapier3d-compat` (which inlines WASM into JS and would land in the
  JS budget). Loaded via async dynamic `import()`; there is **no
  `RAPIER.init()`** call — the WASM-ESM package resolves the module
  asynchronously. (Ref: Rapier JS "getting started".)
- **World bodies (v1):** momentum-only — the dart plus an analytic containing
  boundary. No collider shapes this release.
- **flight.ts:** kept **dormant** as a legacy reference, removed from the world
  path. Shared types move to a neutral module first.
- **Accessible backup navigation mode:** a separate, independent sub-project
  (see Out of Scope). It gets no vote in any decision here.

## Scope

In scope:

- New pure control mapping `src/core/control.ts`.
- New Rapier adapter `src/physics/dart.ts` (the only Rapier importer).
- Neutral shared types module for `FlightInput` / `FlightState`.
- `src/world/wire.ts` swap from `FlightMachine` to the adapter, incl. a real
  boost input.
- Vite WASM support and a `worldWasm` budget line + test.

Out of scope (explicit follow-up sub-projects, each its own spec):

- **B — Collision world:** node-bodies and/or asteroid colliders, contact
  response, angular dynamics from impacts. The v1 adapter scaffolds the Rapier
  `World` so B is additive.
- **C — Accessible backup mode:** scroll + click-on-node → predetermined
  camera/travel moves. Built fresh (does **not** reuse `travel.ts` / `path.ts`
  / `overview.ts`), fully independent of the physics engine.

## Package & Loading Model (P1)

- Add dev deps `vite-plugin-wasm` and `vite-plugin-top-level-await`; register
  both in `vite.config.ts`. `@dimforge/rapier3d` uses top-level `await` and a
  WASM import, which the default Vite pipeline does not handle.
- Add `@dimforge/rapier3d` as a runtime dependency.
- Rapier is imported only from `src/physics/dart.ts` via async dynamic
  `import('@dimforge/rapier3d')`, reached through the already-dynamic world
  chunk (`main.ts` → `mount.ts` → `wire.ts` → adapter). It never touches the
  homepage/fallback critical path.
- Optionally give Rapier its own manual chunk so the budget rows read cleanly;
  the emitted `.wasm` is a separate asset (the point of choosing this package).

## Module Architecture

The single rule: **Rapier is imported in exactly one file (`src/physics/dart.ts`).**

```
src/core/flight-types.ts   (new) FlightInput, FlightState, Vec3 re-export — neutral, no deps
src/core/control.ts        (new) pure: FlightInput -> desired wrench {thrust, boost, yawDelta, pitchDelta}
src/physics/dart.ts        (new) ONLY Rapier importer; owns World + dart body; outputs FlightState
src/core/flight.ts         (dormant) legacy FlightMachine; imports + RE-EXPORTS types from flight-types.ts
                           (so flight.test.ts's `from '../src/core/flight'` import is unchanged); NOT in world path
src/world/wire.ts          swap FlightMachine -> DartPhysics; add boost input
src/world/scene.ts         change one import (FlightState from flight-types); otherwise unchanged
```

- `control.ts` is pure and three.js/Rapier-free, unit-tested like `flight.ts`.
- `dart.ts` exposes a small interface: `create(opts)`, `step(dt, input)`,
  `readState(): FlightState`, `dispose()`. Fixed-timestep accumulator inside.
- `FlightState` output is **explicit** about every field `scene.ts` consumes:
  `position, velocity, heading, yaw, pitch, bank, throttle, speed, surge,
  strafe` (P2 — scene.ts derives avatar rotation from `heading` + `bank` at
  scene.ts:184, so the adapter must populate both).

## Control → Physics Contract

Extend the input contract so boost is first-class (P2 — today `wire.ts:21`
folds right-click into `forward = 1`, which cannot represent a real boost):

```ts
interface FlightInput {
  yawDelta: number; pitchDelta: number;
  forward: number;  // -1..1 (W/S only now)
  strafe: number;   // -1..1
  boost?: boolean;  // right-click — extra thrust + raised velocity cap
}
```

- `boost` is **optional** so the dormant `flight.ts` (which ignores it) and
  `flight.test.ts` (which omits it in its `I()` helper) keep typechecking
  unchanged; `control.ts` reads `input.boost ?? false`.
- `wire.ts`: `forward()` no longer includes `rightHeld`; new `boost()` returns
  `rightHeld`.
- `control.ts`: maps `forward`/`strafe` → thrust force along heading/right;
  `boost` → larger thrust force and a higher velocity cap.
- Damping replaces the old `drag^dt` glide (Rapier `linearDamping`). Starting
  tunables mirror today's `FlightOpts` (accel, maxSpeed, drag, boost) so the
  feel is a tuning baseline, not a reset.

## Mass & Inertia (P1)

With no collider shapes in v1, Rapier cannot derive mass properties, and a
dynamic body with zero mass will not respond to forces correctly. The adapter
therefore sets mass **explicitly** via `RigidBodyDesc.setAdditionalMass` (or
`setAdditionalMassProperties` if a center-of-mass / principal inertia is
needed). Mass and the force constants are tuned together so cruise speed and
stop distance match the current feel. (Ref: Rapier "rigid bodies" — mass &
collider implications.)

## Orientation Policy (P2)

v1's "momentum" is **linear**. Orientation is **control-state**, not angular
dynamics:

- The dart body has **rotations locked** in Rapier (`lockRotations()` /
  enabled-rotations off). Rapier integrates translation only.
- Yaw/pitch are integrated in `control.ts` (with the existing pitch clamp), and
  the adapter applies the resulting orientation with `setRotation`. Because
  rotations are locked, there is no solver to fight — orientation is fully
  owned by control-state, deterministically.
- Thrust force is applied along the control-state heading each step.
- `bank` is derived from yaw-rate for the visual roll.

Rationale: this keeps the drag-steer feel and pitch clamp exactly, avoids the
"directly setting rotation undercuts momentum" trap (we lock rotation rather
than overwrite an actively-solved one), and reserves true angular dynamics
(torque steering, impact-induced spin) for sub-project B, where colliders make
it meaningful.

## Boundary & Collision Posture

Boundary = analytic centripetal force applied in the adapter when the body
passes `bound` radius — same containment model as today's `flight.ts`, not a
Rapier collider (Rapier colliders are solid; hollow-sphere containment is
awkward and unnecessary for v1). v1 runs **no collider shapes**; the adapter
still constructs the Rapier `World` so sub-project B is purely additive.

Honest framing: v1's Rapier value is proper Newtonian integration (explicit
mass, linear momentum, damping, real boost) plus the collision-world
scaffolding — not collisions yet.

## Determinism & Tests

- `control.ts` — fast synchronous deterministic unit tests (no WASM): forward/
  back/strafe directions, yaw-relative thrust, pitch clamp, boost raises the
  target, determinism (same inputs → same wrench). Mirrors `flight.test.ts`.
- `dart.ts` — async tests (`await import('@dimforge/rapier3d')`), **fixed
  timestep** for reproducibility, asserting *properties* rather than exact
  floats: starts at rest at origin; thrust accelerates along heading; glides to
  near-rest under damping after release; boost yields a higher top speed than
  cruise; boundary pulls a runaway back toward center; speed cap respected.
  Single-platform fixed-step is reproducible on CI; cross-platform determinism
  is a bonus we do not depend on.
- Budget visibility test (P2) — extend `tests/budgets.test.ts` with a synthetic
  dist whose manifest chunk lists a fake `assets/*.wasm`, asserting the new
  `worldWasm` row counts it so the row cannot silently miss the payload.

## Budget & Loading (Budget-Integrity)

- `scripts/check-budgets.mjs` today counts only `.js`/`.css`
  (`check-budgets.mjs:13`), so a `.wasm` asset is invisible. Add:
  - a `WASM` extension set,
  - a `worldWasm` measurement over world-chunk `.wasm` assets,
  - a `LIMITS.worldWasm` entry and a `budgetRows` line.
- The world JS chunk stays gated by the existing `world` limit (250 KB gzip);
  Rapier's JS glue is small, so this should hold. The WASM weight lands in the
  new `worldWasm` row.
- The concrete `worldWasm` gzip limit is **TBD-by-measurement** in this spec,
  but is a hard acceptance gate (below).

## Fallback / Safety

If Rapier's WASM fails to load/instantiate, the adapter throws → `wireWorld`/
`mountWorld` reject → `main.ts:26` already catches world-boot failure and drops
to list mode. No new fallback path is required; the existing net covers it.

## Acceptance Criteria

- `npm run typecheck && npm test && npm run build && npm run budgets` all green;
  e2e smoke still passes.
- `control.ts` tests cover directions, pitch clamp, boost, determinism.
- `dart.ts` property tests pass under fixed timestep.
- `worldWasm` budget row exists, is exercised by a test with a fake `.wasm`,
  and a **concrete measured gzip limit is set before merge** (no placeholder).
- World `.js` chunk remains within the 250 KB gzip `world` limit.
- `flight.ts` no longer imported by anything under `src/world/`; its types come
  from `flight-types.ts`; `flight.test.ts` still passes (legacy guard).
- Rapier imported from `src/physics/dart.ts` only.
- WASM-init failure path verified to fall back to list mode.

## Verification

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run budgets`
- `npm run e2e`
- Manual browser check: cruise/stop feel, boost, drag-steer + pitch clamp,
  boundary containment, and graceful list-mode fallback when WASM is blocked.
