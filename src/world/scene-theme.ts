// Pure "paint" half of scene theming: writes a Theme into plain color/attribute
// targets. Unit-testable with object fakes — no three.js, no WebGL. WorldScene
// assembles ThemeTargets from its real three objects and calls applyTheme.
import type { ObstacleSpec } from '../core/field';
import { densityColor, DENSITY_MIN, DENSITY_MAX } from '../core/field';
import { paintStarColors } from '../core/galaxy';
import type { Theme } from '../core/theme';

export interface ColorTarget { r: number; g: number; b: number; setRGB(r: number, g: number, b: number): unknown }
export interface AttrTarget { array: Float32Array; needsUpdate: boolean }

/** Every mutable color slot in the scene. A new themed slot MUST be added here (the unit test covers each). */
export interface ThemeTargets {
  background: ColorTarget;
  gridColor: ColorTarget;
  avatarBody: ColorTarget;
  avatarFins: ColorTarget;
  galaxyColor: AttrTarget;
  squareColor: AttrTarget;
  obstacleColor: AttrTarget | null; // null until setObstacles builds the cloud
}

export function applyTheme(
  t: ThemeTargets, theme: Theme,
  ctx: { mixes: Float32Array; obstacles: readonly ObstacleSpec[] },
): void {
  t.background.setRGB(theme.bg.r, theme.bg.g, theme.bg.b);
  t.gridColor.setRGB(theme.grid.r, theme.grid.g, theme.grid.b);
  t.avatarBody.setRGB(theme.avatarBody.r, theme.avatarBody.g, theme.avatarBody.b);
  t.avatarFins.setRGB(theme.avatarFins.r, theme.avatarFins.g, theme.avatarFins.b);

  t.galaxyColor.array.set(paintStarColors(ctx.mixes, theme.starArm, theme.starCore));
  t.galaxyColor.needsUpdate = true;

  const sq = t.squareColor.array;
  for (let i = 0; i < sq.length; i += 3) { sq[i] = theme.square.r; sq[i + 1] = theme.square.g; sq[i + 2] = theme.square.b; }
  t.squareColor.needsUpdate = true;

  // Paint obstacles from stored DENSITY with the theme's palette — never from
  // spec.color, which is light-baked at generation time.
  if (t.obstacleColor) {
    const oc = t.obstacleColor.array;
    ctx.obstacles.forEach((s, i) => {
      const c = densityColor(s.density, DENSITY_MIN, DENSITY_MAX, theme.obstacleLo, theme.obstacleHi);
      oc[i * 3] = c.r; oc[i * 3 + 1] = c.g; oc[i * 3 + 2] = c.b;
    });
    t.obstacleColor.needsUpdate = true;
  }
}
