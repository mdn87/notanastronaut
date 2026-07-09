import { describe, expect, it } from 'vitest';
import { StarIndex } from '../src/core/star-index';

const positions = new Float32Array([
  0, 0, 0,
  2, 0, 12,
  5, 0, 12,
  0, 0, 30,
  20, 0, 12,
]);

describe('StarIndex', () => {
  it('queries a swept segment in deterministic distance/index order', () => {
    const index = new StarIndex(positions, 8, 4);
    expect(index.querySegment(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 20 },
      6,
    )).toEqual([1, 2]);
  });

  it('does not return stars inside the spawn-clear bubble', () => {
    const index = new StarIndex(positions, 8, 4);
    expect(index.querySegment(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 2 },
      4,
    )).toEqual([]);
  });

  it('does not return a far star outside the swept capsule', () => {
    const index = new StarIndex(positions, 8, 4);
    expect(index.querySegment(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 20 },
      3,
    )).toEqual([1]);
  });
});
