import { describe, expect, it } from 'vitest';
import type { SpiralField } from '../src/core/galaxy';
import type { ActiveStarSnapshot } from '../src/physics/star-collisions';
import { syncActiveStarBuffers, type ActiveStarBufferState } from '../src/world/scene';

const field: SpiralField = {
  positions: new Float32Array([4, 5, 6]),
  sizes: new Float32Array([2]),
  alphas: new Float32Array([0.45]),
  colors: new Float32Array([0.2, 0.6, 0.8]),
  collisionRadii: new Float32Array([1.5]),
  masses: new Float32Array([1]),
  count: 1,
};

const state = (capacity = 1): ActiveStarBufferState => ({
  indices: new Int32Array(capacity).fill(-1),
  positions: new Float32Array(capacity * 3),
  sizes: new Float32Array(capacity),
  alphas: new Float32Array(capacity),
  colors: new Float32Array(capacity * 3),
  displayAlphas: field.alphas.slice(),
  baseChanged: false,
});

describe('active star display buffers', () => {
  it('keeps active alpha across frames while hiding and restoring only the base display', () => {
    const buffers = state();
    const active: ActiveStarSnapshot = {
      starIndices: new Int32Array([0]),
      positions: new Float32Array([4, 5, 6]),
      alphas: new Float32Array([field.alphas[0]!]),
      hitCount: 0,
    };

    expect(syncActiveStarBuffers(active, field, field.alphas, buffers)).toBe(1);
    expect(field.alphas[0]).toBeCloseTo(0.45);
    expect(buffers.displayAlphas[0]).toBe(0);
    expect(buffers.alphas[0]).toBeCloseTo(0.45);

    active.alphas[0] = field.alphas[0]!;
    expect(syncActiveStarBuffers(active, field, field.alphas, buffers)).toBe(1);
    expect(buffers.alphas[0]).toBeCloseTo(0.45);
    expect(buffers.displayAlphas[0]).toBe(0);

    active.starIndices[0] = -1;
    expect(syncActiveStarBuffers(active, field, field.alphas, buffers)).toBe(0);
    expect(buffers.displayAlphas[0]).toBeCloseTo(0.45);
    expect(field.alphas[0]).toBeCloseTo(0.45);
  });

  it('keeps a base star hidden when its active slot changes', () => {
    const buffers = state(2);
    const active: ActiveStarSnapshot = {
      starIndices: new Int32Array([-1, 0]),
      positions: new Float32Array([0, 0, 0, 4, 5, 6]),
      alphas: new Float32Array([0, field.alphas[0]!]),
      hitCount: 0,
    };
    syncActiveStarBuffers(active, field, field.alphas, buffers);
    expect(buffers.displayAlphas[0]).toBe(0);

    active.starIndices[0] = 0;
    active.starIndices[1] = -1;
    active.alphas[0] = field.alphas[0]!;
    active.alphas[1] = 0;
    syncActiveStarBuffers(active, field, field.alphas, buffers);
    expect(buffers.displayAlphas[0]).toBe(0);
    expect(buffers.alphas[0]).toBeCloseTo(0.45);
    expect(field.alphas[0]).toBeCloseTo(0.45);

    active.starIndices[0] = -1;
    active.alphas[0] = 0;
    syncActiveStarBuffers(active, field, field.alphas, buffers);
    expect(buffers.displayAlphas[0]).toBeCloseTo(0.45);
    expect(field.alphas[0]).toBeCloseTo(0.45);
  });
});
