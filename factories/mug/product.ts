import * as THREE from 'three';
import { letterGeometry } from '../../engine/letterSolid';
import type { ProductCtx, ProductHandle, ProductModel } from '../../engine/product';
import type { Job } from '../../engine/types';
import { MUG_STAGES, mugVisual } from './visual';

export { MUG_STAGES };
export const MUG_H = 24;
export const MUG_R = 12;
export const PUCK_R = 14;
export const PUCK_T = 3;
const WALL = 1.7;
const FLOOR_T = 2.4;
const TUB_R = 15;
const FILL_Z0 = 1.8;
const FILL_H = 12;
const HANDLE_R = 6;
const HANDLE_Z = 12.5;
const SEG = 32;

const DRY = new THREE.Color(0xd8cdb8);
const WET = new THREE.Color(0x8c7a64);
const BISCUIT = new THREE.Color(0xe6bf9c);
const GLAZE = new THREE.Color(0xf4f1e8);
const DRY_CLAY = new THREE.Color(0x9b7d5c);
const SLIP = new THREE.Color(0xd9c9a8);
const ORANGE = new THREE.Color(0xff5a10);
const BLACK = new THREE.Color(0x000000);
const tmp = new THREE.Color();

const lerp = THREE.MathUtils.lerp;
const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Mug lathe [r, z]: foot, straight wall, rim, inner wall, inner floor (closed profile = real wall thickness). */
const MUG_PROFILE: [number, number][] = [[0, 0], [MUG_R - 1.8, 0], [MUG_R - 0.4, 0.5], [MUG_R, 1.6], [MUG_R, MUG_H - 0.8], [MUG_R - 0.5, MUG_H], [MUG_R - WALL + 0.3, MUG_H], [MUG_R - WALL, MUG_H - 0.8], [MUG_R - WALL, FLOOR_T], [0, FLOOR_T]];
const lathe = (p: [number, number][]) => new THREE.LatheGeometry(p.map(([r, z]) => new THREE.Vector2(r, z)), SEG).rotateX(Math.PI / 2);

let shared: { body: THREE.BufferGeometry; puck: THREE.BufferGeometry; tub: THREE.BufferGeometry; fill: THREE.BufferGeometry; handle: THREE.BufferGeometry } | null = null;
/** Geometries shared by every mug handle (never disposed). */
function geoms() {
  if (shared) return shared;
  shared = {
    body: lathe(MUG_PROFILE),
    puck: new THREE.CylinderGeometry(PUCK_R, PUCK_R + 1, PUCK_T, 32).rotateX(Math.PI / 2).translate(0, 0, PUCK_T / 2),
    tub: lathe([[0, 0], [TUB_R, 0], [TUB_R + 1.5, 16], [TUB_R + 0.5, 16], [TUB_R - 0.8, 1.8], [0, 1.8]]),
    fill: new THREE.CylinderGeometry(TUB_R - 1.6, TUB_R - 1.6, 1, 24).rotateX(Math.PI / 2).translate(0, 0, 0.5),
    // D-shaped loop bulging toward +x, both ends buried in the wall.
    handle: new THREE.TorusGeometry(HANDLE_R, 1.5, 8, 18, Math.PI).rotateZ(-Math.PI / 2).rotateX(Math.PI / 2).translate(MUG_R - 1.2, 0, HANDLE_Z),
  };
  return shared;
}

/** Glyph solid centred on (0, 0, 0) in the x-z plane, bent onto a cylinder of radius R (front = −y). Caller owns the clone. */
function glyphSolid(ch: string, height: number, radius: number, bendR: number): THREE.BufferGeometry {
  const g = letterGeometry(ch, { height, radius }).clone();
  const bb = g.boundingBox ?? (g.computeBoundingBox(), g.boundingBox!);
  g.translate(-(bb.min.x + bb.max.x) / 2, 0, -(bb.min.z + bb.max.z) / 2);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const a = pos.getX(i) / bendR;
    const r = bendR + pos.getY(i) + radius * 0.6;
    pos.setXYZ(i, r * Math.sin(a), -r * Math.cos(a), pos.getZ(i));
  }
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}

interface Content {
  tub: THREE.Mesh;
  fill: THREE.Mesh;
  body: THREE.Mesh;
  handle: THREE.Mesh;
  ink: THREE.Mesh;
  clay: THREE.Material;
  slip: THREE.Material;
  own: THREE.BufferGeometry[];
}

