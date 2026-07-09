import type { ObstacleSpec } from '../core/field';

type Rapier = typeof import('@dimforge/rapier3d');
type World = InstanceType<Rapier['World']>;
type RigidBody = ReturnType<World['createRigidBody']>;

const RESTITUTION = 0.6;
const LIN_DAMP = 0.8;
const ANG_DAMP = 0.8;

/**
 * Dynamic obstacle bodies in a shared Rapier World. Each is a ball with mass set
 * SOLELY by setAdditionalMass (collider density 0), so Rapier's momentum exchange
 * with the dart depends only on the spec masses. Damped so a knocked obstacle
 * drifts then settles.
 */
export class Obstacles {
  private readonly bodies: RigidBody[] = [];
  private readonly buf: Float32Array;

  constructor(RAPIER: Rapier, world: World, specs: ObstacleSpec[]) {
    this.buf = new Float32Array(specs.length * 3);
    for (const s of specs) {
      const desc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(s.pos.x, s.pos.y, s.pos.z)
        .setLinearDamping(LIN_DAMP)
        .setAngularDamping(ANG_DAMP)
        .setAdditionalMass(s.mass);
      const body = world.createRigidBody(desc);
      const col = RAPIER.ColliderDesc.ball(s.radius).setRestitution(RESTITUTION).setDensity(0);
      world.createCollider(col, body);
      this.bodies.push(body);
    }
  }

  /** Live positions as a flat xyz buffer (reused — no per-frame allocation). */
  positions(): Float32Array {
    for (let i = 0; i < this.bodies.length; i++) {
      const t = this.bodies[i]!.translation();
      this.buf[i * 3] = t.x; this.buf[i * 3 + 1] = t.y; this.buf[i * 3 + 2] = t.z;
    }
    return this.buf;
  }
}
