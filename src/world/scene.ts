import * as THREE from 'three';
import type { NodeDef, RailMotionState, Vec3 } from '../core/types';
import { makeRailPath } from '../core/rail-path';
import { overviewPose } from '../core/overview';
import astronautUrl from '../assets/astronaut-alpha.png';
import planet1Url from '../assets/rail/planet1.png';
import planet1AltUrl from '../assets/rail/planet1-alt.png';
import planet2Url from '../assets/rail/planet2.png';
import cometLongUrl from '../assets/rail/comet-long.png';
import cometSmallUrl from '../assets/rail/comet-small.png';
import cloudUrl from '../assets/rail/cloud.png';
import starLargeUrl from '../assets/rail/star-large.png';
import starSmallUrl from '../assets/rail/star-small.png';
import lunarSurfaceUrl from '../assets/rail/lunar-surface.png';
import proj1Url from '../assets/rail/proj1.png';
import proj2Url from '../assets/rail/proj2.png';
import proj3Url from '../assets/rail/proj3.png';
import motionUrl from '../assets/rail/motion.png';

// Source art is 517x773; keep that aspect when scaling the billboard.
const ASTRONAUT_ASPECT = 517 / 773, ASTRONAUT_HEIGHT = 2.6;

const BG = 0xffffff, LINE_FAINT = 0xcfe4f0;
const CAM_BACK_PROGRESS = 0.18, CAM_AHEAD_PROGRESS = 0.24, CAM_UP = 3, CAM_DEPTH = 6.3;
const ASTRONAUT_RIGHT = -0.7, ASTRONAUT_FORWARD = -1.2, ASTRONAUT_MARGIN = 0.1;
const NODE_SCALE = 2.2;
const OVERVIEW_NODE_GROW = 1.45;
const OVERVIEW_DIR: Vec3 = { x: 0, y: 1, z: -0.18 };

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const v3 = (v: Vec3) => new THREE.Vector3(v.x, v.y, v.z);
const nodeRadius = (node: NodeDef) => node.kind === 'intro' || node.kind === 'contact' ? 1.6 : 2.25;

type SpriteDef = {
  url: string;
  aspect: number;
  progress: number;
  offset: Vec3;
  height: number;
  rotation: number;
  spin?: number;
};

function imageTexture(url: string): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function overviewAmount(motion: RailMotionState): number {
  if (motion.phase === 'overview') return 1;
  return smoothstep(clamp01(-motion.progress));
}

export class WorldScene {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly rail: ReturnType<typeof makeRailPath>;
  private readonly nodes: NodeDef[];
  private readonly nodePositions: Vec3[];
  private readonly nodeFrameRadii: number[];
  private readonly planets: THREE.Sprite[] = [];
  private readonly scenery: THREE.Sprite[] = [];
  private readonly flyFades: THREE.Material[] = [];
  private readonly astronaut: THREE.Sprite;
  private readonly raycaster = new THREE.Raycaster();
  private readonly idle: boolean;
  private time = 0;
  private labelData: { x: number; y: number; focus: number; visible: boolean }[] = [];

  constructor(canvas: HTMLCanvasElement, nodes: NodeDef[], opts: { idle: boolean; seed?: number }) {
    this.nodes = nodes;
    this.rail = makeRailPath(nodes);
    this.idle = opts.idle;
    this.nodePositions = nodes.map((n) => n.pos);
    this.nodeFrameRadii = nodes.map((n) => nodeRadius(n) * NODE_SCALE * 0.75);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene.background = new THREE.Color(BG);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.3, 4000);

    const nodeTextures = {
      planet1: imageTexture(planet1Url),
      planet1Alt: imageTexture(planet1AltUrl),
      proj1: imageTexture(proj1Url),
      proj2: imageTexture(proj2Url),
      proj3: imageTexture(proj3Url),
      motion: imageTexture(motionUrl),
    };
    const missionTextures = [nodeTextures.proj1, nodeTextures.proj2, nodeTextures.proj3, nodeTextures.motion];

