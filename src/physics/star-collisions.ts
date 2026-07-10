import type { SpiralField } from '../core/galaxy';
import { StarIndex } from '../core/star-index';
import type { Vec3 } from '../core/types';

type Rapier = typeof import('@dimforge/rapier3d');
type World = InstanceType<Rapier['World']>;
type RigidBody = ReturnType<World['createRigidBody']>;
type Collider = ReturnType<World['createCollider']>;

export interface ActiveStarSnapshot {
  starIndices: Int32Array;
  positions: Float32Array;
  alphas: Float32Array;
  hitCount: number;
}

interface Slot {
  body: RigidBody;
  collider: Collider;
  starIndex: number;
  phase: 'free' | 'armed' | 'scattered';
  age: number;
}

const ACTIVE_RADIUS = 35;
const RELEASE_RADIUS = 55;
const HOLD = 0.9;
const FADE = 0.6;

const rotateYInto = (p: Vec3, angle: number, out: Vec3): Vec3 => {
  const c = Math.cos(angle), s = Math.sin(angle);
  out.x = p.x * c + p.z * s;
  out.y = p.y;
  out.z = -p.x * s + p.z * c;
  return out;
};

export class StarCollisions {
  readonly events: InstanceType<Rapier['EventQueue']>;
  private readonly index: StarIndex;
  private readonly slots: Slot[] = [];
  private readonly assigned = new Set<number>();
  private readonly colliderSlots = new Map<number, number>();
  private readonly out: ActiveStarSnapshot;
  private readonly localFrom: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly localTo: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly localStar: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly worldStar: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly zero: Vec3 = { x: 0, y: 0, z: 0 };
  private shipX = 0;
  private shipY = 0;
  private shipZ = 0;
  private disposed = false;
  private readonly onCollision = (h1: number, h2: number, started: boolean) => {
    if (!started) return;
    const starHandle = h1 === this.shipColliderHandle
      ? h2
      : h2 === this.shipColliderHandle
        ? h1
        : -1;
    const slotIndex = this.colliderSlots.get(starHandle);
    if (slotIndex === undefined) return;
    const slot = this.slots[slotIndex]!;
    if (slot.phase === 'armed') {
      slot.phase = 'scattered';
      slot.age = 0;
      this.out.hitCount++;
    }
  };

  constructor(
    RAPIER: Rapier,
    private readonly world: World,
    private readonly shipColliderHandle: number,
    private readonly field: SpiralField,
    opts: { capacity?: number } = {},
  ) {
    const capacity = opts.capacity ?? 96;
    this.events = new RAPIER.EventQueue(true);
    this.index = new StarIndex(field.positions, 32, 20);
    this.out = {
      starIndices: new Int32Array(capacity).fill(-1),
      positions: new Float32Array(capacity * 3),
      alphas: new Float32Array(capacity),
      hitCount: 0,
    };
    for (let i = 0; i < capacity; i++) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setLinearDamping(0.25)
        .lockRotations()
        .setAdditionalMass(1));
      const collider = world.createCollider(RAPIER.ColliderDesc.ball(1)
        .setDensity(0)
        .setRestitution(0.7)
        .setCollisionGroups(0x00020001)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
      body.setEnabled(false);
      this.slots.push({ body, collider, starIndex: -1, phase: 'free', age: 0 });
      this.colliderSlots.set(collider.handle, i);
    }
  }

  prepare(fromWorld: Vec3, toWorld: Vec3, galaxyAngle: number): void {
    rotateYInto(fromWorld, -galaxyAngle, this.localFrom);
    rotateYInto(toWorld, -galaxyAngle, this.localTo);
    const candidates = this.index.querySegment(this.localFrom, this.localTo, ACTIVE_RADIUS);
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
      const starIndex = candidates[candidateIndex]!;
      if (this.assigned.has(starIndex)) continue;
      let slot: Slot | undefined;
      for (let i = 0; i < this.slots.length; i++) {
        if (this.slots[i]!.phase === 'free') {
          slot = this.slots[i];
          break;
        }
      }
      if (!slot) break;

      this.localStar.x = this.field.positions[starIndex * 3]!;
      this.localStar.y = this.field.positions[starIndex * 3 + 1]!;
      this.localStar.z = this.field.positions[starIndex * 3 + 2]!;
      rotateYInto(this.localStar, galaxyAngle, this.worldStar);

      slot.starIndex = starIndex;
      slot.phase = 'armed';
      slot.age = 0;
      slot.body.setEnabled(true);
      slot.body.setTranslation(this.worldStar, true);
      slot.body.setLinvel(this.zero, true);
      slot.body.setAdditionalMass(this.field.masses[starIndex]!, true);
      slot.collider.setRadius(this.field.collisionRadii[starIndex]!);
      this.assigned.add(starIndex);
    }
  }

  afterStep(dt: number, shipPosition: Vec3): void {
    this.shipX = shipPosition.x;
    this.shipY = shipPosition.y;
    this.shipZ = shipPosition.z;
    this.events.drainCollisionEvents(this.onCollision);
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]!;
      if (slot.phase === 'scattered') {
        slot.age += dt;
        if (slot.age >= HOLD + FADE) this.release(slot);
      }
    }
  }

  snapshot(): ActiveStarSnapshot {
    this.syncSnapshot();
    return this.out;
  }

  dispose(): void {
    if (this.disposed) return;
    for (let i = 0; i < this.slots.length; i++) {
      this.world.removeRigidBody(this.slots[i]!.body);
    }
    this.slots.length = 0;
    this.assigned.clear();
    this.colliderSlots.clear();
    this.out.starIndices.fill(-1);
    this.out.positions.fill(0);
    this.out.alphas.fill(0);
    this.events.free();
    this.disposed = true;
  }

  private release(slot: Slot): void {
    this.assigned.delete(slot.starIndex);
    slot.starIndex = -1;
    slot.phase = 'free';
    slot.age = 0;
    slot.body.setLinvel(this.zero, false);
    slot.body.setEnabled(false);
  }

  private syncSnapshot(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]!;
      if (slot.phase === 'free') {
        this.out.starIndices[i] = -1;
        this.out.alphas[i] = 0;
        continue;
      }
      const p = slot.body.translation(), o = i * 3;
      if (slot.phase === 'armed' && Math.hypot(
        p.x - this.shipX,
        p.y - this.shipY,
        p.z - this.shipZ,
      ) > RELEASE_RADIUS) {
        this.release(slot);
        this.out.starIndices[i] = -1;
        this.out.alphas[i] = 0;
        continue;
      }
      this.out.starIndices[i] = slot.starIndex;
      this.out.positions[o] = p.x;
      this.out.positions[o + 1] = p.y;
      this.out.positions[o + 2] = p.z;
      const base = this.field.alphas[slot.starIndex]!;
      this.out.alphas[i] = slot.phase === 'scattered' && slot.age > HOLD
        ? base * Math.max(0, 1 - (slot.age - HOLD) / FADE)
        : base;
    }
  }
}
