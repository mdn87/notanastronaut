import type { Vec3 } from './types';

const key = (x: number, y: number, z: number) => ((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class StarIndex {
  private readonly cells = new Map<number, number[]>();
  private readonly result: number[] = [];
  private ax = 0; private ay = 0; private az = 0;
  private abx = 0; private aby = 0; private abz = 0; private den = 0;
  private readonly compare = (u: number, v: number) => {
    const ut = this.segmentT(u), vt = this.segmentT(v);
    return ut - vt || this.distanceSq(u, ut) - this.distanceSq(v, vt) || u - v;
  };

  constructor(
    private readonly positions: Float32Array,
    private readonly cellSize = 32,
    private readonly spawnClear = 20,
  ) {
    for (let i = 0; i < positions.length / 3; i++) {
      const x = positions[i * 3]!, y = positions[i * 3 + 1]!, z = positions[i * 3 + 2]!;
      if (Math.hypot(x, y, z) <= spawnClear) continue;
      const k = key(Math.floor(x / cellSize), Math.floor(y / cellSize), Math.floor(z / cellSize));
      const bucket = this.cells.get(k) ?? [];
      bucket.push(i);
      this.cells.set(k, bucket);
    }
  }

  querySegment(a: Vec3, b: Vec3, radius: number): readonly number[] {
    this.ax = a.x; this.ay = a.y; this.az = a.z;
    this.abx = b.x - a.x; this.aby = b.y - a.y; this.abz = b.z - a.z;
    this.den = this.abx * this.abx + this.aby * this.aby + this.abz * this.abz;
    this.result.length = 0;
    const minX = Math.floor((Math.min(a.x, b.x) - radius) / this.cellSize);
    const maxX = Math.floor((Math.max(a.x, b.x) + radius) / this.cellSize);
    const minY = Math.floor((Math.min(a.y, b.y) - radius) / this.cellSize);
    const maxY = Math.floor((Math.max(a.y, b.y) + radius) / this.cellSize);
    const minZ = Math.floor((Math.min(a.z, b.z) - radius) / this.cellSize);
    const maxZ = Math.floor((Math.max(a.z, b.z) + radius) / this.cellSize);
    const radiusSq = radius * radius;
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) for (let z = minZ; z <= maxZ; z++) {
      const bucket = this.cells.get(key(x, y, z));
      if (!bucket) continue;
      for (const i of bucket) {
        const t = this.segmentT(i);
        if (this.distanceSq(i, t) <= radiusSq) this.result.push(i);
      }
    }
    this.result.sort(this.compare);
    return this.result;
  }

  private segmentT(i: number): number {
    if (this.den === 0) return 0;
    const o = i * 3;
    const apx = this.positions[o]! - this.ax;
    const apy = this.positions[o + 1]! - this.ay;
    const apz = this.positions[o + 2]! - this.az;
    return clamp((apx * this.abx + apy * this.aby + apz * this.abz) / this.den, 0, 1);
  }

  private distanceSq(i: number, t: number): number {
    const o = i * 3;
    const dx = this.positions[o]! - (this.ax + this.abx * t);
    const dy = this.positions[o + 1]! - (this.ay + this.aby * t);
    const dz = this.positions[o + 2]! - (this.az + this.abz * t);
    return dx * dx + dy * dy + dz * dz;
  }
}
