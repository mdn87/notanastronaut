import { describe, expect, it } from 'vitest';
import type { FlightInput } from '../src/core/flight-types';
import type { Vec3 } from '../src/core/types';
import {
  DEFAULT_CONTROL, headingFrom, rightFrom, integrateFacing, thrustForce, boundaryForce,
  steerDelta, deflect01, DEFAULT_STEER, stepRoll, alignVelocity,
} from '../src/core/control';

const I = (p: Partial<FlightInput> = {}): FlightInput => ({ yawDelta: 0, pitchDelta: 0, forward: 0, strafe: 0, ...p });
const O = DEFAULT_CONTROL;

describe('control (pure mapping)', () => {
  it('heading is unit-length and faces +z at rest', () => {
    const h = headingFrom(0, 0);
    expect(h).toEqual({ x: 0, y: 0, z: 1 });
    expect(Math.hypot(h.x, h.y, h.z)).toBeCloseTo(1, 6);
  });

  it('yaw 90° faces +x', () => {
    const h = headingFrom(Math.PI / 2, 0);
    expect(h.x).toBeCloseTo(1, 6);
    expect(Math.abs(h.z)).toBeLessThan(1e-6);
  });

  it('non-zero pitch sets y = sin(pitch) and heading remains unit-length', () => {
    const h = headingFrom(0, Math.PI / 4);
    expect(h.y).toBeCloseTo(Math.sin(Math.PI / 4), 6); // ≈0.7071
    expect(Math.hypot(h.x, h.y, h.z)).toBeCloseTo(1, 6);
  });

  it('right vector is screen-right (perp to heading, no y)', () => {
    const r = rightFrom(headingFrom(0, 0)); // heading +z -> right = -x
    expect(r.x).toBeCloseTo(-1, 6);
    expect(r.y).toBe(0);
    expect(Math.hypot(r.x, r.y, r.z)).toBeCloseTo(1, 6);
  });

  it('rightFrom returns a unit vector even for a (near-)vertical heading', () => {
    const r = rightFrom({ x: 0, y: 1, z: 0 });
    expect(Math.hypot(r.x, r.y, r.z)).toBeCloseTo(1, 6);
    expect(r.y).toBe(0);
  });

  it('integrateFacing adds yaw and clamps pitch', () => {
    const f = integrateFacing(0, 0, I({ yawDelta: 0.2, pitchDelta: -5 }), O.pitchLimit);
    expect(f.yaw).toBeCloseTo(0.2, 6);
    expect(f.pitch).toBeCloseTo(-O.pitchLimit, 6);
  });

  it('forward thrust points along heading; strafe along right', () => {
    const h = headingFrom(0, 0), r = rightFrom(h);
    const fwd = thrustForce(I({ forward: 1 }), h, r, O);
    expect(fwd.z).toBeCloseTo(O.accel, 6);
    const str = thrustForce(I({ strafe: 1 }), h, r, O);
    expect(str.x).toBeCloseTo(-O.accel, 6);
    expect(Math.abs(str.z)).toBeLessThan(1e-6);
  });

  it('boost uses the larger accel', () => {
    const h = headingFrom(0, 0), r = rightFrom(h);
    const normal = thrustForce(I({ forward: 1 }), h, r, O);
    const boosted = thrustForce(I({ forward: 1, boost: true }), h, r, O);
    expect(boosted.z).toBeGreaterThan(normal.z);
    expect(boosted.z).toBeCloseTo(O.boostAccel, 6);
  });

  it('boundary force is zero inside, pulls back outside', () => {
    expect(boundaryForce({ x: 0, y: 0, z: 0 }, O.bound, O.boundPush)).toEqual({ x: 0, y: 0, z: 0 });
    const f = boundaryForce({ x: O.bound + 100, y: 0, z: 0 }, O.bound, O.boundPush);
    expect(f.x).toBeLessThan(0); // pulled back toward center (-x)
  });
});

