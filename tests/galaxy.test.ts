// tests/galaxy.test.ts
import { describe, expect, it } from 'vitest';
import { makeSpiralGalaxy, paintStarColors, GALAXY_MAX_POINTS, starMass } from '../src/core/galaxy';
import { THEMES } from '../src/core/theme';

describe('makeSpiralGalaxy', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = makeSpiralGalaxy(7), b = makeSpiralGalaxy(7), c = makeSpiralGalaxy(8);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.positions)).not.toEqual(Array.from(c.positions));
  });

  it('returns parallel typed arrays of the requested count', () => {
    const f = makeSpiralGalaxy(1, { count: 5000 });
    expect(f.count).toBe(5000);
    expect(f.positions.length).toBe(5000 * 3);
    expect(f.sizes.length).toBe(5000);
    expect(f.alphas.length).toBe(5000);
    expect(f.colors.length).toBe(5000 * 3);
  });

  it('returns deterministic collision radius and mass arrays parallel to the stars', () => {
    const a = makeSpiralGalaxy(1981, { count: 1000 });
    const b = makeSpiralGalaxy(1981, { count: 1000 });
    expect(a.collisionRadii).toHaveLength(a.count);
    expect(a.masses).toHaveLength(a.count);
    expect(Array.from(a.collisionRadii)).toEqual(Array.from(b.collisionRadii));
    expect(Array.from(a.masses)).toEqual(Array.from(b.masses));
    for (let i = 0; i < a.count; i++) {
      expect(a.collisionRadii[i]).toBeGreaterThanOrEqual(1.2);
      expect(a.collisionRadii[i]).toBeLessThanOrEqual(3.2);
      expect(a.masses[i]).toBeGreaterThanOrEqual(0.1);
      expect(a.masses[i]).toBeLessThanOrEqual(8);
    }
  });

  it('makes darker stars denser at equal visual size', () => {
    expect(starMass(2, 1)).toBeGreaterThan(starMass(2, 0));
    expect(starMass(3, 0.5)).toBeGreaterThan(starMass(1, 0.5));
    expect(starMass(1, 1)).toBeGreaterThan(1);
  });

  it('produces a flat disk (thin in y) spanning a wide radius — a galaxy, not a ball', () => {
    const f = makeSpiralGalaxy(2026, { count: 8000, radius: 200, thickness: 10 });
    let maxR = 0, minR = Infinity, maxY = 0;
    for (let i = 0; i < f.count; i++) {
      const x = f.positions[i * 3]!, y = f.positions[i * 3 + 1]!, z = f.positions[i * 3 + 2]!;
      const r = Math.hypot(x, z);
      maxR = Math.max(maxR, r); minR = Math.min(minR, r); maxY = Math.max(maxY, Math.abs(y));
    }
    expect(maxR).toBeGreaterThan(120);   // arms reach out
    expect(minR).toBeLessThan(20);       // dense core near center
    expect(maxY).toBeLessThan(maxR * 0.4); // clearly flattened in y
  });

  it('keeps all outputs finite and clamps to the point cap', () => {
    const f = makeSpiralGalaxy(3, { count: 999999 });
    expect(f.count).toBe(GALAXY_MAX_POINTS);
    for (const v of f.positions) expect(Number.isFinite(v)).toBe(true);
    for (const a of f.alphas) { expect(a).toBeGreaterThan(0); expect(a).toBeLessThanOrEqual(1); }
  });
});

describe('paintStarColors / mixes', () => {
  it('exposes per-point mixes in [0,1]; colors are exactly the light paint of mixes', () => {
    const f = makeSpiralGalaxy(7, { count: 4000 });
    expect(f.mixes.length).toBe(4000);
    for (const m of f.mixes) { expect(m).toBeGreaterThanOrEqual(0); expect(m).toBeLessThanOrEqual(1); }
    const repaint = paintStarColors(f.mixes, THEMES.light.starArm, THEMES.light.starCore);
    expect(Array.from(f.colors)).toEqual(Array.from(repaint));
  });

  it('paintStarColors endpoints: mix 0 -> arm, mix 1 -> core; 0.5 between', () => {
    const arm = { r: 0.1, g: 0.2, b: 0.3 }, core = { r: 0.9, g: 0.8, b: 0.7 };
    const out = paintStarColors(new Float32Array([0, 1, 0.5]), arm, core);
    expect(out[0]).toBeCloseTo(0.1, 6); expect(out[1]).toBeCloseTo(0.2, 6); expect(out[2]).toBeCloseTo(0.3, 6);
    expect(out[3]).toBeCloseTo(0.9, 6); expect(out[4]).toBeCloseTo(0.8, 6); expect(out[5]).toBeCloseTo(0.7, 6);
    expect(out[6]).toBeCloseTo(0.5, 6); expect(out[7]).toBeCloseTo(0.5, 6); expect(out[8]).toBeCloseTo(0.5, 6);
  });
});
