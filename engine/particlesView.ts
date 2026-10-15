import * as THREE from 'three';
import { MAX_PARTICLES, specOf, type ColorKey, type ParticleSystem } from './particles';

/** Particles live on their own layer so the line-art normal pass can skip them. */
export const PARTICLE_LAYER = 1;

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
uniform bool uOrtho;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uOrtho ? aSize * uScale : aSize * uScale / max(1.0, -mv.z);
  vAlpha = aAlpha;
  vColor = aColor;
}`;
const FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float r = length(gl_PointCoord - 0.5);
  if (r > 0.5) discard;
  gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.15, r));
  #include <colorspace_fragment>
}`;

interface Set_ { points: THREE.Points; pos: Float32Array; col: Float32Array; size: Float32Array; alpha: Float32Array }

/** Draws a ParticleSystem as two pooled THREE.Points (normal + additive). */
export class ParticlesView {
  readonly group = new THREE.Group();
  private sets: [Set_, Set_];
  private uniforms = { uScale: { value: 400 }, uOrtho: { value: false } };
  private cache = new Map<ColorKey, THREE.Color>();

  constructor(private sys: ParticleSystem, private color: (k: ColorKey) => THREE.Color) {
    this.sets = [this.make(false), this.make(true)];
  }

  /** Copy live particles into the GPU buffers; returns the drawn counts. */
  sync(): { normal: number; additive: number } {
    const n = [0, 0];
    const s = this.sys;
    for (let i = 0; i < s.count; i++) {
      const spec = specOf(s.kind[i]);
      const k = spec.additive ? 1 : 0;
      const set = this.sets[k];
      const j = n[k]++;
      set.pos.set([s.p[i * 3], s.p[i * 3 + 1], s.p[i * 3 + 2]], j * 3);
      const key = Array.isArray(spec.color) ? spec.color[s.col[i]] : spec.color;
      const c = this.colorOf(key);
      set.col.set([c.r, c.g, c.b], j * 3);
      const t = s.age[i] / s.life[i];
      set.size[j] = s.size[i] * 2 * (1 + ((spec.grow ?? 1) - 1) * t);
      set.alpha[j] = 1 - t;
    }
    this.sets.forEach((set, k) => {
      const g = set.points.geometry;
      g.setDrawRange(0, n[k]);
      for (const a of ['position', 'aColor', 'aSize', 'aAlpha']) g.getAttribute(a).needsUpdate = true;
    });
    return { normal: n[0], additive: n[1] };
  }

  /** px per world unit at distance 1 (perspective) or per unit (ortho); from CameraRig.pointScale(). */
  setProjection(scale: number, ortho: boolean): void {
    this.uniforms.uScale.value = scale;
    this.uniforms.uOrtho.value = ortho;
  }

  /** Look changed: colours come from the new look. */
  refresh(): void {
    this.cache.clear();
  }

  dispose(): void {
    for (const set of this.sets) {
      set.points.geometry.dispose();
      (set.points.material as THREE.Material).dispose();
    }
    this.group.removeFromParent();
  }

  private colorOf(k: ColorKey): THREE.Color {
    let c = this.cache.get(k);
    if (!c) this.cache.set(k, (c = this.color(k)));
    return c;
  }

  private make(additive: boolean): Set_ {
    const pos = new Float32Array(MAX_PARTICLES * 3);
    const col = new Float32Array(MAX_PARTICLES * 3);
    const size = new Float32Array(MAX_PARTICLES);
    const alpha = new Float32Array(MAX_PARTICLES);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const points = new THREE.Points(g, m);
    points.frustumCulled = false;
    points.layers.set(PARTICLE_LAYER);
    this.group.add(points);
    return { points, pos, col, size, alpha };
  }
}
