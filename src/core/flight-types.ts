import type { Vec3 } from './types';
export type { Vec3 };

/**
 * Game-style input. Facing (yaw/pitch) is decoupled from movement: the pointer
 * aims yaw/pitch; W/S drive `forward`, A/D drive `strafe` relative to facing.
 * `boost` (right-click) is first-class so it can mean extra thrust + a raised
 * speed cap, not a synonym for `forward`.
 */
export interface FlightInput {
  yawDelta: number;
  pitchDelta: number;
  forward: number; // -1..1
  strafe: number;  // -1..1
  boost?: boolean; // optional so legacy flight.ts/flight.test.ts are unaffected
  roll?: -1 | 0 | 1; // edge event: -1 = roll left (A), +1 = roll right (D); one tick per press
}

export interface FlightState {
  position: Vec3; velocity: Vec3; heading: Vec3;
  yaw: number; pitch: number; bank: number; throttle: number; speed: number;
  surge: number; strafe: number; // last movement intents (-1..1), for thruster visuals
}

export interface FlightOpts {
  accel?: number; maxSpeed?: number; drag?: number; throttleEase?: number;
  bankMax?: number; bankEase?: number; bound?: number; boundPush?: number; pitchLimit?: number;
}
