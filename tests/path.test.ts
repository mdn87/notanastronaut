import { describe, expect, it } from 'vitest';
import { NODES } from '../src/content/nodes';
import { FlightPath, nodeParam } from '../src/core/path';

const path = new FlightPath(NODES.map((n) => n.pos));

describe('FlightPath', () => {
  it('requires at least two points', () => {
    expect(() => new FlightPath([])).toThrow('FlightPath needs >= 2 points');
    expect(() => new FlightPath([{ x: 0, y: 0, z: 0 }])).toThrow('FlightPath needs >= 2 points');
  });

  it('passes through every node at its knot parameter', () => {
    NODES.forEach((n, i) => {
      const p = path.sample(nodeParam(i, NODES.length));
      expect(p.x).toBeCloseTo(n.pos.x, 6);
      expect(p.y).toBeCloseTo(n.pos.y, 6);
      expect(p.z).toBeCloseTo(n.pos.z, 6);
    });
  });

  it('is continuous (no jumps between fine samples)', () => {
    let prev = path.sample(0);
    for (let s = 1; s <= 1000; s++) {
      const p = path.sample(s / 1000);
      const d = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
      expect(d).toBeLessThan(1.0); // total length ~150 units / 1000 samples
      prev = p;
    }
  });

  it('clamps out-of-range params', () => {
    expect(path.sample(-0.5)).toEqual(path.sample(0));
    expect(path.sample(1.5)).toEqual(path.sample(1));
  });

  it('does not change when constructor inputs are mutated later', () => {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 10, z: 0 },
      { x: 10, y: 10, z: 0 },
      { x: 10, y: 0, z: 0 },
    ];
    const localPath = new FlightPath(points);
    const before = localPath.sample(0.5);

    points[1]!.y = 1000;
    points[2]!.x = -1000;
    points.splice(1, 2);

    expect(() => localPath.sample(0.5)).not.toThrow();
    expect(localPath.sample(0.5)).toEqual(before);
  });

  it('uses curved Catmull-Rom interpolation between interior knots', () => {
    const localPath = new FlightPath([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
    ]);

    const p = localPath.sample(0.5);
    expect(p.x).toBeCloseTo(1.5, 6);
    expect(p.y).toBeCloseTo(0.5625, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });
});
