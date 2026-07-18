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
- The default seam is the visible outer grid face, derived from the grid's
  spacing and extent rather than a second magic number.
- Wrapping applies to the ship and active gameplay objects in the live flight
  surface. The removed/stale galaxy backdrop is not part of this feature and
  must not be restored or used as a dependency.
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

- deriving the effective grid edge from `{ spacing, extent }`;
- wrapping a scalar into `[-edge, edge]` while preserving overshoot;
- wrapping all three coordinates independently;
- finding the nearest-image delta between two positions on the torus.

The scalar operation uses the grid period (`2 * edge`) and is deterministic for
positive and negative inputs. Exact seam values have one defined canonical
representation so minimap and physics state cannot disagree.

### Physics integration

The physics adapter remains responsible for Rapier integration. After each
fixed substep it canonicalizes the ship and active gameplay-object positions
through the pure torus helper. It does not modify linear velocity or the
control-facing state when a wrap occurs.

Collision checks near a seam use the nearest-image delta. An object just beyond
the positive X/Z/Y face is treated as adjacent to the corresponding object just
inside the negative face. This keeps collisions continuous without requiring a
second gameplay coordinate system or a backdrop-specific renderer.

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
numbers/vectors so it remains unit-testable without WebGL.

The new regions use opaque `var(--bg)`/white backgrounds, solid borders, and
simple CSS geometry. Existing pointer interaction remains limited to the
controls that already need it; HUD decoration stays pointer-transparent.

Responsive behavior keeps the center flight view clear: the minimap and
telemetry shrink into compact corner blocks and the compass remains centered at
the bottom with a bounded width. No full-screen HUD layer is introduced.

## Module boundaries

- `src/core/grid.ts` or a focused torus helper: pure edge, wrap, and
  nearest-image math.
- `src/physics/dart.ts` and any active-object physics adapter: apply canonical
  wrapping after fixed substeps and preserve velocity/facing.
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
normalized against the effective edge; the compass uses yaw/pitch and the
heading vector; telemetry uses the same canonical position shown to physics.

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
- A gameplay object crossing a face is canonicalized too.
- Objects on opposite faces still collide when their nearest-image distance is
  within the collision radius.

### HUD tests

- The HUD markup contains minimap, compass, and telemetry regions.
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
- The grid, ship, and active gameplay objects share toroidal coordinates.
- Cross-seam nearest-image collision behavior is covered by tests.
- The HUD visibly includes a gimbal compass at middle-bottom, a rudimentary
  minimap, and right-side telemetry.
- HUD panels are flat, opaque, limited to their added geometric regions, and
  use only white/cyan plus orange indicator accents.
- No galaxy backdrop is added or required.
