import { describe, expect, it } from 'vitest';
import { NODES, SITE } from '../src/content/nodes';
import { renderListPage } from '../src/fallback/render';
import type { NodeDef } from '../src/core/types';

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

  it('escapes scalar content while preserving trusted body html', () => {
    const nodes: NodeDef[] = [
      {
        id: 'bad"&node',
        title: 'A <B> & "C"',
        route: '/unsafe?x=<tag>&q="quote"',
        accent: '#4ab3d4',
        pos: { x: 0, y: 0, z: 0 },
        tagline: 'Tag <line> & "quote"',
        body: '<p><strong>trusted</strong> & raw</p>',
        kind: 'intro',
      },
    ];
    const syntheticSite = {
      title: 'Synthetic',
      origin: 'https://example.test',
      joke: 'Joke <& "quote">',
    };

    const syntheticHtml = renderListPage(nodes, syntheticSite);

    expect(syntheticHtml).toContain('href="#bad&quot;&amp;node"');
    expect(syntheticHtml).toContain('id="bad&quot;&amp;node"');
    expect(syntheticHtml).toContain('<h1>A &lt;B&gt; &amp; &quot;C&quot;</h1>');
    expect(syntheticHtml).toContain('<em>Tag &lt;line&gt; &amp; &quot;quote&quot;</em>');
    expect(syntheticHtml).toContain('<footer><p class="joke">Joke &lt;&amp; &quot;quote&quot;&gt;</p></footer>');
    expect(syntheticHtml).toContain('<p><strong>trusted</strong> & raw</p>');
  });
});
