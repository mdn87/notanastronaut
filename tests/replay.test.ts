import { describe, expect, it } from 'vitest';
import { MotionController } from '../src/core/motion';

type Event =
  | { kind: 'wheel'; deltaY: number }
  | { kind: 'key'; dir: 1 | -1 }
  | { kind: 'jump'; to: number }
  | { kind: 'tick'; dt: number; times?: number };

function replay(events: Event[]): { state: unknown; arrivals: number[] } {
  const m = new MotionController(6, { reducedMotion: false });
  const arrivals: number[] = [];
  m.onArrive((i) => arrivals.push(i));
  for (const e of events) {
    if (e.kind === 'wheel') m.nudge(e.deltaY);
    else if (e.kind === 'key') e.dir === 1 ? m.advance() : m.back();
    else if (e.kind === 'jump') m.jumpTo(e.to);
    else {
      const times = e.times ?? 1;
      for (let i = 0; i < times; i++) m.tick(e.dt);
    }
  }
  return { state: m.snapshot(), arrivals };
}

describe('replay', () => {
  it('a recorded continuous session always lands in the same place', () => {
    const session: Event[] = [
      { kind: 'wheel', deltaY: 140 },
      { kind: 'tick', dt: 0.2 },
      { kind: 'wheel', deltaY: 140 },
      { kind: 'tick', dt: 0.4 },
      { kind: 'key', dir: 1 },
      { kind: 'tick', dt: 1 / 60, times: 150 },
      { kind: 'jump', to: 5 },
      { kind: 'tick', dt: 1 / 60, times: 300 },
      { kind: 'key', dir: -1 },
      { kind: 'tick', dt: 1 / 60, times: 150 },
    ];
    const a = replay(session);
    const b = replay(session);
    expect(a).toEqual(b);
    expect(a.state).toMatchObject({ phase: 'atNode', progress: 4, settledIndex: 4 });
    expect(a.arrivals).toEqual([1, 5, 4]);
  });
});
