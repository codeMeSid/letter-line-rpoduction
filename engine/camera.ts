import { hl, type Cam, type Projector, type Spring, type Tween } from '../lib/hl';
import type { Vec3 } from './types';

export interface Box { x: number; y: number; w: number; h: number }
export type CameraMode = 'overview' | 'follow' | 'cinematic';

/** What the camera looks at; supplied by the Scene each frame. */
export interface CameraTargets {
  /** world bounds of the active factory + its shelf */
  overview(): { min: Vec3; max: Vec3 };
  /** newest in-flight job position on the active line, or null */
  newest(): Vec3 | null;
  /** busiest station anchor on the active line, or null */
  busiest(): Vec3 | null;
  /** world extent that ~3 stations span (follow zoom) */
  followSpan(): number;
}

/** Projected 2D bounds of a 3D box, padded, grown to the viewport `aspect` (w/h) around its centre. Pure. */
export function fitBox(P: Projector, min: Vec3, max: Vec3, pad: number, aspect: number): Box {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
    const [sx, sy] = P(x, y, z);
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  let w = x1 - x0 + pad * 2;
  let h = y1 - y0 + pad * 2;
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
}

const CINEMATIC_MS = 4000;
const CINEMATIC_ZOOM = 2.2;

/**
 * Pans/zooms the world by animating the root svg viewBox (never re-projecting).
 * Four springs drive {x,y,w,h}; `panTo` overrides them with tweens for factory switches.
 */
export class Camera {
  mode: CameraMode = 'overview';
  private sp: Spring[];
  private tw: Tween[] | null = null;
  private vw = 1;
  private vh = 1;
  private lastVB = '';
  private cineAt = -Infinity;
  private cineTarget: Vec3 | null = null;

  constructor(private svg: SVGSVGElement, private C: Cam, private P: Projector, private targets: CameraTargets) {
    const HL = hl();
    this.sp = [0, 0, 400, 320].map((v) => HL.spring(v, { k: 30, c: 11 }));
    this.resize(svg.clientWidth || 1, svg.clientHeight || 1);
  }

  resize(w: number, h: number): void {
    this.vw = Math.max(1, w);
    this.vh = Math.max(1, h);
  }

  aspect(): number {
    return this.vw / this.vh;
  }

  fitBox(min: Vec3, max: Vec3, pad = 40): Box {
    return fitBox(this.P, min, max, pad, this.aspect());
  }

  /** Jump without animation (first frame). */
  snap(b: Box): void {
    [b.x, b.y, b.w, b.h].forEach((v, i) => { this.sp[i].x = this.sp[i].t = v; this.sp[i].v = 0; });
    this.tw = null;
    this.apply();
  }

  /** Tweened move (factory switch); springs resume from where the tween lands. */
  panTo(b: Box, ms = 1200): void {
    const HL = hl();
    const now = performance.now();
    this.tw = [b.x, b.y, b.w, b.h].map((v, i) => {
      const t = HL.tween(this.sp[i].x, ms);
      HL.tset(t, v, now, 0);
      return t;
    });
  }

  box(): Box {
    const [x, y, w, h] = this.sp.map((s) => s.x);
    return { x, y, w, h };
  }

  /** svg-unit centre of the view, unprojected to world on the ground plane (for audio panning). */
  center(): { x: number; halfWidth: number } {
    const b = this.box();
    const [wx] = hl().unproj(this.C, b.x + b.w / 2, b.y + b.h / 2, 0);
    return { x: wx, halfWidth: b.w / 2 / Math.cos(this.C.az) };
  }

  /** CSS px per svg unit (`preserveAspectRatio` meet). */
  screenScale(): number {
    const b = this.box();
    return Math.min(this.vw / b.w, this.vh / b.h);
  }

  worldToScreen(v: Vec3): [number, number] {
    const b = this.box();
    const s = this.screenScale();
    const [sx, sy] = this.P(v[0], v[1], v[2]);
    return [(sx - b.x) * s + (this.vw - b.w * s) / 2, (sy - b.y) * s + (this.vh - b.h * s) / 2];
  }

  update(dt: number, now: number): boolean {
    const HL = hl();
    if (this.tw) {
      const tw = this.tw;
      tw.forEach((t, i) => { this.sp[i].x = this.sp[i].t = HL.tval(t, now); this.sp[i].v = 0; });
      if (tw.every((t) => HL.tdone(t, now))) this.tw = null;
      this.apply();
      return true;
    }
    const target = this.target(now);
    let moving = false;
    [target.x, target.y, target.w, target.h].forEach((v, i) => {
      this.sp[i].t = v;
      if (HL.stepS(this.sp[i], dt)) moving = true;
    });
    this.apply();
    return moving;
  }

  private target(now: number): Box {
    const ov = this.targets.overview();
    const overview = this.fitBox(ov.min, ov.max);
    if (this.mode === 'follow') {
      const p = this.targets.newest();
      if (!p) return overview;
      const r = this.targets.followSpan() / 2;
      return this.fitBox([p[0] - r, p[1] - r, p[2]], [p[0] + r, p[1] + r, p[2] + 60], 20);
    }
    if (this.mode === 'cinematic') {
      if (now - this.cineAt >= CINEMATIC_MS) {
        this.cineAt = now;
        this.cineTarget = this.targets.busiest();
      }
      if (!this.cineTarget) return overview;
      const [cx, cy] = this.P(...this.cineTarget);
      const w = overview.w / CINEMATIC_ZOOM;
      const h = overview.h / CINEMATIC_ZOOM;
      const drift = Math.sin(now / 2500) * w * 0.05; // slow sideways drift
      return { x: cx - w / 2 + drift, y: cy - h / 2, w, h };
    }
    return overview;
  }

  private apply(): void {
    const b = this.box();
    const r = (n: number) => Math.round(n * 100) / 100;
    const vb = `${r(b.x)} ${r(b.y)} ${r(b.w)} ${r(b.h)}`;
    if (vb !== this.lastVB) {
      this.svg.setAttribute('viewBox', vb);
      this.lastVB = vb;
    }
  }
}
