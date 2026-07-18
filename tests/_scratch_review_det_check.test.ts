import { describe, expect, it } from 'vitest';
import { makeObstacleField } from '../src/core/field';

describe('scratch determinism + perf check', () => {
  it('same seed -> identical field (deep equal)', () => {
    const a = makeObstacleField(1981);
    const b = makeObstacleField(1981);
    expect(a).toEqual(b);
  });

  it('boot time is reasonable', () => {
    const t0 = performance.now();
    const f = makeObstacleField(1981);
    const t1 = performance.now();
    console.log('generated', f.length, 'obstacles in', (t1 - t0).toFixed(2), 'ms');
    expect(t1 - t0).toBeLessThan(500);
  });

  it('greeter is registered before its jitter siblings are placed (no overlap with greeter)', () => {
    const f = makeObstacleField(1981);
    const greeter = f.find((o) => o.pos.x === 0 && o.pos.y === 0 && o.pos.z === 130)!;
    for (const o of f) {
      if (o === greeter) continue;
      const dx = o.pos.x - greeter.pos.x, dy = o.pos.y - greeter.pos.y, dz = o.pos.z - greeter.pos.z;
      const minDist = o.radius + greeter.radius;
      const dist2 = dx * dx + dy * dy + dz * dz;
      if (dist2 < minDist * minDist) {
        throw new Error(`obstacle overlaps greeter: dist=${Math.sqrt(dist2).toFixed(2)} < ${minDist.toFixed(2)}`);
      }
    }
  });
});
