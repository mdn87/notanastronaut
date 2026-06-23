import { describe, expect, it } from 'vitest';
import type { RailMotionState } from '../src/core/types';
import type { WorldScene } from '../src/world/scene';

function renderRailMotionFrame(scene: WorldScene, motion: RailMotionState): void {
  scene.frame(1 / 60, motion);
}

describe('WorldScene frame type contract', () => {
  it('accepts rail motion state', () => {
    expect(renderRailMotionFrame).toBeTypeOf('function');
  });
});
