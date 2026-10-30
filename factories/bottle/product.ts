import * as THREE from 'three';
import { letterGeometry } from '../../engine/letterSolid';
import type { ProductCtx, ProductHandle, ProductModel } from '../../engine/product';
import type { Job } from '../../engine/types';
import { BOTTLE_STAGES, bottleVisual } from './visual';

export { BOTTLE_STAGES };
export const BOTTLE_H = 54;   // crown top
export const BOTTLE_R = 10;
export const PUCK_R = 14;
export const PUCK_T = 3;
const LINER = 8.7;            // liquid radius (inside the 10 wall)
const LIQ_Z0 = 1.5;
const LIQ_H = 26.5;           // liquid top at z 28, below the shoulder
const LAYER_H = 3;
const LABEL_R = 10.25;
const LABEL_H = 15;
const LABEL_Z = 21;           // label centre (body wall is straight from z 4 to 25)
const CAP_Z = 52;
const SEG = 32;

const GLOW = 3;
const WHITE_HOT = new THREE.Color(0xff8c20);
const ORANGE = new THREE.Color(0xff4400);
const RED = new THREE.Color(0x9a1800);
const BLACK = new THREE.Color(0x000000);
const AMBER = new THREE.Color(0xc89a50);
const CLEAR = new THREE.Color(0xdff5ef);
const WHITE = new THREE.Color(0xf4f4ee);
const BATCH = new THREE.Color(0xb0b59a);
/** Sand, soda ash, limestone, cullet. */
const LAYER_COLORS = [0xc9ae78, 0xf0f0ea, 0x8d8f8a, 0x5fae8a].map((c) => new THREE.Color(c));
const tmp = new THREE.Color();
const tmpE = new THREE.Color();

const lerp = THREE.MathUtils.lerp;
const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

function heatColor(h: number, out: THREE.Color): THREE.Color {
  if (h > 0.66) return out.copy(ORANGE).lerp(WHITE_HOT, (h - 0.66) / 0.34);
  if (h > 0.33) return out.copy(RED).lerp(ORANGE, (h - 0.33) / 0.33);
  return out.copy(BLACK).lerp(RED, h / 0.33);
}

/** Lathe profiles [r, z], one point count: gob → parison → bottle are morph targets of each other. */
const BOTTLE_PROFILE: [number, number][] = [[0, 0], [7.5, 0], [9.6, 1.4], [10, 4], [10, 25], [9.3, 30], [7, 35], [4.5, 39], [3.4, 43], [3.4, 48], [4.3, 49], [4.3, 52], [2.8, 52]];
const PARISON_PROFILE: [number, number][] = [[0, 0], [4.5, 0], [5.8, 1.5], [6.2, 4], [6.2, 17], [5.8, 22], [5.2, 26], [4.4, 29], [3.4, 32], [3.4, 36], [4.3, 37], [4.3, 39], [2.8, 39]];
const GOB_PROFILE: [number, number][] = [[0, 0], [4, 0], [6, 1.2], [7, 3.5], [7.4, 6], [7, 8.5], [6, 10.5], [4.5, 12], [3, 13], [2, 13.8], [1.4, 14.2], [0.8, 14.5], [0, 14.6]];

const lathe = (p: [number, number][]) => new THREE.LatheGeometry(p.map(([r, z]) => new THREE.Vector2(r, z)), SEG).rotateX(Math.PI / 2);

let shared: {
  body: THREE.BufferGeometry; puck: THREE.BufferGeometry; tub: THREE.BufferGeometry; layer: THREE.BufferGeometry;
  liquid: THREE.BufferGeometry; crown: THREE.BufferGeometry; label: THREE.BufferGeometry;
} | null = null;
/** Geometries shared by every bottle handle (never disposed). Body = the final bottle with gob/parison morph targets. */
function geoms() {
  if (shared) return shared;
  const body = lathe(BOTTLE_PROFILE);
  const targets = [GOB_PROFILE, PARISON_PROFILE].map(lathe);
  body.morphAttributes.position = targets.map((g) => g.getAttribute('position'));
  body.morphAttributes.normal = targets.map((g) => g.getAttribute('normal'));
  const cyl = (r: number, h: number) => new THREE.CylinderGeometry(r, r, h, 24).rotateX(Math.PI / 2).translate(0, 0, h / 2);
  const label = new THREE.CylinderGeometry(LABEL_R, LABEL_R, LABEL_H, 48, 1, true).rotateX(Math.PI / 2).rotateZ(Math.PI).translate(0, 0, LABEL_Z);
  shared = {
    body,
    puck: new THREE.CylinderGeometry(PUCK_R, PUCK_R + 1, PUCK_T, 32).rotateX(Math.PI / 2).translate(0, 0, PUCK_T / 2),
    tub: lathe([[0, 0], [10, 0], [11.5, 16], [10.7, 16], [9.6, 1.8], [0, 1.8]]),
    layer: cyl(9.4, 1),
    liquid: cyl(LINER, 1),
    crown: lathe([[0, 2], [4.8, 2], [5.3, 1.5], [5.3, 0], [4.8, 0]]),
    label,
  };
  return shared;
}

