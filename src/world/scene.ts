import * as THREE from 'three';
import type { NodeDef, TravelState, Vec3 } from '../core/types';
import { FlightPath, nodeParam } from '../core/path';
import { makeBodies } from '../core/parallax';

const BG = 0xffffff, LINE = 0x4ab3d4, LINE_FAINT = 0xcfe4f0;
const CAM_BACK = 9, CAM_UP = 3;

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const v3 = (v: Vec3) => new THREE.Vector3(v.x, v.y, v.z);

function edged(geom: THREE.BufferGeometry, fill: number, line: number, opacity = 1): THREE.Group {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: fill, transparent: opacity < 1, opacity }));
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geom),
    new THREE.LineBasicMaterial({ color: line }),
  );
  g.add(mesh, edges);
  return g;
}

function starTexture(variant: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = ['#cfe4f0', '#bcd9e8', '#e8f1f7'][variant]!;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(16, 4); ctx.lineTo(16, 28);
  ctx.moveTo(4, 16); ctx.lineTo(28, 16);
  ctx.stroke();
  return new THREE.CanvasTexture(c);
}

export class WorldScene {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly path: FlightPath;
  private readonly nodes: NodeDef[];
  private readonly planets: THREE.Group[] = [];
  private readonly midBodies: THREE.Group[] = [];
  private readonly astronaut: THREE.Group;
  private readonly raycaster = new THREE.Raycaster();
  private readonly idle: boolean;
  private time = 0;

  constructor(canvas: HTMLCanvasElement, nodes: NodeDef[], opts: { idle: boolean; seed?: number }) {
    this.nodes = nodes;
    this.idle = opts.idle;
    this.path = new FlightPath(nodes.map((n) => n.pos));
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene.background = new THREE.Color(BG);
    this.scene.fog = new THREE.Fog(BG, 30, 110);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);

    // Node planets: icosahedrons with accent ring.
    nodes.forEach((n, i) => {
      const r = n.kind === 'intro' || n.kind === 'contact' ? 1.6 : 2.4;
      const planet = edged(new THREE.IcosahedronGeometry(r, 1), BG, LINE);
      const ring = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          Array.from({ length: 48 }, (_, k) => {
            const a = (k / 48) * Math.PI * 2;
            return new THREE.Vector3(Math.cos(a) * (r + 1.0), 0, Math.sin(a) * (r + 1.0));
          }),
        ),
        new THREE.LineBasicMaterial({ color: new THREE.Color(n.accent) }),
      );
      ring.rotation.x = 0.4;
      planet.add(ring);
      planet.position.copy(v3(n.pos));
      planet.userData.nodeIndex = i;
      this.planets.push(planet);
      this.scene.add(planet);
    });

    // Dashed flight path.
    const pathPts = Array.from({ length: 200 }, (_, k) => v3(this.path.sample(k / 199)));
    const dashed = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pathPts),
      new THREE.LineDashedMaterial({ color: LINE_FAINT, dashSize: 0.8, gapSize: 0.6 }),
    );
    dashed.computeLineDistances();
    this.scene.add(dashed);

    // Mid + far parallax field (deterministic).
    const field = makeBodies(opts.seed ?? 1981);
    for (const b of field.mid) {
      const rock = edged(new THREE.DodecahedronGeometry(b.radius, 0), BG, LINE_FAINT);
      rock.position.copy(v3(b.pos));
      rock.userData.spin = b.spin;
      this.midBodies.push(rock);
      this.scene.add(rock);
    }
    for (const s of field.far) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture(s.variant), transparent: true }));
      sprite.position.copy(v3(s.pos));
      sprite.scale.setScalar(s.size);
      this.scene.add(sprite);
    }

    // Temporary astronaut (capsule + helmet), replaced by real art later.
    this.astronaut = new THREE.Group();
    this.astronaut.add(edged(new THREE.CapsuleGeometry(0.35, 0.7, 2, 8), BG, LINE));
    const helmet = edged(new THREE.SphereGeometry(0.32, 10, 8), BG, LINE);
    helmet.position.y = 0.85;
    this.astronaut.add(helmet);
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

  /** One frame: position camera/astronaut from travel state, render. */
  frame(dt: number, travel: TravelState): void {
    this.time += dt;
    const n = this.nodes.length;
    const u = travel.kind === 'atNode'
      ? nodeParam(travel.index, n)
      : nodeParam(travel.from, n) + (nodeParam(travel.to, n) - nodeParam(travel.from, n)) * smoothstep(travel.t);
    const eye = this.path.sample(Math.max(0, u - CAM_BACK / 150));
    const look = this.path.sample(Math.min(1, u + 0.02));
    const bob = this.idle ? Math.sin(this.time * 1.4) * 0.15 : 0;
    this.camera.position.set(eye.x, eye.y + CAM_UP + bob * 0.3, eye.z - CAM_BACK * 0.4);
    this.camera.lookAt(look.x, look.y, look.z);
    const here = this.path.sample(u);
    this.astronaut.position.set(here.x, here.y + bob, here.z);
    this.astronaut.rotation.z = this.idle ? Math.sin(this.time * 0.6) * 0.12 : 0;
    if (this.idle) {
      for (const p of this.planets) p.rotation.y += dt * 0.15;
      for (const r of this.midBodies) r.rotation.y += dt * (r.userData.spin as number);
    }
    this.renderer.render(this.scene, this.camera);
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
    this.renderer.dispose();
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
  }
}
