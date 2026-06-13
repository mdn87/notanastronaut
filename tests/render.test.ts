import { describe, expect, it } from 'vitest';
import { NODES, SITE } from '../src/content/nodes';
import { renderListPage } from '../src/fallback/render';

describe('renderListPage', () => {
  const html = renderListPage(NODES, SITE);

  it('renders one section per node with its title and route anchor', () => {
    for (const n of NODES) {
      expect(html).toContain(`id="${n.id}"`);
      expect(html).toContain(n.title);
    }
    expect((html.match(/<section/g) ?? []).length).toBe(6);
  });

  it('has exactly one h1 (intro) and h2s for the rest', () => {
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect((html.match(/<h2/g) ?? []).length).toBe(5);
  });

  it('includes the map-mode link and the joke', () => {
    expect(html).toContain('?mode=world');
    expect(html).toContain('not actually an astronaut');
  });

  it('links every node in the nav', () => {
    for (const n of NODES) expect(html).toContain(`href="#${n.id}"`);
  });
});
