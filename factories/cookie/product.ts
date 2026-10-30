import * as THREE from 'three';
import { letterGeometry } from '../../engine/letterSolid';
import type { ProductCtx, ProductHandle, ProductModel } from '../../engine/product';
import type { Job } from '../../engine/types';
import { COOKIE_STAGES, cookieVisual } from './visual';

export { COOKIE_STAGES };
export const BED_R = 17;   // baking disc under the cookie
export const BED_T = 2;
export const CUP_H = 5.8;
export const CUP_LIFT = 0.6;
export const COOKIE_H = 12; // tallest the cookie gets on the line (dough column)
const SEG = 32;

const DOUGH = new THREE.Color(0xe4c58a);
const GOLD = new THREE.Color(0xb8803a);
const CHOC = new THREE.Color(0x3a2214);
const ICING = new THREE.Color(0xf6f1e6);
const BLACK = new THREE.Color(0x000000);
const GLOWC = new THREE.Color(0xff6a1a);
const LAYER_COLORS = [0xf3eee2, 0xa87a4a, 0xf2d36b, 0xe9a93a].map((c) => new THREE.Color(c));
const SPRINKLE_COLORS = [0xe8508a, 0x4a8fe0, 0xf5c542].map((c) => new THREE.Color(c));
const tmp = new THREE.Color();
const tmpE = new THREE.Color();
const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/** Unit dough profile (r, z): a rounded puck, scaled by (r, r, h). */
const DOUGH_PROFILE: [number, number][] = [[0, 0], [0.82, 0], [0.97, 0.12], [1, 0.4], [0.93, 0.75], [0.65, 0.96], [0.3, 1], [0, 1]];
/** Unit surface height of the dough at unit radius u (flat top inside 0.3, rounding to the rim). */
export function topZ(u: number): number {
  const top = [[0.3, 1], [0.65, 0.96], [0.93, 0.75], [1, 0.4]];
  if (u <= top[0][0]) return 1;
  for (let i = 1; i < top.length; i++) {
    if (u <= top[i][0]) return top[i - 1][1] + ((top[i][1] - top[i - 1][1]) * (u - top[i - 1][0])) / (top[i][0] - top[i - 1][0]);
  }
  return top[3][1];
}

export const CHIP_N = 10;
const CHIP_U = [0.15, 0.4, 0.6, 0.75, 0.3, 0.55, 0.8, 0.2, 0.65, 0.45];
const SPRINKLE_N = 14;
/** Chip i resting spot on the dough (cookie-local, z above the tray top). */
export function chipSpot(i: number, r: number, h: number): [number, number, number] {
  const a = i * 2.4;
  const u = CHIP_U[i % CHIP_N];
  return [u * r * Math.cos(a), u * r * Math.sin(a), topZ(u) * h - 0.3];
}
const sprinkleSpot = (i: number, r: number, h: number): [number, number, number] => {
  const a = i * 1.7 + 0.5;
  const u = 0.72 + 0.22 * ((i * 5) % 7) / 6;
  return [u * r * Math.cos(a), u * r * Math.sin(a), topZ(u) * h + 0.2];
};

const lathe = (p: [number, number][]) => new THREE.LatheGeometry(p.map(([r, z]) => new THREE.Vector2(r, z)), SEG).rotateX(Math.PI / 2);

let shared: Record<'bed' | 'bowl' | 'layer' | 'dough' | 'chip' | 'sprinkle' | 'cup', THREE.BufferGeometry> | null = null;
/** Geometries shared by every cookie handle (never disposed). */
function geoms() {
  if (shared) return shared;
  const cyl = (r: number, h: number) => new THREE.CylinderGeometry(r, r, h, 24).rotateX(Math.PI / 2).translate(0, 0, h / 2);
  shared = {
    bed: new THREE.CylinderGeometry(BED_R, BED_R + 0.5, BED_T, 40).rotateX(Math.PI / 2).translate(0, 0, BED_T / 2),
    bowl: lathe([[0, 0], [10, 0], [11.5, 16], [10.7, 16], [9.6, 1.8], [0, 1.8]]),
    layer: cyl(9.4, 1),
    dough: lathe(DOUGH_PROFILE),
    chip: new THREE.IcosahedronGeometry(1.35, 0).scale(1, 1, 0.7),
    sprinkle: new THREE.CapsuleGeometry(0.28, 1.1, 2, 6).rotateY(Math.PI / 2),
    cup: lathe([[0, 0], [13, 0], [15.5, CUP_H], [15, CUP_H + 0.3], [12.6, CUP_LIFT], [0, CUP_LIFT]]),
  };
  return shared;
}

