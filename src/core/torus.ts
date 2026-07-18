import type { Vec3 } from './types';

export function wrapScalar(value: number, edge: number): number {
  if (!(edge > 0)) throw new Error('torus edge must be positive');
  const period = edge * 2;
  return ((value + edge) % period + period) % period - edge;
}

export function wrapPositionInto(position: Vec3, edge: number, out: Vec3): boolean {
  const x = wrapScalar(position.x, edge);
  const y = wrapScalar(position.y, edge);
  const z = wrapScalar(position.z, edge);
  out.x = x; out.y = y; out.z = z;
  return x !== position.x || y !== position.y || z !== position.z;
}

export function nearestImageDeltaInto(from: Vec3, to: Vec3, edge: number, out: Vec3): void {
  out.x = wrapScalar(to.x - from.x, edge);
  out.y = wrapScalar(to.y - from.y, edge);
  out.z = wrapScalar(to.z - from.z, edge);
}
