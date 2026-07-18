import { describe, expect, it } from 'vitest';
import type { FlightInput } from '../src/core/flight-types';
import { DartPhysics } from '../src/physics/dart';

const FORWARD: FlightInput = { yawDelta: 0, pitchDelta: 0, forward: 1, strafe: 0 };
const IDLE: FlightInput = { yawDelta: 0, pitchDelta: 0, forward: 0, strafe: 0 };

describe('DartPhysics', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid wrap edge %p', async (wrapEdge) => {
    await expect(DartPhysics.create({ wrapEdge })).rejects.toThrow(/wrapEdge must be a finite positive number/);
  });

  it('wraps across the grid seam without changing its velocity', async () => {
    const dart = await DartPhysics.create({ wrapEdge: 10, accel: 160, maxSpeed: 20, linearDamping: 0 });
    try {
      let preWrapVelocity: { x: number; y: number; z: number } | undefined;
      for (let i = 0; i < 80; i++) {
        const state = dart.state();
        if (state.position.z > 9) {
          preWrapVelocity = state.velocity;
          dart.step(0.05, IDLE);
          break;
        }
        dart.step(0.05, FORWARD);
      }

      if (!preWrapVelocity) throw new Error('dart did not approach the wrap seam');

      const state = dart.state();
      expect(state.wrapped).toBe(true);
      expect(state.position.z).toBeLessThan(-9);
      expect(state.velocity.z).toBeGreaterThan(0);
      expect(state.velocity.x).toBeCloseTo(preWrapVelocity.x, 12);
      expect(state.velocity.y).toBeCloseTo(preWrapVelocity.y, 12);
      expect(state.velocity.z).toBeCloseTo(preWrapVelocity.z, 12);
      expect(state.heading).toEqual({ x: 0, y: 0, z: 1 });
    } finally {
      dart.dispose();
    }
  });
});
