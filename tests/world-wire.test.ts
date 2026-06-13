import { afterEach, describe, expect, it, vi } from 'vitest';
import { NODES, SITE } from '../src/content/nodes';
import type { WorldScene } from '../src/world/scene';
import { wireWorld } from '../src/world/wire';

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

describe('wireWorld', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an idempotent cleanup that cancels the animation loop', () => {
    const { callbacks, requestAnimationFrame, cancelAnimationFrame } = installAnimationFrame();
    const scene = { frame: vi.fn() } as unknown as WorldScene;

    const cleanup = wireWorld(scene, { nodes: NODES, site: SITE, reducedMotion: false });

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    const firstFrame = callbacks.get(1)!;
    callbacks.delete(1);
    firstFrame(performance.now() + 16);

    expect(scene.frame).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    const secondFrame = callbacks.get(2)!;

    cleanup();
    cleanup();
    secondFrame(performance.now() + 32);

    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(2);
    expect(callbacks.has(2)).toBe(false);
    expect(scene.frame).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
  });
});
