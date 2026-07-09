import type { Vec3 } from './types';
import { mulberry32 } from './rng';

export interface Rgb { r: number; g: number; b: number }

export interface ObstacleSpec { pos: Vec3; radius: number; density: number; mass: number; color: Rgb }

export interface FieldOpts {
  extent?: number; spacing?: number; spawnClear?: number;
  minRadius?: number; maxRadius?: number;
  minDensity?: number; maxDensity?: number;
  sizeMassLo?: number; sizeMassHi?: number;
  densMassLo?: number; densMassHi?: number;
  massClampLo?: number; massClampHi?: number;
  clusterCount?: number; perClusterMin?: number; perClusterMax?: number; clusterRadius?: number;
  greeterZ?: number; greeterRadius?: number; maxObstacles?: number;
}

// Low density -> light cyan; high density -> near-black. Denser = darker.
const LIGHT: Rgb = { r: 0x7f / 255, g: 0xc9 / 255, b: 0xe0 / 255 };
const DARK: Rgb = { r: 0x0a / 255, g: 0x14 / 255, b: 0x1e / 255 };

/** Denser -> darker. Monotonic lerp from LIGHT (minD) to DARK (maxD). */
export function densityColor(density: number, minD = 0.2, maxD = 15): Rgb {
  const t = Math.max(0, Math.min(1, (density - minD) / (maxD - minD)));
  return {
    r: LIGHT.r + (DARK.r - LIGHT.r) * t,
    g: LIGHT.g + (DARK.g - LIGHT.g) * t,
    b: LIGHT.b + (DARK.b - LIGHT.b) * t,
  };
}

/**
 * Mass of an obstacle as a product of two normalized factors (size and density),
 * clamped to [massClampLo, massClampHi]. Density gets a wider multiplicative
 * range so a small super-dense "core" can out-mass a large light object.
 *
 * Defaults: small+dense (0.7·4.0=2.8) > ship (1) > big+light (1.6·0.4=0.64).
 */
export function obstacleMass(radius: number, density: number, opts: FieldOpts = {}): number {
  const rMin = opts.minRadius ?? 2, rMax = opts.maxRadius ?? 9;
  const dMin = opts.minDensity ?? 0.2, dMax = opts.maxDensity ?? 15;
  const sLo = opts.sizeMassLo ?? 0.7, sHi = opts.sizeMassHi ?? 1.6;   // size's pull on mass
  const dfLo = opts.densMassLo ?? 0.4, dfHi = opts.densMassHi ?? 4.0;  // density's pull (wider -> can dominate)
  const kLo = opts.massClampLo ?? 0.1, kHi = opts.massClampHi ?? 8;
  const sizeT = (radius - rMin) / (rMax - rMin);    // 0..1 across the size range
  const densT = (density - dMin) / (dMax - dMin);   // 0..1 across the density range
  const sizeFactor = sLo + (sHi - sLo) * sizeT;
  const densFactor = dfLo + (dfHi - dfLo) * densT;
  return Math.max(kLo, Math.min(kHi, sizeFactor * densFactor));
}

/**
 * Deterministic free-floating clumps filling the grid volume, plus a guaranteed
 * "greeter" clump on the +z spawn path so obstacles are found immediately (and the
 * collision e2e is deterministic). The spawn bubble is kept clear. Seeded; capped.
 */
export function makeObstacleField(seed: number, opts: FieldOpts = {}): ObstacleSpec[] {
  const extent = opts.extent ?? 630;
  const spawnClear = opts.spawnClear ?? 40;
  const rMin = opts.minRadius ?? 2, rMax = opts.maxRadius ?? 9;
  const dMin = opts.minDensity ?? 0.2, dMax = opts.maxDensity ?? 15;
  const clusterCount = opts.clusterCount ?? 210;
  const perMin = opts.perClusterMin ?? 5, perMax = opts.perClusterMax ?? 9;
  const clusterRadius = opts.clusterRadius ?? 55;
  const greeterZ = opts.greeterZ ?? 130;
  const greeterRadius = opts.greeterRadius ?? 70;
  const maxObstacles = opts.maxObstacles ?? 2000;

  const rnd = mulberry32(seed);
  const gauss = () => { // Box–Muller (matches galaxy.ts)
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const clampAxis = (x: number) => Math.max(-extent, Math.min(extent, x));

  const out: ObstacleSpec[] = [];
  const spec = (pos: Vec3, radius: number, density: number): ObstacleSpec =>
    ({ pos, radius, density, mass: obstacleMass(radius, density, opts), color: densityColor(density, dMin, dMax) });
  const push = (pos: Vec3) => {
    if (out.length >= maxObstacles) return;
    if (Math.hypot(pos.x, pos.y, pos.z) <= spawnClear) return; // keep the spawn bubble clear
    out.push(spec(pos, rMin + (rMax - rMin) * rnd(), dMin + (dMax - dMin) * rnd()));
  };

  // Greeter: a heavy obstacle exactly on the +z spawn path (deterministic head-on),
  // plus a few jittered around it.
  out.push(spec({ x: 0, y: 0, z: greeterZ }, rMax, (dMin + dMax) / 2));
  for (let i = 0; i < 6; i++) {
    push({
      x: clampAxis(gauss() * greeterRadius * 0.5),
      y: clampAxis(gauss() * greeterRadius * 0.5),
      z: clampAxis(greeterZ + gauss() * greeterRadius * 0.5),
    });
  }

  // Free-floating clumps across the volume.
  for (let c = 0; c < clusterCount; c++) {
    const cx = (rnd() * 2 - 1) * extent, cy = (rnd() * 2 - 1) * extent, cz = (rnd() * 2 - 1) * extent;
    const per = perMin + Math.floor(rnd() * (perMax - perMin + 1));
    for (let i = 0; i < per; i++) {
      push({ x: clampAxis(cx + gauss() * clusterRadius), y: clampAxis(cy + gauss() * clusterRadius), z: clampAxis(cz + gauss() * clusterRadius) });
    }
  }
  return out;
}
