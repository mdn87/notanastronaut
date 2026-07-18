import { describe, expect, it, vi } from 'vitest';
import { FlightHud } from '../src/hud/flight-hud';

type ClassListStub = {
  add: (...tokens: string[]) => void;
  remove: (...tokens: string[]) => void;
  contains: (token: string) => boolean;
};

type ElementStub = {
  textContent: string;
  style: Record<string, string>;
  classList: ClassListStub;
};

function makeClassList(): ClassListStub {
  const tokens = new Set<string>();
  return {
    add: (...next) => next.forEach((token) => tokens.add(token)),
    remove: (...next) => next.forEach((token) => tokens.delete(token)),
    contains: (token) => tokens.has(token),
  };
}

/** Root whose querySelector returns a persistent element per selector, so writes are observable. */
function makeRoot() {
  const els = new Map<string, ElementStub>();
  const root = {
    innerHTML: '',
    querySelector: vi.fn((sel: string) => {
      if (!els.has(sel)) els.set(sel, { textContent: '', style: {}, classList: makeClassList() });
      return els.get(sel)!;
    }),
    replaceChildren: vi.fn(),
  };
  return { root: root as unknown as HTMLElement, el: (sel: string) => els.get(sel)! };
}

describe('FlightHud', () => {
  it('renders the three fixed instrument regions and no floating readout', () => {
    const { root } = makeRoot();
    new FlightHud(root, { edge: 630 });
    const markup = (root as unknown as { innerHTML: string }).innerHTML;
    expect(markup).toContain('flight-minimap');
    expect(markup).toContain('flight-compass');
    expect(markup).toContain('flight-telemetry');
    expect(markup).not.toContain('flight-readout');
  });

  it('maps navigation into telemetry, minimap geometry, and compass transforms', () => {
    const { root, el } = makeRoot();
    const hud = new FlightHud(root, { edge: 630 });
    hud.setNavigation({
      speed: 42.4,
      position: { x: 630, y: -34, z: 630 },
      heading: { x: 1, y: 0, z: 0 },
      yaw: Math.PI / 2,
      pitch: 0.2,
      wrapped: true,
    });

    expect(el('.flight-speed').textContent).toBe('42 u/s');
    expect(el('.flight-xyz').textContent).toBe('X +630  Y -034  Z +630');
    expect(el('.flight-wrap').textContent).toBe('GRID WRAP');
    expect(el('.flight-minimap-marker').style.left).toBe('90%');
    expect(el('.flight-minimap-marker').style.top).toBe('10%');
    expect(el('.flight-minimap-marker').style.transform).toBe('translate(-50%, -50%)');
    expect(el('.flight-minimap-vector').style.transform).toMatch(/rotate\(90deg\)/);
    expect(el('.flight-compass-band').style.transform).toMatch(/translateX\(/);
    expect(el('.flight-gimbal').style.transform).toMatch(/rotate\(/);
  });

  it('maps configured edges and the center to the minimap inner 10–90% range', () => {
    const { root, el } = makeRoot();
    const hud = new FlightHud(root, { edge: 100 });
    hud.setNavigation({
      speed: 0,
      position: { x: -100, y: 0, z: -100 },
      heading: { x: 0, y: 0, z: 1 },
      yaw: 0,
      pitch: 0,
      wrapped: false,
    });
    expect(el('.flight-minimap-marker').style.left).toBe('10%');
    expect(el('.flight-minimap-marker').style.top).toBe('90%');
    expect(el('.flight-minimap-marker').style.transform).toBe('translate(-50%, -50%)');

    hud.setNavigation({
      speed: 0,
      position: { x: 0, y: 0, z: 0 },
      heading: { x: 0, y: 0, z: 1 },
      yaw: 0,
      pitch: 0,
      wrapped: false,
    });
    expect(el('.flight-minimap-marker').style.left).toBe('50%');
    expect(el('.flight-minimap-marker').style.top).toBe('50%');
    expect(el('.flight-minimap-marker').style.transform).toBe('translate(-50%, -50%)');
  });

  it('clears wrap feedback on the next non-wrap navigation frame', () => {
    const { root, el } = makeRoot();
    const hud = new FlightHud(root, { edge: 630 });
    const nav = {
      speed: 0,
      position: { x: 0, y: 0, z: 0 },
      heading: { x: 0, y: 0, z: 1 },
      yaw: 0,
      pitch: 0,
    };

    hud.setNavigation({ ...nav, wrapped: true });
    expect(el('.flight-wrap').classList.contains('is-wrapped')).toBe(true);
    hud.setNavigation({ ...nav, wrapped: false });

    expect(el('.flight-wrap').textContent).toBe('GRID OK');
    expect(el('.flight-wrap').classList.contains('is-wrapped')).toBe(false);
  });

  it('clears the root on dispose', () => {
    const { root } = makeRoot();
    new FlightHud(root, { edge: 630 }).dispose();
    expect((root as unknown as { replaceChildren: ReturnType<typeof vi.fn> }).replaceChildren).toHaveBeenCalled();
  });
});
