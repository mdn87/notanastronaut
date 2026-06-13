import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NODES, SITE } from '../src/content/nodes';

const mocks = vi.hoisted(() => {
  const scene = { dispose: vi.fn(), resize: vi.fn() };
  return {
    scene,
    wireWorld: vi.fn(),
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

function installFakeDom(): { body: FakeBody; removeEventListener: ReturnType<typeof vi.fn> } {
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
  const removeEventListener = vi.fn();
  vi.stubGlobal('document', document);
  vi.stubGlobal('addEventListener', vi.fn());
  vi.stubGlobal('removeEventListener', removeEventListener);
  return { body, removeEventListener };
}

describe('mountWorld', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.WorldScene.mockImplementation(() => mocks.scene);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes the canvas when scene construction fails', async () => {
    const { body } = installFakeDom();
    mocks.WorldScene.mockImplementationOnce(() => {
      throw new Error('webgl unavailable');
    });

    await expect(mountWorld({ nodes: NODES, site: SITE, reducedMotion: false }))
      .rejects.toThrow('webgl unavailable');

    expect(body.children).toEqual([]);
  });

  it('removes the canvas, listener, and scene when wiring fails', async () => {
    const { body, removeEventListener } = installFakeDom();
    mocks.wireWorld.mockImplementationOnce(() => {
      throw new Error('wire failed');
    });

    await expect(mountWorld({ nodes: NODES, site: SITE, reducedMotion: false }))
      .rejects.toThrow('wire failed');

    expect(body.children).toEqual([]);
    expect(removeEventListener).toHaveBeenCalledTimes(1);
    expect(mocks.scene.dispose).toHaveBeenCalledTimes(1);
  });
});