/** Glyph solid lying flat (reads left→right from the front, top toward +y), centred on the origin. Caller owns the clone. */
function icingGlyph(ch: string): THREE.BufferGeometry {
  const g = letterGeometry(ch, { height: 8, radius: 0.55 }).clone();
  const bb = g.boundingBox ?? (g.computeBoundingBox(), g.boundingBox!);
  g.translate(-(bb.min.x + bb.max.x) / 2, 0, -(bb.min.z + bb.max.z) / 2);
  g.rotateX(-Math.PI / 2);
  return g;
}

interface Content {
  bowl: THREE.Mesh;
  stack: THREE.Group;
  layers: THREE.Mesh[];
  dough: THREE.Mesh;
  chips: THREE.Mesh[];
  sprinkles: THREE.Mesh[];
  icing: THREE.Mesh;
  icingCount: number;
  cup: THREE.Mesh;
  doughMat: THREE.Material;
  chipMat: THREE.Material;
  icingMat: THREE.Material;
  sprinkleMats: THREE.Material[];
  layerMats: THREE.Material[];
  own: THREE.BufferGeometry[];
}

class CookieHandle implements ProductHandle {
  readonly root = new THREE.Group();
  private readonly bed = new THREE.Group();
  private readonly content = new THREE.Group();
  private readonly cookie = new THREE.Group(); // dough + toppings, lifted into the cup
  private readonly c: Content | null;
  private stage: string = COOKIE_STAGES[0];
  private t = 0;
  private placed = 0;

  constructor(job: Job, private readonly ctx: ProductCtx) {
    const { looks } = ctx;
    const g = geoms();
    this.bed.name = 'bed';
    this.bed.add(looks.part(g.bed, 'steel'));
    this.content.position.z = BED_T;
    this.root.add(this.bed, this.content);
    if (job.isSpace) { this.c = null; return; }
    this.content.name = 'cookie';

    const doughMat = looks.own('product');
    const chipMat = looks.own('product');
    const icingMat = looks.own('product');
    const sprinkleMats = SPRINKLE_COLORS.map(() => looks.own('product'));
    const layerMats = LAYER_COLORS.map(() => looks.own('sand'));
    const own: THREE.BufferGeometry[] = [];

    const dough = new THREE.Mesh(g.dough, doughMat);
    dough.name = 'dough';
    dough.castShadow = dough.receiveShadow = true;
    const chips = Array.from({ length: CHIP_N }, () => { const m = new THREE.Mesh(g.chip, chipMat); m.castShadow = true; return m; });
    const sprinkles = Array.from({ length: SPRINKLE_N }, (_, i) => new THREE.Mesh(g.sprinkle, sprinkleMats[i % sprinkleMats.length]));
    const geom = icingGlyph(job.char);
    own.push(geom);
    const icing = new THREE.Mesh(geom, icingMat);
    icing.name = 'icing';
    icing.castShadow = true;
    icing.frustumCulled = false;
    this.cookie.add(dough, ...chips, ...sprinkles, icing);

    const bowl = looks.part(g.bowl, 'paint-accent');
    const stack = new THREE.Group();
    stack.position.z = 1.8;
    const layers = layerMats.map((m, i) => { const l = new THREE.Mesh(g.layer, m); l.name = `layer${i}`; stack.add(l); return l; });
    bowl.add(stack);
    const cup = looks.part(g.cup, 'sand');
    cup.name = 'cup';
    this.content.add(bowl, this.cookie, cup);
    this.c = { bowl, stack, layers, dough, chips, sprinkles, icing, icingCount: geom.index ? geom.index.count : geom.getAttribute('position').count, cup, doughMat, chipMat, icingMat, sprinkleMats, layerMats, own };
    this.shape(COOKIE_STAGES[0], 0);
  }

