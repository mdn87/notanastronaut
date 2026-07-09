import { describe, expect, it } from 'vitest';
import type { FlightInput } from '../src/core/flight-types';
import {
  DEFAULT_CONTROL, headingFrom, rightFrom, integrateFacing, thrustForce, boundaryForce,
  aimDelta, DEFAULT_STEER, stepRoll,
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

describe('aim-based steering (aimDelta)', () => {
  const S = DEFAULT_STEER;

  it('eases the facing toward the drag target and then STOPS (no perpetual spin)', () => {
    // Hold a fixed leftward drag of 200px from an anchor at yaw 0.
    let yaw = 0;
    let last = Infinity;
    for (let i = 0; i < 400; i++) {
      const d = aimDelta(yaw, 0, 0, 0, -200, 0, 0.05, S);
      yaw += d.yawDelta;
      last = d.yawDelta;
    }
    const deflect = Math.min(Math.max(0, 200 - S.deadzonePx), S.maxDeflectionPx);
    const target = 0 + deflect * S.gain; // dragX<0 -> yaw+ (nose screen-left)
    expect(yaw).toBeCloseTo(target, 3);        // reached the held target
    expect(Math.abs(last)).toBeLessThan(1e-3); // ...and the per-frame turn decayed to ~0 (stopped)
  });

  it('caps deflection so a huge/fast drag cannot run away', () => {
    const huge = aimDelta(0, 0, 0, 0, -100000, 0, 0.05, S);
    const atMax = aimDelta(0, 0, 0, 0, -(S.maxDeflectionPx + S.deadzonePx), 0, 0.05, S);
    expect(huge.yawDelta).toBeCloseTo(atMax.yawDelta, 9); // clamped to the same max target
  });

  it('ignores drags inside the deadzone', () => {
    const d = aimDelta(0, 0, 0, 0, S.deadzonePx - 1, S.deadzonePx - 1, 0.05, S);
    expect(d.yawDelta).toBeCloseTo(0, 9);
    expect(d.pitchDelta).toBeCloseTo(0, 9);
  });

  it('clamps the pitch target to +/- pitchLimit (settles at the limit, not beyond)', () => {
    let pitch = 0;
    for (let i = 0; i < 400; i++) {
      const d = aimDelta(0, pitch, 0, 0, 0, 100000, 0.05, S); // drag far down -> nose down
      pitch += d.pitchDelta;
    }
    expect(pitch).toBeGreaterThanOrEqual(-S.pitchLimit - 1e-6);
    expect(pitch).toBeCloseTo(-S.pitchLimit, 2);
  });

  it('is deterministic', () => {
    expect(aimDelta(0.1, 0.2, 0, 0, -50, 30, 0.05, S)).toEqual(aimDelta(0.1, 0.2, 0, 0, -50, 30, 0.05, S));
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
