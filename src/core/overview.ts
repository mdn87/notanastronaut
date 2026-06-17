import type { Vec3 } from './types';

export interface CameraPose { eye: Vec3; look: Vec3; }

export interface OverviewOpts {
  fovDeg: number;     // camera vertical field of view
  aspect: number;     // viewport width / height
  margin?: number;    // breathing room multiplier on the fit distance
  minRadius?: number; // floor for the bounding radius (tiny clusters)
  /** View direction from the framed centre toward the eye (need not be unit). */
  dir?: Vec3;
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const norm = (a: Vec3): Vec3 => { const l = len(a) || 1; return scale(a, 1 / l); };

/**
 * Compute an overhead camera pose that frames every node. The eye sits along
 * `dir` from the constellation centroid, far enough back that the bounding
 * sphere fits inside the smaller of the vertical / horizontal half-FOV.
 * Pure and three.js-free so the framing can be unit-tested.
 */
export function overviewPose(positions: Vec3[], radii: number[], opts: OverviewOpts): CameraPose {
  if (positions.length === 0) throw new Error('overviewPose needs at least one position');
  const margin = opts.margin ?? 1.15;
  const dir = norm(opts.dir ?? { x: 0, y: 1, z: -0.15 });

  const centroid = scale(
    positions.reduce((acc, p) => add(acc, p), { x: 0, y: 0, z: 0 }),
    1 / positions.length,
  );

  let radius = opts.minRadius ?? 0;
  positions.forEach((p, i) => {
    radius = Math.max(radius, len(sub(p, centroid)) + (radii[i] ?? 0));
  });

  const vHalf = (opts.fovDeg * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * opts.aspect);
  const halfFov = Math.min(vHalf, hHalf);
  const distance = (radius / Math.sin(halfFov)) * margin;

  return { eye: add(centroid, scale(dir, distance)), look: centroid };
}
