// src/core/galaxy.ts
import { mulberry32 } from './rng';

export interface SpiralField {
  positions: Float32Array; sizes: Float32Array; alphas: Float32Array; colors: Float32Array; count: number;
}
export interface SpiralOpts {
  count?: number; arms?: number; radius?: number; thickness?: number; twist?: number; coreFraction?: number;
}

export const GALAXY_MAX_POINTS = 40000;

// Brand cyan (arms) -> deep navy (core).
const CYAN = { r: 0x4a / 255, g: 0xb3 / 255, b: 0xd4 / 255 };
const NAVY = { r: 0x16 / 255, g: 0x32 / 255, b: 0x4a / 255 };

/**
 * Dark-stardust spiral galaxy as point arrays for a BufferGeometry. A flattened
 * logarithmic-spiral disk (N arms) plus a dense core bulge; per-point size/alpha
 * scale with "coreness" so density paints the spiral on white. Pure + seeded.
 */
export function makeSpiralGalaxy(seed: number, opts: SpiralOpts = {}): SpiralField {
  const count = Math.min(GALAXY_MAX_POINTS, Math.max(0, Math.floor(opts.count ?? 22000)));
  const arms = Math.max(1, Math.floor(opts.arms ?? 2));
  const radius = opts.radius ?? 200;
  const thickness = opts.thickness ?? 10;
  const twist = opts.twist ?? 2.4;
  const coreFraction = opts.coreFraction ?? 0.16;
  const rnd = mulberry32(seed);
  const gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const core = rnd() < coreFraction;
    let r: number, theta: number, y: number, coreness: number;
    if (core) {
      r = radius * 0.18 * Math.pow(rnd(), 0.6);
      theta = rnd() * Math.PI * 2;
      y = gauss() * thickness * 1.6;
      coreness = 1 - r / (radius * 0.18);
    } else {
      r = radius * (0.08 + 0.92 * Math.pow(rnd(), 0.5));
      const base = Math.floor(rnd() * arms) * ((Math.PI * 2) / arms);
      theta = base + twist * Math.log(1 + (r / radius) * 8) + gauss() * 0.18;
      y = gauss() * thickness * (1 - 0.5 * (r / radius));
      coreness = Math.max(0, 1 - r / radius);
    }
    positions[i * 3] = Math.cos(theta) * r;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(theta) * r;
    sizes[i] = 0.8 + 1.6 * coreness + rnd() * 0.5;
    alphas[i] = Math.min(1, 0.12 + 0.34 * coreness + rnd() * 0.05);
    const m = coreness * coreness;
    colors[i * 3] = CYAN.r + (NAVY.r - CYAN.r) * m;
    colors[i * 3 + 1] = CYAN.g + (NAVY.g - CYAN.g) * m;
    colors[i * 3 + 2] = CYAN.b + (NAVY.b - CYAN.b) * m;
  }
  return { positions, sizes, alphas, colors, count };
}
