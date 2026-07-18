import { describe, expect, it } from 'vitest';
import { makeDotGrid, makeGridLines, GRID_MAX_POINTS, GRID_MAX_LINES } from '../src/core/grid';

describe('makeDotGrid', () => {
  it('builds a cubic lattice of (2n+1)^3 points on the spacing', () => {
    const g = makeDotGrid({ spacing: 50, extent: 100 }); // n = 2 -> 5^3 = 125
    expect(g).toBeInstanceOf(Float32Array);
    expect(g.length).toBe(125 * 3);
    for (let i = 0; i < g.length; i++) {
      expect(Number.isFinite(g[i]!)).toBe(true);
      expect(Math.abs(g[i]!)).toBeLessThanOrEqual(100);
      expect(Number.isInteger(g[i]! / 50)).toBe(true); // multiple of spacing (-0-safe)
    }
  });

  it('is deterministic', () => {
    expect(Array.from(makeDotGrid({ spacing: 40, extent: 80 })))
      .toEqual(Array.from(makeDotGrid({ spacing: 40, extent: 80 })));
  });

  it('refuses a lattice denser than the cap', () => {
    expect(() => makeDotGrid({ spacing: 1, extent: 1000 })).toThrow(/too dense/);
    const defaults = makeDotGrid();
    expect(defaults.length / 3).toBeLessThanOrEqual(GRID_MAX_POINTS);
  });
});

describe('makeGridLines', () => {
  it('emits line-segment pairs (6 floats each) along all three axes, within extent', () => {
    const g = makeGridLines({ spacing: 50, extent: 100 }); // n=2 -> ticks 5 -> 3*25 = 75 lines
    expect(g).toBeInstanceOf(Float32Array);
    expect(g.length).toBe(75 * 6);
    for (const v of g) { expect(Number.isFinite(v)).toBe(true); expect(Math.abs(v)).toBeLessThanOrEqual(100); }
  });

  it('is deterministic and stays under the line cap', () => {
    expect(Array.from(makeGridLines({ spacing: 90, extent: 700 })))
      .toEqual(Array.from(makeGridLines({ spacing: 90, extent: 700 })));
    expect(makeGridLines().length / 6).toBeLessThanOrEqual(GRID_MAX_LINES);
    expect(() => makeGridLines({ spacing: 1, extent: 1000 })).toThrow(/too dense/);
  });
});
