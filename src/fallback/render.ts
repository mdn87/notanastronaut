import type { NodeDef } from '../core/types';
import type { SITE } from '../content/nodes';

/**
 * The canonical HTML rendering of the content model. Used at runtime for
 * list mode AND at build time by scripts/prerender.ts (it is the SSG).
 */
export function renderListPage(nodes: NodeDef[], site: typeof SITE): string {
  const nav = nodes
    .map((n) => `<a href="#${esc(n.id)}">${esc(n.title)}</a>`)
    .join('\n    ');
  const sections = nodes
    .map((n, i) => {
      const h = n.kind === 'intro'
        ? `<h1>${esc(n.title)}</h1>`
        : `<h2>${esc(n.title)}</h2>`;
      return `<section id="${esc(n.id)}" aria-label="${esc(n.title)}">
  ${h}
  <p class="node-route">NODE ${String(i + 1).padStart(2, '0')}/06 · ${esc(n.route)}</p>
  <p><em>${esc(n.tagline)}</em></p>
  ${n.body}
</section>`;
    })
    .join('\n');
  return `<nav class="list-nav" aria-label="Sections">
    ${nav}
    <a href="?mode=world">[ map ]</a>
  </nav>
${sections}
<footer><p class="joke">${esc(site.joke)}</p></footer>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
