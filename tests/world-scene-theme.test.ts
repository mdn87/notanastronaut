import { describe, expect, it } from 'vitest';
import { applyTheme, type ThemeTargets } from '../src/world/scene-theme';
import { paintStarColors } from '../src/core/galaxy';
import { THEMES } from '../src/core/theme';
import type { Rgb } from '../src/core/types';

const fakeColor = () => {
  const c = { r: -1, g: -1, b: -1, setRGB(r: number, g: number, b: number) { c.r = r; c.g = g; c.b = b; return c; } };
  return c;
};
const fakeAttr = (n: number) => ({ array: new Float32Array(n * 3), needsUpdate: false });
const fakeThruster = () => { const calls: Rgb[][] = []; return { calls, setPalette(m: Rgb, d: Rgb) { calls.push([m, d]); } }; };

function makeTargets(): ThemeTargets {
  return {
    background: fakeColor(), gridColor: fakeColor(), avatarBody: fakeColor(), avatarFins: fakeColor(),
    galaxyColor: fakeAttr(4), squareColor: fakeAttr(3), thruster: fakeThruster(),
  };
}

describe('applyTheme paints every mutable scene slot', () => {
  const mixes = new Float32Array([0, 0.5, 1, 0.25]);

  it('dark theme lands in all seven slots', () => {
    const t = makeTargets();
    applyTheme(t, THEMES.dark, { mixes });

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

    const thruster = t.thruster as ReturnType<typeof fakeThruster>;
    expect(thruster.calls.at(-1)).toEqual([d.thrusterMain, d.thrusterDeep]);
  });

  it('light and dark produce different values in every slot', () => {
    const a = makeTargets(), b = makeTargets();
    applyTheme(a, THEMES.light, { mixes });
    applyTheme(b, THEMES.dark, { mixes });
    expect(a.background.r).not.toBe(b.background.r);
    expect(a.gridColor.r).not.toBe(b.gridColor.r);
    expect(a.avatarBody.r).not.toBe(b.avatarBody.r);
    expect(a.avatarFins.r).not.toBe(b.avatarFins.r);
    expect(Array.from(a.galaxyColor.array)).not.toEqual(Array.from(b.galaxyColor.array));
    expect(Array.from(a.squareColor.array)).not.toEqual(Array.from(b.squareColor.array));

    const ta = a.thruster as ReturnType<typeof fakeThruster>;
    const tb = b.thruster as ReturnType<typeof fakeThruster>;
    expect(ta.calls).not.toEqual(tb.calls);
  });
});
