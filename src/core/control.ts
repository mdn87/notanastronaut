import type { Vec3 } from './types';
import type { FlightInput } from './flight-types';

export interface ControlOpts {
  accel: number; boostAccel: number;
  maxSpeed: number; boostMaxSpeed: number;
  linearDamping: number; pitchLimit: number;
  align: number;
  bound: number; boundPush: number;
}

/** Tunables seeded from the legacy FlightMachine feel, plus boost. */
export const DEFAULT_CONTROL: ControlOpts = {
  accel: 110, boostAccel: 200,
  maxSpeed: 80, boostMaxSpeed: 130,
  linearDamping: 0.8, pitchLimit: 1.3,
  align: 3.5,
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

/**
 * Rotate `vel` toward `sense`·`heading` by an exponential angular ease
 * (1 − e^(−align·dt)) — SPEED IS PRESERVED EXACTLY. `sense` is the COMMANDED
 * travel direction (+1 forward/coast, −1 while reverse is held): deriving it
 * from sign(v·h) would stall alignment at 90° and fight a forward U-turn.
 * Exact anti-parallel (θ = π) is a deliberate no-op — no unique rotation
 * axis; the next thrust step bends velocity off the axis. Pure.
 */
export function alignVelocity(vel: Vec3, heading: Vec3, sense: 1 | -1, align: number, dt: number): Vec3 {
  const s = Math.hypot(vel.x, vel.y, vel.z);
  if (s < 1e-6) return vel;
  const tx = heading.x * sense, ty = heading.y * sense, tz = heading.z * sense;
  const vx = vel.x / s, vy = vel.y / s, vz = vel.z / s;
  const dot = Math.max(-1, Math.min(1, vx * tx + vy * ty + vz * tz));
  if (dot > 1 - 1e-9) return vel; // already aligned
  let ax = vy * tz - vz * ty, ay = vz * tx - vx * tz, az = vx * ty - vy * tx;
  const al = Math.hypot(ax, ay, az);
  if (al < 1e-9) return vel;      // anti-parallel: no unique axis
  ax /= al; ay /= al; az /= al;
  const step = Math.acos(dot) * (1 - Math.exp(-align * dt));
  const c = Math.cos(step), si = Math.sin(step);
  // Rodrigues: v' = v·c + (k×v)·s + k(k·v)(1−c); k⊥v by construction so the last term ~0, kept for float safety
  const ka = ax * vx + ay * vy + az * vz;
  const rx = vx * c + (ay * vz - az * vy) * si + ax * ka * (1 - c);
  const ry = vy * c + (az * vx - ax * vz) * si + ay * ka * (1 - c);
  const rz = vz * c + (ax * vy - ay * vx) * si + az * ka * (1 - c);
  const rl = Math.hypot(rx, ry, rz) || 1; // renormalize float drift, then restore the exact speed
  return { x: (rx / rl) * s, y: (ry / rl) * s, z: (rz / rl) * s };
}

export interface SteerOpts {
  yawRate: number; pitchRate: number;   // max rad/s at full deflection
  deadzonePx: number; maxDeflectionPx: number;
  pitchLimit: number; levelRate: number; // rad/s pitch auto-levels toward 0 when not pitching
}

export const DEFAULT_STEER: SteerOpts = {
  yawRate: 1.6, pitchRate: 1.2, deadzonePx: 6, maxDeflectionPx: 320, pitchLimit: 1.3, levelRate: 0.9,
};

/** Normalized signed deflection in [-1,1]: 0 within the deadzone, ±1 at/after maxPx. */
export function deflect01(px: number, deadzonePx: number, maxPx: number): number {
  const span = Math.max(1, maxPx - deadzonePx);
  const e = Math.min(Math.max(0, Math.abs(px) - deadzonePx), span);
  return Math.sign(px) * (e / span);
}

/**
 * Rate-based steering: drag deflection -> a capped turn RATE, so holding a drag
 * keeps turning (no runaway; stops on release). Pitch turns while dragging
 * vertically and AUTO-LEVELS toward 0 otherwise (nose returns to the horizon).
 * dragX/dragY are 0 when not dragging. Returns the per-frame yaw/pitch delta. Pure.
 */
export function steerDelta(curPitch: number, dragX: number, dragY: number, dt: number, o: SteerOpts): { yawDelta: number; pitchDelta: number } {
  // `+ 0` normalizes away a `-0` result (e.g. deadzoned input negated below): numerically
  // identical to 0 in every comparison/arithmetic use, but Object.is/toBe(0) distinguish it.
  const yawDelta = (-deflect01(dragX, o.deadzonePx, o.maxDeflectionPx) * o.yawRate * dt) + 0; // drag left -> nose left
  const pitchIn = -deflect01(dragY, o.deadzonePx, o.maxDeflectionPx);                          // drag down -> nose down
  let pitchDelta: number;
  if (Math.abs(pitchIn) > 1e-3) {
    pitchDelta = pitchIn * o.pitchRate * dt;
  } else {
    const step = o.levelRate * dt;                     // auto-level toward 0
    pitchDelta = (Math.abs(curPitch) <= step ? -curPitch : -Math.sign(curPitch) * step) + 0;
  }
  return { yawDelta, pitchDelta };
}
