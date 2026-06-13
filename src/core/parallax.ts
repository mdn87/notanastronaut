import type { Vec3 } from './types';
import { mulberry32 } from './rng';

export interface Body { pos: Vec3; radius: number; spin: number; }
export interface Sprite { pos: Vec3; size: number; variant: 0 | 1 | 2; }
export interface ParallaxField { mid: Body[]; far: Sprite[]; }
export interface ParallaxOpts { midCount?: number; farCount?: number; }

const Z_MIN = -30, Z_MAX = 176, X_MAX = 80, Y_MAX = 40, CORRIDOR = 12;
const MAX_BODIES = 500;

function count(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_BODIES, Math.max(0, Math.floor(value)));
}

/** Deterministic background field around the flight corridor. */
export function makeBodies(seed: number, opts: ParallaxOpts = {}): ParallaxField {
  const rnd = mulberry32(seed);
  const mid: Body[] = [];
  const far: Sprite[] = [];
  const midCount = count(opts.midCount, 24);
  const farCount = count(opts.farCount, 60);

  while (mid.length < midCount) {
    const pos = {
      x: (rnd() * 2 - 1) * X_MAX,
      y: (rnd() * 2 - 1) * Y_MAX,
      z: Z_MIN + rnd() * (Z_MAX - Z_MIN),
    };
    if (Math.hypot(pos.x, pos.y) < CORRIDOR) continue; // keep the corridor clear
    mid.push({ pos, radius: 0.4 + rnd() * 1.6, spin: (rnd() * 2 - 1) * 0.4 });
  }
  for (let i = 0; i < farCount; i++) {
    far.push({
      pos: {
        x: (rnd() * 2 - 1) * X_MAX,
        y: (rnd() * 2 - 1) * Y_MAX,
        z: Z_MIN + rnd() * (Z_MAX - Z_MIN),
      },
      size: 0.6 + rnd() * 1.8,
      variant: Math.floor(rnd() * 3) as 0 | 1 | 2,
    });
  }
  return { mid, far };
}
