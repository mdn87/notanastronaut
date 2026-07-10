// src/world/scene.ts
import * as THREE from 'three';
import type { FlightState } from '../core/flight-types';
import type { Vec3 } from '../core/types';
import { makeSpiralGalaxy, type SpiralField } from '../core/galaxy';
import { makeGridLines } from '../core/grid';
import { makeVolumeBodies } from '../core/parallax';
import type { ActiveStarSnapshot } from '../physics/star-collisions';
import { ThrusterView } from './thruster';

const BG = 0xffffff;
const ARROW_LEN = 3.6;
// Chase cam: CAM_TURN is how fast the trail eases toward the facing (low = the
// camera barely swings when you look); CAM_LOOK_LAG keeps the avatar centered.
const CAM_BACK = 11, CAM_UP = 3.4, CAM_LAG = 5, CAM_LOOK_LAG = 12, CAM_TURN = 2;
const CAM_PITCH_MAX = 0.5; // cap the trail's elevation (rad ≈ 29°) so a steep climb/dive never swings the camera near vertical (which would flip the lookAt up-vector)
const FORWARD = new THREE.Vector3(0, 0, 1);
const EXTENT = 700;        // vast, explorable galaxy — matches the flight soft-bound
const GALAXY_RADIUS = 700;

const v = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);

/** Custom point shader: per-vertex size + alpha, soft round mask, dark-on-white. */
function pointsMaterial(square: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    uniforms: { uPixelRatio: { value: Math.min(devicePixelRatio, 2) }, uAvatar: { value: new THREE.Vector3() }, uFade: { value: 520 } },
    vertexShader: `
      attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
      varying float vAlpha; varying vec3 vColor;
      uniform float uPixelRatio; uniform vec3 uAvatar; uniform float uFade;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float fade = clamp(1.0 - distance(position, uAvatar) / uFade, 0.0, 1.0);
        vAlpha = aAlpha * (uFade > 0.0 ? fade : 1.0);
        gl_PointSize = min(aSize * uPixelRatio * (120.0 / max(-mv.z, 1.0)), 26.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vAlpha; varying vec3 vColor;
      void main() {
        ${square
          ? 'float mask = 1.0;'
          : 'float r = length(gl_PointCoord - vec2(0.5)); float mask = 1.0 - smoothstep(0.18, 0.5, r); if (mask <= 0.0) discard;'}
        gl_FragColor = vec4(vColor, vAlpha * mask);
      }`,
  });
}

/** Grid-line shader: per-FRAGMENT distance fade so a passing line glows near the
 *  avatar and fades into the distance (a holodeck lattice, distinct from stars). */
function gridLinesMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    uniforms: { uAvatar: { value: new THREE.Vector3() }, uFade: { value: 380 }, uColor: { value: new THREE.Color(0x4ab3d4) } },
    vertexShader: `
      varying vec3 vWorld;
      void main() { vWorld = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vWorld; uniform vec3 uAvatar; uniform float uFade; uniform vec3 uColor;
      void main() {
        float fade = clamp(1.0 - distance(vWorld, uAvatar) / uFade, 0.0, 1.0);
        if (fade <= 0.0) discard;
        gl_FragColor = vec4(uColor, fade * 0.55);
      }`,
  });
}

function setAttrs(geom: THREE.BufferGeometry, pos: Float32Array, size: Float32Array, alpha: Float32Array, color: Float32Array) {
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geom.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geom.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
}

export interface ActiveStarBufferState {
  indices: Int32Array;
  positions: Float32Array;
  sizes: Float32Array;
  alphas: Float32Array;
  colors: Float32Array;
  displayAlphas: Float32Array;
  baseChanged: boolean;
}

