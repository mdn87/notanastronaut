import { WheelIntent } from '../core/intent';
import { TravelMachine } from '../core/travel';
import { Hud } from '../hud/hud';
import { routeToIndex } from '../router';
import type { WorldScene } from './scene';
import type { MountOpts, WorldCleanup } from './mount';

const MAX_DT_SECONDS = 0.05;
const TRANSIT_SECONDS = 1.5;
const SWIPE_THRESHOLD_PX = 60;

export function wireWorld(scene: WorldScene, opts: MountOpts): WorldCleanup {
  const { nodes, site, reducedMotion } = opts;
  const transitDuration = reducedMotion ? 0 : TRANSIT_SECONDS;
  const hud = new Hud(document.getElementById('hud-root')!, nodes, site);
  const travel = new TravelMachine(nodes.length, {
    transitDuration,
  });
  const wheel = new WheelIntent();
  const canvas = scene.renderer.domElement;
  let suppressHistoryPush = false;

  const depart = () => {
    if (travel.state.kind === 'inTransit') {
      hud.setTransit(travel.state.to);
    }
  };
  const advance = () => {
    if (travel.advance()) depart();
  };
  const back = () => {
    if (travel.back()) depart();
  };
  const jumpTo = (index: number) => {
    if (travel.jumpTo(index)) depart();
  };
  const settleTransitWithoutHistoryPush = () => {
    if (travel.state.kind !== 'inTransit') return;
    suppressHistoryPush = true;
    try {
      travel.tick(Number.POSITIVE_INFINITY);
    } finally {
      suppressHistoryPush = false;
    }
  };
  const syncToCurrentRoute = () => {
    const index = routeToIndex(location.pathname, nodes);
    if (index === null) return;
    settleTransitWithoutHistoryPush();
    if (travel.state.kind === 'atNode' && travel.state.index === index) {
      hud.setAtNode(index);
      return;
    }
    jumpTo(index);
  };

  const startIndex = routeToIndex(location.pathname, nodes) ?? 0;
  if (startIndex !== 0) {
    travel.jumpTo(startIndex);
    travel.tick(transitDuration);
  }
  hud.setAtNode(startIndex);

  const unlistenArrive = travel.onArrive((index) => {
    if (index < 0) { hud.setOverview(); return; } // arrived at the galaxy overview
    hud.setAtNode(index);
    const route = nodes[index]?.route;
    const nextUrl = route ? `${route}${location.search}` : null;
    if (!suppressHistoryPush && nextUrl && `${location.pathname}${location.search}` !== nextUrl) {
      history.pushState(null, '', nextUrl);
    }
  });

  const onWheel = (event: WheelEvent) => {
    const direction = wheel.feed(event.deltaY, performance.now());
    if (direction > 0) advance();
    else if (direction < 0) back();
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
    travel.tick(dt);
    scene.frame(dt, travel.state);
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
