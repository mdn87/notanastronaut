import { describe, expect, it } from 'vitest';
import { nearestImageDeltaInto, wrapPositionInto, wrapScalar } from '../src/core/torus';

describe('wrapScalar', () => {
  it('wraps values at the torus boundaries', () => {
    expect(wrapScalar(631, 630)).toBe(-629);
    expect(wrapScalar(-631, 630)).toBe(629);
    expect(wrapScalar(630, 630)).toBe(-630);
    expect(wrapScalar(-630, 630)).toBe(-630);
  });

  it('wraps values that overshoot by multiple periods', () => {
    expect(wrapScalar(630 + 1260 + 7, 630)).toBe(-623);
    expect(wrapScalar(-630 - 1260 - 7, 630)).toBe(623);
  });
});

describe('wrapPositionInto', () => {
  it('wraps each component into the torus and reports movement', () => {
    const out = { x: 0, y: 0, z: 0 };
    expect(wrapPositionInto({ x: 631, y: -700, z: 631 }, 630, out)).toBe(true);
    expect(out).toEqual({ x: -629, y: 560, z: -629 });
  });

  it('copies an in-bounds position and reports no movement', () => {
    const out = { x: 0, y: 0, z: 0 };
    expect(wrapPositionInto({ x: 12, y: -34, z: 56 }, 630, out)).toBe(false);
    expect(out).toEqual({ x: 12, y: -34, z: 56 });
  });
});

describe('nearestImageDeltaInto', () => {
  it('writes the shortest wrapped delta into the output vector', () => {
    const out = { x: 0, y: 0, z: 0 };
    nearestImageDeltaInto({ x: 629, y: 0, z: 0 }, { x: -629, y: 0, z: 0 }, 630, out);
    expect(out).toEqual({ x: 2, y: 0, z: 0 });
  });

  it('wraps shortest deltas across the Y and Z seams', () => {
    const out = { x: 0, y: 0, z: 0 };
    nearestImageDeltaInto({ x: 0, y: 629, z: -629 }, { x: 0, y: -629, z: 629 }, 630, out);
    expect(out).toEqual({ x: 0, y: 2, z: -2 });
  });
});
