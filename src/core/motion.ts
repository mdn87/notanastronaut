import type { RailMotionState } from './types';
import { OVERVIEW_INDEX } from './travel';

export interface MotionOpts {
  reducedMotion?: boolean;
  wheelScale?: number;
  stepDuration?: number;
  damping?: number;
  snapRadius?: number;
  snapStrength?: number;
  maxVelocity?: number;
  passThroughVelocity?: number;
  settleEpsilon?: number;
  minWheelStep?: number;
  maxWheelStep?: number;
  maxWheelLead?: number;
}

const DEFAULTS = {
  wheelScale: 0.0015,
  stepDuration: 2,
  damping: 5,
  snapRadius: 0.12,
  snapStrength: 8,
  maxVelocity: 8,
  passThroughVelocity: 1.2,
  settleEpsilon: 0.01,
  minWheelStep: 0.16,
  maxWheelStep: 0.45,
  maxWheelLead: 1,
};

export class MotionController {
  private readonly nodeCount: number;
  private readonly reducedMotion: boolean;
  private readonly wheelScale: number;
  private readonly stepDuration: number;
  private readonly damping: number;
  private readonly snapRadius: number;
  private readonly snapStrength: number;
  private readonly maxVelocity: number;
  private readonly passThroughVelocity: number;
  private readonly settleEpsilon: number;
  private readonly minWheelStep: number;
  private readonly maxWheelStep: number;
  private readonly maxWheelLead: number;
  private arriveCbs: Array<(index: number) => void> = [];
  private progress = 0;
  private targetProgress = 0;
  private velocity = 0;
  private lastArrivedIndex: number | null = 0;

  constructor(nodeCount: number, opts: MotionOpts = {}) {
    if (!Number.isInteger(nodeCount) || nodeCount < 1) {
      throw new Error('MotionController needs >= 1 node');
    }

    this.nodeCount = nodeCount;
    this.reducedMotion = opts.reducedMotion ?? false;
    this.wheelScale = this.finiteOrDefault(opts.wheelScale, DEFAULTS.wheelScale);
    this.stepDuration = this.nonnegativeOrDefault(opts.stepDuration, DEFAULTS.stepDuration);
    this.damping = this.nonnegativeOrDefault(opts.damping, DEFAULTS.damping, { fallbackOnNegative: true });
    this.snapRadius = this.nonnegativeOrDefault(opts.snapRadius, DEFAULTS.snapRadius);
    this.snapStrength = this.nonnegativeOrDefault(opts.snapStrength, DEFAULTS.snapStrength);
    this.maxVelocity = this.nonnegativeOrDefault(opts.maxVelocity, DEFAULTS.maxVelocity, { fallbackOnNegative: true });
    this.passThroughVelocity = this.nonnegativeOrDefault(opts.passThroughVelocity, DEFAULTS.passThroughVelocity);
    this.settleEpsilon = this.nonnegativeOrDefault(opts.settleEpsilon, DEFAULTS.settleEpsilon, { fallbackOnNegative: true });
    this.minWheelStep = this.nonnegativeOrDefault(opts.minWheelStep, DEFAULTS.minWheelStep);
    this.maxWheelStep = this.nonnegativeOrDefault(opts.maxWheelStep, DEFAULTS.maxWheelStep);
    this.maxWheelLead = this.nonnegativeOrDefault(opts.maxWheelLead, DEFAULTS.maxWheelLead);
  }

  onArrive(cb: (index: number) => void): () => void {
    this.arriveCbs.push(cb);
    return () => { this.arriveCbs = this.arriveCbs.filter((c) => c !== cb); };
  }

  snapshot(): RailMotionState {
    const progress = this.clean(this.progress);
    const targetProgress = this.clean(this.targetProgress);
    const velocity = this.clean(this.velocity);
    const settledIndex = this.settledIndex();

    if (settledIndex === OVERVIEW_INDEX) {
      return {
        phase: 'overview',
        progress,
        targetProgress,
        velocity,
        from: OVERVIEW_INDEX,
        to: 0,
        t: 0,
        settledIndex: OVERVIEW_INDEX,
      };
    }

    if (settledIndex !== null) {
      return {
        phase: 'atNode',
        progress,
        targetProgress,
        velocity,
        from: settledIndex,
        to: settledIndex,
        t: 1,
        settledIndex,
      };
    }

    const segment = this.directionalSegment(progress, targetProgress);

    return {
      phase: 'inTransit',
      progress,
      targetProgress,
      velocity,
      from: segment.from,
      to: segment.to,
      t: this.ease(segment.t),
      settledIndex: null,
    };
  }