class MugHandle implements ProductHandle {
  readonly root = new THREE.Group();
  private readonly bed = new THREE.Group();
  private readonly content = new THREE.Group();
  private readonly c: Content | null;
  private stage: string = MUG_STAGES[0];
  private t = 0;
  private placed = 0;

  constructor(job: Job, private readonly ctx: ProductCtx) {
    const { looks } = ctx;
    const g = geoms();
    this.bed.name = 'bed';
    this.bed.add(looks.part(g.puck, 'steel'));
    this.content.position.z = PUCK_T;
    this.root.add(this.bed, this.content);
    if (job.isSpace) {
      this.c = null;
      return;
    }
    const clay = looks.own('sand'); // the ceramic body (clay → greenware → bisque → glaze)
    const slip = looks.own('sand'); // clay lumps / slip in the tub
    const body = new THREE.Mesh(g.body, clay);
    body.name = 'mug';
    body.castShadow = true;
    const handle = new THREE.Mesh(g.handle, clay);
    handle.name = 'handle';
    handle.castShadow = true;
    const inkGeom = glyphSolid(job.char, 11, 0.35, MUG_R);
    const ink = looks.part(inkGeom, 'rubber', false);
    ink.name = 'glyph';
    ink.position.z = 13;
    const tub = looks.part(g.tub, 'paint-accent');
    const fill = new THREE.Mesh(g.fill, slip);
    fill.name = 'fill';
    fill.position.z = FILL_Z0;
    this.content.add(tub, fill, body, handle, ink);
    this.c = { tub, fill, body, handle, ink, clay, slip, own: [inkGeom] };
    this.shape(MUG_STAGES[0], 0);
  }

  shape(stage: string, t: number): void {
    this.stage = stage;
    this.t = t;
    const c = this.c;
    if (!c) return;
    const v = mugVisual(stage, t);
    const { looks } = this.ctx;

    c.tub.visible = v.tub > 0.01;
    c.tub.scale.setScalar(Math.max(1e-3, v.tub));
    // Clay lumps → slip, then the slip drains out into the mould.
    const lvl = FILL_H * v.fill * (1 - v.drain);
    c.fill.visible = lvl > 0.05 && v.tub > 0.01;
    c.fill.scale.set(1, 1, Math.max(1e-3, lvl));
    looks.appearance(c.slip, { color: tmp.copy(DRY_CLAY).lerp(SLIP, v.mix), emissive: BLACK, emissiveIntensity: 0, metalness: 0, roughness: lerp(1, 0.25, v.mix) });

    // Cast wall grows up from the foot (slip cast), handle slides on from +x.
    c.body.visible = v.body > 0.01;
    c.body.scale.set(1, 1, Math.max(1e-3, v.body));
    c.handle.visible = v.handle > 0.01;
    c.handle.position.x = (1 - v.handle) * 12;
    c.handle.scale.setScalar(Math.max(1e-3, v.handle));
    c.ink.visible = v.print > 0.5;
    c.ink.scale.setScalar(Math.max(1e-3, v.print));

    tmp.copy(DRY).lerp(WET, v.wet).lerp(BISCUIT, v.fire).lerp(GLAZE, v.glaze);
    const rough = lerp(lerp(0.95, 0.75, v.glaze), 0.12, v.gloss);
    looks.appearance(c.clay, { color: tmp, emissive: ORANGE, emissiveIntensity: 2.2 * v.heat, metalness: 0, roughness: rough });
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
      const old = [c.clay, c.slip];
      c.clay = looks.own('sand');
      c.slip = looks.own('sand');
      c.body.material = c.clay;
      c.handle.material = c.clay;
      c.fill.material = c.slip;
      for (const m of old) m.dispose();
    }
    this.shape(this.stage, this.t);
    if (this.placed > 0) this.place(this.placed);
  }

  dispose(): void {
    const c = this.c;
    if (c) {
      c.clay.dispose();
      c.slip.dispose();
      for (const g of c.own) g.dispose();
    }
    this.root.removeFromParent(); // shared geometries are never disposed
  }
}

export const mugProduct: ProductModel = {
  kind: 'mug',
  stages: MUG_STAGES,
  size: [2 * MUG_R + 14, 2 * MUG_R + 2, MUG_H],
  lineSize: 2 * PUCK_R + 8,
  shatter: {
    burst: [{ kind: 'crumb', count: 36 }, { kind: 'powder', count: 20 }],
    sounds: ['ceramic-shatter'],
    fragments: { role: 'sand', count: 12, size: 3 },
  },
  create: (job: Job, ctx: ProductCtx) => new MugHandle(job, ctx),
};
