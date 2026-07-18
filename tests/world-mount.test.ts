import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const scene = { dispose: vi.fn(), resize: vi.fn() };
  const cleanupWire = vi.fn();
  return {
    cleanupWire,
    scene,
    wireWorld: vi.fn(() => cleanupWire),
    WorldScene: vi.fn(() => scene),
  };
});

vi.mock('../src/world/scene', () => ({ WorldScene: mocks.WorldScene }));
vi.mock('../src/world/wire', () => ({ wireWorld: mocks.wireWorld }));

import { mountWorld } from '../src/world/mount';

interface FakeCanvas {
  id: string;
  parent: FakeBody | null;
  style: { cssText: string };
  attrs: Record<string, string>;
  remove: () => void;
  setAttribute: (name: string, value: string) => void;
}

interface FakeBody {
  children: FakeCanvas[];
  prepend: (canvas: FakeCanvas) => void;
}

function installFakeDom(): {
  body: FakeBody;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
} {
  const body: FakeBody = {
    children: [],
    prepend(canvas) {
      canvas.parent = body;
      body.children.unshift(canvas);
    },
  };
  const document = {
    body,
    createElement(tag: string) {
      if (tag !== 'canvas') throw new Error(`unexpected element ${tag}`);
      const canvas: FakeCanvas = {
        id: '',
        parent: null,
        style: { cssText: '' },
        attrs: {},
        remove() {
          if (!canvas.parent) return;
          canvas.parent.children = canvas.parent.children.filter((child) => child !== canvas);
          canvas.parent = null;
        },
        setAttribute(name, value) {
          canvas.attrs[name] = value;
        },
      };
      return canvas;
    },
  };
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  vi.stubGlobal('document', document);
  vi.stubGlobal('addEventListener', addEventListener);
  vi.stubGlobal('removeEventListener', removeEventListener);
  return { body, addEventListener, removeEventListener };
}

describe('mountWorld', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.WorldScene.mockImplementation(() => mocks.scene);
    mocks.wireWorld.mockImplementation(() => mocks.cleanupWire);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes the canvas when scene construction fails', async () => {
    const { body } = installFakeDom();
    mocks.WorldScene.mockImplementationOnce(() => {
      throw new Error('webgl unavailable');
    });

    await expect(mountWorld({ reducedMotion: false }))
      .rejects.toThrow('webgl unavailable');

    expect(body.children).toEqual([]);
  });

  it('returns an idempotent cleanup for canvas, listener, scene, and wiring', async () => {
    const { body, addEventListener, removeEventListener } = installFakeDom();

    const cleanup = await mountWorld({ reducedMotion: false });

    expect(body.children).toHaveLength(1);
    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(mocks.wireWorld).toHaveBeenCalledTimes(1);

    cleanup();
    cleanup();

    expect(body.children).toEqual([]);
    expect(mocks.cleanupWire).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledTimes(1);
    expect(mocks.scene.dispose).toHaveBeenCalledTimes(1);
  });

  it('removes the canvas, listener, and scene when wiring fails', async () => {
    const { body, removeEventListener } = installFakeDom();
    mocks.wireWorld.mockImplementationOnce(() => {
      throw new Error('wire failed');
    });

    await expect(mountWorld({ reducedMotion: false }))
      .rejects.toThrow('wire failed');

    expect(body.children).toEqual([]);
    expect(removeEventListener).toHaveBeenCalledTimes(1);
    expect(mocks.scene.dispose).toHaveBeenCalledTimes(1);
  });
});
