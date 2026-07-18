import { describe, expect, it, vi } from 'vitest';
import { FlightHud } from '../src/hud/flight-hud';

/** Root whose querySelector returns a persistent element per selector, so writes are observable. */
function makeRoot() {
  const els = new Map<string, { textContent: string; style: Record<string, string> }>();
  const root = {
    innerHTML: '',
    querySelector: vi.fn((sel: string) => {
      if (!els.has(sel)) els.set(sel, { textContent: '', style: {} });
      return els.get(sel)!;
    }),
    replaceChildren: vi.fn(),
  };
  return { root: root as unknown as HTMLElement, el: (sel: string) => els.get(sel)! };
}

describe('FlightHud', () => {
  it('renders the control hint', () => {
    const { root } = makeRoot();
    new FlightHud(root);
    expect((root as unknown as { innerHTML: string }).innerHTML).toMatch(/move/i);
  });

  it('updates the speed readout text', () => {
    const { root, el } = makeRoot();
    const hud = new FlightHud(root);
    hud.setSpeed(42.4);
    expect(el('.flight-speed').textContent).toBe('42 u/s');
  });

  it('formats the floating position readout and positions it near the avatar', () => {
    const { root, el } = makeRoot();
    const hud = new FlightHud(root);
    hud.setReadout({ x: 100, y: 200, pos: { x: 12, y: -34, z: 120 }, visible: true });
    const r = el('.flight-readout');
    expect(r.textContent).toBe('X +012  Y -034  Z +120');
    expect(r.style.opacity).toBe('1');
    expect(r.style.transform).toMatch(/translate\(/);
  });

  it('hides the readout when the avatar is off-screen', () => {
    const { root, el } = makeRoot();
    const hud = new FlightHud(root);
    hud.setReadout({ x: 0, y: 0, pos: { x: 0, y: 0, z: 0 }, visible: false });
    expect(el('.flight-readout').style.opacity).toBe('0');
  });

  it('clears the root on dispose', () => {
    const { root } = makeRoot();
    new FlightHud(root).dispose();
    expect((root as unknown as { replaceChildren: ReturnType<typeof vi.fn> }).replaceChildren).toHaveBeenCalled();
  });

  it('theme toggle shows the theme you would switch TO and fires the callback', () => {
    const { root, el } = makeRoot();
    const onThemeToggle = vi.fn();
    const hud = new FlightHud(root, { theme: 'light', onThemeToggle });
    const t = el('.theme-toggle') as unknown as { textContent: string; onclick: (e: { preventDefault(): void }) => void };
    expect(t.textContent).toBe('[ dark ]');
    t.onclick({ preventDefault: () => {} });
    expect(onThemeToggle).toHaveBeenCalledTimes(1);
    hud.setTheme('dark');
    expect(t.textContent).toBe('[ light ]');
  });

  it('renders without theme opts (legacy construction)', () => {
    const { root, el } = makeRoot();
    new FlightHud(root);
    expect((el('.theme-toggle') as unknown as { textContent: string }).textContent).toBe('[ dark ]');
  });
});
