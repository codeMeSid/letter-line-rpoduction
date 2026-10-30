import * as THREE from 'three';
import { letterGeometry } from '../../engine/letterSolid';
import type { ProductCtx, ProductHandle, ProductModel } from '../../engine/product';
import type { Job } from '../../engine/types';
import { box } from '../shared/parts';
import { CAN_STAGES, canVisual } from './visual';

export { CAN_STAGES };
export const CAN_H = 50;     // lid top
export const CAN_R = 12;
export const LID_Z = 48.3;   // seamed lid centre
const SLEEVE_R = 12.25;
const SLEEVE_H = 30;
const SLEEVE_Z = 22;
const LIQ_Z0 = 2.5;
const LIQ_H = 40;
const SEG = 40;

const ALU = new THREE.Color(0xdde1e6);
const MILL = new THREE.Color(0x80858b);
const WHITE = new THREE.Color(0xf4f4ee);
const BLACK = new THREE.Color(0x000000);
const tmp = new THREE.Color();
const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

type P = [number, number];
/** Every profile has 12 points ([radius, z], dome centre → foot → wall → rim) so they morph one into the other. */
export const CAN_PROFILE: P[] = [[0, 2.5], [6, 2.5], [8, 0], [9, 0], [12, 3], [12, 40], [10.6, 43.5], [10.6, 45.8], [11.4, 46.8], [11.4, 48], [10.8, 48], [10.8, 46.5]];
const TRIMMED: P[] = [[0, 2.5], [6, 2.5], [8, 0], [9, 0], [12, 3], [12, 40], [12, 43], [12, 46], [12, 47.6], [12, 48], [11.4, 48], [11.4, 46.5]];
const TALL: P[] = [[0, 2.5], [6, 2.5], [8, 0], [9, 0], [12, 3], [12, 40], [12, 45], [12, 49], [12, 50.6], [12, 51.2], [11.4, 51.2], [11.4, 49]];
const CUP: P[] = [[0, 2], [4, 2], [5.5, 0], [6.3, 0], [8.5, 2.5], [8.5, 12], [8.5, 14], [8.5, 16], [8.5, 17.5], [8.5, 18], [8, 18], [8, 16]];
const DISC: P[] = [[0, 0.7], [3, 0.7], [6, 0.7], [9, 0.7], [12, 0.7], [13.5, 0.7], [14, 0.55], [14, 0.35], [13.6, 0], [9, 0], [4, 0], [0, 0]];
export const COIL_R = 15;

const lathe = (p: P[]) => new THREE.LatheGeometry(p.map(([r, z]) => new THREE.Vector2(r, z)), SEG).rotateX(Math.PI / 2);

let shared: {
  body: THREE.BufferGeometry; liquid: THREE.BufferGeometry; sleeve: THREE.BufferGeometry;
  coil: THREE.BufferGeometry; strap: THREE.BufferGeometry; lid: THREE.BufferGeometry;
} | null = null;

