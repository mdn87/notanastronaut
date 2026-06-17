import type { Vec3 } from './types';
import { mulberry32 } from './rng';

export type GalaxyKind = 'planet' | 'bubble' | 'cloud' | 'sparkle';
export interface GalaxyPiece { kind: GalaxyKind; pos: Vec3; size: number; rot: number; spin: number; }
export interface GalaxyArc { points: Vec3[]; }
export interface GalaxyField { pieces: GalaxyPiece[]; arcs: GalaxyArc[]; }

export interface GalaxyOpts {
  bubbles?: number; sparkles?: number; clouds?: number; planets?: number; arcs?: number;
}

const Z_MIN = -40, Z_MAX = 190, X_MAX = 70, Y_MAX = 38;
const CLEAR_BIG = 12, CLEAR_SMALL = 5; // keep the flight corridor from being blocked
const MAX = 600;
const KINDS: GalaxyKind[] = ['bubble', 'sparkle', 'cloud', 'planet'];

const clampCount = (v: number | undefined, d: number): number =>
  v === undefined || !Number.isFinite(v) ? d : Math.min(MAX, Math.max(0, Math.floor(v)));

/**
 * Deterministic field of simple line-art doodles (bubbles, sparkles, clouds, a
 * few planet outlines) plus gentle line arcs, sparsely scattered through the 3D
 * volume around the corridor so they parallax as the camera moves. The sparse,
 * airy count recaptures the original site's charm. Pure: no Math.random, no three.
 */
export function makeGalaxy(seed: number, opts: GalaxyOpts = {}): GalaxyField {
  const rnd = mulberry32(seed);
  const pieces: GalaxyPiece[] = [];
  const arcs: GalaxyArc[] = [];

  const want: Record<GalaxyKind, number> = {
    bubble: clampCount(opts.bubbles, 14),
    sparkle: clampCount(opts.sparkles, 16),
    cloud: clampCount(opts.clouds, 6),
    planet: clampCount(opts.planets, 5),
  };

  const sizeFor = (kind: GalaxyKind): number => {
    if (kind === 'bubble') return 0.6 + rnd() * 2.2;
    if (kind === 'sparkle') return 0.5 + rnd() * 1.3;
    if (kind === 'cloud') return 2.4 + rnd() * 3.2;
    return 2.6 + rnd() * 3.4; // planet outline
  };
  const clearFor = (kind: GalaxyKind): number => (kind === 'bubble' || kind === 'sparkle' ? CLEAR_SMALL : CLEAR_BIG);

  for (const kind of KINDS) {
    let made = 0;
    let guard = 0;
    while (made < want[kind] && guard++ < want[kind] * 20 + 20) {
      const pos = {
        x: (rnd() * 2 - 1) * X_MAX,
        y: (rnd() * 2 - 1) * Y_MAX,
        z: Z_MIN + rnd() * (Z_MAX - Z_MIN),
      };
      const size = sizeFor(kind); // consume RNG regardless so layout stays stable
      const rot = (rnd() * 2 - 1) * Math.PI;
      const spin = (rnd() * 2 - 1) * 0.3;
      if (Math.hypot(pos.x, pos.y) < clearFor(kind)) continue;
      pieces.push({ kind, pos, size, rot, spin });
      made++;
    }
  }

  const arcCount = clampCount(opts.arcs, 5);
  for (let i = 0; i < arcCount; i++) {
    const cx = (rnd() * 2 - 1) * X_MAX, cy = (rnd() * 2 - 1) * Y_MAX, cz = Z_MIN + rnd() * (Z_MAX - Z_MIN);
    const len = 20 + rnd() * 40;
    const dirAngle = rnd() * Math.PI * 2;
    const dx = Math.cos(dirAngle), dz = Math.sin(dirAngle);
    const amp = 3 + rnd() * 7, phase = rnd() * Math.PI * 2, waves = 1 + rnd() * 2;
    const points: Vec3[] = [];
    const N = 16;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const along = (t - 0.5) * len;
      const off = Math.sin(phase + t * Math.PI * 2 * waves) * amp;
      points.push({
        x: cx + dx * along + (-dz) * off,
        y: cy + (rnd() * 2 - 1) * 1.5,
        z: cz + dz * along + dx * off,
      });
    }
    arcs.push({ points });
  }

  return { pieces, arcs };
}
