import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEMES, THEME_KEY, readStoredTheme, getStoredTheme, storeTheme } from '../src/core/theme';

const hex = (c: { r: number; g: number; b: number }) =>
  (Math.round(c.r * 255) << 16) | (Math.round(c.g * 255) << 8) | Math.round(c.b * 255);

describe('THEMES', () => {
  it('light matches the legacy scene colors exactly', () => {
    expect(hex(THEMES.light.bg)).toBe(0xffffff);
    expect(hex(THEMES.light.starArm)).toBe(0x4ab3d4);
    expect(hex(THEMES.light.starCore)).toBe(0x16324a);
    expect(hex(THEMES.light.grid)).toBe(0x4ab3d4);
    expect(hex(THEMES.light.square)).toBe(0x4ab3d4);
    expect(hex(THEMES.light.obstacleLo)).toBe(0x7fc9e0);
    expect(hex(THEMES.light.obstacleHi)).toBe(0x0a141e);
    expect(hex(THEMES.light.avatarBody)).toBe(0x2b7e9e);
    expect(hex(THEMES.light.avatarFins)).toBe(0x184f68);
  });

  it('dark fills every slot light has, each with a different value', () => {
    const slots = Object.keys(THEMES.light) as (keyof typeof THEMES.light)[];
    expect(Object.keys(THEMES.dark).sort()).toEqual([...slots].sort());
    for (const s of slots) expect(hex(THEMES.dark[s])).not.toBe(hex(THEMES.light[s]));
  });
});

describe('theme storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('readStoredTheme: only "dark" is dark; junk and null are light', () => {
    expect(readStoredTheme('dark')).toBe('dark');
    expect(readStoredTheme('light')).toBe('light');
    expect(readStoredTheme('banana')).toBe('light');
    expect(readStoredTheme(null)).toBe('light');
  });

  it('getStoredTheme reads the key; storeTheme writes it', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    expect(getStoredTheme()).toBe('light');
    storeTheme('dark');
    expect(store.get(THEME_KEY)).toBe('dark');
    expect(getStoredTheme()).toBe('dark');
  });

  it('survives storage that throws (disabled) and storage that is absent', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    });
    expect(getStoredTheme()).toBe('light');
    expect(() => storeTheme('dark')).not.toThrow();
    vi.unstubAllGlobals();
    expect(getStoredTheme()).toBe('light'); // node has no localStorage
  });
});
