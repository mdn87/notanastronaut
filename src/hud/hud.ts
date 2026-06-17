import type { NodeDef } from '../core/types';
import type { SITE } from '../content/nodes';
import logoUrl from '../assets/logo.png';
import './hud.css';

const pad = (n: number) => String(n).padStart(2, '0');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Floating node title: how it animates out from the planet as focus 0 -> 1.
const LABEL_MARGIN = 18; // px gap from the planet at rest
const LABEL_EMERGE = 48; // px it slides outward while appearing
const LABEL_RISE = 26;   // px it lifts while appearing

/** DOM overlay adapter: console strip + node panel. Real HTML, never canvas text. */
export class Hud {
  private readonly root: HTMLElement;
  private strip!: HTMLElement;
  private status!: HTMLElement;
  private hint!: HTMLElement;
  private panel!: HTMLElement;
  private readonly nodes: NodeDef[];
  private currentKey: string | null = null;
  private labelEls: HTMLElement[] | null = null;

  constructor(root: HTMLElement, nodes: NodeDef[], site: typeof SITE) {
    this.root = root;
    this.nodes = nodes;
    root.innerHTML = `
      <div class="hud-labels" aria-hidden="true">${nodes.map((n) => `<span class="node-label">${esc(n.title)}</span>`).join('')}</div>
      <div class="hud-brand"><img class="hud-logo" src="${logoUrl}" alt="" /><span class="hi">HI.</span> <span class="name">I’m Matt</span> <span class="joke"></span></div>
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
    this.labelEls = null;
  }

  /**
   * Position the per-node floating titles. Each animates out from its planet
   * (slides outward + lifts + fades) as its focus rises toward 1 on approach.
   */
  setLabels(layout: { x: number; y: number; focus: number; visible: boolean }[]): void {
    if (!this.labelEls) {
      this.labelEls = Array.from(this.root.querySelectorAll('.node-label')) as HTMLElement[];
    }
    for (let i = 0; i < this.labelEls.length; i++) {
      const el = this.labelEls[i]!;
      const l = layout[i];
      if (!l || !l.visible) { el.style.opacity = '0'; continue; }
      const tx = l.x - (LABEL_MARGIN + LABEL_EMERGE * l.focus);
      const ty = l.y - LABEL_RISE * l.focus;
      el.style.transform = `translate(-100%, -50%) translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${(0.85 + 0.15 * l.focus).toFixed(3)})`;
      el.style.opacity = l.focus.toFixed(3);
    }
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
    this.status.textContent = to < 0
      ? '▸ STAR MAP'
      : `▸ EN ROUTE: ${this.nodes[to]!.title.toUpperCase()}`;
    this.hint.textContent = '';
    this.panel.setAttribute('hidden', '');
  }

  /** The zoomed-back galaxy overview: no node panel, just the map prompt. */
  setOverview(): void {
    const key = 'overview';
    if (this.currentKey === key) return;
    this.currentKey = key;
    this.status.textContent = `★ STAR MAP · ${pad(this.nodes.length)} MISSIONS`;
    this.hint.textContent = 'scroll ↓ to enter · click a planet';
    this.panel.setAttribute('hidden', '');
  }
}
