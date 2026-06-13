import type { NodeDef } from '../core/types';
import type { SITE } from '../content/nodes';
import { WorldScene } from './scene';

export interface MountOpts { nodes: NodeDef[]; site: typeof SITE; reducedMotion: boolean; }
export type WorldCleanup = () => void;

export async function mountWorld(opts: MountOpts): Promise<WorldCleanup> {
  const canvas = document.createElement('canvas');
  canvas.id = 'scene';
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block;';
  canvas.setAttribute('aria-hidden', 'true');

  let scene: WorldScene | null = null;
  let onResize: (() => void) | null = null;
  let cleanupWire: WorldCleanup | null = null;
  try {
    scene = new WorldScene(canvas, opts.nodes, { idle: !opts.reducedMotion });
    onResize = () => scene?.resize();
    document.body.prepend(canvas);
    addEventListener('resize', onResize);

    const { wireWorld } = await import('./wire');
    cleanupWire = wireWorld(scene, opts);

    let cleaned = false;
    return () => {
      if (cleaned) return;
      cleaned = true;
      cleanupWire?.();
      if (onResize) removeEventListener('resize', onResize);
      scene?.dispose();
      canvas.remove();
    };
  } catch (err) {
    cleanupWire?.();
    if (onResize) removeEventListener('resize', onResize);
    scene?.dispose();
    canvas.remove();
    throw err;
  }
}
