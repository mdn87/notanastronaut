/**
 * Motion curves for node-to-node travel — "jet boosters in space".
 *
 * `jetEase` is the position curve: a slow ignition (s'(0)=0), a hard burn that
 * peaks a third of the way in, then a long inertial *glide* that eases to a soft
 * stop (s'(1)=0). It is strictly increasing on [0,1] with s(0)=0, s(1)=1.
 *
 *   s(t)  = 3t⁴ − 8t³ + 6t²
 *   s'(t) = 12t(1−t)²            (peak 16/9 at t = 1/3)
 *
 * `jetSpeed` is that derivative normalised to a 0..1 thrust level, used to flare
 * the booster flame: dark at rest, brightest during the burn, fading on the glide.
 *
 * Pure: no time source, no three.js — so the curves are unit-testable.
 */

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Position eased from 0→1: slow start, quick burn, long glide to a soft stop. */
export function jetEase(t: number): number {
  const x = clamp01(t);
  return ((3 * x - 8) * x + 6) * x * x;
}

const PEAK_SPEED = 16 / 9; // max of 12t(1−t)² on [0,1], at t = 1/3

/** Thrust level 0..1 (the eased velocity), peaking at t = 1/3. */
export function jetSpeed(t: number): number {
  const x = clamp01(t);
  return (12 * x * (1 - x) * (1 - x)) / PEAK_SPEED;
}
