import * as THREE from 'three';
import type { FlightState } from '../core/flight-types';
import { ThrusterParticles, type ThrusterInput } from '../core/thruster-particles';

function material(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    vertexShader: `
      attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
      varying float vAlpha; varying vec3 vColor;
      void main() {
        vAlpha = aAlpha;
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(aSize * (120.0 / max(-mv.z, 1.0)), 18.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vAlpha; varying vec3 vColor;
      void main() {
        float r = length(gl_PointCoord - vec2(0.5));
        float mask = 1.0 - smoothstep(0.12, 0.5, r);
        if (mask <= 0.0) discard;
        gl_FragColor = vec4(vColor, vAlpha * mask);
      }`,
  });
}

export class ThrusterView {
  readonly points: THREE.Points;
  private readonly sim: ThrusterParticles;
  private readonly tail = new THREE.Vector3();
  private readonly heading = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly input: ThrusterInput = {
    tail: this.tail,
    heading: this.heading,
    velocity: this.velocity,
    enginePower: 0,
  };
  private readonly positionAttr: THREE.BufferAttribute;
  private readonly sizeAttr: THREE.BufferAttribute;
  private readonly alphaAttr: THREE.BufferAttribute;
  private readonly colorAttr: THREE.BufferAttribute;

  constructor(seed = 1981) {
    this.sim = new ThrusterParticles(128, seed);
    const geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(this.sim.positions, 3);
    this.sizeAttr = new THREE.BufferAttribute(this.sim.sizes, 1);
    this.alphaAttr = new THREE.BufferAttribute(this.sim.alphas, 1);
    this.colorAttr = new THREE.BufferAttribute(this.sim.colors, 3);
    geometry.setAttribute('position', this.positionAttr);
    geometry.setAttribute('aSize', this.sizeAttr);
    geometry.setAttribute('aAlpha', this.alphaAttr);
    geometry.setAttribute('aColor', this.colorAttr);
    this.points = new THREE.Points(geometry, material());
    this.points.frustumCulled = false;
    this.points.renderOrder = 9;
  }

  get aliveCount(): number {
    return this.sim.aliveCount;
  }

  frame(dt: number, flight: FlightState, tailDistance: number): void {
    this.heading.set(flight.heading.x, flight.heading.y, flight.heading.z);
    this.tail.set(flight.position.x, flight.position.y, flight.position.z)
      .addScaledVector(this.heading, -tailDistance);
    this.velocity.set(flight.velocity.x, flight.velocity.y, flight.velocity.z);
    this.input.enginePower = flight.enginePower;
    this.sim.step(dt, this.input);
    this.positionAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    const material = this.points.material;
    if (Array.isArray(material)) {
      for (let i = 0; i < material.length; i++) material[i]!.dispose();
    } else {
      material.dispose();
    }
  }
}