  setProgress(progress: number): void {
    const next = this.clampProgress(progress);
    this.progress = next;
    this.targetProgress = next;
    this.velocity = 0;
    if (this.settledIndex() === null) {
      this.lastArrivedIndex = null;
    }
    this.notifyIfSettled();
  }

  advance(): boolean {
    return this.stepBy(1);
  }

  back(): boolean {
    return this.stepBy(-1);
  }

  jumpTo(index: number): boolean {
    if (!Number.isInteger(index) || index < OVERVIEW_INDEX || index > this.maxProgress()) {
      return false;
    }
    const settled = this.settledIndex();
    if (index === this.targetProgress && settled === index) {
      return false;
    }

    if (settled !== null && settled !== index) {
      this.lastArrivedIndex = null;
    }
    this.targetProgress = index;
    if (this.reducedMotion) {
      this.progress = index;
      this.velocity = 0;
      this.notifyIfSettled();
    }
    return true;
  }

  nudge(deltaY: number): void {
    if (!Number.isFinite(deltaY) || deltaY === 0) return;

    if (this.reducedMotion) {
      if (deltaY > 0) this.advance();
      else this.back();
      return;
    }

    const settled = this.settledIndex();
    if (settled !== null) {
      const next = settled + Math.sign(deltaY);
      if (next < OVERVIEW_INDEX || next > this.maxProgress()) return;
      this.targetProgress = next;
      this.lastArrivedIndex = null;
      this.velocity = this.clampVelocity(Math.sign(deltaY) * this.minWheelStep);
      return;
    }

    const delta = this.wheelDelta(deltaY);
    if (this.shouldHoldWheelTarget(delta)) return;
    this.targetProgress = this.clampWheelTarget(this.targetProgress + delta);

    this.velocity = this.clampVelocity(this.velocity + delta);
  }

  tick(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;

    if (this.reducedMotion) {
      this.progress = this.targetProgress;
      this.velocity = 0;
      this.notifyIfSettled();
      return;
    }

    const damp = Math.max(0, this.damping);
    const duration = Math.max(0, this.stepDuration);
    const blend = duration === 0 ? 1 : 1 - Math.exp(-(damp / duration) * dt);
    const nearestTarget = Math.round(this.targetProgress);
    let effectiveTarget = this.targetProgress;

    if (
      Number.isInteger(nearestTarget) &&
      nearestTarget >= OVERVIEW_INDEX &&
      nearestTarget <= this.maxProgress() &&
      Math.abs(this.targetProgress - nearestTarget) <= this.snapRadius &&
      Math.abs(this.velocity) < this.passThroughVelocity
    ) {
      const snapBlend = 1 - Math.exp(-Math.max(0, this.snapStrength) * dt);
      this.targetProgress = nearestTarget;
      effectiveTarget += (nearestTarget - effectiveTarget) * snapBlend;
    }

    const previous = this.progress;
    const proposedDelta = (effectiveTarget - this.progress) * blend;
    const maxDelta = this.maxVelocity * dt;
    const delta = Math.min(maxDelta, Math.max(-maxDelta, proposedDelta));
    this.progress = this.clampProgress(this.progress + delta);
    this.velocity = this.clampVelocity((this.progress - previous) / dt);

    if (Math.abs(this.targetProgress - this.progress) <= this.settleEpsilon && Math.abs(this.velocity) <= this.settleEpsilon) {
      this.progress = this.targetProgress;
      this.velocity = 0;
    }

    this.notifyIfSettled();
  }

