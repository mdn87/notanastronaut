import { describe, expect, it, vi } from 'vitest';
import { NODES, SITE } from '../src/content/nodes';
import { Hud } from '../src/hud/hud';

class FakeElement {
  innerHTML = '';
  textContent = '';
  private readonly children = new Map<string, FakeElement>();
  private readonly attributes = new Map<string, string>();

  replaceChildren = vi.fn(() => {
    this.innerHTML = '';
    this.textContent = '';
    this.children.clear();
    this.attributes.clear();
  });

  querySelector(selector: string): FakeElement {
    const existing = this.children.get(selector);
    if (existing) return existing;
    const child = new FakeElement();
    this.children.set(selector, child);
    return child;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
}

describe('Hud', () => {
  it('clears the root it owns on dispose', () => {
    const root = new FakeElement();
    const hud = new Hud(root as unknown as HTMLElement, NODES, SITE);

    hud.setAtNode(0);

    expect(root.innerHTML).toContain('hud-panel');
    expect(root.querySelector('.status').textContent).toContain('NODE 01/06');

    hud.dispose();

    expect(root.replaceChildren).toHaveBeenCalledTimes(1);
    expect(root.innerHTML).toBe('');
  });
});
