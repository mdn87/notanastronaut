import { describe, expect, it } from 'vitest';
import { TravelMachine } from '../src/core/travel';

const mk = (opts?: { transitDuration?: number }) => new TravelMachine(6, opts);

describe('TravelMachine', () => {
  it('starts at node 0', () => {
    expect(mk().state).toEqual({ kind: 'atNode', index: 0 });
  });

  it('advance starts a transit and tick completes it', () => {
    const m = mk({ transitDuration: 1.5 });
    expect(m.advance()).toBe(true);
    expect(m.state).toEqual({ kind: 'inTransit', from: 0, to: 1, t: 0 });
    m.tick(0.75);
    expect(m.state).toMatchObject({ kind: 'inTransit', t: 0.5 });
    m.tick(0.75);
    expect(m.state).toEqual({ kind: 'atNode', index: 1 });
  });

  it('ignores verbs while in transit', () => {
    const m = mk();
    m.advance();
    expect(m.advance()).toBe(false);
    expect(m.back()).toBe(false);
    expect(m.jumpTo(4)).toBe(false);
    expect(m.state).toEqual({ kind: 'inTransit', from: 0, to: 1, t: 0 });
  });

  it('steps back from node 0 into the overview, and clamps there', () => {
    const m = mk();
    expect(m.back()).toBe(true); // node 0 -> overview transit
    expect(m.state).toEqual({ kind: 'inTransit', from: 0, to: -1, t: 0 });
    m.tick(10);
    expect(m.state).toEqual({ kind: 'atNode', index: -1 }); // overview
    expect(m.back()).toBe(false); // overview is the start; nothing behind it
  });

  it('advances out of the overview back to node 0', () => {
    const m = mk();
    m.back(); m.tick(10); // now at overview (-1)
    expect(m.advance()).toBe(true);
    expect(m.state).toEqual({ kind: 'inTransit', from: -1, to: 0, t: 0 });
    m.tick(10);
    expect(m.state).toEqual({ kind: 'atNode', index: 0 });
  });

  it('jumps straight to a node from the overview', () => {
    const m = mk();
    m.back(); m.tick(10); // overview
    expect(m.jumpTo(3)).toBe(true);
    expect(m.state).toEqual({ kind: 'inTransit', from: -1, to: 3, t: 0 });
  });

  it('clamps advancing past the last node', () => {
    const last = mk();
    last.jumpTo(5);
    last.tick(10);
    expect(last.state).toEqual({ kind: 'atNode', index: 5 });
    expect(last.advance()).toBe(false);
  });

  it('fires onArrive with -1 when reaching the overview', () => {
    const m = mk({ transitDuration: 1 });
    const arrivals: number[] = [];
    m.onArrive((i) => arrivals.push(i));
    m.back(); m.tick(1);
    expect(arrivals).toEqual([-1]);
  });

  it('rejects invalid jump targets without changing state', () => {
    const m = mk();
    expect(m.jumpTo(Number.NaN)).toBe(false);
    expect(m.state).toEqual({ kind: 'atNode', index: 0 });
    expect(m.jumpTo(1.5)).toBe(false);
    expect(m.state).toEqual({ kind: 'atNode', index: 0 });
    expect(m.jumpTo(-1)).toBe(false);
    expect(m.state).toEqual({ kind: 'atNode', index: 0 });
    expect(m.jumpTo(6)).toBe(false);
    expect(m.state).toEqual({ kind: 'atNode', index: 0 });
  });

  it('jumpTo same node is a no-op', () => {
    const m = mk();
    expect(m.jumpTo(0)).toBe(false);
  });

  it('transitDuration 0 arrives on next tick', () => {
    const m = mk({ transitDuration: 0 });
    m.advance();
    m.tick(0.016);
    expect(m.state).toEqual({ kind: 'atNode', index: 1 });
  });

  it('fires onArrive with the node index', () => {
    const m = mk({ transitDuration: 1 });
    const arrivals: number[] = [];
    m.onArrive((i) => arrivals.push(i));
    m.advance(); m.tick(1);
    m.jumpTo(4); m.tick(0.5); m.tick(0.5);
    expect(arrivals).toEqual([1, 4]);
  });

  it('does not fire callbacks registered during the same arrival', () => {
    const m = mk({ transitDuration: 1 });
    const arrivals: string[] = [];
    let registered = false;
    m.onArrive((i) => {
      arrivals.push(`first:${i}`);
      if (!registered) {
        registered = true;
        m.onArrive((j) => arrivals.push(`second:${j}`));
      }
    });

    m.advance(); m.tick(1);
    expect(arrivals).toEqual(['first:1']);
    m.advance(); m.tick(1);
    expect(arrivals).toEqual(['first:1', 'first:2', 'second:2']);
  });
});
