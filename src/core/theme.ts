import type { Rgb } from './types';

export type ThemeName = 'light' | 'dark';

/**
 * WebGL color slots only — DOM colors live in CSS variables (tokens.css).
 * This module is the single source of truth for scene hexes; galaxy.ts and
 * field.ts default their palettes from THEMES.light.
 */
export interface Theme {
  bg: Rgb;
  starArm: Rgb; starCore: Rgb;
  grid: Rgb; square: Rgb;
  obstacleLo: Rgb; obstacleHi: Rgb;
  avatarBody: Rgb; avatarFins: Rgb;
}

export const THEME_KEY = 'naa-theme';

const rgb = (hex: number): Rgb =>
  ({ r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 });

/** Light = the legacy look, byte-for-byte. Dark inverts luminance direction: denser = hotter. */
export const THEMES: Record<ThemeName, Theme> = {
  light: {
    bg: rgb(0xffffff),
    starArm: rgb(0x4ab3d4), starCore: rgb(0x16324a),
    grid: rgb(0x4ab3d4), square: rgb(0x4ab3d4),
    obstacleLo: rgb(0x7fc9e0), obstacleHi: rgb(0x0a141e),
    avatarBody: rgb(0x2b7e9e), avatarFins: rgb(0x184f68),
  },
  dark: {
    bg: rgb(0x1e2125),
    starArm: rgb(0xe8743b), starCore: rgb(0xffc98a),
    grid: rgb(0xb4562a), square: rgb(0xe8743b),
    obstacleLo: rgb(0x6e4630), obstacleHi: rgb(0xffb066),
    avatarBody: rgb(0xe8743b), avatarFins: rgb(0x8a3a12),
  },
};

/** Pure parse of a stored value; anything unrecognized -> 'light' (the default theme). */
export function readStoredTheme(raw: string | null): ThemeName {
  return raw === 'dark' ? 'dark' : 'light';
}

/** Guarded read — localStorage can throw when storage access is disabled. */
export function getStoredTheme(): ThemeName {
  try { return readStoredTheme(globalThis.localStorage?.getItem(THEME_KEY) ?? null); } catch { return 'light'; }
}

/** Guarded write — a failed write silently keeps the session-only theme. */
export function storeTheme(name: ThemeName): void {
  try { globalThis.localStorage?.setItem(THEME_KEY, name); } catch { /* storage disabled */ }
}
