import type { RailMotionState } from '../src/core/types';
import type { WorldScene } from '../src/world/scene';

function renderRailMotionFrame(scene: WorldScene, motion: RailMotionState): void {
  scene.frame(1 / 60, motion);
}

void renderRailMotionFrame;
