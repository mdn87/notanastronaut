import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { SpiralField } from '../src/core/galaxy';
import { StarCollisions } from '../src/physics/star-collisions';

let RAPIER: typeof import('@dimforge/rapier3d');

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
  RAPIER = await import('@dimforge/rapier3d/rapier.js?inline') as unknown as typeof import('@dimforge/rapier3d');
  bindings.__wbg_set_wasm(instance.exports);
});

const field = (mass: number): SpiralField => ({
  positions: new Float32Array([0, 0, 28]),
  sizes: new Float32Array([2]),
  alphas: new Float32Array([1]),
  colors: new Float32Array([0.29, 0.7, 0.83]),
  collisionRadii: new Float32Array([2]),
  masses: new Float32Array([mass]),
  count: 1,
});

const twoStarField: SpiralField = {
  positions: new Float32Array([0, 0, 28, 0, 0, 100]),
  sizes: new Float32Array([1, 3]),
  alphas: new Float32Array([0.5, 1]),
  colors: new Float32Array([0.29, 0.7, 0.83, 0.09, 0.2, 0.29]),
  collisionRadii: new Float32Array([1, 3]),
  masses: new Float32Array([0.2, 6]),
  count: 2,
};

function scenario(mass: number) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = 1 / 120;
  const ship = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 0, 0)
    .lockRotations()
    .setAdditionalMass(1)
    .setCcdEnabled(true));
  const shipCollider = world.createCollider(
    RAPIER.ColliderDesc.ball(1.6)
      .setDensity(0)
      .setRestitution(0.7)
      .setCollisionGroups(0x00010002),
    ship,
  );
  const stars = new StarCollisions(RAPIER, world, shipCollider.handle, field(mass), { capacity: 1 });
  stars.prepare({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 32 }, 0);
  const snapshot = stars.snapshot();
  ship.setLinvel({ x: 0, y: 0, z: 40 }, true);
  for (let i = 0; i < 120; i++) {
    world.step(stars.events);
    stars.afterStep(1 / 120, ship.translation());
  }
  return { world, ship, stars, snapshot };
}