/** Glyph solid centred on (0, 0, 0) in the x-z plane, optionally bent onto a cylinder of radius R (front = −y). Caller owns the clone. */
function glyphSolid(ch: string, height: number, radius: number, bendR?: number): THREE.BufferGeometry {
  const g = letterGeometry(ch, { height, radius }).clone();
  const bb = g.boundingBox ?? (g.computeBoundingBox(), g.boundingBox!);
  g.translate(-(bb.min.x + bb.max.x) / 2, 0, -(bb.min.z + bb.max.z) / 2);
  if (bendR) {
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const a = pos.getX(i) / bendR;
      const r = bendR + pos.getY(i) + radius * 0.6;
      pos.setXYZ(i, r * Math.sin(a), -r * Math.cos(a), pos.getZ(i));
    }
    g.computeVertexNormals();
    g.computeBoundingBox();
  }
  return g;
}

interface Content {
  tub: THREE.Mesh;
  stack: THREE.Group;
  layers: THREE.Mesh[];
  body: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  liquid: THREE.Mesh;
  foam: THREE.Mesh;
  crown: THREE.Mesh;
  label: THREE.Mesh;
  ink: THREE.Mesh | null;
  emboss: THREE.Mesh | null;
  capMark: THREE.Mesh | null;
  glass: THREE.Material;
  foamMat: THREE.Material;
  layerMats: THREE.Material[];
  own: THREE.BufferGeometry[];
}

class BottleHandle implements ProductHandle {
  readonly root = new THREE.Group();
  private readonly bed = new THREE.Group();
  private readonly content = new THREE.Group();
  private readonly c: Content | null;
  private stage: string = BOTTLE_STAGES[0];
  private t = 0;
  private placed = 0;

  constructor(job: Job, private readonly ctx: ProductCtx) {
    const { looks, marks } = ctx;
    const g = geoms();
    this.bed.name = 'bed';
    const puck = looks.part(g.puck, 'steel');
    this.bed.add(puck);
    this.content.position.z = PUCK_T;
    this.root.add(this.bed, this.content);
    if (job.isSpace) {
      this.c = null;
      return;
    }
    const glass = looks.own('glass');
    const foamMat = looks.own('liquid');
    const layerMats = LAYER_COLORS.map(() => looks.own('sand'));
    const body = new THREE.Mesh(g.body, glass);
    body.name = 'bottle';
    body.frustumCulled = false; // morph targets move vertices outside the base geometry's bounds
    body.castShadow = true;
    body.morphTargetInfluences = [1, 0]; // [gob, parison]; both 0 = bottle
    const own: THREE.BufferGeometry[] = [];
    const mark = (geom: THREE.BufferGeometry, mat: THREE.Material | null, role: 'rubber' | null, name: string) => {
      own.push(geom);
      const m = mat ? new THREE.Mesh(geom, mat) : looks.part(geom, role!, false);
      m.name = name;
      return m;
    };
    const emboss = marks.emboss ? mark(glyphSolid(job.char, 7, 0.5, BOTTLE_R), glass, null, 'emboss') : null;
    emboss?.position.set(0, 0, 8.5);
    const ink = marks.label ? mark(glyphSolid(job.char, 9, 0.35, LABEL_R), null, 'rubber', 'glyph') : null;
    ink?.position.set(0, 0, LABEL_Z);
    const capMark = marks.cap ? mark(glyphSolid(job.char, 3.4, 0.25), null, 'rubber', 'cap-glyph') : null;
    if (capMark) { capMark.rotation.x = -Math.PI / 2; capMark.position.z = 2.2; }

    const tub = looks.part(g.tub, 'paint-accent');
    const stack = new THREE.Group();
    stack.position.z = 1.8;
    const layers = layerMats.map((m, i) => {
      const l = new THREE.Mesh(g.layer, m);
      l.name = `layer${i}`;
      stack.add(l);
      return l;
    });
    tub.add(stack);
    const liquid = looks.part(g.liquid, 'liquid', false);
    liquid.position.z = LIQ_Z0;
    const foam = new THREE.Mesh(g.liquid, foamMat);
    foam.name = 'foam';
    const crown = looks.part(g.crown, 'copper');
    if (capMark) crown.add(capMark);
    const labelGeom = g.label.clone(); // draw range is per handle
    own.push(labelGeom);
    const label = looks.part(labelGeom, 'sand', false);
    label.name = 'label';
    if (ink) label.add(ink);
    this.content.add(tub, body, liquid, foam, crown, label);
    if (emboss) this.content.add(emboss);
    this.c = { tub, stack, layers, body, liquid, foam, crown, label, ink, emboss, capMark, glass, foamMat, layerMats, own };
    this.shape(BOTTLE_STAGES[0], 0);
  }

