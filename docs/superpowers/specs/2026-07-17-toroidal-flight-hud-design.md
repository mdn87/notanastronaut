# Toroidal Flight and Instrument HUD Design

## Goal

Improve the free-flight spaceship surface with a finite repeating grid, a
minimal instrument HUD, and clear direction feedback.

When the ship crosses a marked grid face, it re-enters through the opposite
face without changing its direction of travel. The HUD makes that space legible
with a gimbal compass and a small minimap while keeping the 3D view visually
open outside the exact HUD regions.

## Product decisions

- The world is a torus over the marked grid volume.
- The default seam is the visible outer line-grid face: `spacing: 90`,
  `extent: 700`, `n = floor(extent / spacing) = 7`, and therefore
  `edge = n * spacing = 630` on every axis. The dot lattice's separate
  `spacing: 26`, `extent: 260` values are not the seam.
- Toroidal mode replaces the live flight soft-boundary force. The old
  `boundaryForce` helper and `bound`/`boundPush` options may remain for legacy
  callers/tests, but the active toroidal adapter does not apply them.
- In v1 the ship is the only object that can cross the seam in live gameplay.
  The seeded obstacle field currently lives inside a smaller ±300 volume and
  does not reach the ±630 planes. Object-wrapping helpers stay pure and
  forward-compatible, but no new dynamic-object lifecycle is added here.
- The removed/stale galaxy backdrop is not part of this feature and must not be
  restored or used as a dependency.
- A wrap preserves velocity, heading, yaw, pitch, roll, and overshoot.
- The HUD uses the selected side-instrument-strip composition.
- The compass is centered along the bottom edge, not at the top.
- HUD colors are white and cyan, with orange reserved for the active heading,
  wrap feedback, and warnings.
- HUD panels are opaque white rectangles. They fully block the 3D canvas where
  they exist; there is no translucent full-screen wash or decoration outside
  the feature regions.

## Architecture

### Toroidal coordinate core

Extend the grid/core layer with pure helpers for:

- deriving the effective line-grid edge from `{ spacing, extent }` as
  `floor(extent / spacing) * spacing`;
- wrapping a scalar into `[-edge, edge]` while preserving overshoot;
- wrapping all three coordinates independently;
- finding the nearest-image delta between two positions on the torus.

The scalar operation uses the grid period (`2 * edge`) and is deterministic for
positive and negative inputs. Exact seam values have one defined canonical
representation so minimap and physics state cannot disagree.

The line-grid spacing, requested extent, and quantized edge are one shared
source of truth used by grid construction, scene rendering, minimap scaling,
and flight physics. With the current values these are `90`, `700`, and `630`;
the old `720` soft-bound value is not reused or left as a competing live limit.

### Physics integration

The physics adapter remains responsible for Rapier integration. After each
fixed substep it canonicalizes the ship position through the pure torus helper.
It does not modify linear velocity or the control-facing state when a wrap
occurs. Wrapping happens after `world.step()` and before the next fixed
substep, so the old soft-boundary force cannot fight or undo the seam.
Skipping that force in toroidal mode is an explicit cleanup/clarity decision,
not a load-bearing behavior: the ±630 seam is reached before the legacy ±720
force onset, so wrapping already makes the force unreachable in live flight.

The pure core also exposes nearest-image deltas for minimap/proximity logic and
future seam-aware physics. In this v1, that helper is not presented as Rapier
collision response: Rapier still resolves contacts in ordinary canonical
world-space. Because the current seeded obstacles are bounded to ±300, no live
obstacle is near the ±630 seam. Adding ghost/image colliders or a custom
narrowphase for dynamic objects is explicitly deferred until the gameplay field
can reach the seam.

The renderer receives canonical positions. The grid remains fixed in the same
coordinate volume and therefore acts as the visual reference for the seam.

### HUD adapter

`FlightHud` owns three small instrument regions:

1. `.flight-minimap` on the left: a square top-down X/Z map, cyan grid lines,
   an orange ship marker, and a solid heading vector.
2. `.flight-compass` centered at the bottom: a horizontal cardinal band plus a
   circular gimbal/attitude ring. Yaw moves the cardinal band; pitch tilts the
   gimbal cue; the current heading marker is orange.
3. `.flight-telemetry` on the right: speed, wrapped XYZ position, and a
   `GRID WRAP` status cue that briefly accents orange when a wrap occurs.

