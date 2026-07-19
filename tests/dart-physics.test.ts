import { beforeAll, describe, expect, it } from 'vitest';
import type { FlightInput } from '../src/core/flight-types';
import { makeSpiralGalaxy } from '../src/core/galaxy';

let DartPhysics: typeof import('../src/physics/dart').DartPhysics;

beforeAll(async () => {
  // Rapier 0.14 omits declarations for this internal binding module.
  // @ts-expect-error The runtime file is present in the exact-pinned package.
  const bindings = await import('@dimforge/rapier3d/rapier_wasm3d_bg.js') as {
    __wbg_set_wasm(wasm: WebAssembly.Exports): void;
  };
  const { readFile } = await import('node:fs/promises');
  const wasm = await readFile(new URL(
    '../node_modules/@dimforge/rapier3d/rapier_wasm3d_bg.wasm',
    import.meta.url,
  ));
  const { instance } = await WebAssembly.instantiate(wasm, {
    './rapier_wasm3d_bg.js': bindings,
  } as unknown as WebAssembly.Imports);
  await import('@dimforge/rapier3d/rapier.js?inline');
  bindings.__wbg_set_wasm(instance.exports);
  DartPhysics = (await import('../src/physics/dart')).DartPhysics;
});

const input = (overrides: Partial<FlightInput> = {}): FlightInput => ({
  yawDelta: 0,
  pitchDelta: 0,
  forward: 0,
  strafe: 0,
  ...overrides,
});

describe('DartPhysics', () => {
  it('reports engine power only for forward thrust and scales boost', async () => {
    const dart = await DartPhysics.create({}, makeSpiralGalaxy(7, { count: 256 }));
    try {
      dart.step(0.05, input({ forward: -1 }), 0);
      expect(dart.state().enginePower).toBe(0);

      dart.step(0.05, input({ forward: 1 }), 0);
      expect(dart.state().enginePower).toBeGreaterThan(0);

      for (let i = 0; i < 10; i++) dart.step(0.05, input({ forward: 1, boost: true }), 0);
      expect(dart.state().enginePower).toBeGreaterThan(0.6);
    } finally {
      dart.dispose();
    }
  });

  it('returns stable default active-star snapshot arrays', async () => {
    const dart = await DartPhysics.create({}, makeSpiralGalaxy(8, { count: 256 }));
    try {
      const first = dart.activeStars();
      const second = dart.activeStars();
      expect(second).toBe(first);
      expect(second.starIndices).toBe(first.starIndices);
      expect(second.positions).toBe(first.positions);
      expect(second.alphas).toBe(first.alphas);
      expect(first.starIndices).toHaveLength(96);
      expect(first.positions).toHaveLength(288);
      expect(first.alphas).toHaveLength(96);
    } finally {
      dart.dispose();
    }
  });

  it('a coasting dart curves toward the nose after a yaw turn (velocity alignment)', async () => {
    // count: 0 galaxy — no stars, so nothing can collide with the dart mid-test.
    const dart = await DartPhysics.create({}, makeSpiralGalaxy(9, { count: 0 }));
    try {
      for (let i = 0; i < 60; i++) dart.step(1 / 60, input({ forward: 1 }), 0);            // thrust +z, 1s
      for (let i = 0; i < 30; i++) dart.step(1 / 60, input({ yawDelta: Math.PI / 60 }), 0); // release, yaw 90°
      for (let i = 0; i < 90; i++) dart.step(1 / 60, input(), 0);                           // coast 1.5s
      const s = dart.state();
      expect(s.speed).toBeGreaterThan(1);
      const h = { x: Math.cos(s.pitch) * Math.sin(s.yaw), y: Math.sin(s.pitch), z: Math.cos(s.pitch) * Math.cos(s.yaw) };
      const dot = (s.velocity.x * h.x + s.velocity.y * h.y + s.velocity.z * h.z) / s.speed;
      expect(dot).toBeGreaterThan(0.98); // velocity swung to the nose WHILE COASTING
    } finally {
      dart.dispose();
    }
  });

  it('the ship is never physically affected by stars (one-way coupling)', async () => {
    // Params tuned from the spec default (7, {count:4096, radius:60, thickness:8}): that
    // config does record hits, but the galaxy's random x/y scatter makes most of them
    // grazing (mostly lateral deflection, little forward-speed loss), so pre-fix the
    // aggregate `speed` signal barely moves even while genuinely colliding. Shrinking the
    // disk (radius 20, thickness 2, count 16000) packs more mass near the dart's straight
    // z-axis path out of the origin, producing a real near-head-on hit. Verified pre-fix:
    // this exact seed/opts pair yields hits=1 and a genuine 18.67 u/s single-frame speed
    // collapse (a light-mass star reversing the ship's z-velocity via solver restitution),
    // i.e. the test fails against current solver behavior as required by TDD.
    const dart = await DartPhysics.create({}, makeSpiralGalaxy(3, { count: 16000, radius: 20, thickness: 2 }));
    try {
      let prevSpeed = 0, hits = 0, maxDrop = 0;
      for (let i = 0; i < 240; i++) {
        dart.step(1 / 60, input({ forward: 1 }), 0);
        const s = dart.state();
        if (prevSpeed > 10) maxDrop = Math.max(maxDrop, prevSpeed - s.speed);
        prevSpeed = s.speed;
        hits = dart.activeStars().hitCount;
      }
      expect(hits).toBeGreaterThan(0);      // we really plowed through stars
      expect(maxDrop).toBeLessThan(0.5);    // and never lost speed to a collision
    } finally {
      dart.dispose();
    }
  });
});