  private stepBy(direction: -1 | 1): boolean {
    const settled = this.settledIndex();
    if (settled !== null) {
      const next = settled + direction;
      if (next < OVERVIEW_INDEX || next > this.maxProgress()) return false;
      return this.jumpTo(next);
    }

    const target = Math.round(this.targetProgress);
    if (Math.abs(this.targetProgress - target) <= this.settleEpsilon) {
      const directionToTarget = Math.sign(this.targetProgress - this.progress);
      if (directionToTarget === direction) return false;
      if (directionToTarget === -direction) return this.jumpTo(target + direction);
    }

    const next = Math.round(this.targetProgress) + direction;
    if (next < OVERVIEW_INDEX || next > this.maxProgress()) return false;
    return this.jumpTo(next);
  }

  private notifyIfSettled(): void {
    const index = this.settledIndex();
    if (index === null || index === this.lastArrivedIndex) return;
    this.lastArrivedIndex = index;
    for (const cb of [...this.arriveCbs]) cb(index);
  }

  private settledIndex(): number | null {
    const nearest = Math.round(this.progress);
    if (nearest < OVERVIEW_INDEX || nearest > this.maxProgress()) return null;
    if (Math.abs(this.progress - nearest) > this.settleEpsilon) return null;
    if (Math.abs(this.targetProgress - nearest) > this.settleEpsilon) return null;
    if (Math.abs(this.velocity) > this.settleEpsilon) return null;
    return nearest;
  }

  private maxProgress(): number {
    return this.nodeCount - 1;
  }

  private wheelDelta(deltaY: number): number {
    const scaled = deltaY * this.wheelScale;
    const sign = Math.sign(scaled);
    if (sign === 0) return 0;

    let magnitude = Math.abs(scaled);
    magnitude = Math.min(this.maxWheelStep, magnitude);
    return sign * magnitude;
  }

  private shouldHoldWheelTarget(delta: number): boolean {
    const target = Math.round(this.targetProgress);
    if (Math.abs(this.targetProgress - target) > this.settleEpsilon) return false;

    const directionToTarget = Math.sign(this.targetProgress - this.progress);
    if (directionToTarget === 0) return false;
    return Math.sign(delta) === directionToTarget;
  }

  private clampWheelTarget(target: number): number {
    const clamped = this.clampProgress(target);
    const lead = Math.max(0, this.maxWheelLead);
    if (lead === 0) return clamped;
    return this.clampProgress(Math.min(this.progress + lead, Math.max(this.progress - lead, clamped)));
  }

  private finiteOrDefault(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private nonnegativeOrDefault(
    value: number | undefined,
    fallback: number,
    opts: { fallbackOnNegative?: boolean } = {},
  ): number {
    const finite = this.finiteOrDefault(value, fallback);
    if (opts.fallbackOnNegative && finite < 0) return fallback;
    return Math.max(0, finite);
  }

  private directionalSegment(progress: number, targetProgress: number): { from: number; to: number; t: number } {
    if (targetProgress < progress) {
      const from = Math.min(this.maxProgress(), Math.ceil(progress));
      const to = Math.max(OVERVIEW_INDEX, from - 1);
      const distance = from - to;
      return {
        from: this.clean(from),
        to: this.clean(to),
        t: distance === 0 ? 1 : this.clamp01((from - progress) / distance),
      };
    }

    const from = Math.max(OVERVIEW_INDEX, Math.floor(progress));
    const to = Math.min(this.maxProgress(), from + 1);
    const distance = to - from;
    return {
      from: this.clean(from),
      to: this.clean(to),
      t: distance === 0 ? 1 : this.clamp01((progress - from) / distance),
    };
  }

  private clampProgress(progress: number): number {
    if (!Number.isFinite(progress)) return this.progress;
    return Math.min(this.maxProgress(), Math.max(OVERVIEW_INDEX, progress));
  }

  private clampVelocity(velocity: number): number {
    if (!Number.isFinite(velocity)) return 0;
    return Math.min(this.maxVelocity, Math.max(-this.maxVelocity, velocity));
  }

  private ease(t: number): number {
    return t * t * (3 - 2 * t);
  }

  private clamp01(t: number): number {
    return Math.min(1, Math.max(0, t));
  }

  private clean(n: number): number {
    return Object.is(n, -0) ? 0 : n;
  }
}
