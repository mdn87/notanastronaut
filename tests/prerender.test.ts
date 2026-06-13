import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { prerender, routeOutFile } from '../scripts/prerender';
import { NODES, SITE } from '../src/content/nodes';

const TEMPLATE = `<!doctype html><html><head><title>X</title>
<link rel="canonical" href="https://notanastronaut.com/" />
</head><body><main id="content"><!--SSG--></main></body></html>`;

describe('prerender', () => {
  const pages = prerender(TEMPLATE, NODES, SITE);

  it('emits one page per route', () => {
    expect(Object.keys(pages).sort()).toEqual(
      NODES.map((n) => n.route).sort(),
    );
  });

  it('injects the list HTML into #content', () => {
    for (const html of Object.values(pages)) {
      expect(html).not.toContain('<!--SSG-->');
      expect(html).toContain('<section id="intro"');
    }
  });

  it('sets per-route title and canonical', () => {
    expect(pages['/missions/agent-ops']).toContain('<title>Agent Ops — Not An Astronaut');
    expect(pages['/missions/agent-ops']).toContain(
      'href="https://notanastronaut.com/missions/agent-ops"',
    );
    expect(pages['/']).toContain('href="https://notanastronaut.com/"');
  });

  it('escapes scalar title and canonical values', () => {
    const route = '/missions/unsafe"title?x=<tag>&q=1';
    const escapedPages = prerender(
      TEMPLATE,
      NODES.map((node) => node.id === 'agent-ops'
        ? { ...node, title: 'Unsafe <Title> & "Quote"', route }
        : node),
      SITE,
    );

    expect(escapedPages[route]).toContain(
      '<title>Unsafe &lt;Title&gt; &amp; &quot;Quote&quot; — Not An Astronaut</title>',
    );
    expect(escapedPages[route]).toContain(
      'href="https://notanastronaut.com/missions/unsafe&quot;title?x=&lt;tag&gt;&amp;q=1"',
    );
  });

  it('fails fast on invalid content', () => {
    expect(() => prerender(TEMPLATE, NODES.slice(0, 5), SITE)).toThrow(/expected 6 nodes/);
  });
});

describe('routeOutFile', () => {
  const dist = resolve('dist');

  it('maps safe routes inside dist', () => {
    expect(routeOutFile(dist, '/')).toBe(resolve(dist, 'index.html'));
    expect(routeOutFile(dist, '/missions/agent-ops')).toBe(
      resolve(dist, 'missions', 'agent-ops', 'index.html'),
    );
  });

  it('rejects unsafe route paths', () => {
    for (const route of ['/../escape', '/missions//bad', '/./bad', '/back\\slash']) {
      expect(() => routeOutFile(dist, route)).toThrow();
    }
  });
});
