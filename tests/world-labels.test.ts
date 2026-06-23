import { describe, expect, it } from 'vitest';
import { safeLabelPoint } from '../src/world/scene';

describe('safeLabelPoint', () => {
  it('keeps focused labels inside the viewport safe zone', () => {
    expect(safeLabelPoint(736, 736, 1280, 720)).toEqual({ x: 736, y: 656 });
    expect(safeLabelPoint(-40, 12, 1280, 720)).toEqual({ x: 120, y: 48 });
    expect(safeLabelPoint(1500, 800, 1280, 720)).toEqual({ x: 1256, y: 656 });
  });

  it('scales the left safe zone down on narrow screens', () => {
    expect(safeLabelPoint(0, 400, 360, 640)).toEqual({ x: 90, y: 400 });
  });
});
