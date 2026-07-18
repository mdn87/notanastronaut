// Side-effect import: forces rapier_wasm3d.js into the bundle so __wbg_set_wasm
// is called and the Rapier WASM module is bound before any World is created.
// Without this, Rollup optimises the re-export chain and skips the init glue.
// @dimforge/rapier3d is exact-pinned (no ^) in package.json — a minor bump can
// rename rapier_wasm3d.js (wasm-bindgen glue), silently breaking this import at runtime.
import '@dimforge/rapier3d/rapier_wasm3d.js';
import type { FlightInput, FlightState } from '../core/flight-types';
import {
  DEFAULT_CONTROL, headingFrom, rightFrom, integrateFacing, thrustForce, boundaryForce, stepRoll,
  type ControlOpts,
} from '../core/control';
import type { ObstacleSpec } from '../core/field';
import { Obstacles } from './obstacles';

type Rapier = typeof import('@dimforge/rapier3d');
type World = InstanceType<Rapier['World']>;
type RigidBody = ReturnType<World['createRigidBody']>;

const MAX_STEP = 0.05;
const FIXED = 1 / 120;
const NO_OBSTACLES = new Float32Array(0);
const ROLL_SPEED = 16;       // rad/s — ~0.4s per 360°; chaining keeps it spinning
const SIDESTEP_IMPULSE = 12; // lateral dodge impulse per roll (mass 1; damped)
const TWO_PI = Math.PI * 2;

/**
 * Rapier-owned dart. A single dynamic point mass (mass = 1, rotations locked):
 * Rapier integrates translation; orientation is control-state (yaw/pitch),
 * exposed via FlightState for the renderer. Boundary is an analytic force, no
 * collider shapes in v1.
 */
export class DartPhysics {
  static async create(opts: Partial<ControlOpts> = {}, obstacleSpecs: ObstacleSpec[] = []): Promise<DartPhysics> {
    const RAPIER = await import('@dimforge/rapier3d');
    return new DartPhysics(RAPIER, { ...DEFAULT_CONTROL, ...opts }, obstacleSpecs);
  }

  private readonly world: World;
  private readonly body: RigidBody;
  private readonly obstacles: Obstacles | null = null;
  private yaw = 0; private pitch = 0; private bank = 0; private throttle = 0;
  private surge = 0; private strafeIntent = 0; private acc = 0;
  private rollTarget = 0;

  private constructor(RAPIER: Rapier, private readonly o: ControlOpts, obstacleSpecs: ObstacleSpec[]) {
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 }); // deep space: no gravity
    this.world.timestep = FIXED;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 0, 0)
      .setLinearDamping(this.o.linearDamping)
      .lockRotations()        // Rapier integrates translation only
      .setAdditionalMass(1);  // explicit mass; collider density 0 keeps it exactly 1
    this.body = this.world.createRigidBody(desc);
    // Ball collider so the dart physically collides with obstacles; density 0 so it
    // adds no mass (mass stays the v1 reference of 1, preserving thrust feel).
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(1.6).setRestitution(0.85).setDensity(0),
      this.body,
    );
    if (obstacleSpecs.length > 0) {
      this.obstacles = new Obstacles(RAPIER, this.world, obstacleSpecs);
    }
  }

  step(dt: number, input: FlightInput): void {
    if (!(dt > 0)) return;
    const f = integrateFacing(this.yaw, this.pitch, input, this.o.pitchLimit);
    this.yaw = f.yaw; this.pitch = f.pitch;
    const heading = headingFrom(this.yaw, this.pitch);
    const right = rightFrom(heading);

    this.surge = Math.max(-1, Math.min(1, input.forward));
    this.strafeIntent = Math.max(-1, Math.min(1, input.strafe));
    const moving = Math.hypot(input.forward, input.strafe) > 1e-6;
    this.throttle += ((moving ? 1 : 0) - this.throttle) * Math.min(1, 6 * dt);

    const roll = input.roll ?? 0;
    if (roll !== 0) {
      this.rollTarget += roll * TWO_PI; // one full barrel roll per press; chaining keeps it spinning
      this.body.applyImpulse({ x: right.x * roll * SIDESTEP_IMPULSE, y: 0, z: right.z * roll * SIDESTEP_IMPULSE }, true); // lateral dodge
    }
    this.bank = stepRoll(this.bank, this.rollTarget, ROLL_SPEED, dt); // bank now carries the barrel-roll spin

    const cap = input.boost ? this.o.boostMaxSpeed : this.o.maxSpeed;
    // thrustForce is loop-invariant: heading/right/input are fixed for this step
    const thr = thrustForce(input, heading, right, this.o);
    this.acc += Math.min(dt, MAX_STEP);
    while (this.acc >= FIXED) {
      const t = this.body.translation();
      const bnd = boundaryForce(t, this.o.bound, this.o.boundPush);
      this.body.resetForces(false);
      this.body.addForce({
        x: thr.x * this.throttle + bnd.x,
        y: thr.y * this.throttle + bnd.y,
        z: thr.z * this.throttle + bnd.z,
      }, true);
      this.world.step();
      const v = this.body.linvel();
      const sp = Math.hypot(v.x, v.y, v.z);
      if (sp > cap) { const k = cap / sp; this.body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true); }
      this.acc -= FIXED;
    }
  }

  state(): FlightState {
    const t = this.body.translation();
    const v = this.body.linvel();
    return {
      position: { x: t.x, y: t.y, z: t.z },
      velocity: { x: v.x, y: v.y, z: v.z },
      heading: headingFrom(this.yaw, this.pitch),
      yaw: this.yaw, pitch: this.pitch, bank: this.bank, throttle: this.throttle,
      speed: Math.hypot(v.x, v.y, v.z), surge: this.surge, strafe: this.strafeIntent,
    };
  }

  obstaclePositions(): Float32Array {
    return this.obstacles ? this.obstacles.positions() : NO_OBSTACLES;
  }

  dispose(): void {
    this.world.free();
  }
}