export function syncActiveStarBuffers(
  active: ActiveStarSnapshot,
  field: SpiralField,
  baseAlphas: Float32Array,
  state: ActiveStarBufferState,
): number {
  let activeCount = 0;
  state.baseChanged = false;
  for (let i = 0; i < state.indices.length; i++) {
    const previous = state.indices[i]!;
    const next = active.starIndices[i]!;
    if (previous !== next) {
      if (previous >= 0) state.displayAlphas[previous] = baseAlphas[previous]!;
      state.baseChanged = true;
    }
  }

  for (let i = 0; i < state.indices.length; i++) {
    const next = active.starIndices[i]!;
    if (state.indices[i] !== next && next >= 0) state.displayAlphas[next] = 0;
  }

  for (let i = 0; i < state.indices.length; i++) {
    const next = active.starIndices[i]!;
    state.indices[i] = next;
    const offset = i * 3;
    if (next >= 0) {
      const sourceOffset = next * 3;
      activeCount++;
      state.positions[offset] = active.positions[offset]!;
      state.positions[offset + 1] = active.positions[offset + 1]!;
      state.positions[offset + 2] = active.positions[offset + 2]!;
      state.sizes[i] = field.sizes[next]!;
      state.alphas[i] = active.alphas[i]!;
      state.colors[offset] = field.colors[sourceOffset]!;
      state.colors[offset + 1] = field.colors[sourceOffset + 1]!;
      state.colors[offset + 2] = field.colors[sourceOffset + 2]!;
    } else {
      state.sizes[i] = 0;
      state.alphas[i] = 0;
    }
  }
  return activeCount;
}