The flight loop passes navigation state into the HUD once per frame. The HUD
does not read Three.js objects directly. Its update method accepts plain
numbers/vectors so it remains unit-testable without WebGL. The fixed telemetry
panel replaces the flight HUD's existing floating `.flight-readout`; there is
one authoritative XYZ readout, not two competing presentations.

The new regions use opaque `var(--bg)`/white backgrounds, solid borders, and
simple CSS geometry. Existing pointer interaction remains limited to the
controls that already need it; HUD decoration stays pointer-transparent. White
panels are intentional: the live surface is a sparse line/grid field, so opaque
white instrument blocks provide the strongest contrast without tinting the rest
of the viewport.

Responsive behavior keeps the center flight view clear: the minimap and
telemetry shrink into compact corner blocks and the compass remains centered at
the bottom with a bounded width. No full-screen HUD layer is introduced.

## Module boundaries

- `src/core/grid.ts` or a focused torus helper: pure line-grid edge, wrap, and
  nearest-image math.
- `src/physics/dart.ts`: apply canonical ship wrapping after fixed substeps,
  skip the live soft-boundary force in toroidal mode, and preserve
  velocity/facing.
- `src/world/scene.ts`: continue to render the existing live surface and fixed
  grid; consume canonical positions only. Do not add galaxy/backdrop rendering.
- `src/world/wire.ts`: pass navigation state and wrap events to the HUD.
- `src/hud/flight-hud.ts`: render and update the three geometric instrument
  regions.
- `src/hud/hud.css`: define the opaque white/cyan/orange flat HUD geometry and
  responsive layout.

No unrelated content, route, artwork, or portfolio HUD behavior changes are in
scope.

## State and data flow

```text
input
  -> flight control / fixed physics
  -> torus canonicalization
  -> state { position, velocity, heading, yaw, pitch, wrapped }
  -> scene render + HUD update
```

`wrapped` is a frame-level event or counter used only for feedback. It must not
change the continuous movement state. The minimap uses canonical position
normalized against the line-grid edge (`±630` with the current constants); the
compass uses yaw/pitch and the heading vector; telemetry uses the same
canonical position shown to physics.

## Testing

### Pure unit tests

- Positive and negative scalar crossings wrap to the opposite face.
- Overshoot is preserved, including values beyond one full period.
- X, Y, and Z axes wrap independently; corner crossings wrap all crossed axes.
- Exact boundary behavior is deterministic.
- Nearest-image deltas select the short path across each seam.
- Repeated runs with the same inputs produce the same wrapped state.

### Physics integration tests

- A ship crossing each face reappears on the opposite face.
- Linear velocity and heading are unchanged by wrapping.
- The pure object helper canonicalizes a position crossing a face, even though
  no current v1 obstacle reaches the seam.
- Objects on opposite faces report the short nearest-image distance; v1 does
  not claim Rapier resolves cross-seam collision response.

### HUD tests

- The HUD markup contains minimap, compass, and telemetry regions, with the
  telemetry panel replacing the floating flight XYZ readout.
- Compass output responds to yaw/pitch without accessing WebGL.
- Minimap output places the marker from canonical X/Z coordinates and rotates
  the heading vector.
- Telemetry formats speed and wrapped XYZ values.
- Wrap feedback toggles the orange state and then clears without affecting
  other regions.
- Existing dispose behavior remains intact.

### Browser smoke coverage

- World mode boots with the HUD regions present.
- The compass is bottom-centered and the minimap/telemetry are in their side
  regions.
- The center viewport remains visible outside the opaque HUD rectangles.
- A deterministic movement sequence crosses a seam and leaves the ship moving
  in the same direction.

## Performance and failure bounds

- Wrapping is constant-time per position and does not allocate in the frame
  loop.
- Nearest-image math checks the fixed set of adjacent period offsets only.
- HUD updates mutate existing DOM nodes instead of rebuilding the root.
- No new persistent render objects, background layers, or galaxy data are
  introduced.
- If the browser cannot initialize the world, the existing list fallback still
  works; HUD behavior must not prevent fallback teardown.

## Acceptance criteria

- Crossing a marked grid edge teleports the ship to the opposite side while
  preserving its direction and motion state.
- The grid and ship share the same quantized toroidal coordinate volume; the
  pure helpers are ready for future moving-object wrapping.
- Cross-seam nearest-image proximity math is covered by tests, without claiming
  unsupported Rapier collision response.
- The HUD visibly includes a gimbal compass at middle-bottom, a rudimentary
  minimap, and right-side telemetry.
- HUD panels are flat, opaque, limited to their added geometric regions, and
  use only white/cyan plus orange indicator accents.
- No galaxy backdrop is added or required.
