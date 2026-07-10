// tests/world-wire.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSpiralGalaxy } from '../src/core/galaxy';
import type { WorldScene } from '../src/world/scene';

const hudMocks = vi.hoisted(() => {
  const instances: Array<{ setSpeed: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }> = [];
  const FlightHud = vi.fn(function (this: { setSpeed: ReturnType<typeof vi.fn>; setReadout: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }) {
    this.setSpeed = vi.fn(); this.setReadout = vi.fn(); this.dispose = vi.fn(); instances.push(this);
  });
  return { FlightHud, instances };
});
vi.mock('../src/hud/flight-hud', () => ({ FlightHud: hudMocks.FlightHud }));

const dartMocks = vi.hoisted(() => {
  const instances: Array<{
    step: ReturnType<typeof vi.fn>;
    state: ReturnType<typeof vi.fn>;
    activeStars: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];
  const DartPhysics = {
    create: vi.fn(async () => {
      const active = {
        starIndices: new Int32Array(96).fill(-1),
        positions: new Float32Array(288),
        alphas: new Float32Array(96),
        hitCount: 0,
      };
      const inst = {
        step: vi.fn(),
        state: vi.fn(() => ({
          position: { x: 0, y: 0, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          heading: { x: 0, y: 0, z: -1 },
          yaw: 0, pitch: 0, bank: 0, throttle: 0,
          speed: 0, surge: 0, strafe: 0, enginePower: 0,
        })),
        activeStars: vi.fn(() => active),
        dispose: vi.fn(),
      };
      instances.push(inst);
      return inst;
    }),
  };
  return { DartPhysics, instances };
});
vi.mock('../src/physics/dart', () => ({ DartPhysics: dartMocks.DartPhysics }));

import { wireWorld } from '../src/world/wire';

function makeEventTarget() {
  const listeners = new Map<string, Set<(e: Record<string, unknown>) => void>>();
  const addEventListener = vi.fn((t: string, fn: (e: Record<string, unknown>) => void) => {
    const set = listeners.get(t) ?? new Set(); set.add(fn); listeners.set(t, set);
  });
  const removeEventListener = vi.fn((t: string, fn: (e: Record<string, unknown>) => void) => listeners.get(t)?.delete(fn));
  const dispatch = (t: string, e: Record<string, unknown> = {}) => [...(listeners.get(t) ?? [])].forEach((fn) => fn(e));
  const count = () => [...listeners.values()].reduce((s, set) => s + set.size, 0);
  return { addEventListener, removeEventListener, dispatch, count };
}

function installFrame() {
  const cbs = new Map<number, FrameRequestCallback>(); let id = 1;
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => { const i = id++; cbs.set(i, cb); return i; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((i: number) => cbs.delete(i)));
  return { cbs };
}

function makeScene(): WorldScene {
  return { frame: vi.fn(), resize: vi.fn(), dispose: vi.fn(),
    galaxyField: makeSpiralGalaxy(1981, { count: 100 }),
    readout: vi.fn(() => ({ x: 0, y: 0, pos: { x: 0, y: 0, z: 0 }, visible: false })),
    renderer: { domElement: { clientWidth: 800, clientHeight: 600 } } } as unknown as WorldScene;
}

describe('wireWorld (free-fly)', () => {
  let win: ReturnType<typeof makeEventTarget>;
  beforeEach(() => {
    hudMocks.instances.length = 0; hudMocks.FlightHud.mockClear();
    dartMocks.instances.length = 0; dartMocks.DartPhysics.create.mockClear();
    win = makeEventTarget();
    vi.stubGlobal('addEventListener', win.addEventListener);
    vi.stubGlobal('removeEventListener', win.removeEventListener);
    vi.stubGlobal('innerWidth', 800); vi.stubGlobal('innerHeight', 600);
    vi.stubGlobal('document', { getElementById: () => ({}) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('drives scene.frame every animation frame', async () => {
    const { cbs } = installFrame();
    const scene = makeScene();
    const cleanup = await wireWorld(scene, { reducedMotion: false });
    cbs.get(1)!(performance.now() + 16); // first frame
    const dart = dartMocks.instances[0]!;
    const active = dart.activeStars.mock.results[0]!.value;
    expect(scene.frame).toHaveBeenCalledTimes(1);
    expect(dart.step).toHaveBeenCalledWith(expect.any(Number), expect.any(Object), expect.any(Number));
    expect(dart.state).toHaveBeenCalledTimes(1);
    expect(dart.activeStars).toHaveBeenCalledTimes(1);
    expect(scene.frame).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ position: expect.any(Object) }),
      active,
      expect.any(Number),
    );
    expect(dartMocks.DartPhysics.create).toHaveBeenCalledWith(expect.anything(), scene.galaxyField);
    cleanup();
  });

  it('thrusts while a thrust key is held and stops on release', async () => {
    const { cbs } = installFrame();
    const scene = makeScene();
    const cleanup = await wireWorld(scene, { reducedMotion: false });
    win.dispatch('keydown', { key: 'w' });
    const t0 = performance.now();
    for (let f = 1; f <= 30; f++) cbs.get(f)!(t0 + f * 16);
    expect(dartMocks.instances[0]!.step).toHaveBeenCalled();
    const lastCall = dartMocks.instances[0]!.step.mock.calls.at(-1) as [number, { forward: number }, number];
    expect(lastCall[1].forward).toBe(1);
    expect(lastCall[2]).toBeGreaterThan(0);
    cleanup();
  });

  it('cleanup cancels the loop and removes every listener', async () => {
    const { cbs } = installFrame();
    const cleanup = await wireWorld(makeScene(), { reducedMotion: false });
    cbs.get(1)!(performance.now() + 16);
    const before = win.count();
    expect(before).toBeGreaterThan(0);
    cleanup();
    expect(win.count()).toBe(0);
    expect(hudMocks.instances[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(dartMocks.instances[0]!.dispose).toHaveBeenCalledTimes(1);
  });
});
