import type { Vec3 } from './types';
import type { FlightInput } from './flight-types';

export interface ControlOpts {
  accel: number; boostAccel: number;
  maxSpeed: number; boostMaxSpeed: number;
  linearDamping: number; pitchLimit: number;
  bound: number; boundPush: number;
}

/** Tunables seeded from the legacy FlightMachine feel, plus boost. */
export const DEFAULT_CONTROL: ControlOpts = {
  accel: 110, boostAccel: 200,
  maxSpeed: 80, boostMaxSpeed: 130,
  linearDamping: 0.5, pitchLimit: 1.3,
  bound: 720, boundPush: 220,
};

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function headingFrom(yaw: number, pitch: number): Vec3 {
  return { x: Math.cos(pitch) * Math.sin(yaw), y: Math.sin(pitch), z: Math.cos(pitch) * Math.cos(yaw) };
}

/** Screen-right under the chase cam: cross(heading, worldUp) normalized. */
export function rightFrom(h: Vec3): Vec3 {
  const rx = -h.z, rz = h.x;
  const rl = Math.hypot(rx, rz);
  // Degenerate only if heading is exactly vertical; pitchLimit (1.3 < pi/2)
  // prevents that in practice, but fall back to a unit perpendicular for safety.
  if (rl < 1e-9) return { x: 1, y: 0, z: 0 };
  return { x: rx / rl, y: 0, z: rz / rl };
}

// `pitchDelta`/`yawDelta` arrive pre-scaled by the caller (wire layer); the
// pitch clamp is the safety bound, not a rate limiter.
export function integrateFacing(yaw: number, pitch: number, input: FlightInput, pitchLimit: number): { yaw: number; pitch: number } {
  return { yaw: yaw + input.yawDelta, pitch: clamp(pitch + input.pitchDelta, -pitchLimit, pitchLimit) };
}

/** Thrust force (mass is 1, so force == acceleration). Boost raises the magnitude. */
export function thrustForce(input: FlightInput, heading: Vec3, right: Vec3, o: ControlOpts): Vec3 {
  const a = input.boost ? o.boostAccel : o.accel;
  return {
    x: (heading.x * input.forward + right.x * input.strafe) * a,
    y: (heading.y * input.forward) * a,
    z: (heading.z * input.forward + right.z * input.strafe) * a,
  };
}

/** Soft containment: zero inside `bound`, else a centripetal pull toward origin. */
export function boundaryForce(pos: Vec3, bound: number, boundPush: number): Vec3 {
  const dist = Math.hypot(pos.x, pos.y, pos.z);
  if (dist <= bound) return { x: 0, y: 0, z: 0 };
  const k = (boundPush * ((dist - bound) / bound)) / dist;
  return { x: -pos.x * k, y: -pos.y * k, z: -pos.z * k };
}

/** Move `angle` toward `target` by at most speed·dt (constant angular speed, no overshoot). */
export function stepRoll(angle: number, target: number, speed: number, dt: number): number {
  const max = speed * dt;
  const d = target - angle;
  if (Math.abs(d) <= max) return target;
  return angle + Math.sign(d) * max;
}

export interface SteerOpts {
  gain: number;            // radians of target turn per pixel of (deadzoned) drag offset
  ease: number;            // how fast the facing eases toward the target (1/s)
  deadzonePx: number;      // ignore drags smaller than this
  maxDeflectionPx: number; // cap the drag offset so a fast/far drag can't run away
  pitchLimit: number;      // clamp the pitch target
}

export const DEFAULT_STEER: SteerOpts = {
  gain: 0.006, ease: 8, deadzonePx: 6, maxDeflectionPx: 320, pitchLimit: 1.3,
};

/** Drag offset → signed effective deflection: deadzoned near center, capped at the edge. */
const deflect = (px: number, deadzonePx: number, maxPx: number): number =>
  Math.sign(px) * Math.min(Math.max(0, Math.abs(px) - deadzonePx), maxPx);

/**
 * Aim-based steering. The drag offset (relative to the press anchor) maps to a
 * TARGET facing; the current facing eases toward it and STOPS there — no
 * perpetual spin. Deflection is deadzoned and capped so a fast/far drag can't
 * run away. Returns the per-frame yaw/pitch delta to apply (composes with
 * `integrateFacing`). Pure — no state, no DOM, no Rapier.
 */
export function aimDelta(
  curYaw: number, curPitch: number,
  anchorYaw: number, anchorPitch: number,
  dragX: number, dragY: number,
  dt: number, o: SteerOpts,
): { yawDelta: number; pitchDelta: number } {
  // drag left (dragX<0) -> yaw+ (nose to screen-left); drag down (dragY>0) -> pitch- (nose down)
  const targetYaw = anchorYaw - deflect(dragX, o.deadzonePx, o.maxDeflectionPx) * o.gain;
  const targetPitch = clamp(
    anchorPitch - deflect(dragY, o.deadzonePx, o.maxDeflectionPx) * o.gain,
    -o.pitchLimit, o.pitchLimit,
  );
  const k = 1 - Math.exp(-o.ease * dt);
  return { yawDelta: (targetYaw - curYaw) * k, pitchDelta: (targetPitch - curPitch) * k };
}
