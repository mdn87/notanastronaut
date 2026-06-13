import type { NodeDef } from '../core/types';
import type { SITE } from '../content/nodes';
import './hud.css';

const pad = (n: number) => String(n).padStart(2, '0');

/** DOM overlay adapter: console strip + node panel. Real HTML, never canvas text. */
export class Hud {
  private readonly root: HTMLElement;
  private strip!: HTMLElement;
  private status!: HTMLElement;
  private hint!: HTMLElement;
  private panel!: HTMLElement;
  private readonly nodes: NodeDef[];
  private currentKey: string | null = null;

  constructor(root: HTMLElement, nodes: NodeDef[], site: typeof SITE) {
    this.root = root;
    this.nodes = nodes;
    root.innerHTML = `
      <div class="hud-brand"><b>HI.</b> I’m Matt <span class="joke"></span></div>
      <nav class="hud-nav" aria-label="Mode">
        <a href="?mode=list">[ list ]</a>
      </nav>
      <div class="hud-panel" aria-live="polite"><h2></h2><p class="tagline"></p><div class="body"></div></div>
      <div class="hud-strip"><span class="status" aria-live="polite"></span><span class="hint"></span></div>`;
    root.querySelector('.joke')!.textContent = site.joke;
    this.strip = root.querySelector('.hud-strip')!;
    this.status = root.querySelector('.status')!;
    this.hint = root.querySelector('.hint')!;
    this.panel = root.querySelector('.hud-panel')!;
  }

  dispose(): void {
    this.root.replaceChildren();
    this.currentKey = null;
  }

  setAtNode(index: number): void {
    const key = `node:${index}`;
    if (this.currentKey === key) return;
    this.currentKey = key;
    const n = this.nodes[index]!;
    this.status.textContent = `NODE ${pad(index + 1)}/${pad(this.nodes.length)} · ${n.title.toUpperCase()}`;
    this.hint.textContent = 'scroll ↓ advance · ↑ back · click a planet';
    this.panel.removeAttribute('hidden');
    this.panel.querySelector('h2')!.textContent = n.title;
    (this.panel.querySelector('.tagline') as HTMLElement).textContent = n.tagline;
    (this.panel.querySelector('.body') as HTMLElement).innerHTML = n.body;
  }

  setTransit(to: number): void {
    const key = `transit:${to}`;
    if (this.currentKey === key) return;
    this.currentKey = key;
    const n = this.nodes[to]!;
    this.status.textContent = `▸ EN ROUTE: ${n.title.toUpperCase()}`;
    this.hint.textContent = '';
    this.panel.setAttribute('hidden', '');
  }
}