/** Geometries shared by every can handle (never disposed). Body = necked can base + disc/cup/tall/trimmed morph targets. */
function geoms() {
  if (shared) return shared;
  const body = lathe(CAN_PROFILE);
  const targets = [DISC, CUP, TALL, TRIMMED].map(lathe);
  body.morphAttributes.position = targets.map((g) => g.getAttribute('position'));
  body.morphAttributes.normal = targets.map((g) => g.getAttribute('normal'));
  shared = {
    body,
    liquid: new THREE.CylinderGeometry(10.8, 10.8, 1, 28).rotateX(Math.PI / 2).translate(0, 0, 0.5),
    sleeve: new THREE.CylinderGeometry(SLEEVE_R, SLEEVE_R, SLEEVE_H, 48, 1, true).rotateX(Math.PI / 2).rotateZ(Math.PI).translate(0, 0, SLEEVE_Z),
    coil: lathe([[5, 0], [COIL_R, 0], [COIL_R, 10], [5, 10], [5, 0.01], [5, 0]]),
    strap: lathe([[COIL_R, 2.5], [COIL_R + 0.5, 2.5], [COIL_R + 0.5, 3.5], [COIL_R, 3.5]]),
    lid: lathe([[0, 0.2], [9.2, 0.2], [9.8, 1.2], [11.8, 1.2], [12.4, 0.7], [12.4, -0.7], [11, -0.7], [11, 0.2]]),
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
  coil: THREE.Group;
  strip: THREE.Mesh;
  body: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  liquid: THREE.Mesh;
  foam: THREE.Mesh;
  lid: THREE.Group;
  sleeve: THREE.Mesh;
  ink: THREE.Mesh | null;
  alu: THREE.Material;
  foamMat: THREE.Material;
  own: THREE.BufferGeometry[];
}

class CanHandle implements ProductHandle {
  readonly root = new THREE.Group();
  private readonly c: Content | null;
  private stage: string = CAN_STAGES[0];
  private t = 0;
  private placed = 0;

  constructor(job: Job, private readonly ctx: ProductCtx) {
    const { looks, marks } = ctx;
    const g = geoms();
    if (job.isSpace) {
      this.c = null;
      return;
    }
    const alu = looks.own('steel');
    const foamMat = looks.own('liquid');
    const body = new THREE.Mesh(g.body, alu);
    body.name = 'can';
    body.frustumCulled = false; // morph targets move vertices outside the base geometry's bounds
    body.castShadow = true;
    body.morphTargetInfluences = [1, 0, 0, 0]; // [disc, cup, tall, trimmed]; all 0 = necked can
    const own: THREE.BufferGeometry[] = [];
    const ink = marks.label ? looks.part(glyphSolid(job.char, 16, 0.4, SLEEVE_R), 'rubber', false) : null;
    if (ink) { own.push(ink.geometry); ink.name = 'glyph'; ink.position.z = SLEEVE_Z; }

    const coil = new THREE.Group();
    coil.position.z = 0;
    coil.add(looks.part(g.coil, 'steel'), looks.part(g.strap, 'paint-accent'));
    const strapB = looks.part(g.strap, 'paint-accent');
    strapB.rotation.z = Math.PI;
    strapB.position.z = 4;
    coil.add(strapB);
    const strip = box(looks, 30, 26, 0.7, 'steel');
    own.push(strip.geometry);
    const liquid = looks.part(g.liquid, 'liquid', false);
    liquid.position.z = LIQ_Z0;
    const foam = new THREE.Mesh(g.liquid, foamMat);
    foam.name = 'foam';
    const sleeveGeom = g.sleeve.clone(); // draw range per handle
    own.push(sleeveGeom);
    const sleeve = looks.part(sleeveGeom, 'paint-accent', false);
    sleeve.name = 'sleeve';
    if (ink) sleeve.add(ink);
    // Lid: seamed end with a stay tab (and the typed character on the panel when the cap mark is on).
    const lid = new THREE.Group();
    lid.add(looks.part(g.lid, 'steel'));
    const tab = box(looks, 5, 7, 0.6, 'paint-accent');
    own.push(tab.geometry);
    tab.position.set(0, -1, 1.2);
    lid.add(tab);
    if (marks.cap) {
      const m = looks.part(glyphSolid(job.char, 3.4, 0.25), 'rubber', false);
      own.push(m.geometry);
      m.name = 'cap-glyph';
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 3.2, 1.25);
      lid.add(m);
    }
    this.root.add(coil, strip, body, liquid, foam, sleeve, lid);
    this.c = { coil, strip, body, liquid, foam, lid, sleeve, ink, alu, foamMat, own };
    this.shape(CAN_STAGES[0], 0);
  }

  shape(stage: string, t: number): void {
    this.stage = stage;
    this.t = t;
    const c = this.c;
    if (!c) return;
    const v = canVisual(stage, t);

    c.coil.visible = v.coil > 0.01;
    c.coil.scale.set(Math.max(1e-3, v.coil), Math.max(1e-3, v.coil), 1);
    c.coil.position.z = 0;
    c.strip.visible = v.strip > 0.01;
    c.strip.scale.set(Math.max(1e-3, v.strip), 1, 1);
    c.body.visible = v.body > 0.01;
    c.body.scale.setScalar(Math.max(1e-3, v.body));
    const m = v.morph;
    const w = c.body.morphTargetInfluences!;
    for (let i = 0; i < 4; i++) w[i] = Math.max(0, 1 - Math.abs(m - i));
    this.ctx.looks.appearance(c.alu, {
      color: tmp.copy(ALU).lerp(MILL, v.dirt),
      emissive: BLACK, emissiveIntensity: 0, metalness: 1, roughness: 0.22 + 0.5 * v.dirt,
    });

    const lvl = LIQ_H * v.fill;
    c.liquid.visible = v.fill > 0.01;
    c.liquid.scale.z = Math.max(1e-3, lvl);
    c.foam.visible = v.foam > 0.01 && v.fill > 0.01;
    c.foam.scale.set(1, 1, 3 * v.foam);
    c.foam.position.z = LIQ_Z0 + lvl;
    this.ctx.looks.appearance(c.foamMat, { color: WHITE, emissive: BLACK, emissiveIntensity: 0, metalness: 0, roughness: 0.9 });

    const wrap = Math.ceil(48 * v.ink);
    c.sleeve.visible = wrap > 0;
    c.sleeve.geometry.setDrawRange(0, 6 * wrap);
    if (c.ink) c.ink.visible = v.ink > 0.6;
    c.lid.visible = v.lid > 0.01;
    c.lid.position.z = LID_Z + (1 - smooth(v.lid)) * 16;
  }

  place(t: number): void {
    this.placed = t;
  }

  restyle(): void {
    const c = this.c;
    if (!c) return;
    const { looks } = this.ctx;
    for (const m of [c.alu, c.foamMat]) m.dispose();
    c.alu = looks.own('steel');
    c.foamMat = looks.own('liquid');
    c.body.material = c.alu;
    c.foam.material = c.foamMat;
    this.shape(this.stage, this.t);
    if (this.placed > 0) this.place(this.placed);
  }

  dispose(): void {
    const c = this.c;
    if (c) {
      for (const m of [c.alu, c.foamMat]) m.dispose();
      for (const g of c.own) g.dispose();
    }
    this.root.removeFromParent();
  }
}

export const canProduct: ProductModel = {
  kind: 'can',
  stages: CAN_STAGES,
  size: [2 * SLEEVE_R + 2, 2 * SLEEVE_R + 2, CAN_H],
  lineSize: 2 * COIL_R + 2,
  shatter: {
    burst: [{ kind: 'shard', count: 24 }, { kind: 'droplet', count: 24 }, { kind: 'liquid', count: 16 }],
    sounds: ['metal-crumple', 'liquid-splash'],
    fragments: { role: 'steel', count: 8, size: 3 },
    puddle: true,
  },
  create: (job: Job, ctx: ProductCtx) => new CanHandle(job, ctx),
};
