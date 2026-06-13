import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/rng';
import { makeBodies } from '../src/core/parallax';

function makeBodiesInChild(opts: string): { mid: number; far: number } {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      `
        import { makeBodies } from './src/core/parallax.ts';
        const f = makeBodies(42, ${opts});
        console.log(JSON.stringify({ mid: f.mid.length, far: f.far.length }));
      `,
    ],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 3000 },
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout) as { mid: number; far: number };
}

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = mulberry32(7), b = mulberry32(7), c = mulberry32(8);
    const seqA = [a(), a(), a()], seqB = [b(), b(), b()], seqC = [c(), c(), c()];
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });
});

describe('parallax field', () => {
  it('same seed -> identical field; different seed -> different', () => {
    const f1 = makeBodies(42), f2 = makeBodies(42), f3 = makeBodies(43);
    expect(f1).toEqual(f2);
    expect(JSON.stringify(f1)).not.toEqual(JSON.stringify(f3));
  });

  it('produces the configured counts within bounds', () => {
    const f = makeBodies(42, { midCount: 30, farCount: 80 });
    expect(f.mid).toHaveLength(30);
    expect(f.far).toHaveLength(80);
    for (const b of [...f.mid, ...f.far]) {
      expect(b.pos.z).toBeGreaterThanOrEqual(-30);
      expect(b.pos.z).toBeLessThanOrEqual(176);
      expect(Math.abs(b.pos.x)).toBeLessThanOrEqual(80);
      expect(Math.abs(b.pos.y)).toBeLessThanOrEqual(40);
    }
  });

  it('keeps a clear corridor near the flight axis', () => {
    const f = makeBodies(1);
    for (const b of f.mid) {
      expect(Math.hypot(b.pos.x, b.pos.y)).toBeGreaterThanOrEqual(12);
    }
  });

  it('floors fractional counts', () => {
    const f = makeBodies(42, { midCount: 2.9, farCount: 3.9 });
    expect(f.mid).toHaveLength(2);
    expect(f.far).toHaveLength(3);
  });

  it('clamps negative counts to zero', () => {
    const f = makeBodies(42, { midCount: -1, farCount: -2 });
    expect(f.mid).toHaveLength(0);
    expect(f.far).toHaveLength(0);
  });

  it('falls back to defaults for non-finite counts', () => {
    const f = makeBodiesInChild('{ midCount: Number.POSITIVE_INFINITY, farCount: Number.NaN }');
    expect(f.mid).toBe(24);
    expect(f.far).toBe(60);
  });

  it('caps very large counts', () => {
    const f = makeBodies(42, { midCount: 501, farCount: 501 });
    expect(f.mid).toHaveLength(500);
    expect(f.far).toHaveLength(500);
  });
});
