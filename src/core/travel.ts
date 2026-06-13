import type { TravelState } from './types';

export interface TravelOpts { transitDuration?: number } // seconds

/**
 * Deterministic node-snap travel. Two states, three verbs.
 * No wall-clock: time only enters through tick(dt).
 */
export class TravelMachine {
  state: TravelState = { kind: 'atNode', index: 0 };
  private readonly nodeCount: number;
  private readonly duration: number;
  private arriveCbs: Array<(index: number) => void> = [];

  constructor(nodeCount: number, opts: TravelOpts = {}) {
    this.nodeCount = nodeCount;
    this.duration = opts.transitDuration ?? 1.5;
  }

  onArrive(cb: (index: number) => void): () => void {
    this.arriveCbs.push(cb);
    return () => { this.arriveCbs = this.arriveCbs.filter((c) => c !== cb); };
  }

  advance(): boolean {
    if (this.state.kind !== 'atNode') return false;
    return this.startTransit(this.state.index + 1);
  }

  back(): boolean {
    if (this.state.kind !== 'atNode') return false;
    return this.startTransit(this.state.index - 1);
  }

  jumpTo(index: number): boolean {
    if (this.state.kind !== 'atNode') return false;
    if (index === this.state.index) return false;
    return this.startTransit(index);
  }

  tick(dt: number): void {
    if (this.state.kind !== 'inTransit') return;
    const t = this.duration <= 0 ? 1 : this.state.t + dt / this.duration;
    if (t >= 1) {
      const to = this.state.to;
      this.state = { kind: 'atNode', index: to };
      for (const cb of this.arriveCbs) cb(to);
    } else {
      this.state = { ...this.state, t };
    }
  }

  private startTransit(to: number): boolean {
    if (to < 0 || to >= this.nodeCount) return false;
    const from = (this.state as { index: number }).index;
    this.state = { kind: 'inTransit', from, to, t: 0 };
    return true;
  }
}
