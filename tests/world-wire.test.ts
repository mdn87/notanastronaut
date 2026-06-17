import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NODES, SITE } from '../src/content/nodes';
import type { WorldScene } from '../src/world/scene';

const hudMocks = vi.hoisted(() => {
  const instances: Array<{
    root: unknown;
    nodes: unknown;
    site: unknown;
    setAtNode: ReturnType<typeof vi.fn>;
    setTransit: ReturnType<typeof vi.fn>;
    setLabels: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];

  const Hud = vi.fn(function (
    this: {
      root: unknown;
      nodes: unknown;
      site: unknown;
      setAtNode: ReturnType<typeof vi.fn>;
      setTransit: ReturnType<typeof vi.fn>;
      setLabels: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    },
    root: unknown,
    nodes: unknown,
    site: unknown,
  ) {
    this.root = root;
    this.nodes = nodes;
    this.site = site;
    this.setAtNode = vi.fn();
    this.setTransit = vi.fn();
    this.setLabels = vi.fn();
    this.dispose = vi.fn();
    instances.push(this);
  });

  return { Hud, instances };
});

vi.mock('../src/hud/hud', () => ({ Hud: hudMocks.Hud }));

import { wireWorld } from '../src/world/wire';

type Listener = (event: Record<string, unknown>) => void;

function installAnimationFrame() {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  const cancelAnimationFrame = vi.fn((id: number) => {
    callbacks.delete(id);
  });
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
  return { callbacks, requestAnimationFrame, cancelAnimationFrame };
}

function runFrame(callbacks: Map<number, FrameRequestCallback>, id: number, now: number) {
  const callback = callbacks.get(id);
  if (!callback) throw new Error(`missing frame ${id}`);
  callbacks.delete(id);
  callback(now);
}

function makeEventTarget() {
  const listeners = new Map<string, Set<Listener>>();
  const listenerFns = new Map<EventListenerOrEventListenerObject, Listener>();
  const listenerFn = (listener: EventListenerOrEventListenerObject): Listener => {
    const existing = listenerFns.get(listener);
    if (existing) return existing;
    const fn: Listener = typeof listener === 'function'
      ? (event) => listener(event as unknown as Event)
      : (event) => listener.handleEvent(event as unknown as Event);
    listenerFns.set(listener, fn);
    return fn;
  };
  const addEventListener = vi.fn((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean,
  ) => {
    const signal = typeof options === 'object' ? options.signal : undefined;
    if (signal?.aborted) return;
    const fn = listenerFn(listener);
    const set = listeners.get(type) ?? new Set<Listener>();
    set.add(fn);
    listeners.set(type, set);
    signal?.addEventListener('abort', () => set.delete(fn), { once: true });
  });
  const removeEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    const set = listeners.get(type);
    if (!set) return;
    set.delete(listenerFn(listener));
  });
  const dispatch = (type: string, event: Record<string, unknown> = {}) => {
    for (const listener of [...(listeners.get(type) ?? [])]) listener(event);
  };
  const listenerCount = (type?: string) => {
    if (type) return listeners.get(type)?.size ?? 0;
    return [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
  };
  return { addEventListener, removeEventListener, dispatch, listenerCount };
}

function installDom(pathname = '/', search = '?mode=world') {
  const windowTarget = makeEventTarget();
  const canvasTarget = makeEventTarget();
  const hudRoot = { id: 'hud-root' };
  const location = { pathname, search };
  const history = {
    pushState: vi.fn((_state: unknown, _title: string, url: string) => {
      const parsed = new URL(url, 'https://notanastronaut.com');
      location.pathname = parsed.pathname;
      location.search = parsed.search;
    }),
  };
  const document = {
    getElementById: vi.fn((id: string) => id === 'hud-root' ? hudRoot : null),
  };

  vi.stubGlobal('document', document);
  vi.stubGlobal('location', location);
  vi.stubGlobal('history', history);
  vi.stubGlobal('addEventListener', windowTarget.addEventListener);
  vi.stubGlobal('removeEventListener', windowTarget.removeEventListener);

  const canvas = {
    addEventListener: canvasTarget.addEventListener,
    removeEventListener: canvasTarget.removeEventListener,
  } as unknown as HTMLCanvasElement;

  return { canvas, canvasTarget, history, hudRoot, location, windowTarget };
}

function makeScene(canvas: HTMLCanvasElement): WorldScene {
  return {
    frame: vi.fn(),
    pickNode: vi.fn(),
    labels: vi.fn(() => []),
    renderer: { domElement: canvas },
  } as unknown as WorldScene;
}

