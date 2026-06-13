export interface WheelOpts { threshold?: number; cooldownMs?: number; gapResetMs?: number; }

/**
 * Turns a stream of wheel deltas into discrete travel intents.
 * Pure: the caller supplies timestamps, so tests are deterministic.
 * Returns -1 (back), 0 (nothing), or 1 (advance).
 */
export class WheelIntent {
  private acc = 0;
  private lastEvent = -Infinity;
  private lastFire = -Infinity;
  private readonly threshold: number;
  private readonly cooldown: number;
  private readonly gapReset: number;

  constructor(opts: WheelOpts = {}) {
    this.threshold = opts.threshold ?? 50;
    this.cooldown = opts.cooldownMs ?? 600;
    this.gapReset = opts.gapResetMs ?? 250;
  }

  feed(deltaY: number, nowMs: number): -1 | 0 | 1 {
    if (nowMs - this.lastEvent > this.gapReset) this.acc = 0;
    this.lastEvent = nowMs;
    if (Math.sign(deltaY) !== Math.sign(this.acc) && this.acc !== 0) this.acc = 0;
    this.acc += deltaY;
    if (Math.abs(this.acc) < this.threshold) return 0;
    this.acc = 0;
    if (nowMs - this.lastFire < this.cooldown) return 0;
    this.lastFire = nowMs;
    return deltaY > 0 ? 1 : -1;
  }
}