describe('steerDelta (rate-based steering + auto-level)', () => {
  const O = DEFAULT_STEER;
  it('deadzone: small drag produces no yaw', () => {
    expect(steerDelta(0, 3, 0, 0.016, O).yawDelta).toBe(0);
  });
  it('drag left turns the nose left (yaw+) at a constant rate while held', () => {
    const a = steerDelta(0, -200, 0, 0.016, O).yawDelta;
    const b = steerDelta(0, -200, 0, 0.016, O).yawDelta; // same input next frame -> same rate (does NOT decay to 0)
    expect(a).toBeGreaterThan(0);
    expect(b).toBeCloseTo(a, 12);
  });
  it('yaw rate is capped at full deflection', () => {
    const capped = steerDelta(0, -100000, 0, 0.016, O).yawDelta;
    expect(capped).toBeCloseTo(O.yawRate * 0.016, 9);
  });
  it('drag down pitches the nose down', () => {
    expect(steerDelta(0, 0, 200, 0.016, O).pitchDelta).toBeLessThan(0);
  });
  it('auto-levels pitch toward 0 when not pitching', () => {
    expect(steerDelta(0.5, 0, 0, 0.016, O).pitchDelta).toBeLessThan(0);   // above horizon -> comes down
    expect(steerDelta(-0.5, 0, 0, 0.016, O).pitchDelta).toBeGreaterThan(0); // below horizon -> comes up
  });
  it('auto-level snaps exactly to 0 within one step (no overshoot)', () => {
    const tiny = O.levelRate * 0.016 * 0.5;
    expect(steerDelta(tiny, 0, 0, 0.016, O).pitchDelta).toBeCloseTo(-tiny, 12);
    expect(steerDelta(0, 0, 0, 0.016, O).pitchDelta).toBe(0);
  });
});

describe('stepRoll (barrel-roll spin)', () => {
  it('snaps to target when within one step', () => {
    expect(stepRoll(0, 0.1, 16, 0.05)).toBeCloseTo(0.1, 9); // max step 0.8 >= 0.1
  });
  it('moves at most speed*dt toward the target (no overshoot)', () => {
    expect(stepRoll(0, 100, 16, 0.05)).toBeCloseTo(0.8, 9); // 16*0.05
    expect(stepRoll(0, -100, 16, 0.05)).toBeCloseTo(-0.8, 9);
  });
  it('converges to a full 2π roll over time', () => {
    let a = 0; const target = 2 * Math.PI;
    for (let i = 0; i < 200; i++) a = stepRoll(a, target, 16, 0.05);
    expect(a).toBeCloseTo(target, 6);
  });
  it('holds at the target', () => {
    expect(stepRoll(2, 2, 16, 0.05)).toBe(2);
  });
});

describe('alignVelocity (speed-preserving rotation)', () => {
  const DT = 1 / 120;
  const speed = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
  const angleTo = (v: Vec3, h: Vec3, sense: 1 | -1) =>
    Math.acos(Math.max(-1, Math.min(1, ((v.x * h.x + v.y * h.y + v.z * h.z) * sense) / speed(v))));

  it('no-op when parallel, at rest, and at exact 180° anti-parallel', () => {
    const h = { x: 0, y: 0, z: 1 };
    expect(alignVelocity({ x: 0, y: 0, z: 30 }, h, 1, 3.5, DT)).toEqual({ x: 0, y: 0, z: 30 });
    expect(alignVelocity({ x: 0, y: 0, z: 0 }, h, 1, 3.5, DT)).toEqual({ x: 0, y: 0, z: 0 });
    // no unique rotation axis at 180° — deliberate no-op; the next thrust step breaks the tie
    expect(alignVelocity({ x: 0, y: 0, z: -30 }, h, 1, 3.5, DT)).toEqual({ x: 0, y: 0, z: -30 });
  });

  it('preserves speed through a full 90° realignment and converges < 5° in 2s', () => {
    const h = { x: 1, y: 0, z: 0 };
    let v: Vec3 = { x: 0, y: 0, z: 80 };
    for (let i = 0; i < 240; i++) {
      v = alignVelocity(v, h, 1, 3.5, DT);
      expect(speed(v)).toBeCloseTo(80, 4); // spec bound: 1e-4 relative
    }
    expect(angleTo(v, h, 1)).toBeLessThan((5 * Math.PI) / 180);
  });

  it('forward U-turn past 90° keeps aligning — P1 regression: sense from input, not sign(v·h)', () => {
    const h = headingFrom(Math.PI * 0.75, 0); // nose 135° away from the velocity
    let v: Vec3 = { x: 0, y: 0, z: 60 };
    let prev = angleTo(v, h, 1);
    expect(prev).toBeGreaterThan(Math.PI / 2);
    for (let i = 0; i < 600; i++) {
      v = alignVelocity(v, h, 1, 3.5, DT);
      const a = angleTo(v, h, 1);
      expect(a).toBeLessThanOrEqual(prev + 1e-9); // never stalls, never reverses
      prev = a;
    }
    expect(prev).toBeLessThan((5 * Math.PI) / 180);
    expect(speed(v)).toBeCloseTo(60, 4);
  });

  it('sense −1 aligns toward −heading (reverse flight stays reverse)', () => {
    const h = { x: 0, y: 0, z: 1 };
    let v: Vec3 = { x: 30, y: 0, z: -30 };
    for (let i = 0; i < 600; i++) v = alignVelocity(v, h, -1, 3.5, DT);
    expect(v.z).toBeLessThan(0);
    expect(Math.abs(v.x)).toBeLessThan(1);
    expect(speed(v)).toBeCloseTo(Math.hypot(30, 30), 4);
  });
});
