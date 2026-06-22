import { MotionController } from '../core/motion';
import { Hud } from '../hud/hud';
import { routeToIndex } from '../router';
import type { RailMotionState } from '../core/types';
import type { WorldScene } from './scene';
import type { MountOpts, WorldCleanup } from './mount';

const MAX_DT_SECONDS = 0.05;
const SWIPE_THRESHOLD_PX = 60;

type RailMotionScene = Omit<WorldScene, 'frame'> & {
  frame(dt: number, motion: RailMotionState): void;
};

export function wireWorld(scene: WorldScene, opts: MountOpts): WorldCleanup {
  const { nodes, site, reducedMotion } = opts;
  const railScene = scene as unknown as RailMotionScene;
  const hud = new Hud(document.getElementById('hud-root')!, nodes, site);
  const motion = new MotionController(nodes.length, { reducedMotion });
  const canvas = scene.renderer.domElement;
  let suppressHistoryPush = false;
  let pendingArrival: { index: number; suppressHistoryPush: boolean } | null = null;

  const updateTransitHud = (previousSettledIndex: number | null) => {
    const state = motion.snapshot();
    if (state.phase === 'inTransit') {
      hud.setTransit(state.to);
      return;
    }
    if (reducedMotion && state.settledIndex !== previousSettledIndex) {
      hud.setTransit(state.settledIndex);
    }
  };
  const advance = () => {
    const previousSettledIndex = motion.snapshot().settledIndex;
    if (motion.advance()) updateTransitHud(previousSettledIndex);
  };
  const back = () => {
    const previousSettledIndex = motion.snapshot().settledIndex;
    if (motion.back()) updateTransitHud(previousSettledIndex);
  };
  const jumpTo = (index: number) => {
    const previousSettledIndex = motion.snapshot().settledIndex;
    if (motion.jumpTo(index)) updateTransitHud(previousSettledIndex);
  };
  const syncToCurrentRoute = () => {
    const index = routeToIndex(location.pathname, nodes);
    if (index === null) return;
    if (motion.snapshot().settledIndex === index) {
      hud.setAtNode(index);
      return;
    }
    hud.setTransit(index);
    suppressHistoryPush = true;
    try {
      motion.setProgress(index);
    } finally {
      suppressHistoryPush = false;
    }
  };

  const startIndex = routeToIndex(location.pathname, nodes) ?? 0;
  motion.setProgress(startIndex);
  hud.setAtNode(startIndex);

  const unlistenArrive = motion.onArrive((index) => {
    pendingArrival = { index, suppressHistoryPush };
  });

  const flushArrival = () => {
    if (!pendingArrival) return;
    const { index, suppressHistoryPush: shouldSuppressHistoryPush } = pendingArrival;
    pendingArrival = null;
    if (index < 0) { hud.setOverview(); return; } // arrived at the galaxy overview
    hud.setAtNode(index);
    const route = nodes[index]?.route;
    const nextUrl = route ? `${route}${location.search}` : null;
    if (!shouldSuppressHistoryPush && nextUrl && `${location.pathname}${location.search}` !== nextUrl) {
      history.pushState(null, '', nextUrl);
    }
  };

  const onWheel = (event: WheelEvent) => {
    if (reducedMotion && pendingArrival) return;
    const previousSettledIndex = motion.snapshot().settledIndex;
    motion.nudge(event.deltaY);
    updateTransitHud(previousSettledIndex);
  };
  addEventListener('wheel', onWheel, { passive: true });

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'PageDown') advance();
    else if (event.key === 'ArrowUp' || event.key === 'PageUp') back();
  };
  addEventListener('keydown', onKeydown);

  let touchStartY: number | null = null;
  const onPointerdown = (event: PointerEvent) => {
    if (event.pointerType === 'touch') touchStartY = event.clientY;
  };
  addEventListener('pointerdown', onPointerdown);

  const onPointerup = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || touchStartY === null) return;
    const deltaY = event.clientY - touchStartY;
    touchStartY = null;
    if (deltaY < -SWIPE_THRESHOLD_PX) advance();
    else if (deltaY > SWIPE_THRESHOLD_PX) back();
  };
  addEventListener('pointerup', onPointerup);

  const onClick = (event: MouseEvent) => {
    const index = scene.pickNode(event.clientX, event.clientY);
    if (index !== null) jumpTo(index);
  };
  canvas.addEventListener('click', onClick);

  const onPopstate = () => {
    syncToCurrentRoute();
  };
  addEventListener('popstate', onPopstate);

  let last = performance.now();
  let frameId = 0;
  let stopped = false;
  const loop = (now: number) => {
    if (stopped) return;
    const dt = Math.min(MAX_DT_SECONDS, Math.max(0, (now - last) / 1000));
    last = now;
    motion.tick(dt);
    const motionState = motion.snapshot();
    railScene.frame(dt, motionState);
    flushArrival();
    hud.setLabels(scene.labels());
    frameId = requestAnimationFrame(loop);
  };
  frameId = requestAnimationFrame(loop);
  return () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frameId);
    removeEventListener('wheel', onWheel);
    removeEventListener('keydown', onKeydown);
    removeEventListener('pointerdown', onPointerdown);
    removeEventListener('pointerup', onPointerup);
    removeEventListener('popstate', onPopstate);
    canvas.removeEventListener('click', onClick);
    unlistenArrive();
    hud.dispose();
  };
}
