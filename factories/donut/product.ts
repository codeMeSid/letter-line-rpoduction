import * as THREE from 'three';
import { letterGeometry } from '../../engine/letterSolid';
import type { ProductCtx, ProductHandle, ProductModel } from '../../engine/product';
import type { Job } from '../../engine/types';
import { DONUT_STAGES, donutVisual } from './visual';

export { DONUT_STAGES };
export const DON_R = 12;          // ring radius (centre of the tube)
export const DON_r = 7;           // tube radius
export const TRAY_R = 22;
export const TRAY_T = 2;
export const DON_Z = TRAY_T + DON_r;      // ring centre above the tray bottom
export const DON_TOP = DON_Z + DON_r + 1; // glaze top while lying on the tray
const GLAZE_R = DON_r + 0.6;
const RADIAL = 14;
const TUBULAR = 48;
const BOWL_Z = TRAY_T;
const SPRINKLES = 36;

const DOUGH = new THREE.Color(0xe2c58f);
const FLOUR = new THREE.Color(0xf3efe2);
const GOLD = new THREE.Color(0xb9772c);
const PINK = new THREE.Color(0xe98fb0);
const BLACK = new THREE.Color(0x000000);
const SPRINKLE_COLORS = [0xffd23f, 0x4aa8e0, 0xf5f5f5].map((c) => new THREE.Color(c));
const tmp = new THREE.Color();

const lathe = (p: [number, number][], seg = 40) => new THREE.LatheGeometry(p.map(([r, z]) => new THREE.Vector2(r, z)), seg).rotateX(Math.PI / 2);

let shared: { bowl: THREE.BufferGeometry; fill: THREE.BufferGeometry; tray: THREE.BufferGeometry; ring: THREE.BufferGeometry; glaze: THREE.BufferGeometry; sprinkle: THREE.BufferGeometry } | null = null;
/** Geometries shared by every handle (never disposed); ring/glaze are cloned per handle (their draw range differs). */
function geoms() {
  if (shared) return shared;
  shared = {
    bowl: lathe([[0, 0], [10, 0], [15.5, 5], [17, 14], [16, 14], [14.4, 6], [0, 3]]),
    fill: lathe([[0, 0], [14, 0], [14, 1.5], [12, 6], [7, 9], [0, 10]]),
    tray: new THREE.CylinderGeometry(TRAY_R, TRAY_R - 1, TRAY_T, 40).rotateX(Math.PI / 2).translate(0, 0, TRAY_T / 2),
    ring: new THREE.TorusGeometry(DON_R, DON_r, RADIAL, TUBULAR),
    glaze: new THREE.TorusGeometry(DON_R, GLAZE_R, RADIAL, TUBULAR).scale(1, 1, 0.8).translate(0, 0, 1.1),
    sprinkle: new THREE.CapsuleGeometry(0.4, 1.6, 2, 6),
  };
  return shared;
}

/** Piped glyph lying flat (reads from above, top toward +y), centred on (0, 0). Caller owns the clone. */
function glyphFlat(ch: string): THREE.BufferGeometry {
  const g = letterGeometry(ch, { height: 15, radius: 0.9 }).clone();
  const bb = g.boundingBox ?? (g.computeBoundingBox(), g.boundingBox!);
  g.translate(-(bb.min.x + bb.max.x) / 2, 0, -(bb.min.z + bb.max.z) / 2);
  g.rotateX(-Math.PI / 2);
  g.computeBoundingBox();
  return g;
}

interface Content {
  bowl: THREE.Mesh; fill: THREE.Mesh; ring: THREE.Mesh; glaze: THREE.Mesh; icing: THREE.Mesh;
  sprinkles: THREE.Mesh[];
  doughMat: THREE.Material; ringMat: THREE.Material; glazeMat: THREE.Material; sprMats: THREE.Material[];
  own: THREE.BufferGeometry[];
}

class DonutHandle implements ProductHandle {
  readonly root = new THREE.Group();
  private readonly bed = new THREE.Group();
  private readonly mover = new THREE.Group();   // donut centre; stands the ring up on the shelf
  private readonly lying = new THREE.Group();   // ring + glaze + toppings (rotated upright by place())
  private readonly bowlGroup = new THREE.Group();
  private readonly c: Content | null;
  private stage: string = DONUT_STAGES[0];
  private t = 0;
  private placed = 0;

