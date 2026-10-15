/**
 * Typed wrapper around the vendored Hairline kernel (public/hairline/kernel.js).
 * The kernel is a classic script defining a global `HL`; app code reaches it only through `hl()`.
 * Never touch `window` at module top level: this file is safe to import anywhere.
 */

/** Camera: azimuth in radians (Cam() converts from degrees), k = sin(elevation), S = scale, ox/oy = screen offset. */
export interface Cam {
  az: number;
  k: number;
  S: number;
  ox: number;
  oy: number;
}

/** One sample of a rounded ring: footprint position (u, v) and outward normal (nu, nv). */
export interface RingSample {
  u: number;
  v: number;
  nu: number;
  nv: number;
}
export type Ring = RingSample[];

export type Pt2 = [number, number];
export type Pt3 = [number, number, number];
/** Projects a world point (x, y on ground, z up) to a screen point. */
export type Projector = (x: number, y: number, z: number) => Pt2;
/** Whether a ring sample faces the camera. */
export type FrontFn = (q: RingSample) => boolean;

export interface PrismPaths {
  sil: string;
  crease: string;
}
export interface GhostPath {
  d: string;
  y0: number;
  y1: number;
}

export interface SpringOpts {
  k?: number;
  c?: number;
  m?: number;
  eps?: number;
}
/** A spring: write `.t` to retarget; `x` is the current value, `v` its velocity. */
export interface Spring {
  x: number;
  v: number;
  t: number;
  k: number;
  c: number;
  m: number;
  eps: number;
}
/** A discrete-clock tween (default 700 ms). */
export interface Tween {
  from: number;
  to: number;
  t0: number;
  dur: number;
}

export interface SolidEl {
  g: SVGGElement;
  sil: SVGPathElement;
  cr: SVGPathElement;
}

export interface LoopHandle {
  wake(): void;
  unregister(): void;
}
/** Called once a frame with dt in seconds and now in ms; return true to ask for another frame. */
export type Tick = (dt: number, now: number) => boolean | void;

export interface PointerHandlers {
  move(pt: Pt2, e?: PointerEvent): void;
  down?(pt: Pt2, e?: PointerEvent): void;
  leave(e?: PointerEvent): void;
}

export interface Disposer {
  add(fn: () => void): void;
  on(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions | boolean): void;
  dispose(): void;
}

export type TourStop = Pt2 | null;
export interface Tour {
  stop(): void;
}

export interface HLKernel {
  // Camera
  Cam(azDeg: number, k: number, S: number): Cam;
  fit(C: Cam, points: Pt3[], cx: number, cy: number): void;
  proj(C: Cam): Projector;
  unproj(C: Cam, sx: number, sy: number, z: number): Pt2;
  facing(C: Cam): FrontFn;

  // Rounded solids
  rrect(u0: number, v0: number, u1: number, v1: number, r: number, n?: number): Ring;
  circ(R: number, n?: number): Ring;
  rings(x0: number, y0: number, x1: number, y1: number, r: number, b: number): [Ring, Ring];
  prism(P: Projector, front: FrontFn, ring: Ring, inner: Ring | null | undefined, z0: number, z1: number): PrismPaths;
  ringAt(P: Projector, ring: Ring, z: number): Pt2[];
  run(ring: Ring, keep: (q: RingSample) => boolean): Ring;
  hull(points: Pt2[]): Pt2[];
  extremes(P: Projector, ring: Ring): [RingSample, RingSample, RingSample];
  fillet(points: Pt2[], radii: number[], n?: number): Pt2[];
  ghost(P: Projector, front: FrontFn, ring: Ring, z0: number, depth: number): GhostPath;

  // Paths and numbers
  poly(points: Pt2[]): string;
  open(points: Pt2[]): string;
  seg(a: Pt2, b: Pt2): string;
  clamp(v: number, a: number, b: number): number;
  lerp(a: number, b: number, t: number): number;
  rad(deg: number): number;
  r2(n: number): number;

  // Continuous clock
  spring(x: number, opts?: SpringOpts): Spring;
  stepS(sp: Spring, dt: number): boolean;

  // Discrete clock
  tween(v: number, dur?: number): Tween;
  /** `delay` (ms) is required: the kernel computes `now + delay`, so omitting it yields NaN. Pass 0 for none. */
  tset(tw: Tween, to: number, now: number, delay: number): void;
  tval(tw: Tween, now: number): number;
  tdone(tw: Tween, now: number): boolean;
  bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number;
  EASE_LIFT: (t: number) => number;
  reducedMotion(): boolean;
  setReducedMotion(on: boolean): void;

  // Drawing
  mk<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs?: Record<string, string | number>,
    parent?: Element | null,
  ): SVGElementTagNameMap[K];
  solid(parent: Element): SolidEl;
  put(el: SolidEl, paths: PrismPaths): void;
  flatDot(parent: Element, C: Cam, r: number, cls: 'dot' | 'dot m' | 'dot off'): SVGEllipseElement;
  place(el: Element, point: Pt2): void;
  reflect(svg: SVGSVGElement, parent: Element, P: Projector, front: FrontFn, ring: Ring, z0: number, depth: number): void;
  fade(svg: SVGSVGElement, y0: number, y1: number, a0?: number): string;

  // Life
  register(stage: Element, tick: Tick): LoopHandle;
  pointer(stage: Element, handlers: PointerHandlers): () => void;
  disposer(): Disposer;

  // The bench's business (css / inject / tour / LAP)
  css(lightDark: boolean): string;
  inject(root: Document | ShadowRoot): void;
  tour(stage: Element, stops: TourStop[], onStop?: (i: number) => void): Tour;
  LAP: TourStop[];
}

declare global {
  interface Window {
    HL?: HLKernel;
  }
}

/** The kernel global. Throws a clear error if the script has not loaded (or on the server). */
export function hl(): HLKernel {
  const k = typeof window === 'undefined' ? undefined : window.HL;
  if (!k) {
    throw new Error(
      'Hairline kernel (window.HL) is not available. It is loaded by /hairline/kernel.js ' +
        'in app/layout.tsx and only exists in the browser.',
    );
  }
  return k;
}
