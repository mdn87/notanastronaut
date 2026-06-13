import type { Vec3 } from './types';

/** Knot parameter for node i of n on the unit interval. */
export function nodeParam(i: number, n: number): number {
  return n <= 1 ? 0 : i / (n - 1);
}

/**
 * Uniform Catmull-Rom spline through the node positions, endpoints clamped
 * by duplicating the first/last points. sample(0)=first node, sample(1)=last.
 * Dependency-free on purpose: the core must not import three.js.
 */
export class FlightPath {
  private readonly pts: Vec3[];

  constructor(points: Vec3[]) {
    if (points.length < 2) throw new Error('FlightPath needs >= 2 points');
    this.pts = points.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  }

  sample(u: number): Vec3 {
    const n = this.pts.length;
    const t = Math.min(1, Math.max(0, u)) * (n - 1);
    const seg = Math.min(n - 2, Math.floor(t));
    const lt = t - seg;
    const p0 = this.pts[Math.max(0, seg - 1)]!;
    const p1 = this.pts[seg]!;
    const p2 = this.pts[seg + 1]!;
    const p3 = this.pts[Math.min(n - 1, seg + 2)]!;
    return {
      x: cr(p0.x, p1.x, p2.x, p3.x, lt),
      y: cr(p0.y, p1.y, p2.y, p3.y, lt),
      z: cr(p0.z, p1.z, p2.z, p3.z, lt),
    };
  }
}

function cr(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (
    2 * p1 + (p2 - p0) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (3 * p1 - p0 - 3 * p2 + p3) * t3
  );
}
