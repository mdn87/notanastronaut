import type { NodeDef, Vec3 } from './types';
import { FlightPath } from './path';

export interface RailPath {
  readonly points: ReadonlyArray<Vec3>;
  readonly nodeParams: ReadonlyArray<number>;
  sampleProgress(progress: number): Vec3;
  progressToParam(progress: number): number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function makeRailPath(nodes: NodeDef[]): RailPath {
  const nodeCount = nodes.length;
  if (nodeCount < 2) throw new Error('makeRailPath needs >= 2 nodes');
  const pathPoints: Vec3[] = [];
  const nodePointIndexes: number[] = [];

  for (let i = 0; i < nodeCount; i++) {
    nodePointIndexes.push(pathPoints.length);
    pathPoints.push({ ...nodes[i]!.pos });
    if (i < nodeCount - 1) {
      const a = nodes[i]!.pos;
      const b = nodes[i + 1]!.pos;
      const side = i % 2 === 0 ? 1 : -1;
      pathPoints.push({
        x: (a.x + b.x) / 2 + side * 9,
        y: (a.y + b.y) / 2 + side * 4,
        z: (a.z + b.z) / 2,
      });
    }
  }

  const path = new FlightPath(pathPoints);
  const maxPointIndex = pathPoints.length - 1;
  const pathNodeParams = nodePointIndexes.map((i) => i / maxPointIndex);
  const points = Object.freeze(pathPoints.map((p) => Object.freeze({ ...p })));
  const nodeParams = Object.freeze([...pathNodeParams]);

  const progressToParam = (progress: number): number => {
    const maxProgress = nodeCount - 1;
    const p = Number.isFinite(progress) ? clamp(progress, 0, maxProgress) : 0;
    const lo = Math.floor(p);
    const hi = Math.ceil(p);
    if (lo === hi) return pathNodeParams[lo]!;
    const local = p - lo;
    return pathNodeParams[lo]! + (pathNodeParams[hi]! - pathNodeParams[lo]!) * local;
  };

  return {
    points,
    nodeParams,
    progressToParam,
    sampleProgress(progress: number): Vec3 {
      return path.sample(progressToParam(progress));
    },
  };
}
