import { describe, expect, it } from 'vitest';
import { makeObstacleField, densityColor, obstacleMass } from '../src/core/field';

const sum = (c: { r: number; g: number; b: number }) => c.r + c.g + c.b;

describe('obstacleMass(...)', () => {
  it('mass factor stays within the clamp range', () => {
    const f = makeObstacleField(7, { extent: 180, spacing: 90, massClampLo: 0.1, massClampHi: 8 });
    for (const o of f) {
      expect(o.mass).toBeGreaterThanOrEqual(0.1);
      expect(o.mass).toBeLessThanOrEqual(8);
    }
  });

  it('mass: a small super-dense core out-masses the ship and a large light object', () => {
    const smallDense = obstacleMass(2, 15);
    const bigLight = obstacleMass(9, 0.2);
    expect(smallDense).toBeGreaterThan(1);          // heavier than the ship (mass 1)
    expect(smallDense).toBeGreaterThan(bigLight);   // density can dominate size
  });

  it('mass: both size and density raise it; extremes are heaviest/lightest', () => {
    expect(obstacleMass(9, 15)).toBeGreaterThan(obstacleMass(2, 15));  // bigger -> heavier (same density)
    expect(obstacleMass(9, 15)).toBeGreaterThan(obstacleMass(9, 0.2)); // denser -> heavier (same size)
    const corners = [obstacleMass(2, 0.2), obstacleMass(2, 15), obstacleMass(9, 0.2), obstacleMass(9, 15)];
    expect(Math.max(...corners)).toBe(obstacleMass(9, 15));
    expect(Math.min(...corners)).toBe(obstacleMass(2, 0.2));
  });

  it('mass stays within the clamp range across the field', () => {
    for (const o of makeObstacleField(7, { extent: 180, spacing: 90 })) {
      expect(o.mass).toBeGreaterThanOrEqual(0.1);
      expect(o.mass).toBeLessThanOrEqual(8);
    }
  });
});

describe('densityColor(...)', () => {
  it('densityColor is monotonic: denser is darker', () => {
    expect(sum(densityColor(15))).toBeLessThan(sum(densityColor(0.2)));
    // mid density sits between the extremes
    const mid = sum(densityColor(7.5));
    expect(mid).toBeLessThan(sum(densityColor(0.2)));
    expect(mid).toBeGreaterThan(sum(densityColor(15)));
  });
});

describe('obstacle field (clustered, seeded)', () => {
  const F = () => makeObstacleField(1981); // defaults: clustered, ~1500

  it('generates a dense field within the cap', () => {
    const f = F();
    expect(f.length).toBeGreaterThan(800);
    expect(f.length).toBeLessThanOrEqual(2000); // maxObstacles
  });

  it('keeps the spawn bubble clear and stays within extent', () => {
    for (const o of F()) {
      expect(Math.hypot(o.pos.x, o.pos.y, o.pos.z)).toBeGreaterThan(40 - 1e-6); // spawnClear
      for (const c of [o.pos.x, o.pos.y, o.pos.z]) expect(Math.abs(c)).toBeLessThanOrEqual(630 + 1e-6);
    }
  });

  it('places a greeter obstacle exactly on the +z spawn path', () => {
    expect(F().some((o) => o.pos.x === 0 && o.pos.y === 0 && o.pos.z === 130)).toBe(true);
  });

  it('masses stay within the clamp range', () => {
    for (const o of F()) {
      expect(o.mass).toBeGreaterThanOrEqual(0.1);
      expect(o.mass).toBeLessThanOrEqual(8);
    }
  });

  it('is deterministic for a seed, and varies by seed', () => {
    expect(makeObstacleField(42)).toEqual(makeObstacleField(42));
    expect(makeObstacleField(1)).not.toEqual(makeObstacleField(2));
  });
});
