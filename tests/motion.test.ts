import { describe, expect, it } from 'vitest';
import { MotionController } from '../src/core/motion';

describe('MotionController', () => {
  it('starts settled at node 0', () => {
    const m = new MotionController(6);
    expect(m.snapshot()).toMatchObject({
      phase: 'atNode',
      progress: 0,
      targetProgress: 0,
      settledIndex: 0,
    });
  });

  it('uses node-unit progress including overview at -1', () => {
    const m = new MotionController(6, { reducedMotion: true });
    m.back();
    m.tick(0.016);
    expect(m.snapshot()).toMatchObject({ phase: 'overview', progress: -1, settledIndex: -1 });
    m.advance();
    m.tick(0.016);
    expect(m.snapshot()).toMatchObject({ phase: 'atNode', progress: 0, settledIndex: 0 });
  });

  it('reports directional from/to immediately when backing toward overview', () => {
    const m = new MotionController(6);
    m.back();
    expect(m.snapshot()).toMatchObject({ phase: 'inTransit', from: 0, to: -1, settledIndex: null });
  });

  it('keeps backward from/to stable while moving toward overview', () => {
    const m = new MotionController(6);
    m.back();
    m.tick(0.1);
    const s = m.snapshot();
    expect(s.phase).toBe('inTransit');
    expect(s.from).toBe(0);
    expect(s.to).toBe(-1);
    expect(s.t).toBeGreaterThan(0);
    expect(s.t).toBeLessThan(1);
  });

  it('reports directional from/to when advancing from overview', () => {
    const m = new MotionController(6, { reducedMotion: true });
    m.back();
    m.tick(0.016);
    m.advance();
    expect(m.snapshot()).toMatchObject({ phase: 'atNode', from: 0, to: 0 });

    const animated = new MotionController(6);
    animated.back();
    for (let i = 0; i < 90; i++) animated.tick(1 / 60);
    animated.advance();
    expect(animated.snapshot()).toMatchObject({ phase: 'inTransit', from: -1, to: 0, settledIndex: null });
  });

  it('wheel deltas create continuous progress before settling', () => {
    const m = new MotionController(6, { wheelScale: 0.002, snapRadius: 0.08 });
    m.nudge(120);
    m.tick(0.05);
    const s = m.snapshot();
    expect(s.progress).toBeGreaterThan(0);
    expect(s.progress).toBeLessThan(1);
    expect(s.phase).toBe('inTransit');
  });

  it('default wheel nudges do not snap back to the current node when target leaves snap radius', () => {
    const m = new MotionController(6);
    m.nudge(120);
    m.tick(0.05);
    const s = m.snapshot();
    expect(s.targetProgress).toBeGreaterThan(0);
    expect(s.from).toBe(0);
    expect(s.to).toBe(1);
  });

  it('small default wheel nudges visibly depart a settled node', () => {
    const m = new MotionController(6);

    m.nudge(20);
    m.tick(0.05);

    const s = m.snapshot();
    expect(s.phase).toBe('inTransit');
    expect(s.targetProgress).toBeGreaterThan(0.12);
    expect(s.progress).toBeGreaterThan(0);
  });

  it('small default wheel nudges from rest settle at the adjacent node', () => {
    const m = new MotionController(6);

    m.nudge(20);
    for (let i = 0; i < 180; i++) m.tick(1 / 60);

    expect(m.snapshot()).toMatchObject({ phase: 'atNode', progress: 1, settledIndex: 1 });
  });

  it('small default wheel nudges backward from the final node settle at the previous node', () => {
    const m = new MotionController(6);
    m.setProgress(5);

    m.nudge(-20);
    for (let i = 0; i < 180; i++) m.tick(1 / 60);

    expect(m.snapshot()).toMatchObject({ phase: 'atNode', progress: 4, settledIndex: 4 });
  });

  it('large default wheel nudges cannot fling the target several nodes ahead', () => {
    const m = new MotionController(6);

    m.nudge(3000);

    expect(m.snapshot().targetProgress).toBeLessThanOrEqual(1);
  });

  it('wheel bursts do not push past the next stop before arrival', () => {
    const m = new MotionController(6);

    m.nudge(140);
    m.tick(0.2);
    m.nudge(140);

    expect(m.snapshot().targetProgress).toBe(1);
  });

  it('advance does not skip past an in-flight wheel target', () => {
    const m = new MotionController(6);

    m.nudge(140);
    m.tick(0.6);

    expect(m.advance()).toBe(false);
    expect(m.snapshot().targetProgress).toBe(1);
  });

  it('snaps to a nearby node when velocity decays', () => {
    const m = new MotionController(6, { snapRadius: 0.18, damping: 14 });
    m.jumpTo(1);
    for (let i = 0; i < 90; i++) m.tick(1 / 60);
    expect(m.snapshot()).toMatchObject({ phase: 'atNode', progress: 1, settledIndex: 1 });
  });

  it('keeps default node hops visually unhurried', () => {
    const m = new MotionController(6);
    m.advance();

    for (let i = 0; i < 15; i++) m.tick(1 / 60);
    expect(m.snapshot().progress).toBeLessThan(0.55);

    for (let i = 0; i < 45; i++) m.tick(1 / 60);
    expect(m.snapshot().phase).toBe('inTransit');

    for (let i = 0; i < 90; i++) m.tick(1 / 60);
    expect(m.snapshot()).toMatchObject({ phase: 'atNode', progress: 1, settledIndex: 1 });
  });

  it('settles fractional targets inside the snap radius onto the nearest node', () => {
    const m = new MotionController(6, { snapRadius: 0.18, damping: 14 });
    const arrivals: number[] = [];
    m.onArrive((i) => arrivals.push(i));
    m.setProgress(0.96);
    for (let i = 0; i < 600; i++) m.tick(1 / 60);
    expect(m.snapshot()).toMatchObject({ phase: 'atNode', progress: 1, targetProgress: 1, settledIndex: 1 });
    expect(arrivals).toEqual([1]);
  });

  it('jumpTo current settled node is a no-op', () => {
    const m = new MotionController(6);
    expect(m.jumpTo(0)).toBe(false);
    expect(m.snapshot()).toMatchObject({ phase: 'atNode', progress: 0, settledIndex: 0 });
  });

  it('strong wheel intent can pass through a snap zone', () => {
    const m = new MotionController(6, { wheelScale: 0.02, snapRadius: 0.25, passThroughVelocity: 0.9 });
    m.setProgress(0.9);
    m.nudge(240);
    m.tick(0.05);
    expect(m.snapshot().targetProgress).toBeGreaterThan(1);
  });

  it('normalizes negative maxVelocity so idle tick stays settled', () => {
    const m = new MotionController(6, { maxVelocity: -1 });
    m.tick(1 / 60);
    expect(m.snapshot()).toMatchObject({ phase: 'atNode', progress: 0, velocity: 0, settledIndex: 0 });
  });

  it('falls back to default maxVelocity when option is negative', () => {
    const m = new MotionController(6, { maxVelocity: -1 });
    m.jumpTo(1);
    for (let i = 0; i < 300; i++) m.tick(1 / 60);
    expect(m.snapshot()).toMatchObject({ phase: 'atNode', progress: 1, settledIndex: 1 });
  });

  it('falls back to default damping and settle epsilon when options are negative', () => {
    const m = new MotionController(6, { damping: -1, settleEpsilon: -1 });
    m.jumpTo(1);
    for (let i = 0; i < 300; i++) m.tick(1 / 60);
    expect(m.snapshot()).toMatchObject({ phase: 'atNode', progress: 1, settledIndex: 1 });
  });

  it('reduced-motion wheel nudges settle to integer nodes', () => {
    const m = new MotionController(6, { reducedMotion: true });
    const arrivals: number[] = [];
    m.onArrive((i) => arrivals.push(i));
    m.nudge(120);
    m.tick(1 / 60);
    expect(m.snapshot()).toMatchObject({ phase: 'atNode', progress: 1, targetProgress: 1, velocity: 0, settledIndex: 1 });
    expect(arrivals).toEqual([1]);
  });

  it('limits actual progress movement by maxVelocity', () => {
    const m = new MotionController(6, { maxVelocity: 0.5, damping: 100, stepDuration: 0.01 });
    m.jumpTo(5);
    m.tick(0.1);
    expect(m.snapshot().progress).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  it('fires arrival once per settled node', () => {
    const m = new MotionController(6, { reducedMotion: true });
    const arrivals: number[] = [];
    m.onArrive((i) => arrivals.push(i));
    m.jumpTo(2);
    m.tick(0.016);
    m.tick(0.016);
    expect(arrivals).toEqual([2]);
  });

  it('fires arrival after departing and returning to the same node', () => {
    const m = new MotionController(6, { damping: 14 });
    const arrivals: number[] = [];
    m.onArrive((i) => arrivals.push(i));

    m.advance();
    for (let i = 0; i < 5; i++) m.tick(1 / 60);
    m.back();
    for (let i = 0; i < 300; i++) m.tick(1 / 60);

    expect(arrivals).toEqual([0]);
  });

  it('fires arrival after setProgress departs and returns to the same node', () => {
    const m = new MotionController(6, { damping: 14 });
    const arrivals: number[] = [];
    m.onArrive((i) => arrivals.push(i));

    m.setProgress(0.5);
    m.jumpTo(0);
    for (let i = 0; i < 300; i++) m.tick(1 / 60);

    expect(arrivals).toEqual([0]);
  });

  it('is deterministic for identical dt and input streams', () => {
    const session = (m: MotionController) => {
      m.nudge(180); m.tick(0.04);
      m.tick(0.12);
      m.nudge(90); m.tick(0.08);
      m.back(); m.tick(0.3);
      m.jumpTo(4);
      for (let i = 0; i < 30; i++) m.tick(1 / 60);
      return m.snapshot();
    };
    expect(session(new MotionController(6))).toEqual(session(new MotionController(6)));
  });

  it('rejects invalid jump targets', () => {
    const m = new MotionController(6);
    expect(m.jumpTo(Number.NaN)).toBe(false);
    expect(m.jumpTo(1.5)).toBe(false);
    expect(m.jumpTo(-2)).toBe(false);
    expect(m.jumpTo(6)).toBe(false);
    expect(m.snapshot().progress).toBe(0);
  });
});