  shape(stage: string, t: number): void {
    this.stage = stage;
    this.t = t;
    const c = this.c;
    if (!c) return;
    const v = bottleVisual(stage, t);

    c.tub.visible = v.tub > 0.01;
    c.tub.scale.setScalar(Math.max(1e-3, v.tub));
    // Granule layers: fill one after the other; the batch drains as the tub tips into the furnace.
    let z = 0;
    c.layers.forEach((l, i) => {
      const h = LAYER_H * Math.min(1, Math.max(0, v.layers * 4 - i)) * (1 - 0.97 * v.drain);
      l.visible = h > 0.02;
      l.position.z = z;
      l.scale.z = Math.max(1e-3, h);
      z += h;
    });
    c.layerMats.forEach((m, i) => this.ctx.looks.appearance(m, { color: tmp.copy(LAYER_COLORS[i]).lerp(BATCH, v.mix), emissive: BLACK, emissiveIntensity: 0, metalness: 0, roughness: 1 }));

    // Glass: gob → parison → bottle morph, heat, clarity.
    const m = v.morph;
    c.body.visible = v.gob > 0.01;
    c.body.scale.setScalar(Math.max(1e-3, v.gob));
    c.body.morphTargetInfluences![0] = m < 1 ? 1 - m : 0;
    c.body.morphTargetInfluences![1] = m < 1 ? m : 2 - m;
    if (c.emboss) { c.emboss.visible = v.emboss > 0.01; c.emboss.scale.setScalar(Math.max(1e-3, v.emboss)); }
    this.ctx.looks.appearance(c.glass, {
      color: tmp.copy(AMBER).lerp(CLEAR, v.clear),
      emissive: heatColor(v.heat, tmpE),
      emissiveIntensity: GLOW * v.heat,
      metalness: 0,
      roughness: lerp(0.5, 0.05, v.clear),
    });
    const gm = c.glass as THREE.MeshPhysicalMaterial;
    if (gm.isMeshPhysicalMaterial) gm.transmission = 0.92 * v.clear;
    else if (gm.transparent) gm.opacity = lerp(1, 0.4, v.clear);

    // Contents.
    const lvl = LIQ_H * v.fill;
    c.liquid.visible = v.fill > 0.01;
    c.liquid.scale.z = Math.max(1e-3, lvl);
    c.foam.visible = v.foam > 0.01 && v.fill > 0.01;
    c.foam.scale.set(1, 1, 1.8 * v.foam);
    c.foam.position.z = LIQ_Z0 + lvl;
    this.ctx.looks.appearance(c.foamMat, { color: WHITE, emissive: BLACK, emissiveIntensity: 0, metalness: 0, roughness: 0.9 });

    c.crown.visible = v.cap > 0.01;
    c.crown.position.z = CAP_Z + (1 - smooth(v.cap)) * 18;
    const wrap = Math.ceil(48 * v.label);
    c.label.visible = wrap > 0;
    c.label.geometry.setDrawRange(0, 6 * wrap);
    if (c.ink) c.ink.visible = v.label > 0.6;
  }

  place(t: number): void {
    this.placed = t;
    this.bed.visible = t <= 0.02;
    this.content.position.z = PUCK_T * (1 - smooth(t));
  }

  restyle(): void {
    const c = this.c;
    if (c) {
      const { looks } = this.ctx;
      const old = [c.glass, c.foamMat, ...c.layerMats];
      c.glass = looks.own('glass');
      c.foamMat = looks.own('liquid');
      c.layerMats = c.layerMats.map(() => looks.own('sand'));
      c.body.material = c.glass;
      if (c.emboss) c.emboss.material = c.glass;
      c.foam.material = c.foamMat;
      c.layers.forEach((l, i) => { l.material = c.layerMats[i]; });
      for (const m of old) m.dispose();
    }
    this.shape(this.stage, this.t);
    if (this.placed > 0) this.place(this.placed);
  }

  dispose(): void {
    const c = this.c;
    if (c) {
      for (const m of [c.glass, c.foamMat, ...c.layerMats]) m.dispose();
      for (const g of c.own) g.dispose();
    }
    this.root.removeFromParent(); // shared geometries are never disposed
  }
}

export const bottleProduct: ProductModel = {
  kind: 'bottle',
  stages: BOTTLE_STAGES,
  size: [2 * LABEL_R + 2, 2 * LABEL_R + 2, BOTTLE_H],
  lineSize: 2 * PUCK_R + 2,
  shatter: {
    burst: [{ kind: 'shard', count: 40 }, { kind: 'droplet', count: 24 }, { kind: 'liquid', count: 16 }],
    sounds: ['glass-shatter', 'liquid-splash'],
    fragments: { role: 'glass', count: 12, size: 3 },
    puddle: true,
  },
  create: (job: Job, ctx: ProductCtx) => new BottleHandle(job, ctx),
};
