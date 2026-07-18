import './hud.css';
import type { ThemeName } from '../core/theme';

const sign = (n: number) => (n >= 0 ? '+' : '-') + String(Math.round(Math.abs(n))).padStart(3, '0');

export interface FlightHudOpts { theme: ThemeName; onThemeToggle: () => void }

/**
 * Minimal free-fly HUD: a control hint, a faint speed readout, and a floating
 * blue-digital position readout that tracks the avatar on screen. No nodes.
 */
export class FlightHud {
  private readonly root: HTMLElement;
  private readonly speedEl: HTMLElement;
  private readonly readoutEl: HTMLElement;
  private readonly toggleEl: HTMLElement;

  constructor(root: HTMLElement, opts?: FlightHudOpts) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-brand"><span class="hi">HI.</span> <span class="name">I'm Matt</span></div>
      <nav class="hud-nav" aria-label="Mode"><a href="#" class="theme-toggle" role="button"></a><a href="?mode=list">[ list ]</a></nav>
      <div class="flight-readout" aria-hidden="true"></div>
      <div class="hud-strip">
        <span class="status">WASD / arrows move · drag to steer · right-click boost · Esc list</span>
        <span class="hint flight-speed">0 u/s</span>
      </div>`;
    this.speedEl = root.querySelector('.flight-speed')!;
    this.readoutEl = root.querySelector('.flight-readout')!;
    this.toggleEl = root.querySelector('.theme-toggle')!;
    this.setTheme(opts?.theme ?? 'light');
    (this.toggleEl as HTMLElement & { onclick: ((e: { preventDefault?: () => void }) => void) | null }).onclick =
      (e) => { e.preventDefault?.(); opts?.onThemeToggle(); };
  }

  setSpeed(speed: number): void {
    this.speedEl.textContent = `${Math.round(speed)} u/s`;
  }

  /** Floating coordinate readout, positioned just off the avatar's shoulder. */
  setReadout(r: { x: number; y: number; pos: { x: number; y: number; z: number }; visible: boolean }): void {
    if (!r.visible) { this.readoutEl.style.opacity = '0'; return; }
    this.readoutEl.textContent = `X ${sign(r.pos.x)}  Y ${sign(r.pos.y)}  Z ${sign(r.pos.z)}`;
    this.readoutEl.style.opacity = '1';
    this.readoutEl.style.transform = `translate(${(r.x + 28).toFixed(1)}px, ${(r.y - 10).toFixed(1)}px)`;
  }

  /** Label shows the theme you'd switch TO ([ dark ] while light is active). */
  setTheme(name: ThemeName): void {
    this.toggleEl.textContent = name === 'light' ? '[ dark ]' : '[ light ]';
  }

  dispose(): void {
    this.root.replaceChildren();
  }
}