describe('wireWorld', () => {
  beforeEach(() => {
    hudMocks.instances.length = 0;
    hudMocks.Hud.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts at the current route and renders that node on the first frame', () => {
    const { callbacks } = installAnimationFrame();
    const { canvas, history, hudRoot } = installDom('/missions/maker-bay', '?mode=world');
    const scene = makeScene(canvas);

    const cleanup = wireWorld(scene, { nodes: NODES, site: SITE, reducedMotion: false });

    expect(hudMocks.Hud).toHaveBeenCalledWith(hudRoot, NODES, SITE);
    expect(hudMocks.instances[0]!.setAtNode).toHaveBeenCalledWith(3);
    expect(history.pushState).not.toHaveBeenCalled();

    runFrame(callbacks, 1, performance.now() + 16);

    expect(scene.frame).toHaveBeenCalledWith(expect.any(Number), { kind: 'atNode', index: 3 });

    cleanup();
  });

  it('turns a wheel gesture into one transit and pushes the arrival route with the current query string', () => {
    const { callbacks } = installAnimationFrame();
    const { canvas, history, windowTarget } = installDom('/', '?mode=world');
    const scene = makeScene(canvas);

    const cleanup = wireWorld(scene, { nodes: NODES, site: SITE, reducedMotion: true });

    windowTarget.dispatch('wheel', { deltaY: 120 });

    expect(hudMocks.instances[0]!.setTransit).toHaveBeenCalledWith(1);

    runFrame(callbacks, 1, performance.now() + 16);

    expect(hudMocks.instances[0]!.setAtNode).toHaveBeenLastCalledWith(1);
    expect(history.pushState).toHaveBeenCalledWith(null, '', '/missions/agent-ops?mode=world');
    expect(scene.frame).toHaveBeenCalledWith(expect.any(Number), { kind: 'atNode', index: 1 });

    windowTarget.dispatch('wheel', { deltaY: 120 });
    expect(hudMocks.instances[0]!.setTransit).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('wires keyboard, touch swipe, canvas click, and popstate navigation', () => {
    const { callbacks } = installAnimationFrame();
    const { canvas, canvasTarget, history, location, windowTarget } = installDom('/', '?mode=world');
    const scene = makeScene(canvas);
    vi.mocked(scene.pickNode).mockReturnValue(3);

    const cleanup = wireWorld(scene, { nodes: NODES, site: SITE, reducedMotion: true });

    windowTarget.dispatch('keydown', { key: 'PageDown' });
    expect(hudMocks.instances[0]!.setTransit).toHaveBeenLastCalledWith(1);
    runFrame(callbacks, 1, performance.now() + 16);

    windowTarget.dispatch('pointerdown', { pointerType: 'touch', clientY: 100 });
    windowTarget.dispatch('pointerup', { pointerType: 'touch', clientY: 170 });
    expect(hudMocks.instances[0]!.setTransit).toHaveBeenLastCalledWith(0);
    runFrame(callbacks, 2, performance.now() + 32);

    canvasTarget.dispatch('click', { clientX: 24, clientY: 48 });
    expect(scene.pickNode).toHaveBeenCalledWith(24, 48);
    expect(hudMocks.instances[0]!.setTransit).toHaveBeenLastCalledWith(3);
    runFrame(callbacks, 3, performance.now() + 48);

    location.pathname = '/missions/agent-ops';
    windowTarget.dispatch('popstate');
    expect(hudMocks.instances[0]!.setTransit).toHaveBeenLastCalledWith(1);
    runFrame(callbacks, 4, performance.now() + 64);

    expect(hudMocks.instances[0]!.setAtNode).toHaveBeenLastCalledWith(1);
    expect(history.pushState).toHaveBeenCalledTimes(3);

    cleanup();
  });

  it('syncs popstate during an in-flight transit without re-pushing the stale destination', () => {
    const { callbacks } = installAnimationFrame();
    const { canvas, history, location, windowTarget } = installDom('/', '?mode=world');
    const scene = makeScene(canvas);

    const cleanup = wireWorld(scene, { nodes: NODES, site: SITE, reducedMotion: true });

    windowTarget.dispatch('keydown', { key: 'PageDown' });
    expect(hudMocks.instances[0]!.setTransit).toHaveBeenLastCalledWith(1);

    location.pathname = '/contact';
    windowTarget.dispatch('popstate');

    expect(hudMocks.instances[0]!.setTransit).toHaveBeenLastCalledWith(5);

    runFrame(callbacks, 1, performance.now() + 16);

    expect(hudMocks.instances[0]!.setAtNode).toHaveBeenLastCalledWith(5);
    expect(history.pushState).not.toHaveBeenCalled();
    expect(scene.frame).toHaveBeenCalledWith(expect.any(Number), { kind: 'atNode', index: 5 });

    cleanup();
  });

  it('returns an idempotent cleanup that cancels raf and removes every registered listener', () => {
    const { callbacks, cancelAnimationFrame, requestAnimationFrame } = installAnimationFrame();
    const { canvas, canvasTarget, windowTarget } = installDom();
    const scene = makeScene(canvas);

    const cleanup = wireWorld(scene, { nodes: NODES, site: SITE, reducedMotion: false });

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(windowTarget.addEventListener).toHaveBeenCalledWith(
      'wheel',
      expect.any(Function),
      expect.objectContaining({ passive: true }),
    );
    expect(windowTarget.listenerCount()).toBe(5);
    expect(canvasTarget.listenerCount()).toBe(1);

    runFrame(callbacks, 1, performance.now() + 16);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);

    cleanup();
    cleanup();

    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(2);
    expect(hudMocks.instances[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(windowTarget.listenerCount()).toBe(0);
    expect(canvasTarget.listenerCount()).toBe(0);
  });
});
