import { describe, expect, it } from 'vitest';
import { jetEase, jetSpeed } from '../src/core/ease';

const samples = Array.from({ length: 101 }, (_, i) => i / 100);

describe('jetEase', () => {
  it('pins the endpoints', () => {
    expect(jetEase(0)).toBe(0);
    expect(jetEase(1)).toBeCloseTo(1, 12);
  });

  it('matches the published polynomial 3t^4 - 8t^3 + 6t^2', () => {
    const poly = (t: number) => 3 * t ** 4 - 8 * t ** 3 + 6 * t ** 2;
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(jetEase(t)).toBeCloseTo(poly(t), 12);
    }
    expect(jetEase(0.5)).toBeCloseTo(0.6875, 12); // glides past the midpoint early
  });

  it('clamps outside [0,1]', () => {
    expect(jetEase(-2)).toBe(0);
    expect(jetEase(5)).toBeCloseTo(1, 12);
  });

  it('is strictly increasing (monotonic glide, never backwards)', () => {
    for (let i = 1; i < samples.length; i++) {
      expect(jetEase(samples[i]!)).toBeGreaterThan(jetEase(samples[i - 1]!));
    }
  });

  it('ignites slowly and glides to a stop — near-zero velocity at both ends', () => {
    const e = 1e-4;
    const vStart = (jetEase(e) - jetEase(0)) / e;
    const vEnd = (jetEase(1) - jetEase(1 - e)) / e;
    expect(vStart).toBeLessThan(0.05);   // barely moving at ignition
    expect(vEnd).toBeLessThan(0.05);     // gliding to a soft stop
  });
});

describe('jetSpeed', () => {
  it('is zero at rest at both ends', () => {
    expect(jetSpeed(0)).toBe(0);
    expect(jetSpeed(1)).toBeCloseTo(0, 12);
  });

  it('never exceeds 1 and peaks during the early burn (t=1/3)', () => {
    let peakT = 0, peakV = -1;
    for (const t of samples) {
      const v = jetSpeed(t);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
      expect(v).toBeGreaterThanOrEqual(0);
      if (v > peakV) { peakV = v; peakT = t; }
    }
    expect(jetSpeed(1 / 3)).toBeCloseTo(1, 12); // analytic peak is exactly 1
    expect(peakV).toBeGreaterThan(0.99);        // discrete grid lands just below
    expect(peakT).toBeGreaterThan(0.25);
    expect(peakT).toBeLessThan(0.42);
  });
});