  shape(stage: string, t: number): void {
    this.stage = stage;
    this.t = t;
    const c = this.c;
    if (!c) return;
    const v = cookieVisual(stage, t);
    const { looks } = this.ctx;

    c.bowl.visible = v.bowl > 0.01;
    c.bowl.scale.setScalar(Math.max(1e-3, v.bowl));
    c.layers.forEach((l, i) => {
      const f = Math.min(1, Math.max(0, v.layers * 4 - i));
      l.visible = f > 0.02;
      l.position.z = i * 3;
      l.scale.z = Math.max(1e-3, 3 * f);
    });
    c.layerMats.forEach((m, i) => looks.appearance(m, { color: tmp.copy(LAYER_COLORS[i]).lerp(DOUGH, v.mix), emissive: BLACK, emissiveIntensity: 0, metalness: 0, roughness: 0.95 }));

    c.dough.visible = v.h > 0.05;
    c.dough.scale.set(v.r, v.r, Math.max(1e-3, v.h));
    looks.appearance(c.doughMat, {
      color: tmp.copy(DOUGH).lerp(GOLD, v.bake), emissive: tmpE.copy(GLOWC), emissiveIntensity: 1.2 * v.heat, metalness: 0, roughness: 0.92,
    });
    looks.appearance(c.chipMat, { color: CHOC, emissive: BLACK, emissiveIntensity: 0, metalness: 0, roughness: 0.35 });
    looks.appearance(c.icingMat, { color: ICING, emissive: BLACK, emissiveIntensity: 0, metalness: 0, roughness: 0.45 });
    c.sprinkleMats.forEach((m, i) => looks.appearance(m, { color: SPRINKLE_COLORS[i], emissive: BLACK, emissiveIntensity: 0, metalness: 0, roughness: 0.4 }));

    c.chips.forEach((m, i) => {
      const f = Math.min(1, Math.max(0, v.chips * CHIP_N - i));
      const [x, y, z] = chipSpot(i, v.r, v.h);
      m.visible = f > 0.01 && v.h > 0.05;
      m.position.set(x, y, z + (1 - smooth(f)) * 12);
      m.rotation.z = i;
    });
    c.sprinkles.forEach((m, i) => {
      const f = Math.min(1, Math.max(0, v.sprinkles * SPRINKLE_N - i));
      const [x, y, z] = sprinkleSpot(i, v.r, v.h);
      m.visible = f > 0.01;
      m.position.set(x, y, z + (1 - smooth(f)) * 8);
      m.rotation.z = i * 1.9;
    });
    c.icing.position.z = v.h - 0.15;
    c.icing.visible = v.icing > 0.01;
    c.icing.geometry.setDrawRange(0, Math.ceil((c.icingCount * v.icing) / 3) * 3);

    const lift = CUP_LIFT * smooth(v.cup);
    this.cookie.position.z = lift;
    c.cup.visible = v.cup > 0.01;
    c.cup.scale.z = Math.max(1e-3, smooth(v.cup));
  }

  place(t: number): void {
    this.placed = t;
    this.bed.visible = t <= 0.02;
    this.content.position.z = BED_T * (1 - smooth(t));
  }

  restyle(): void {
    const c = this.c;
    if (!c) return;
    const { looks } = this.ctx;
    for (const m of [c.doughMat, c.chipMat, c.icingMat, ...c.sprinkleMats, ...c.layerMats]) m.dispose();
    c.doughMat = looks.own('product');
    c.chipMat = looks.own('product');
    c.icingMat = looks.own('product');
    c.sprinkleMats = c.sprinkleMats.map(() => looks.own('product'));
    c.layerMats = c.layerMats.map(() => looks.own('sand'));
    c.dough.material = c.doughMat;
    c.icing.material = c.icingMat;
    c.chips.forEach((m) => { m.material = c.chipMat; });
    c.sprinkles.forEach((m, i) => { m.material = c.sprinkleMats[i % c.sprinkleMats.length]; });
    c.layers.forEach((l, i) => { l.material = c.layerMats[i]; });
    this.shape(this.stage, this.t);
    if (this.placed > 0) this.place(this.placed);
  }

  dispose(): void {
    const c = this.c;
    if (c) {
      for (const m of [c.doughMat, c.chipMat, c.icingMat, ...c.sprinkleMats, ...c.layerMats]) m.dispose();
      for (const g of c.own) g.dispose();
    }
    this.root.removeFromParent();
  }
}

export const cookieProduct: ProductModel = {
  kind: 'cookie',
  stages: COOKIE_STAGES,
  size: [2 * BED_R, 2 * BED_R, CUP_H + 2],
  lineSize: 2 * BED_R + 2,
  shatter: {
    burst: [{ kind: 'crumb', count: 40 }, { kind: 'powder', count: 12 }],
    sounds: ['crunch'],
    fragments: { role: 'product', count: 10, size: 3 },
  },
  create: (job: Job, ctx: ProductCtx) => new CookieHandle(job, ctx),
};