  constructor(job: Job, private readonly ctx: ProductCtx) {
    const { looks } = ctx;
    const g = geoms();
    this.root.name = 'donut';
    this.bed.name = 'bed';
    this.bed.add(looks.part(g.tray, 'steel'));
    this.mover.position.z = DON_Z;
    this.mover.add(this.lying);
    this.bowlGroup.position.z = BOWL_Z - DON_Z;
    this.mover.add(this.bowlGroup);
    this.root.add(this.bed, this.mover);
    if (job.isSpace) { this.c = null; return; }

    const own: THREE.BufferGeometry[] = [];
    const doughMat = looks.own('sand');
    const ringMat = looks.own('sand');
    const glazeMat = looks.own('liquid');
    const sprMats = SPRINKLE_COLORS.map(() => looks.own('product'));
    const bowl = looks.part(g.bowl, 'paint-accent');
    const fill = new THREE.Mesh(g.fill, doughMat);
    fill.position.z = 3;
    fill.castShadow = true;
    this.bowlGroup.add(bowl, fill);

    const ringGeom = g.ring.clone();
    const glazeGeom = g.glaze.clone();
    own.push(ringGeom, glazeGeom);
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.castShadow = true;
    const glaze = new THREE.Mesh(glazeGeom, glazeMat);
    glaze.castShadow = true;
    const iceGeom = glyphFlat(job.char);
    own.push(iceGeom);
    const icing = looks.part(iceGeom, 'rubber', false);
    icing.position.z = DON_r + 1.1 + 0.9 * 0.5; // sits on the glaze crown
    this.lying.add(ring, glaze, icing);

    // Sprinkles scattered on the glaze crown, deterministic per char.
    let seed = job.char.charCodeAt(0) * 9301 + 49297;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const up = new THREE.Vector3(0, 1, 0);
    const sprinkles = Array.from({ length: SPRINKLES }, (_, i) => {
      const a = rnd() * Math.PI * 2;
      const phi = (rnd() - 0.5) * 1.5;              // tube angle from the top
      const rr = GLAZE_R * 0.97;
      const n = new THREE.Vector3(Math.sin(phi) * Math.cos(a), Math.sin(phi) * Math.sin(a), Math.cos(phi));
      const m = new THREE.Mesh(g.sprinkle, sprMats[i % 3]);
      m.position.set((DON_R + rr * Math.sin(phi)) * Math.cos(a), (DON_R + rr * Math.sin(phi)) * Math.sin(a), rr * Math.cos(phi) * 0.8 + 1.1);
      const dir = new THREE.Vector3().crossVectors(n, new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5)).normalize();
      m.quaternion.setFromUnitVectors(up, dir);
      this.lying.add(m);
      return m;
    });
    this.c = { bowl, fill, ring, glaze, icing, sprinkles, doughMat, ringMat, glazeMat, sprMats, own };
    this.shape(DONUT_STAGES[0], 0);
  }

  shape(stage: string, t: number): void {
    this.stage = stage;
    this.t = t;
    const c = this.c;
    if (!c) return;
    const v = donutVisual(stage, t);
    const ap = (m: THREE.Material, color: THREE.Color, rough: number) =>
      this.ctx.looks.appearance(m, { color, emissive: BLACK, emissiveIntensity: 0, metalness: 0, roughness: rough });

    this.bowlGroup.visible = v.bowl > 0.01;
    this.bowlGroup.scale.setScalar(Math.max(1e-3, v.bowl));
    c.fill.visible = v.fill > 0.01;
    c.fill.scale.set(1 + 0.05 * v.fill, 1 + 0.05 * v.fill, Math.max(1e-3, v.fill));
    ap(c.doughMat, tmp.copy(FLOUR).lerp(DOUGH, v.mix), 0.9);

    const arc = Math.ceil(TUBULAR * v.ring);
    c.ring.visible = arc > 0;
    c.ring.geometry.setDrawRange(0, TUBULAR * RADIAL * 6 * Math.min(1, arc / TUBULAR));
    ap(c.ringMat, tmp.copy(DOUGH).lerp(GOLD, v.cook), 0.8);
    const garc = Math.ceil(TUBULAR * v.glaze);
    c.glaze.visible = garc > 0;
    c.glaze.geometry.setDrawRange(0, TUBULAR * RADIAL * 6 * Math.min(1, garc / TUBULAR));
    ap(c.glazeMat, PINK, 0.12);
    c.sprinkles.forEach((s, i) => { s.visible = i < Math.round(SPRINKLES * v.sprinkles); });
    c.sprMats.forEach((m, i) => ap(m, SPRINKLE_COLORS[i], 0.6));
    c.icing.visible = v.icing > 0.01;
    c.icing.scale.set(Math.max(1e-3, v.icing), 1, 1);
    c.icing.position.x = -(1 - v.icing) * c.icing.geometry.boundingBox!.max.x; // grows from its left end
  }

  place(t: number): void {
    this.placed = t;
    this.bed.visible = t < 0.02;
    this.mover.position.z = DON_Z + (DON_R + GLAZE_R - DON_Z) * t; // stands on its rim
    this.lying.rotation.x = (Math.PI / 2) * t;
    this.bowlGroup.visible = this.bowlGroup.visible && t < 0.02;
  }

  restyle(): void {
    const c = this.c;
    if (!c) return;
    const { looks } = this.ctx;
    for (const m of [c.doughMat, c.ringMat, c.glazeMat, ...c.sprMats]) m.dispose();
    c.doughMat = looks.own('sand');
    c.ringMat = looks.own('sand');
    c.glazeMat = looks.own('liquid');
    c.sprMats = SPRINKLE_COLORS.map(() => looks.own('product'));
    c.fill.material = c.doughMat;
    c.ring.material = c.ringMat;
    c.glaze.material = c.glazeMat;
    c.sprinkles.forEach((s, i) => { s.material = c.sprMats[i % 3]; });
    this.shape(this.stage, this.t);
    if (this.placed > 0) this.place(this.placed);
  }

  dispose(): void {
    const c = this.c;
    if (c) {
      for (const m of [c.doughMat, c.ringMat, c.glazeMat, ...c.sprMats]) m.dispose();
      for (const g of c.own) g.dispose();
    }
    this.root.removeFromParent();
  }
}

export const donutProduct: ProductModel = {
  kind: 'donut',
  stages: DONUT_STAGES,
  size: [2 * (DON_R + DON_r + 1), 2 * DON_r + 3, 2 * (DON_R + DON_r + 1)],
  lineSize: 2 * TRAY_R + 2,
  shatter: {
    burst: [{ kind: 'crumb', count: 40 }, { kind: 'confetti', count: 20 }, { kind: 'powder', count: 16 }],
    sounds: ['crunch'],
    fragments: { role: 'product', count: 10, size: 3 },
  },
  create: (job: Job, ctx: ProductCtx) => new DonutHandle(job, ctx),
};
