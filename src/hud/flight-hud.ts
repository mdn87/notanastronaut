import './hud.css';

const sign = (n: number) => (n >= 0 ? '+' : '-') + String(Math.round(Math.abs(n))).padStart(3, '0');

/**
 * Minimal free-fly HUD: a control hint, a faint speed readout, and a floating
 * blue-digital position readout that tracks the avatar on screen. No nodes.
 */
export class FlightHud {
  private readonly root: HTMLElement;
  private readonly speedEl: HTMLElement;
  private readonly readoutEl: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-brand"><span class="hi">HI.</span> <span class="name">I'm Matt</span></div>
      <nav class="hud-nav" aria-label="Mode"><a href="?mode=list">[ list ]</a></nav>
      <div class="flight-readout" aria-hidden="true"></div>
      <div class="hud-strip">
        <span class="status">WASD / arrows move · drag to steer · right-click boost · Esc list</span>
        <span class="hint flight-speed">0 u/s</span>
      </div>`;
    this.speedEl = root.querySelector('.flight-speed')!;
    this.readoutEl = root.querySelector('.flight-readout')!;
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

  dispose(): void {
    this.root.replaceChildren();
  }
}
