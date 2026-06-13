import type { NodeDef } from '../core/types';
import type { SITE } from '../content/nodes';
import { WorldScene } from './scene';

export interface MountOpts { nodes: NodeDef[]; site: typeof SITE; reducedMotion: boolean; }

export async function mountWorld(opts: MountOpts): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.id = 'scene';
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block;';
  canvas.setAttribute('aria-hidden', 'true');

  let scene: WorldScene | null = null;
  let onResize: (() => void) | null = null;
  try {
    scene = new WorldScene(canvas, opts.nodes, { idle: !opts.reducedMotion });
    onResize = () => scene?.resize();
    document.body.prepend(canvas);
    addEventListener('resize', onResize);

    const { wireWorld } = await import('./wire');
    wireWorld(scene, opts);
  } catch (err) {
    if (onResize) removeEventListener('resize', onResize);
    scene?.dispose();
    canvas.remove();
    throw err;
  }
}
