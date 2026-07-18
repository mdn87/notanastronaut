import { describe, expect, it } from 'vitest';
import { applyTheme, type ThemeTargets } from '../src/world/scene-theme';
import { paintStarColors } from '../src/core/galaxy';
import { densityColor, DENSITY_MIN, DENSITY_MAX, type ObstacleSpec } from '../src/core/field';
import { THEMES } from '../src/core/theme';

const fakeColor = () => {
  const c = { r: -1, g: -1, b: -1, setRGB(r: number, g: number, b: number) { c.r = r; c.g = g; c.b = b; return c; } };
  return c;
};
const fakeAttr = (n: number) => ({ array: new Float32Array(n * 3), needsUpdate: false });

const spec = (density: number): ObstacleSpec =>
  ({ pos: { x: 0, y: 0, z: 0 }, radius: 3, density, mass: 1, color: densityColor(density) });

function makeTargets(obstacles: boolean): ThemeTargets {
  return {
    background: fakeColor(), gridColor: fakeColor(), avatarBody: fakeColor(), avatarFins: fakeColor(),
    galaxyColor: fakeAttr(4), squareColor: fakeAttr(3), obstacleColor: obstacles ? fakeAttr(2) : null,
  };
}

describe('applyTheme paints every mutable scene slot', () => {
  const mixes = new Float32Array([0, 0.5, 1, 0.25]);
  const obstacles = [spec(DENSITY_MIN), spec(DENSITY_MAX)];

  it('dark theme lands in all seven slots', () => {
    const t = makeTargets(true);
    applyTheme(t, THEMES.dark, { mixes, obstacles });

    const d = THEMES.dark;
    expect(t.background).toMatchObject({ r: d.bg.r, g: d.bg.g, b: d.bg.b });
    expect(t.gridColor).toMatchObject({ r: d.grid.r, g: d.grid.g, b: d.grid.b });
    expect(t.avatarBody).toMatchObject({ r: d.avatarBody.r, g: d.avatarBody.g, b: d.avatarBody.b });
    expect(t.avatarFins).toMatchObject({ r: d.avatarFins.r, g: d.avatarFins.g, b: d.avatarFins.b });

    expect(Array.from(t.galaxyColor.array)).toEqual(Array.from(paintStarColors(mixes, d.starArm, d.starCore)));
    expect(t.galaxyColor.needsUpdate).toBe(true);

    for (let i = 0; i < t.squareColor.array.length; i += 3) {
      expect(t.squareColor.array[i]).toBeCloseTo(d.square.r, 6);
      expect(t.squareColor.array[i + 1]).toBeCloseTo(d.square.g, 6);
      expect(t.squareColor.array[i + 2]).toBeCloseTo(d.square.b, 6);
    }
    expect(t.squareColor.needsUpdate).toBe(true);

    // Obstacles painted from DENSITY, not from the light-baked spec.color:
    const oc = t.obstacleColor!;
    const lo = densityColor(DENSITY_MIN, DENSITY_MIN, DENSITY_MAX, d.obstacleLo, d.obstacleHi);
    const hi = densityColor(DENSITY_MAX, DENSITY_MIN, DENSITY_MAX, d.obstacleLo, d.obstacleHi);
    expect(oc.array[0]).toBeCloseTo(lo.r, 6); expect(oc.array[1]).toBeCloseTo(lo.g, 6); expect(oc.array[2]).toBeCloseTo(lo.b, 6);
    expect(oc.array[3]).toBeCloseTo(hi.r, 6); expect(oc.array[4]).toBeCloseTo(hi.g, 6); expect(oc.array[5]).toBeCloseTo(hi.b, 6);
    expect(oc.needsUpdate).toBe(true);
  });

  it('light and dark produce different values in every slot', () => {
    const a = makeTargets(true), b = makeTargets(true);
    applyTheme(a, THEMES.light, { mixes, obstacles });
    applyTheme(b, THEMES.dark, { mixes, obstacles });
    expect(a.background.r).not.toBe(b.background.r);
    expect(a.gridColor.r).not.toBe(b.gridColor.r);
    expect(a.avatarBody.r).not.toBe(b.avatarBody.r);
    expect(a.avatarFins.r).not.toBe(b.avatarFins.r);
    expect(Array.from(a.galaxyColor.array)).not.toEqual(Array.from(b.galaxyColor.array));
    expect(Array.from(a.squareColor.array)).not.toEqual(Array.from(b.squareColor.array));
    expect(Array.from(a.obstacleColor!.array)).not.toEqual(Array.from(b.obstacleColor!.array));
  });

  it('tolerates a missing obstacle cloud (before setObstacles)', () => {
    const t = makeTargets(false);
    expect(() => applyTheme(t, THEMES.dark, { mixes, obstacles: [] })).not.toThrow();
  });
});
