import type { WorldScene } from './scene';
import type { MountOpts, WorldCleanup } from './mount';

export function wireWorld(scene: WorldScene, opts: MountOpts): WorldCleanup {
  // Wiring (travel, input, hud, router) lands in the next task.
  let last = performance.now();
  let frameId = 0;
  let stopped = false;
  const loop = (now: number) => {
    if (stopped) return;
    scene.frame(Math.min(0.05, (now - last) / 1000), { kind: 'atNode', index: 0 });
    last = now;
    frameId = requestAnimationFrame(loop);
  };
  frameId = requestAnimationFrame(loop);
  void opts;
  return () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frameId);
  };
}
