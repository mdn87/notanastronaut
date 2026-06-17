import * as THREE from 'three';
import type { NodeDef, TravelState, Vec3 } from '../core/types';
import { FlightPath, nodeParam } from '../core/path';
import { makeGalaxy, type GalaxyKind } from '../core/galaxy';
import { overviewPose } from '../core/overview';
import { OVERVIEW_INDEX } from '../core/travel';
import astronautUrl from '../assets/astronaut-alpha.png';

// Source art is 517x773; keep that aspect when scaling the billboard.
const ASTRONAUT_ASPECT = 517 / 773, ASTRONAUT_HEIGHT = 2.6;

const BG = 0xffffff, LINE = 0x4ab3d4, LINE_FAINT = 0xcfe4f0;
const CAM_BACK = 9, CAM_UP = 3, CAM_DEPTH = 6.3;
const ASTRONAUT_RIGHT = -0.7, ASTRONAUT_FORWARD = -1.2, ASTRONAUT_MARGIN = 0.1;

// Galaxy-planet node billboard (galaxy-planet.svg is 280x220).
const PLANET_ASPECT = 280 / 220, PLANET_SCALE = 2.1;
const OVERVIEW_PLANET_GROW = 2.0; // node planets read as markers within the galaxy
const OVERVIEW_DIR: Vec3 = { x: 0, y: 1, z: -0.18 };

// Simple line-art doodle motifs (thin cyan outlines); aspect keeps each undistorted.
const PIECE_ART: Record<GalaxyKind, { url: string; aspect: number }> = {
  planet: { url: '/artwork/galaxy/galaxy-planet-outline.svg', aspect: 280 / 220 },
  bubble: { url: '/artwork/galaxy/galaxy-bubble.svg', aspect: 1 },
  cloud: { url: '/artwork/galaxy/galaxy-cloud.svg', aspect: 120 / 84 },
  sparkle: { url: '/artwork/galaxy/galaxy-sparkle.svg', aspect: 1 },
};

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const v3 = (v: Vec3) => new THREE.Vector3(v.x, v.y, v.z);
const nodeRadius = (node: NodeDef) => node.kind === 'intro' || node.kind === 'contact' ? 1.6 : 2.4;

/** Rasterize an SVG (incl. filters) to a fixed-resolution canvas texture. */
function svgTexture(url: string, w: number, h: number): THREE.Texture {
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, w, h);
    tex.image = c;
    tex.needsUpdate = true;
  };
  img.src = url;
  return tex;
}

/** How much of the galaxy overview is showing for a given travel state (0..1). */
function overviewAmount(travel: TravelState): number {
  if (travel.kind === 'atNode') return travel.index === OVERVIEW_INDEX ? 1 : 0;
  if (travel.to === OVERVIEW_INDEX) return smoothstep(travel.t);
  if (travel.from === OVERVIEW_INDEX) return 1 - smoothstep(travel.t);
  return 0;
}

/** The real-node endpoint of a transit that touches the overview. */
function nodeEndpoint(travel: TravelState): number {
  if (travel.kind !== 'inTransit') return 0;
  if (travel.from === OVERVIEW_INDEX) return travel.to;
  if (travel.to === OVERVIEW_INDEX) return travel.from;
  return 0;
}

export class WorldScene {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly path: FlightPath;
  private readonly nodes: NodeDef[];
  private readonly nodePositions: Vec3[];
  private readonly nodeFrameRadii: number[];
  private readonly planets: THREE.Sprite[] = [];
  private readonly pieces: THREE.Sprite[] = [];
  private readonly flyFades: THREE.Material[] = [];
  private readonly astronaut: THREE.Sprite;
  private readonly raycaster = new THREE.Raycaster();
  private readonly idle: boolean;
  private time = 0;
  private labelData: { x: number; y: number; focus: number; visible: boolean }[] = [];

  constructor(canvas: HTMLCanvasElement, nodes: NodeDef[], opts: { idle: boolean; seed?: number }) {
    this.nodes = nodes;
    this.idle = opts.idle;
    this.nodePositions = nodes.map((n) => n.pos);
    this.nodeFrameRadii = nodes.map((n) => nodeRadius(n) * PLANET_SCALE * 0.6);
    this.path = new FlightPath(this.nodePositions);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene.background = new THREE.Color(BG);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.3, 4000);

    // Filled two-tone planet for the nodes (the clickable missions) — distinct
    // from the thin outline-planet doodles, so the hierarchy reads.
    const planetTex = svgTexture('/artwork/galaxy/galaxy-planet.svg', 1024, 804);

