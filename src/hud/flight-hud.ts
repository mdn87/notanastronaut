import './hud.css';

const sign = (n: number) => (n >= 0 ? '+' : '-') + String(Math.round(Math.abs(n))).padStart(3, '0');
const compact = (n: number) => String(Number(n.toFixed(2)));
const degrees = (radians: number) => compact((radians * 180) / Math.PI);

export interface FlightNavigation {
  speed: number;
  position: { x: number; y: number; z: number };
  heading: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  wrapped: boolean;
}

export interface FlightHudOptions {
  edge: number;
}

const LEGACY_EDGE = 630;

/** Flat, DOM-native flight instruments. The root is constructed once per flight. */
export class FlightHud {
  private readonly root: HTMLElement;
  private readonly edge: number;
  private readonly speedEl: HTMLElement;
  private readonly xyzEl: HTMLElement;
  private readonly wrapEl: HTMLElement;
  private readonly markerEl: HTMLElement;
  private readonly vectorEl: HTMLElement;
  private readonly compassBandEl: HTMLElement;
  private readonly gimbalEl: HTMLElement;

  constructor(root: HTMLElement, opts: FlightHudOptions = { edge: LEGACY_EDGE }) {
    this.root = root;
    this.edge = opts.edge;
    root.innerHTML = `
      <div class="hud-brand"><span class="hi">HI.</span> <span class="name">I'm Matt</span></div>
      <nav class="hud-nav" aria-label="Mode"><a href="?mode=list">[ list ]</a></nav>
      <section class="flight-minimap" aria-label="Top-down navigation map">
        <div class="flight-minimap-grid" aria-hidden="true"></div>
        <span class="flight-minimap-vector" aria-hidden="true"></span>
        <span class="flight-minimap-marker" aria-hidden="true"></span>
      </section>
      <section class="flight-compass" aria-label="Heading and attitude">
        <div class="flight-compass-band" aria-hidden="true"><span>W</span><span>N</span><span>E</span><span>S</span></div>
        <div class="flight-gimbal" aria-hidden="true"><span></span></div>
        <span class="flight-compass-cue" aria-hidden="true"></span>
      </section>
      <section class="flight-telemetry" aria-label="Flight telemetry">
        <span class="flight-speed">0 u/s</span>
        <span class="flight-xyz">X +000  Y +000  Z +000</span>
        <span class="flight-wrap">GRID OK</span>
        <span class="flight-controls">WASD / arrows move · drag steer · right-click boost</span>
      </section>`;

    this.speedEl = root.querySelector('.flight-speed')!;
    this.xyzEl = root.querySelector('.flight-xyz')!;
    this.wrapEl = root.querySelector('.flight-wrap')!;
    this.markerEl = root.querySelector('.flight-minimap-marker')!;
    this.vectorEl = root.querySelector('.flight-minimap-vector')!;
    this.compassBandEl = root.querySelector('.flight-compass-band')!;
    this.gimbalEl = root.querySelector('.flight-gimbal')!;
  }

  setNavigation(navigation: FlightNavigation): void {
    const { speed, position, heading, yaw, pitch, wrapped } = navigation;
    const mapX = this.mapPercent(position.x);
    const mapY = this.mapPercent(-position.z);
    const angle = Math.atan2(heading.x, heading.z);

    this.speedEl.textContent = `${Math.round(speed)} u/s`;
    this.xyzEl.textContent = `X ${sign(position.x)}  Y ${sign(position.y)}  Z ${sign(position.z)}`;
    this.markerEl.style.transform = `translate(${compact(mapX)}%, ${compact(mapY)}%)`;
    this.markerEl.style.left = '0%';
    this.markerEl.style.top = '0%';
    this.vectorEl.style.transform = `rotate(${degrees(angle)}deg)`;
    this.vectorEl.style.left = `${compact(mapX)}%`;
    this.vectorEl.style.top = `${compact(mapY)}%`;
    this.compassBandEl.style.transform = `translateX(${compact(-yaw * 18)}%)`;
    this.gimbalEl.style.transform = `translateX(-50%) rotate(${degrees(pitch)}deg)`;

    this.wrapEl.textContent = wrapped ? 'GRID WRAP' : 'GRID OK';
    if (wrapped) this.wrapEl.classList.add('is-wrapped');
    else this.wrapEl.classList.remove('is-wrapped');
  }

  /** @deprecated Use setNavigation; retained for the untouched world adapter. */
  setSpeed(speed: number): void {
    this.speedEl.textContent = `${Math.round(speed)} u/s`;
  }

  /** @deprecated Use setNavigation; retained for the untouched world adapter. */
  setReadout(r: { pos: { x: number; y: number; z: number }; visible: boolean }): void {
    if (!r.visible) return;
    this.xyzEl.textContent = `X ${sign(r.pos.x)}  Y ${sign(r.pos.y)}  Z ${sign(r.pos.z)}`;
  }

  private mapPercent(value: number): number {
    const normalized = (value + this.edge) / (this.edge * 2);
    return Math.max(10, Math.min(90, 10 + normalized * 80));
  }

  dispose(): void {
    this.root.replaceChildren();
  }
}
