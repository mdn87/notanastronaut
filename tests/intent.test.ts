import { describe, expect, it } from 'vitest';
import { WheelIntent } from '../src/core/intent';

describe('WheelIntent', () => {
  it('a fast burst fires exactly one advance', () => {
    const w = new WheelIntent();
    let fired = 0;
    for (let i = 0; i < 12; i++) {
      if (w.feed(40, 1000 + i * 30) !== 0) fired++;
    }
    expect(fired).toBe(1);
  });

  it('small drifts below threshold never fire', () => {
    const w = new WheelIntent({ threshold: 50 });
    expect(w.feed(10, 0)).toBe(0);
    // 300ms gap resets the accumulator, so slow trickles never sum to a fire
    expect(w.feed(10, 300)).toBe(0);
    expect(w.feed(10, 600)).toBe(0);
  });

  it('fires again after the cooldown', () => {
    const w = new WheelIntent({ cooldownMs: 600 });
    expect(w.feed(120, 0)).toBe(1);
    expect(w.feed(120, 100)).toBe(0);  // inside cooldown
    expect(w.feed(120, 700)).toBe(1);  // past cooldown
  });

  it('direction follows sign', () => {
    const w = new WheelIntent({ cooldownMs: 0 });
    expect(w.feed(120, 0)).toBe(1);
    expect(w.feed(-120, 50)).toBe(-1);
  });
});
