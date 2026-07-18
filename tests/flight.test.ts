import { describe, expect, it } from 'vitest';
import { FlightMachine, type FlightInput } from '../src/core/flight';

const I = (p: Partial<FlightInput> = {}): FlightInput => ({ yawDelta: 0, pitchDelta: 0, forward: 0, strafe: 0, ...p });
const run = (m: FlightMachine, inp: FlightInput, n: number, dt = 0.05) => { for (let i = 0; i < n; i++) m.tick(dt, inp); };

describe('FlightMachine (game controls)', () => {
  it('starts at rest at the origin facing +z', () => {
    const m = new FlightMachine();
    expect(m.state.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(m.state.speed).toBe(0);
    expect(m.state.heading.z).toBeCloseTo(1, 6);
  });

  it('W (forward) drives +z, S (back) drives -z', () => {
    const f = new FlightMachine(); run(f, I({ forward: 1 }), 20);
    expect(f.state.position.z).toBeGreaterThan(0);
    const b = new FlightMachine(); run(b, I({ forward: -1 }), 20);
    expect(b.state.position.z).toBeLessThan(0);
  });

  it('strafe gives a real left and right (screen-relative under the chase cam)', () => {
    const r = new FlightMachine(); run(r, I({ strafe: 1 }), 20);   // D = screen-right = -x
    expect(r.state.position.x).toBeLessThan(0);
    expect(Math.abs(r.state.position.z)).toBeLessThan(0.01);       // sideways, no forward creep
    const l = new FlightMachine(); run(l, I({ strafe: -1 }), 20);  // A = screen-left = +x
    expect(l.state.position.x).toBeGreaterThan(0);
  });

  it('movement is relative to facing: yaw 90° then W moves along the new heading (+x)', () => {
    const m = new FlightMachine();
    m.tick(0.05, I({ yawDelta: Math.PI / 2 })); // face +x
    expect(m.state.heading.x).toBeCloseTo(1, 3);
    run(m, I({ forward: 1 }), 20);
    expect(m.state.position.x).toBeGreaterThan(0);
    expect(Math.abs(m.state.position.z)).toBeLessThan(0.5);
  });

  it('mouse look adds yaw/pitch and clamps pitch', () => {
    const m = new FlightMachine({ pitchLimit: 1.3 });
    run(m, I({ yawDelta: 0.05, pitchDelta: -0.5 }), 50);
    expect(m.state.yaw).toBeGreaterThan(0);
    expect(Math.abs(m.state.pitch)).toBeLessThanOrEqual(1.3 + 1e-9);
  });

  it('fires the booster (throttle>0) only while a movement input is held', () => {
    const m = new FlightMachine();
    run(m, I({ forward: 1 }), 10);
    expect(m.state.throttle).toBeGreaterThan(0.2);
    run(m, I(), 60); // release everything
    expect(m.state.throttle).toBeLessThan(0.02);
  });

  it('glides to a near-stop after movement is released, and caps speed', () => {
    const m = new FlightMachine({ maxSpeed: 80 });
    let peak = 0;
    for (let i = 0; i < 200; i++) { m.tick(0.05, I({ forward: 1 })); peak = Math.max(peak, m.state.speed); expect(m.state.speed).toBeLessThanOrEqual(80 + 1e-6); }
    expect(peak).toBeGreaterThan(0.9 * 80);
    const cruising = m.state.speed;
    run(m, I(), 400);
    expect(m.state.speed).toBeLessThan(0.02 * cruising);
  });

  it('soft bound pulls a runaway back toward center', () => {
    const m = new FlightMachine({ bound: 100 });
    m.state.position = { x: 160, y: 0, z: 0 };
    m.state.velocity = { x: 20, y: 0, z: 0 };
    run(m, I(), 50);
    expect(m.state.velocity.x).toBeLessThan(20);
  });

  it('is deterministic and keeps heading unit-length', () => {
    const a = new FlightMachine(), b = new FlightMachine();
    const seq = Array.from({ length: 50 }, (_, i) => I({ yawDelta: Math.sin(i) * 0.02, forward: i % 2, strafe: i % 3 ? 1 : -1 }));
    for (const inp of seq) { a.tick(0.05, inp); b.tick(0.05, inp); }
    expect(a.state).toEqual(b.state);
    expect(Math.hypot(a.state.heading.x, a.state.heading.y, a.state.heading.z)).toBeCloseTo(1, 6);
  });
});