    // Node planets: two-tone galaxy-planet billboards (same art at every zoom
    // level), clickable, growing a little in the overview.
    nodes.forEach((n, i) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: planetTex, transparent: true, depthWrite: false, fog: false }));
      const h = nodeRadius(n) * PLANET_SCALE * (0.9 + 0.2 * ((i * 7) % 5) / 5);
      sprite.scale.set(h * PLANET_ASPECT, h, 1);
      sprite.material.rotation = ((i * 13) % 7) / 7 * 0.6 - 0.3;
      sprite.position.copy(v3(n.pos));
      sprite.userData.nodeIndex = i;
      sprite.userData.baseW = h * PLANET_ASPECT;
      sprite.userData.baseH = h;
      this.planets.push(sprite);
      this.scene.add(sprite);
    });

    // Dashed flight path (fades out in the galaxy overview).
    const pathPts = Array.from({ length: 200 }, (_, k) => v3(this.path.sample(k / 199)));
    const dashedMat = new THREE.LineDashedMaterial({ color: LINE_FAINT, dashSize: 0.8, gapSize: 0.6, transparent: true, fog: false });
    const dashed = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pathPts), dashedMat);
    dashed.computeLineDistances();
    this.flyFades.push(dashedMat);
    this.scene.add(dashed);

    // Individual galaxy pieces scattered through 3D space, parallaxing as the
    // viewport moves. Always visible — they are the galaxy in every view.
    const pieceTex: Record<GalaxyKind, THREE.Texture> = {
      planet: svgTexture(PIECE_ART.planet.url, 700, 550),
      bubble: svgTexture(PIECE_ART.bubble.url, 256, 256),
      cloud: svgTexture(PIECE_ART.cloud.url, 384, 269),
      sparkle: svgTexture(PIECE_ART.sparkle.url, 256, 256),
    };
    const field = makeGalaxy(opts.seed ?? 1981);
    for (const p of field.pieces) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: pieceTex[p.kind], transparent: true, depthWrite: false, fog: false }));
      sprite.scale.set(p.size * PIECE_ART[p.kind].aspect, p.size, 1);
      sprite.position.copy(v3(p.pos));
      sprite.material.rotation = p.rot;
      sprite.userData.spin = p.spin;
      this.pieces.push(sprite);
      this.scene.add(sprite);
    }
    for (const arc of field.arcs) {
      // Smooth the polyline into a flowing curve (raw segments look jagged).
      const curve = new THREE.CatmullRomCurve3(arc.points.map(v3));
      const geom = new THREE.BufferGeometry().setFromPoints(curve.getPoints(60));
      const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: LINE, transparent: true, opacity: 0.3, fog: false }));
      this.scene.add(line);
    }

    // The (not-)astronaut billboard, flying beside the camera.
    const astronautTex = new THREE.TextureLoader().load(astronautUrl);
    astronautTex.colorSpace = THREE.SRGBColorSpace;
    this.astronaut = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: astronautTex, transparent: true, depthWrite: false, depthTest: false, fog: false }),
    );
    this.astronaut.scale.set(ASTRONAUT_HEIGHT * ASTRONAUT_ASPECT, ASTRONAUT_HEIGHT, 1);
    // Always the foreground character: draw last + ignore depth so he never
    // gets clipped by planets he flies past.
    this.astronaut.renderOrder = 10;
    this.scene.add(this.astronaut);

    this.resize();
  }

  resize(): void {
    const w = this.renderer.domElement.clientWidth || innerWidth;
    const h = this.renderer.domElement.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Flythrough camera pose at path parameter u (no bob). */
  private flyPose(u: number): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const eye = this.path.sample(Math.max(0, u - CAM_BACK / 150));
    const look = this.path.sample(Math.min(1, u + 0.02));
    return { pos: new THREE.Vector3(eye.x, eye.y + CAM_UP, eye.z - CAM_DEPTH), look: v3(look) };
  }

  /** Overhead "frame everything" camera pose for the galaxy overview. */
  private overviewCam(): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const p = overviewPose(this.nodePositions, this.nodeFrameRadii, {
      fovDeg: this.camera.fov, aspect: this.camera.aspect, dir: OVERVIEW_DIR, margin: 1.2,
    });
    return { pos: v3(p.eye), look: v3(p.look) };
  }

  /** One frame: position camera/astronaut/backdrop from travel state, render. */
  frame(dt: number, travel: TravelState): void {
    this.time += dt;
    const n = this.nodes.length;
    const ov = overviewAmount(travel);
    const bob = this.idle ? Math.sin(this.time * 1.4) * 0.15 : 0;

    let camPos: THREE.Vector3, camLook: THREE.Vector3, flyU: number;
    if (ov > 0) {
      flyU = nodeParam(Math.max(0, nodeEndpoint(travel)), n);
      const np = this.flyPose(flyU);
      const op = this.overviewCam();
      camPos = np.pos.lerp(op.pos, ov);
      camLook = np.look.lerp(op.look, ov);
    } else {
      flyU = travel.kind === 'atNode'
        ? nodeParam(travel.index, n)
        : nodeParam(travel.from, n) + (nodeParam(travel.to, n) - nodeParam(travel.from, n)) * smoothstep(travel.t);
      const np = this.flyPose(flyU);
      np.pos.y += bob * 0.3;
      camPos = np.pos; camLook = np.look;
    }
    this.camera.position.copy(camPos);
    this.camera.lookAt(camLook);

    const forward = camLook.clone().sub(this.camera.position).normalize();

    // Astronaut: pinned beside the camera, faded out as we pull back.
    const here = v3(this.path.sample(flyU));
    const activeRadius = nodeRadius(this.nodes[Math.max(0, nodeEndpoint(travel))] ?? this.nodes[0]!);
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    this.astronaut.position.copy(here)
      .addScaledVector(right, ASTRONAUT_RIGHT)
      .addScaledVector(up, activeRadius + ASTRONAUT_MARGIN + bob)
      .addScaledVector(forward, ASTRONAUT_FORWARD);
    this.astronaut.material.rotation = this.idle ? Math.sin(this.time * 0.6) * 0.12 : 0;
    this.astronaut.material.opacity = 1 - ov;
    for (const m of this.flyFades) m.opacity = 1 - ov;

    // Node planets grow a touch in the overview so they read as the missions.
    const grow = 1 + ov * (OVERVIEW_PLANET_GROW - 1);
    for (const p of this.planets) {
      p.scale.set((p.userData.baseW as number) * grow, (p.userData.baseH as number) * grow, 1);
      if (this.idle) p.material.rotation += dt * 0.05;
    }
    if (this.idle) {
      for (const piece of this.pieces) piece.material.rotation += dt * (piece.userData.spin as number) * 0.2;
    }
    this.renderer.render(this.scene, this.camera);

    // Per-node floating-title layout: screen position of each planet + a focus
    // value (1 at that node, easing during transit, 0 in the overview) the HUD
    // uses to animate the title out from the planet.
    const w = this.renderer.domElement.clientWidth || innerWidth;
    const h = this.renderer.domElement.clientHeight || innerHeight;
    this.labelData = this.planets.map((planet, i) => {
      const ndc = planet.position.clone().project(this.camera);
      const focus = this.titleFocus(i, travel) * (1 - ov);
      return {
        x: (ndc.x * 0.5 + 0.5) * w,
        y: (-ndc.y * 0.5 + 0.5) * h,
        focus,
        visible: ndc.z < 1 && focus > 0.01,
      };
    });
  }

  /** Floating-title focus for node i: 1 when active, eased across transits. */
  private titleFocus(i: number, travel: TravelState): number {
    if (travel.kind === 'atNode') return travel.index === i ? 1 : 0;
    if (travel.to === i) return smoothstep(travel.t);
    if (travel.from === i) return 1 - smoothstep(travel.t);
    return 0;
  }

  /** Screen layout for the per-node floating titles (computed each frame). */
  labels(): { x: number; y: number; focus: number; visible: boolean }[] {
    return this.labelData;
  }

  /** Raycast a pointer event to a planet's node index, or null. */
  pickNode(clientX: number, clientY: number): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hits = this.raycaster.intersectObjects(this.planets, true);
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o) {
        if (o.userData.nodeIndex !== undefined) return o.userData.nodeIndex as number;
        o = o.parent;
      }
    }
    return null;
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const geometry = (o as { geometry?: THREE.BufferGeometry }).geometry;
      if (geometry) geometry.dispose();

      const material = (o as { material?: THREE.Material | THREE.Material[] }).material;
      const materials = Array.isArray(material) ? material : material ? [material] : [];
      for (const mm of materials) {
        const map = (mm as THREE.Material & { map?: THREE.Texture }).map;
        if (map) {
          map.dispose();
        }
        mm.dispose();
      }
    });
    this.renderer.dispose();
  }
}
