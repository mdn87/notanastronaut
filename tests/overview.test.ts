import { describe, expect, it } from 'vitest';
import { overviewPose } from '../src/core/overview';
import type { Vec3 } from '../src/core/types';

const NODES: Vec3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 14, y: 2, z: 28 },
  { x: -12, y: -3, z: 58 },
  { x: 10, y: 4, z: 88 },
  { x: -8, y: -2, z: 118 },
  { x: 0, y: 0, z: 146 },
];
const RADII = NODES.map(() => 2.4);

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** Half-angle (radians) between the view axis and the ray to a point. */
function angleOff(pose: { eye: Vec3; look: Vec3 }, p: Vec3): number {
  const axis = sub(pose.look, pose.eye);
  const ray = sub(p, pose.eye);
  const cos = dot(axis, ray) / (len(axis) * len(ray));
  return Math.acos(Math.min(1, Math.max(-1, cos)));
}

describe('overviewPose', () => {
  it('looks at the centroid from above', () => {
    const pose = overviewPose(NODES, RADII, { fovDeg: 55, aspect: 16 / 9 });
    expect(pose.look.x).toBeCloseTo(4 / 6);
    expect(pose.look.y).toBeCloseTo(1 / 6);
    expect(pose.look.z).toBeCloseTo(73);
    expect(pose.eye.y).toBeGreaterThan(0); // lifted overhead
  });

  it('frames every node inside the limiting half-FOV', () => {
    for (const aspect of [16 / 9, 1, 9 / 16]) {
      const pose = overviewPose(NODES, RADII, { fovDeg: 55, aspect });
      const vHalf = (55 * Math.PI) / 360;
      const hHalf = Math.atan(Math.tan(vHalf) * aspect);
      const limit = Math.min(vHalf, hHalf);
      for (const n of NODES) {
        expect(angleOff(pose, n)).toBeLessThanOrEqual(limit + 1e-9);
      }
    }
  });

  it('pulls back farther for a wider spread', () => {
    const near = overviewPose(NODES, RADII, { fovDeg: 55, aspect: 1 });
    const wide = overviewPose(NODES.map((p) => ({ x: p.x * 3, y: p.y * 3, z: p.z * 3 })), RADII, { fovDeg: 55, aspect: 1 });
    expect(len(sub(wide.eye, wide.look))).toBeGreaterThan(len(sub(near.eye, near.look)));
  });

  it('throws on an empty constellation', () => {
    expect(() => overviewPose([], [], { fovDeg: 55, aspect: 1 })).toThrow();
  });
});