    nodes.forEach((n, i) => {
      const texture = n.kind === 'intro'
        ? nodeTextures.planet1
        : n.kind === 'contact'
          ? nodeTextures.planet1Alt
          : missionTextures[i % missionTextures.length]!;
      const aspect = n.kind === 'intro' || n.kind === 'contact' ? 375 / 250 : 1;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false }));
      const h = nodeRadius(n) * NODE_SCALE * (0.9 + 0.16 * ((i * 7) % 5) / 5);
      sprite.scale.set(h * aspect, h, 1);
      sprite.material.rotation = ((i * 13) % 7) / 7 * 0.5 - 0.25;
      sprite.position.copy(v3(n.pos));
      sprite.userData.nodeIndex = i;
      sprite.userData.baseW = h * aspect;
      sprite.userData.baseH = h;
      this.planets.push(sprite);
      this.scene.add(sprite);
    });

    const routePts = this.rail.points.map(v3);
    const dashedMat = new THREE.LineDashedMaterial({ color: LINE_FAINT, dashSize: 0.8, gapSize: 0.6, transparent: true, fog: false });
    const dashed = new THREE.Line(new THREE.BufferGeometry().setFromPoints(routePts), dashedMat);
    dashed.computeLineDistances();
    this.flyFades.push(dashedMat);
    this.scene.add(dashed);

    const sceneryDefs: SpriteDef[] = [
      { url: cloudUrl, aspect: 200 / 85, progress: 0.35, offset: { x: -10, y: 6, z: 8 }, height: 5.2, rotation: -0.08 },
      { url: starSmallUrl, aspect: 1, progress: 0.7, offset: { x: 8, y: 7, z: -10 }, height: 1.0, rotation: 0.2, spin: 0.2 },
      { url: cometLongUrl, aspect: 325 / 150, progress: 1.15, offset: { x: -8, y: 5, z: 3 }, height: 3.4, rotation: -0.42, spin: -0.03 },
      { url: planet2Url, aspect: 200 / 175, progress: 1.85, offset: { x: 12, y: -3, z: 12 }, height: 6.6, rotation: 0.12, spin: 0.015 },
      { url: starLargeUrl, aspect: 1, progress: 2.35, offset: { x: -12, y: 8, z: -6 }, height: 1.9, rotation: 0.1, spin: 0.12 },
      { url: cometSmallUrl, aspect: 125 / 100, progress: 2.9, offset: { x: 8, y: 4, z: 8 }, height: 2.3, rotation: -0.3, spin: -0.05 },
      { url: cloudUrl, aspect: 200 / 85, progress: 3.4, offset: { x: -13, y: -5, z: 5 }, height: 7.4, rotation: 0.04 },
      { url: planet1AltUrl, aspect: 375 / 250, progress: 4.25, offset: { x: 12, y: 7, z: -8 }, height: 8.2, rotation: -0.12, spin: 0.02 },
      { url: lunarSurfaceUrl, aspect: 900 / 45, progress: 4.8, offset: { x: 0, y: -9, z: 7 }, height: 2.8, rotation: 0 },
    ];

    for (const def of sceneryDefs) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: imageTexture(def.url),
        transparent: true,
        depthWrite: false,
        fog: false,
      }));
      const anchor = this.rail.sampleProgress(def.progress);
      sprite.position.copy(v3(anchor).add(v3(def.offset)));
      sprite.scale.set(def.height * def.aspect, def.height, 1);
      sprite.material.rotation = def.rotation;
      sprite.userData.spin = def.spin ?? 0;
      this.scenery.push(sprite);
      this.scene.add(sprite);
    }

    const astronautTex = imageTexture(astronautUrl);
    this.astronaut = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: astronautTex, transparent: true, depthWrite: false, depthTest: false, fog: false }),
    );
    this.astronaut.scale.set(ASTRONAUT_HEIGHT * ASTRONAUT_ASPECT, ASTRONAUT_HEIGHT, 1);
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

  private flyPose(progress: number): { pos: THREE.Vector3; look: THREE.Vector3; bank: number } {
    const eye = this.rail.sampleProgress(Math.max(0, progress - CAM_BACK_PROGRESS));
    const look = this.rail.sampleProgress(progress + CAM_AHEAD_PROGRESS);
    const pos = new THREE.Vector3(eye.x, eye.y + CAM_UP, eye.z - CAM_DEPTH);
    const lookV = v3(look);
    const bank = THREE.MathUtils.clamp((lookV.x - pos.x) * 0.018, -0.14, 0.14);
    return { pos, look: lookV, bank };
  }

  private overviewCam(): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const p = overviewPose(this.nodePositions, this.nodeFrameRadii, {
      fovDeg: this.camera.fov, aspect: this.camera.aspect, dir: OVERVIEW_DIR, margin: 1.2,
    });
    return { pos: v3(p.eye), look: v3(p.look) };
  }

  /** One frame: position camera/astronaut/backdrop from rail motion, render. */
  frame(dt: number, motion: RailMotionState): void {
    this.time += dt;
    const ov = overviewAmount(motion);
    const railProgress = Math.max(0, motion.progress);
    const bob = this.idle ? Math.sin(this.time * 1.4) * 0.15 : 0;

    const np = this.flyPose(railProgress);
    np.pos.y += bob * 0.3;
    let camPos = np.pos;
    let camLook = np.look;
    if (ov > 0) {
      const op = this.overviewCam();
      camPos = np.pos.clone().lerp(op.pos, ov);
      camLook = np.look.clone().lerp(op.look, ov);
    }
    this.camera.position.copy(camPos);
    this.camera.lookAt(camLook);
    this.camera.rotation.z += this.idle ? np.bank * (1 - ov) : 0;

    const forward = camLook.clone().sub(this.camera.position).normalize();
    const here = v3(this.rail.sampleProgress(railProgress));
    const nodeIndex = Math.min(this.nodes.length - 1, Math.max(0, Math.round(railProgress)));
    const activeRadius = nodeRadius(this.nodes[nodeIndex] ?? this.nodes[0]!);
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    this.astronaut.position.copy(here)
      .addScaledVector(right, ASTRONAUT_RIGHT)
      .addScaledVector(up, activeRadius + ASTRONAUT_MARGIN + bob)
      .addScaledVector(forward, ASTRONAUT_FORWARD);
    this.astronaut.material.rotation = this.idle ? Math.sin(this.time * 0.6) * 0.12 : 0;
    this.astronaut.material.opacity = 1 - ov * 0.75;
    for (const m of this.flyFades) m.opacity = 1 - ov;

    const grow = 1 + ov * (OVERVIEW_NODE_GROW - 1);
    for (const p of this.planets) {
      p.scale.set((p.userData.baseW as number) * grow, (p.userData.baseH as number) * grow, 1);
      if (this.idle) p.material.rotation += dt * 0.035;
    }
    if (this.idle) {
      for (const sprite of this.scenery) sprite.material.rotation += dt * (sprite.userData.spin as number);
    }

    this.renderer.render(this.scene, this.camera);

    const w = this.renderer.domElement.clientWidth || innerWidth;
    const h = this.renderer.domElement.clientHeight || innerHeight;
    this.labelData = this.planets.map((planet, i) => {
      const ndc = planet.position.clone().project(this.camera);
      const focus = clamp01(1 - Math.abs(motion.progress - i) / 0.7) * (1 - ov);
      return {
        x: (ndc.x * 0.5 + 0.5) * w,
        y: (-ndc.y * 0.5 + 0.5) * h,
        focus,
        visible: ndc.z < 1 && focus > 0.01,
      };
    });
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
