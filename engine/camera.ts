import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PARTICLE_LAYER } from './particlesView';
import type { Look, Vec3 } from './types';

export type CameraMode = 'overview' | 'follow' | 'cinematic';

/** What the camera looks at; supplied by the Scene. */
export interface CameraTargets {
  overview(): { min: Vec3; max: Vec3 };
  newest(): Vec3 | null;
  busiest(): Vec3 | null;
  followSpan(): number;
}

export const FOV = 32;
const TAN = Math.tan((FOV * Math.PI) / 360);
const CINEMATIC_MS = 4000;
const CINEMATIC_ZOOM = 2.2;
const USER_HOLD_MS = 4000;
const Z = new THREE.Vector3(0, 0, 1);

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Unit vector from the target toward the camera. The viewer stands at −y so +x reads left→right. */
export function viewDir(look: Look): Vec3 {
  switch (look) {
    case 'flat': return norm([1, -1, 1]); // true isometric: elevation asin(1/√3) = 35.264°
    case 'cutaway': return norm([0, -1, 0.12]);
    default: return norm([0.55, -1, 0.85]);
  }
}

export const isOrthoLook = (look: Look) => look === 'flat' || look === 'cutaway';

/** Target and extent (perspective: distance; ortho: half-height) that frame a world box. */
export function fitView(min: Vec3, max: Vec3, dir: Vec3, aspect: number, ortho: boolean, pad = 1.08): { target: Vec3; extent: number } {
  const c = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  const back = new THREE.Vector3(...dir);
  const f = back.clone().negate();
  const right = f.clone().cross(Z).normalize();
  const up = right.clone().cross(f).normalize();
  let need = 0;
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
    const v = new THREE.Vector3(x, y, z).sub(c);
    const px = Math.abs(v.dot(right));
    const py = Math.abs(v.dot(up));
    const toward = v.dot(back);
    need = ortho ? Math.max(need, py, px / aspect) : Math.max(need, toward + py / TAN, toward + px / (TAN * aspect));
  }
  return { target: [c.x, c.y, c.z], extent: need * pad };
}

/** One camera rig: perspective (realistic/lineart) or orthographic (flat/cutaway); damps toward its mode's goal. */
export class CameraRig {
  mode: CameraMode = 'overview';
  readonly persp = new THREE.PerspectiveCamera(FOV, 1, 1, 30000);
  readonly ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -20000, 20000);
  private look: Look = 'realistic';
  private aspect = 1;
  private hPx = 1;
  private target = new THREE.Vector3();
  private dir = new THREE.Vector3(...viewDir('realistic'));
  private extent = 800;
  private controls: OrbitControls | null = null;
  private dragging = false;
  private userUntil = -Infinity;
  private cineAt = -Infinity;
  private cineTarget: Vec3 | null = null;

  constructor(private targets: CameraTargets) {
    for (const c of [this.persp, this.ortho]) {
      c.up.set(0, 0, 1);
      c.layers.enable(PARTICLE_LAYER);
    }
  }

  active(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    return this.isOrtho() ? this.ortho : this.persp;
  }

  isOrtho(): boolean { return isOrthoLook(this.look); }

  setLook(look: Look): void {
    const wasOrtho = this.isOrtho();
    this.look = look;
    if (wasOrtho !== this.isOrtho()) this.extent = this.isOrtho() ? this.extent * TAN : this.extent / TAN;
    if (this.controls) this.controls.object = this.active();
    this.apply();
  }

  resize(w: number, h: number, pixelRatio: number): void {
    this.aspect = Math.max(1e-3, w / Math.max(1, h));
    this.hPx = h * pixelRatio;
    this.apply();
  }

  /** Orbit/zoom by pointer; the rig yields for USER_HOLD_MS after the last interaction. */
  attach(dom: HTMLElement): void {
    const c = new OrbitControls(this.active(), dom);
    c.enableDamping = false;
    c.addEventListener('start', () => { this.dragging = true; });
    c.addEventListener('end', () => { this.dragging = false; this.userUntil = performance.now() + USER_HOLD_MS; });
    this.controls = c;
  }

  /** Jump to the current goal (first frame, factory switch). */
  snap(): void {
    const g = this.goal(performance.now());
    this.target.set(...g.target);
    this.dir.set(...g.dir);
    this.extent = g.extent;
    this.apply();
  }

  /** Returns true (the camera always participates in the frame). */
  update(realDt: number, now: number): boolean {
    if (this.controls && (this.dragging || now < this.userUntil)) {
      this.controls.target.copy(this.target);
      this.controls.update();
      this.readBack();
      return true;
    }
    const g = this.goal(now);
    const a = 1 - Math.exp(-realDt * 3);
    this.target.lerp(new THREE.Vector3(...g.target), a);
    this.dir.lerp(new THREE.Vector3(...g.dir), a).normalize();
    this.extent += (g.extent - this.extent) * a;
    this.apply();
    return true;
  }

  /** Audio listener: world x at screen centre and half the visible width. */
  center(): { x: number; halfWidth: number } {
    const halfH = this.isOrtho() ? this.extent : this.extent * TAN;
    return { x: this.target.x, halfWidth: halfH * this.aspect };
  }

  /** Point-size scale for ParticlesView.setProjection. */
  pointScale(): number {
    return this.isOrtho() ? this.hPx / (2 * this.extent) : this.hPx / (2 * TAN);
  }

  dispose(): void {
    this.controls?.dispose();
  }

  private goal(now: number): { target: Vec3; dir: Vec3; extent: number } {
    const ortho = this.isOrtho();
    const base = viewDir(this.look);
    const ov = this.targets.overview();
    const fit = fitView(ov.min, ov.max, base, this.aspect, ortho);
    if (this.mode === 'follow') {
      const p = this.targets.newest();
      if (!p) return { ...fit, dir: base };
      const s = this.targets.followSpan() / 2;
      const f = fitView([p[0] - s, p[1] - s / 2, p[2]], [p[0] + s, p[1] + s / 2, p[2] + s / 1.5], base, this.aspect, ortho);
      return { target: f.target, dir: base, extent: f.extent };
    }
    if (this.mode === 'cinematic') {
      if (now - this.cineAt > CINEMATIC_MS) {
        this.cineAt = now;
        this.cineTarget = this.targets.busiest() ?? this.targets.newest();
      }
      const yaw = 0.18 * Math.sin(now / 6000);
      const d = new THREE.Vector3(...base).applyAxisAngle(Z, yaw);
      return { target: this.cineTarget ?? fit.target, dir: [d.x, d.y, d.z], extent: fit.extent / CINEMATIC_ZOOM };
    }
    return { ...fit, dir: base };
  }

  private readBack(): void {
    const cam = this.active();
    this.target.copy(this.controls!.target);
    this.dir.copy(cam.position).sub(this.target).normalize();
    if (this.isOrtho()) {
      this.extent = this.extent / this.ortho.zoom;
      this.ortho.zoom = 1;
    } else {
      this.extent = cam.position.distanceTo(this.target);
    }
    this.apply();
  }

  private apply(): void {
    if (this.isOrtho()) {
      const h = this.extent;
      Object.assign(this.ortho, { left: -h * this.aspect, right: h * this.aspect, top: h, bottom: -h });
      this.ortho.position.copy(this.target).addScaledVector(this.dir, 5000);
      this.ortho.lookAt(this.target);
      this.ortho.updateProjectionMatrix();
    } else {
      this.persp.aspect = this.aspect;
      this.persp.position.copy(this.target).addScaledVector(this.dir, this.extent);
      this.persp.lookAt(this.target);
      this.persp.updateProjectionMatrix();
    }
  }
}
