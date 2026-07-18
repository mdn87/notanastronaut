// src/world/scene.ts
import * as THREE from 'three';
import type { FlightState } from '../core/flight-types';
import type { Vec3 } from '../core/types';
import type { ObstacleSpec } from '../core/field';
import { makeSpiralGalaxy } from '../core/galaxy';
import { makeGridLines } from '../core/grid';
import { makeVolumeBodies } from '../core/parallax';

// galaxy-thruster.svg lives in public/ — reference it by URL, never `import` it.
const THRUSTER_URL = '/artwork/galaxy/galaxy-thruster.svg';
const BG = 0xffffff;
const THRUSTER_ASPECT = 80 / 120;
const ARROW_LEN = 3.6;
// Chase cam: CAM_TURN is how fast the trail eases toward the facing (low = the
// camera barely swings when you look); CAM_LOOK_LAG keeps the avatar centered.
const CAM_BACK = 11, CAM_UP = 3.4, CAM_LAG = 5, CAM_LOOK_LAG = 12, CAM_TURN = 2;
const CAM_PITCH_MAX = 0.5; // cap the trail's elevation (rad ≈ 29°) so a steep climb/dive never swings the camera near vertical (which would flip the lookAt up-vector)
const FORWARD = new THREE.Vector3(0, 0, 1);
const GALAXY_SPIN = 0.015; // rad/s, top-down (about y)
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

export class WorldScene {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly galaxy: THREE.Points;
  private readonly grid: THREE.LineSegments;
  private readonly squares: THREE.Points;
  private readonly avatar: THREE.Object3D;
  private readonly thruster: THREE.Sprite;
  private readonly camDir = new THREE.Vector3(0, 0, 1);
  private readonly gridMat: THREE.ShaderMaterial;
  private readonly squareMat: THREE.ShaderMaterial;
  private readonly camPos = new THREE.Vector3(0, CAM_UP, -CAM_BACK);
  private readonly lookAt = new THREE.Vector3(0, 0, 0);
  private obstacles: THREE.Points | null = null;
  private obstaclePos: Float32Array | null = null;

  constructor(canvas: HTMLCanvasElement, opts: { seed?: number } = {}) {
    const seed = opts.seed ?? 1981;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene.background = new THREE.Color(BG);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 4000);

    // Galaxy (round points, no distance fade).
    const gf = makeSpiralGalaxy(seed, { radius: GALAXY_RADIUS, thickness: 30, count: 30000 });
    const gg = new THREE.BufferGeometry();
    setAttrs(gg, gf.positions, gf.sizes, gf.alphas, gf.colors);
    const galaxyMat = pointsMaterial(false);
    galaxyMat.uniforms.uFade!.value = 0; // galaxy never fades by distance
    this.galaxy = new THREE.Points(gg, galaxyMat);
    this.scene.add(this.galaxy);

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

    const tTex = new THREE.TextureLoader().load(THRUSTER_URL); tTex.colorSpace = THREE.SRGBColorSpace;
    this.thruster = new THREE.Sprite(new THREE.SpriteMaterial({ map: tTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
    this.thruster.renderOrder = 9; this.thruster.visible = false;
    this.scene.add(this.thruster);

    this.resize();
  }

  /** Build the dynamic-obstacle dot cloud. Positions update each frame; size and
   *  color (denser = darker) are fixed from the spec. */
  setObstacles(specs: ObstacleSpec[]): void {
    const n = specs.length;
    if (n === 0) return;
    const pos = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n), color = new Float32Array(n * 3);
    specs.forEach((s, i) => {
      pos[i * 3] = s.pos.x; pos[i * 3 + 1] = s.pos.y; pos[i * 3 + 2] = s.pos.z;
      size[i] = s.radius;
      alpha[i] = 0.9;
      color[i * 3] = s.color.r; color[i * 3 + 1] = s.color.g; color[i * 3 + 2] = s.color.b;
    });
    const geom = new THREE.BufferGeometry();
    setAttrs(geom, pos, size, alpha, color);
    const mat = pointsMaterial(false);
    mat.uniforms.uFade!.value = 0; // obstacles never distance-fade (you must see them to dodge)
    this.obstacles = new THREE.Points(geom, mat);
    this.scene.add(this.obstacles);
    this.obstaclePos = pos;
  }

  resize(): void {
    const w = this.renderer.domElement.clientWidth || innerWidth;
    const h = this.renderer.domElement.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame(dt: number, flight: FlightState, obstaclePositions?: Float32Array): void {
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

    // Rear thruster fires on forward thrust.
    const thrust = flight.throttle;
    if (flight.surge > 0.02 && thrust > 0.02) {
      const flameH = 1.8 * (0.45 + 0.9 * thrust);
      this.thruster.scale.set(flameH * THRUSTER_ASPECT, flameH, 1);
      this.thruster.position.copy(pos).addScaledVector(head, -(ARROW_LEN * 0.55 + flameH * 0.4));
      this.thruster.material.opacity = 0.4 + 0.55 * thrust;
      this.thruster.visible = true;
    } else {
      this.thruster.visible = false;
    }

    // Galaxy turns slowly; grid/squares fade around the avatar.
    this.galaxy.rotation.y += dt * GALAXY_SPIN;
    this.gridMat.uniforms.uAvatar!.value.copy(pos);
    this.squareMat.uniforms.uAvatar!.value.copy(pos);

    // Obstacles move when hit — stream live positions into the cloud.
    if (this.obstacles && this.obstaclePos && obstaclePositions) {
      const n = Math.min(obstaclePositions.length, this.obstaclePos.length);
      this.obstaclePos.set(obstaclePositions.subarray(0, n)); // flat copy, no allocation; capped to the render buffer
      (this.obstacles.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
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