describe('StarCollisions', () => {
  it('launches a light star and records the hit', () => {
    const s = scenario(0.2);
    try {
      expect(s.stars.snapshot().hitCount).toBe(1);
      expect(s.stars.snapshot().positions[2]).toBeGreaterThan(28);
    } finally {
      s.stars.dispose();
      s.world.free();
    }
  });

  it('defers position synchronization until the render snapshot is requested', () => {
    const s = scenario(0.2);
    try {
      expect(s.snapshot.positions[2]).toBe(28);
      const updated = s.stars.snapshot();
      expect(updated).toBe(s.snapshot);
      expect(updated.positions[2]).toBeGreaterThan(28);
    } finally {
      s.stars.dispose();
      s.world.free();
    }
  });

  it('releases a far armed star during fixed-step maintenance without a snapshot', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const ship = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setAdditionalMass(1));
    const shipCollider = world.createCollider(
      RAPIER.ColliderDesc.ball(1.6).setDensity(0).setCollisionGroups(0x00010002),
      ship,
    );
    const stars = new StarCollisions(RAPIER, world, shipCollider.handle, field(0.2), { capacity: 1 });
    try {
      stars.prepare({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 32 }, 0);
      expect(stars.snapshot().starIndices[0]).toBe(0);
      stars.afterStep(0, { x: 0, y: 0, z: 100 });
      stars.afterStep(0, { x: 0, y: 0, z: 0 });
      expect(stars.snapshot().starIndices[0]).toBe(-1);
    } finally {
      stars.dispose();
      world.free();
    }
  });

  it('keeps repeated render snapshots observational', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const ship = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setAdditionalMass(1));
    const shipCollider = world.createCollider(
      RAPIER.ColliderDesc.ball(1.6).setDensity(0).setCollisionGroups(0x00010002),
      ship,
    );
    const stars = new StarCollisions(RAPIER, world, shipCollider.handle, field(0.2), { capacity: 1 });
    stars.prepare({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 32 }, 0);
    const translation = vi.spyOn(RAPIER.RigidBody.prototype, 'translation');
    try {
      const first = stars.snapshot();
      expect(stars.snapshot()).toBe(first);
      expect(stars.snapshot().starIndices[0]).toBe(0);
      expect(stars.snapshot().hitCount).toBe(0);
      stars.prepare({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 32 }, 0);
      expect(stars.snapshot().starIndices[0]).toBe(0);
      expect(translation).not.toHaveBeenCalled();
    } finally {
      translation.mockRestore();
      stars.dispose();
      world.free();
    }
  });

  it('does not read Rapier translations for repeated scattered snapshots', () => {
    const s = scenario(0.2);
    const translation = vi.spyOn(RAPIER.RigidBody.prototype, 'translation');
    try {
      s.stars.snapshot();
      s.stars.snapshot();
      expect(translation).not.toHaveBeenCalled();
    } finally {
      translation.mockRestore();
      s.stars.dispose();
      s.world.free();
    }
  });

  it('advances and fades a scattered star after disabling its physics body', () => {
    const s = scenario(0.2);
    const poolBody = s.world.bodies.getAll().find((body) => body.handle !== s.ship.handle)!;
    try {
      const first = s.stars.snapshot();
      const firstZ = first.positions[2]!;
      const firstAlpha = first.alphas[0]!;
      expect(poolBody.isEnabled()).toBe(false);
      for (let i = 0; i < 96; i++) s.stars.afterStep(1 / 120, s.ship.translation());
      const second = s.stars.snapshot();
      expect(second.positions[2]).toBeGreaterThan(firstZ);
      expect(second.alphas[0]).toBeGreaterThan(0);
      expect(second.alphas[0]).toBeLessThan(firstAlpha);
    } finally {
      s.stars.dispose();
      s.world.free();
    }
  });

  it('a heavy star slows the ship more than a light star', () => {
    const light = scenario(0.2);
    const heavy = scenario(6);
    try {
      expect(heavy.ship.linvel().z).toBeLessThan(light.ship.linvel().z);
    } finally {
      light.stars.dispose();
      heavy.stars.dispose();
      light.world.free();
      heavy.world.free();
    }
  });

  it('fades and releases a scattered star', () => {
    const s = scenario(0.2);
    try {
      for (let i = 0; i < 240; i++) s.stars.afterStep(1 / 120, s.ship.translation());
      expect(s.stars.snapshot().starIndices[0]).toBe(-1);
      expect(s.stars.snapshot().alphas[0]).toBe(0);
    } finally {
      s.stars.dispose();
      s.world.free();
    }
  });

  it('reports an intermediate alpha during the scattered fade', () => {
    const s = scenario(0.2);
    try {
      for (let i = 0; i < 96; i++) s.stars.afterStep(1 / 120, s.ship.translation());
      const alpha = s.stars.snapshot().alphas[0]!;
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThan(1);
    } finally {
      s.stars.dispose();
      s.world.free();
    }
  });

  it('reuses a released slot with a different star radius and mass', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const ship = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setAdditionalMass(1));
    const shipCollider = world.createCollider(
      RAPIER.ColliderDesc.ball(1.6).setDensity(0).setCollisionGroups(0x00010002),
      ship,
    );
    const stars = new StarCollisions(RAPIER, world, shipCollider.handle, twoStarField, { capacity: 1 });
    const poolBody = world.bodies.getAll().find((body) => body.handle !== ship.handle)!;
    const poolCollider = world.colliders.getAll().find((collider) => collider.handle !== shipCollider.handle)!;
    try {
      stars.prepare({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 32 }, 0);
      world.step(stars.events);
      stars.afterStep(world.timestep, ship.translation());
      expect(stars.snapshot().starIndices[0]).toBe(0);
      expect(poolCollider.radius()).toBe(1);
      expect(poolBody.mass()).toBeCloseTo(0.2);

      stars.afterStep(0, { x: 0, y: 0, z: 100 });
      expect(stars.snapshot().starIndices[0]).toBe(-1);
      stars.prepare({ x: 0, y: 0, z: 80 }, { x: 0, y: 0, z: 110 }, 0);
      const reused = stars.snapshot();
      expect(reused.starIndices[0]).toBe(1);
      expect(reused.positions[2]).toBe(100);
      world.step(stars.events);
      expect(poolCollider.radius()).toBe(3);
      expect(poolBody.mass()).toBeCloseTo(6);
    } finally {
      stars.dispose();
      world.free();
    }
  });

  it('removes its pooled bodies and colliders while leaving the world usable', () => {
    const s = scenario(0.2);
    try {
      expect(s.world.bodies.len()).toBe(2);
      expect(s.world.colliders.len()).toBe(2);
      s.stars.dispose();
      expect(s.world.bodies.len()).toBe(1);
      expect(s.world.colliders.len()).toBe(1);
      s.stars.dispose();
      s.world.step();
    } finally {
      s.stars.dispose();
      s.world.free();
    }
  });
});
