import type { Vec3 } from './types';
import type { FlightInput, FlightState, FlightOpts } from './flight-types';
export type { FlightInput, FlightState, FlightOpts };

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const headingFrom = (yaw: number, pitch: number): Vec3 => ({
  x: Math.cos(pitch) * Math.sin(yaw),
  y: Math.sin(pitch),
  z: Math.cos(pitch) * Math.cos(yaw),
});

/**
 * Deterministic free-flight integrator. The booster ramps in (throttle ease)
 * whenever any movement input is held, and the avatar glides to a near-stop on
 * release (light drag). A soft boundary keeps you from getting lost. No three.js.
 */
export class FlightMachine {
  state: FlightState;
  private readonly o: Required<FlightOpts>;

  constructor(opts: FlightOpts = {}) {
    this.o = {
      accel: opts.accel ?? 110,
      maxSpeed: opts.maxSpeed ?? 80,
      drag: opts.drag ?? 0.6,
      throttleEase: opts.throttleEase ?? 6,
      bankMax: opts.bankMax ?? 0.5,
      bankEase: opts.bankEase ?? 3,
      bound: opts.bound ?? 260,
      boundPush: opts.boundPush ?? 140,
      pitchLimit: opts.pitchLimit ?? 1.3,
    };
    this.state = {
      position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
      heading: headingFrom(0, 0), yaw: 0, pitch: 0, bank: 0, throttle: 0, speed: 0,
      surge: 0, strafe: 0,
    };
  }

  tick(dt: number, input: FlightInput): void {
    if (!(dt > 0)) return;
    const o = this.o, s = this.state;
    const ease = (cur: number, tgt: number, rate: number) => cur + (tgt - cur) * Math.min(1, rate * dt);

    // Facing.
    s.yaw += input.yawDelta;
    s.pitch = clamp(s.pitch + input.pitchDelta, -o.pitchLimit, o.pitchLimit);
    s.heading = headingFrom(s.yaw, s.pitch);

    // Strafe "right" = screen-right under the chase cam (camera trails behind,
    // looking along +heading), i.e. cross(heading, worldUp) = (-hz, 0, hx).
    let rx = -s.heading.z, rz = s.heading.x;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;

    // Thrust direction = heading*forward + right*strafe.
    const fx = s.heading.x * input.forward + rx * input.strafe;
    const fy = s.heading.y * input.forward;
    const fz = s.heading.z * input.forward + rz * input.strafe;
    const mag = Math.hypot(fx, fy, fz);

    s.surge = clamp(input.forward, -1, 1);
    s.strafe = clamp(input.strafe, -1, 1);
    s.throttle = ease(s.throttle, mag > 0 ? 1 : 0, o.throttleEase);
    if (mag > 1e-6) {
      const a = (o.accel * s.throttle * dt) / mag;
      s.velocity.x += fx * a; s.velocity.y += fy * a; s.velocity.z += fz * a;
    }

    // Bank: lean into the strafe.
    s.bank = ease(s.bank, -clamp(input.strafe, -1, 1) * o.bankMax, o.bankEase);

    // Light drag -> inertial glide.
    const keep = Math.pow(o.drag, dt);
    s.velocity.x *= keep; s.velocity.y *= keep; s.velocity.z *= keep;

    // Soft boundary.
    const { x: px, y: py, z: pz } = s.position;
    const dist = Math.hypot(px, py, pz);
    if (dist > o.bound) {
      const k = (o.boundPush * ((dist - o.bound) / o.bound) * dt) / dist;
      s.velocity.x -= px * k; s.velocity.y -= py * k; s.velocity.z -= pz * k;
    }

    // Speed cap.
    let sp = Math.hypot(s.velocity.x, s.velocity.y, s.velocity.z);
    if (sp > o.maxSpeed) { const f = o.maxSpeed / sp; s.velocity.x *= f; s.velocity.y *= f; s.velocity.z *= f; sp = o.maxSpeed; }

    // Integrate.
    s.position.x += s.velocity.x * dt; s.position.y += s.velocity.y * dt; s.position.z += s.velocity.z * dt;
    s.speed = sp;
  }
}
