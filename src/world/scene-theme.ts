// Pure "paint" half of scene theming — unit-testable with object fakes.
import { paintStarColors } from '../core/galaxy';
import type { Rgb } from '../core/types';
import type { Theme } from '../core/theme';

export interface ColorTarget { r: number; g: number; b: number; setRGB(r: number, g: number, b: number): unknown }
export interface AttrTarget { array: Float32Array; needsUpdate: boolean }
export interface PaletteTarget { setPalette(main: Rgb, deep: Rgb): void }

/** Every mutable color slot in the scene. A new themed slot MUST be added here (the unit test covers each). */
export interface ThemeTargets {
  background: ColorTarget;   // managed pipeline (sRGB-converting adapter in scene.ts)
  gridColor: ColorTarget;    // custom shader — raw
  avatarBody: ColorTarget;   // managed — sRGB adapter
  avatarFins: ColorTarget;   // managed — sRGB adapter
  galaxyColor: AttrTarget;   // aColor attr wrapping galaxyField.colors — painting it also feeds the active-star overlay
  squareColor: AttrTarget;
  thruster: PaletteTarget;   // ion exhaust spawn colors
}

export function applyTheme(t: ThemeTargets, theme: Theme, ctx: { mixes: Float32Array }): void {
  t.background.setRGB(theme.bg.r, theme.bg.g, theme.bg.b);
  t.gridColor.setRGB(theme.grid.r, theme.grid.g, theme.grid.b);
  t.avatarBody.setRGB(theme.avatarBody.r, theme.avatarBody.g, theme.avatarBody.b);
  t.avatarFins.setRGB(theme.avatarFins.r, theme.avatarFins.g, theme.avatarFins.b);

  t.galaxyColor.array.set(paintStarColors(ctx.mixes, theme.starArm, theme.starCore));
  t.galaxyColor.needsUpdate = true;

  const sq = t.squareColor.array;
  for (let i = 0; i < sq.length; i += 3) { sq[i] = theme.square.r; sq[i + 1] = theme.square.g; sq[i + 2] = theme.square.b; }
  t.squareColor.needsUpdate = true;

  t.thruster.setPalette(theme.thrusterMain, theme.thrusterDeep);
}
