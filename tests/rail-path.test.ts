import { describe, expect, it } from 'vitest';
import { NODES } from '../src/content/nodes';
import { makeRailPath } from '../src/core/rail-path';

describe('makeRailPath', () => {
  it('maps every integer progress value to its node position', () => {
    const rail = makeRailPath(NODES);
    NODES.forEach((node, i) => {
      expect(rail.sampleProgress(i)).toEqual(node.pos);
    });
  });

  it('creates authored control points between nodes', () => {
    const rail = makeRailPath(NODES);
    expect(rail.points.length).toBeGreaterThan(NODES.length);
    expect(rail.nodeParams).toHaveLength(NODES.length);
    for (let i = 1; i < rail.nodeParams.length; i++) {
      expect(rail.nodeParams[i]).toBeGreaterThan(rail.nodeParams[i - 1]!);
    }
  });

  it('clamps overview progress to first rail sample for flythrough path sampling', () => {
    const rail = makeRailPath(NODES);
    expect(rail.sampleProgress(-1)).toEqual(NODES[0]!.pos);
  });

  it('handles non-finite progress deterministically', () => {
    const rail = makeRailPath(NODES);
    expect(rail.sampleProgress(Number.NaN)).toEqual(NODES[0]!.pos);
    expect(rail.progressToParam(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('exposes immutable snapshots that cannot change sampling behavior', () => {
    const rail = makeRailPath(NODES);
    const before = rail.sampleProgress(0.5);
    expect(() => ((rail.nodeParams as unknown as number[])[1] = 999)).toThrow();
    expect(() => ((rail.points as unknown as { x: number }[])[0]!.x = 999)).toThrow();
    expect(rail.sampleProgress(0.5)).toEqual(before);
  });

  it('does not change when the source node array is mutated after construction', () => {
    const nodes = NODES.map((n) => ({ ...n, pos: { ...n.pos } }));
    const rail = makeRailPath(nodes);
    const before = rail.sampleProgress(1);
    nodes.length = 0;
    expect(rail.progressToParam(1)).toBe(rail.nodeParams[1]);
    expect(rail.sampleProgress(1)).toEqual(before);
  });

  it('places between-node samples away from the straight midpoint', () => {
    const rail = makeRailPath(NODES);
    const sample = rail.sampleProgress(0.5);
    const a = NODES[0]!.pos;
    const b = NODES[1]!.pos;
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    expect(Math.hypot(sample.x - midpoint.x, sample.y - midpoint.y)).toBeGreaterThan(1);
  });
});
