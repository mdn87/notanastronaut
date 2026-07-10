import { describe, expect, it } from 'vitest';

import { ThrusterParticles, type ThrusterInput } from '../src/core/thruster-particles';

const input = (enginePower: number): ThrusterInput => ({
  tail: { x: 0, y: 0, z: -2 },
  heading: { x: 0, y: 0, z: 1 },
  velocity: { x: 0, y: 0, z: 10 },
  enginePower,
});

const run = (particles: ThrusterParticles, enginePower: number, seconds: number): void => {
  for (let frame = 0; frame < seconds * 60; frame += 1) {
    particles.step(1 / 60, input(enginePower));
  }
};

describe('ThrusterParticles', () => {
  it('emits no particles at zero engine power', () => {
    const particles = new ThrusterParticles();

    run(particles, 0, 1);

    expect(particles.aliveCount).toBe(0);
  });

  it('makes boost denser and faster than normal thrust', () => {
    const normal = new ThrusterParticles(128, 7);
    const boost = new ThrusterParticles(128, 7);

    run(normal, 0.6, 0.5);
    run(boost, 1, 0.5);

    expect(boost.aliveCount).toBeGreaterThan(normal.aliveCount);
    expect(Math.min(...boost.positions)).toBeLessThan(Math.min(...normal.positions));
  });

  it('stays within capacity and releases expired particles', () => {
    const particles = new ThrusterParticles(16, 7);

    run(particles, 1, 1);
    expect(particles.aliveCount).toBeLessThanOrEqual(16);

    run(particles, 0, 1);
    expect(particles.aliveCount).toBe(0);
  });

  it('replays positions and fades exactly for the same seed', () => {
    const first = new ThrusterParticles(128, 42);
    const second = new ThrusterParticles(128, 42);

    run(first, 0.8, 0.5);
    run(second, 0.8, 0.5);

    expect(first.positions).toEqual(second.positions);
    expect(first.alphas).toEqual(second.alphas);
  });
});