export class WorldScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly galaxyField: SpiralField;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly galaxy: THREE.Points;
  private readonly baseGalaxyAlphas: Float32Array;
  private readonly galaxyDisplayAlphas: Float32Array;
  private readonly baseGalaxyAlphaAttr: THREE.BufferAttribute;
  private readonly activePoints: THREE.Points;
  private readonly activeIndices = new Int32Array(96).fill(-1);
  private readonly activePos = new Float32Array(288);
  private readonly activeSize = new Float32Array(96);
  private readonly activeAlpha = new Float32Array(96);
  private readonly activeColor = new Float32Array(288);
  private readonly activeBufferState: ActiveStarBufferState;
  private readonly activePositionAttr: THREE.BufferAttribute;
  private readonly activeSizeAttr: THREE.BufferAttribute;
  private readonly activeAlphaAttr: THREE.BufferAttribute;
  private readonly activeColorAttr: THREE.BufferAttribute;
  private readonly grid: THREE.LineSegments;
  private readonly squares: THREE.Points;
  private readonly avatar: THREE.Object3D;
  private readonly thruster: ThrusterView;
  private readonly camDir = new THREE.Vector3(0, 0, 1);
  private readonly gridMat: THREE.ShaderMaterial;
  private readonly squareMat: THREE.ShaderMaterial;
  private readonly camPos = new THREE.Vector3(0, CAM_UP, -CAM_BACK);
  private readonly lookAt = new THREE.Vector3(0, 0, 0);

  constructor(canvas: HTMLCanvasElement, opts: { seed?: number } = {}) {
    const seed = opts.seed ?? 1981;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene.background = new THREE.Color(BG);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 4000);

    // Galaxy (round points, no distance fade).
    this.galaxyField = makeSpiralGalaxy(seed, { radius: GALAXY_RADIUS, thickness: 30, count: 30000 });
    this.baseGalaxyAlphas = this.galaxyField.alphas.slice();
    this.galaxyDisplayAlphas = this.galaxyField.alphas.slice();
    const gg = new THREE.BufferGeometry();
    setAttrs(gg, this.galaxyField.positions, this.galaxyField.sizes, this.galaxyDisplayAlphas, this.galaxyField.colors);
    this.baseGalaxyAlphaAttr = gg.getAttribute('aAlpha') as THREE.BufferAttribute;
    const galaxyMat = pointsMaterial(false);
    galaxyMat.uniforms.uFade!.value = 0; // galaxy never fades by distance
    this.galaxy = new THREE.Points(gg, galaxyMat);
    this.scene.add(this.galaxy);

    const activeGeom = new THREE.BufferGeometry();
    setAttrs(activeGeom, this.activePos, this.activeSize, this.activeAlpha, this.activeColor);
    this.activePositionAttr = activeGeom.getAttribute('position') as THREE.BufferAttribute;
    this.activeSizeAttr = activeGeom.getAttribute('aSize') as THREE.BufferAttribute;
    this.activeAlphaAttr = activeGeom.getAttribute('aAlpha') as THREE.BufferAttribute;
    this.activeColorAttr = activeGeom.getAttribute('aColor') as THREE.BufferAttribute;
    this.activeBufferState = {
      indices: this.activeIndices,
      positions: this.activePos,
      sizes: this.activeSize,
      alphas: this.activeAlpha,
      colors: this.activeColor,
      displayAlphas: this.galaxyDisplayAlphas,
      baseChanged: false,
    };
    const activeMat = pointsMaterial(false);
    activeMat.uniforms.uFade!.value = 0;
    this.activePoints = new THREE.Points(activeGeom, activeMat);
    this.activePoints.frustumCulled = false;
    this.scene.add(this.activePoints);

    // 3D grid as a fading line lattice — a clear spatial reference / motion cue,
    // unmistakable against the point stars.
    const gridGeom = new THREE.BufferGeometry();
    gridGeom.setAttribute('position', new THREE.BufferAttribute(makeGridLines({ spacing: 90, extent: EXTENT }), 3));
    this.gridMat = gridLinesMaterial();
    this.grid = new THREE.LineSegments(gridGeom, this.gridMat);
    this.scene.add(this.grid);

    // Depth squares (square points, varied size, faint, distance fade).
    const bodies = makeVolumeBodies(seed ^ 0x9e37, { extent: EXTENT, count: 240, maxSize: 14 });
    const sn = bodies.length;
    const spos = new Float32Array(sn * 3), ssize = new Float32Array(sn), salpha = new Float32Array(sn), scol = new Float32Array(sn * 3);
    bodies.forEach((b, i) => {
      spos[i * 3] = b.pos.x; spos[i * 3 + 1] = b.pos.y; spos[i * 3 + 2] = b.pos.z;
      ssize[i] = b.size; salpha[i] = 0.22;
      scol[i * 3] = 0x4a / 255; scol[i * 3 + 1] = 0xb3 / 255; scol[i * 3 + 2] = 0xd4 / 255;
    });
    const sqGeom = new THREE.BufferGeometry();
    setAttrs(sqGeom, spos, ssize, salpha, scol);
    this.squareMat = pointsMaterial(true);
    this.squares = new THREE.Points(sqGeom, this.squareMat);
    this.scene.add(this.squares);

    // Avatar: a little rocket-dart (nose cone + tail fins) so its facing AND roll
    // read clearly from the chase cam. A real 3D mesh, not a billboard.
    const arrow = new THREE.Group();
    const bodyGeo = new THREE.ConeGeometry(0.7, ARROW_LEN, 6);
    bodyGeo.rotateX(Math.PI / 2); // apex now points +z (forward)
    arrow.add(new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: 0x2b7e9e })));
    const finGeo = new THREE.BoxGeometry(0.1, 1.7, 1.3);
    const finMat = new THREE.MeshBasicMaterial({ color: 0x184f68 });
    const finV = new THREE.Mesh(finGeo, finMat); finV.position.z = -ARROW_LEN * 0.32;
    const finH = finV.clone(); finH.rotation.z = Math.PI / 2;
    arrow.add(finV, finH);
    arrow.renderOrder = 10;
    this.avatar = arrow;
    this.scene.add(this.avatar);

    this.thruster = new ThrusterView(seed);
    this.scene.add(this.thruster.points);

    this.resize();
  }

  resize(): void {
    const w = this.renderer.domElement.clientWidth || innerWidth;
    const h = this.renderer.domElement.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame(dt: number, flight: FlightState, active: ActiveStarSnapshot, galaxyAngle: number): void {
    const pos = v(flight.position);
    const head = v(flight.heading).normalize();

    // Chase cam trails behind the ship's YAW but with a CAPPED elevation, so a
    // steep climb/dive never swings the camera near vertical (which would flip the
    // lookAt up-vector). CAM_TURN is gentle so fast turns don't whip it around.
    const hm = Math.hypot(head.x, head.z) || 1; // horizontal heading mag (>0 — pitch is clamped < π/2)
    const camPitch = Math.max(-CAM_PITCH_MAX, Math.min(CAM_PITCH_MAX, Math.asin(Math.max(-1, Math.min(1, head.y)))));
    const cp = Math.cos(camPitch);
    const camTarget = new THREE.Vector3((head.x / hm) * cp, Math.sin(camPitch), (head.z / hm) * cp);
    this.camDir.lerp(camTarget, 1 - Math.exp(-CAM_TURN * dt));
    if (this.camDir.lengthSq() < 1e-6) this.camDir.copy(camTarget);
    this.camDir.normalize();
    const want = pos.clone().addScaledVector(this.camDir, -CAM_BACK).add(new THREE.Vector3(0, CAM_UP, 0));
    this.camPos.lerp(want, 1 - Math.exp(-CAM_LAG * dt));
    this.lookAt.lerp(pos, 1 - Math.exp(-CAM_LOOK_LAG * dt));
    this.camera.position.copy(this.camPos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.lookAt);

    // Avatar: orient the arrow along the heading, rolled by bank.
    this.avatar.position.copy(pos);
    this.avatar.quaternion.setFromUnitVectors(FORWARD, head);
    this.avatar.rotateZ(flight.bank);

    // Galaxy turns with the same angle used by collision indexing; grid/squares
    // fade around the avatar.
    this.galaxy.rotation.y = galaxyAngle;
    this.gridMat.uniforms.uAvatar!.value.copy(pos);
    this.squareMat.uniforms.uAvatar!.value.copy(pos);
    this.thruster.frame(dt, flight, ARROW_LEN * 0.55);
    const activeCount = this.syncActiveStars(active);

    this.renderer.render(this.scene, this.camera);
    const dataset = this.renderer.domElement.dataset;
    dataset.activeStars = String(activeCount);
    dataset.starHits = String(active.hitCount);
    dataset.thrusterParticles = String(this.thruster.aliveCount);
  }

  private syncActiveStars(active: ActiveStarSnapshot): number {
    const activeCount = syncActiveStarBuffers(
      active,
      this.galaxyField,
      this.baseGalaxyAlphas,
      this.activeBufferState,
    );
    if (this.activeBufferState.baseChanged) this.baseGalaxyAlphaAttr.needsUpdate = true;
    this.activePositionAttr.needsUpdate = true;
    this.activeSizeAttr.needsUpdate = true;
    this.activeAlphaAttr.needsUpdate = true;
    this.activeColorAttr.needsUpdate = true;
    return activeCount;
  }

  /** Avatar's screen position + world coords, for the floating position readout. */
  readout(): { x: number; y: number; pos: Vec3; visible: boolean } {
    const el = this.renderer.domElement;
    const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight;
    const ndc = this.avatar.position.clone().project(this.camera);
    return {
      x: (ndc.x * 0.5 + 0.5) * w,
      y: (-ndc.y * 0.5 + 0.5) * h,
      pos: { x: this.avatar.position.x, y: this.avatar.position.y, z: this.avatar.position.z },
      visible: ndc.z < 1,
    };
  }

  dispose(): void {
    const geoms = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>(), texs = new Set<THREE.Texture>();
    this.scene.traverse((o) => {
      const g = (o as { geometry?: THREE.BufferGeometry }).geometry; if (g) geoms.add(g);
      const m = (o as { material?: THREE.Material | THREE.Material[] }).material;
      for (const mm of Array.isArray(m) ? m : m ? [m] : []) {
        mats.add(mm);
        const map = (mm as THREE.Material & { map?: THREE.Texture }).map; if (map) texs.add(map);
      }
    });
    for (const g of geoms) g.dispose();
    for (const t of texs) t.dispose();
    for (const m of mats) m.dispose();
    this.renderer.dispose();
  }
}
