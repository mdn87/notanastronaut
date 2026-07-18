import { describe, expect, it } from 'vitest';
import type { FlightInput } from '../src/core/flight-types';
import { DartPhysics } from '../src/physics/dart';

const FORWARD: FlightInput = { yawDelta: 0, pitchDelta: 0, forward: 1, strafe: 0 };

describe('DartPhysics', () => {
  it('wraps across the grid seam without changing its velocity', async () => {
    const dart = await DartPhysics.create({ wrapEdge: 10, accel: 160, maxSpeed: 20, linearDamping: 0 });
    try {
      for (let i = 0; i < 80 && !dart.state().wrapped; i++) dart.step(0.05, FORWARD);

      const state = dart.state();
      expect(state.wrapped).toBe(true);
      expect(state.position.z).toBeLessThan(-9);
      expect(state.velocity.z).toBeGreaterThan(0);
      expect(state.heading).toEqual({ x: 0, y: 0, z: 1 });
    } finally {
      dart.dispose();
    }
  });
});
