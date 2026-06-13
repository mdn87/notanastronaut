import type { WorldScene } from './scene';
import type { MountOpts } from './mount';

export function wireWorld(scene: WorldScene, opts: MountOpts): void {
  // Wiring (travel, input, hud, router) lands in the next task.
  let last = performance.now();
  const loop = (now: number) => {
    scene.frame(Math.min(0.05, (now - last) / 1000), { kind: 'atNode', index: 0 });
    last = now;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  void opts;
}
