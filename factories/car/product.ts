import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { letterGeometry } from '../../engine/letterSolid';
import type { ProductCtx, ProductHandle, ProductModel } from '../../engine/product';
import type { Job } from '../../engine/types';
import { CAR_STAGES, carVisual } from './visual';

export { CAR_STAGES };
export const TRAY_T = 3;       // pallet thickness under the car
export const CAR_H = 18;       // carton top over the product root on the shelf
const CAR_Z = 2.2;             // body floor above the tray top (wheel clearance)
const AXLE_Z = 3.2;
const WHEEL_X = 10;
const WHEEL_Y = 9.2;
const BOX_Z = 17 - TRAY_T;     // carton height above the tray

const HOT = new THREE.Color(0xff5a10);
const COLD = new THREE.Color(0xe9e6dc);
const BLACK = new THREE.Color(0x000000);
const tmp = new THREE.Color();
const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
const ss = (a: number, b: number, t: number) => smooth((t - a) / (b - a));

/** Livery colour from the typed character (deterministic). */
const livery = (ch: string, out: THREE.Color) => out.setHSL(((ch.codePointAt(0) ?? 0) * 0.137) % 1, 0.78, 0.5);

interface Shared {
  body: THREE.BufferGeometry; sprue: THREE.BufferGeometry; pellets: THREE.BufferGeometry; puddle: THREE.BufferGeometry;
  axle: THREE.BufferGeometry; tyres: THREE.BufferGeometry; hubs: THREE.BufferGeometry; glass: THREE.BufferGeometry;
  tray: THREE.BufferGeometry; trayBox: THREE.BufferGeometry; lid: THREE.BufferGeometry;
}
let shared: Shared | null = null;

const cyl = (r: number, len: number, seg = 18) => new THREE.CylinderGeometry(r, r, len, seg);
const lathe = (p: [number, number][]) => new THREE.LatheGeometry(p.map(([r, z]) => new THREE.Vector2(r, z)), 24).rotateX(Math.PI / 2);

/** Geometries shared by every car handle (never disposed). z-up, car centred on x/y, floor of the body at z 0 (content origin). */
function geoms(): Shared {
  if (shared) return shared;
  const rb = (w: number, d: number, h: number, x: number, z: number, r = 1.2) => new RoundedBoxGeometry(w, d, h, 3, r).translate(x, 0, z + h / 2);
  // Chassis, cabin, bonnet scoop, spoiler: one merged moulding.
  const body = mergeGeometries([rb(32, 15, 5, 0, CAR_Z), rb(13, 13, 4.6, -2, CAR_Z + 5, 1.6), rb(8, 11, 1.2, 10, CAR_Z + 5, 0.5), rb(3, 15, 1.4, -15, CAR_Z + 5.4, 0.5)])!;
  // Sprue stub and runner out of the tail gate.
  const sprue = mergeGeometries([cyl(1, 8).rotateZ(Math.PI / 2).translate(20, 0, CAR_Z + 2.5), cyl(2.6, 1.6).rotateZ(Math.PI / 2).translate(24.4, 0, CAR_Z + 2.5), cyl(1.1, 5).rotateX(Math.PI / 2).translate(22, 0, CAR_Z + 4.5)])!;
  const pellets = mergeGeometries(
    Array.from({ length: 34 }, (_, i) => {
      const a = i * 2.399, r = 1 + 7 * Math.sqrt(((i * 37) % 34) / 34); // golden-angle scatter
      return new THREE.SphereGeometry(0.9, 8, 6).translate(Math.cos(a) * r, Math.sin(a) * r * 0.8, 0.8 + 3.2 * (1 - r / 8));
    }),
  )!;
  const puddle = lathe([[0, 0], [10, 0], [10.5, 0.6], [8, 3.2], [4, 4.6], [0, 5]]);
  const axle = cyl(0.55, 1, 10); // unit length along y, scaled per handle
  const wheelAt = (g: THREE.BufferGeometry) => [-1, 1].flatMap((sx) => [-1, 1].map((sy) => g.clone().translate(sx * WHEEL_X, sy * WHEEL_Y, AXLE_Z)));
  const tyres = mergeGeometries(wheelAt(cyl(3.2, 2.4, 22)))!;
  const hubs = mergeGeometries(wheelAt(cyl(1.5, 2.8, 12)))!;
  const glass = mergeGeometries([rb(11, 11.2, 3.2, -2, CAR_Z + 5.6, 0.8), rb(0.6, 12.4, 2.6, 4.6, CAR_Z + 5.7, 0.2)])!;
  const tray = new RoundedBoxGeometry(40, 24, TRAY_T, 2, 1).translate(0, 0, TRAY_T / 2);
  const wall = (w: number, d: number, x: number, y: number) => new THREE.BoxGeometry(w, d, BOX_Z).translate(x, y, BOX_Z / 2);
  const trayBox = mergeGeometries([new THREE.BoxGeometry(38, 22, 0.8).translate(0, 0, 0.4), wall(38, 0.8, 0, -10.6), wall(38, 0.8, 0, 10.6), wall(0.8, 22, -18.6, 0), wall(0.8, 22, 18.6, 0)])!;
  const lid = new THREE.BoxGeometry(37, 21, 0.5).translate(0, 0, BOX_Z - 0.25);
  shared = { body, sprue, pellets, puddle, axle, tyres, hubs, glass, tray, trayBox, lid };
  return shared;
}

/** Raised glyph facing the viewer (-y), centred on (0, 0, 0). */
function glyphSolid(ch: string): THREE.BufferGeometry {
  const g = letterGeometry(ch, { height: 5, radius: 0.4 }).clone();
  const bb = g.boundingBox ?? (g.computeBoundingBox(), g.boundingBox!);
  return g.translate(-(bb.min.x + bb.max.x) / 2, 0, -(bb.min.z + bb.max.z) / 2);
}

class CarHandle implements ProductHandle {
  readonly root = new THREE.Group();
  private readonly bed = new THREE.Group();
  private readonly content = new THREE.Group();
  private stage: string = CAR_STAGES[0];
  private t = 0;
  private placed = 0;
  private plastic: THREE.Material | null = null;
  private readonly m: Record<'pellets' | 'puddle' | 'body' | 'sprue' | 'glass' | 'glyph' | 'box' | 'lid', THREE.Mesh> & Record<'axles' | 'wheels', THREE.Group> | null;
  private readonly glyphGeom: THREE.BufferGeometry | null;
  private readonly color = new THREE.Color();

  constructor(private readonly job: Job, private readonly ctx: ProductCtx) {
    const { looks } = ctx;
    const g = geoms();
    this.bed.name = 'bed';
    this.bed.add(looks.part(g.tray, 'steel'));
    this.content.position.z = TRAY_T;
    this.root.add(this.bed, this.content);
    if (job.isSpace) { this.m = null; this.glyphGeom = null; return; }
    livery(job.char, this.color);
    const plastic = looks.own('product');
    this.plastic = plastic;
    const own = (geom: THREE.BufferGeometry) => new THREE.Mesh(geom, plastic);
    const body = own(g.body);
    body.name = 'car';
    const axles = new THREE.Group();
    for (const sx of [-1, 1]) {
      const a = looks.part(g.axle, 'steel');
      a.position.set(sx * WHEEL_X, 0, AXLE_Z);
      axles.add(a);
    }
    const wheels = new THREE.Group();
    wheels.add(looks.part(g.tyres, 'rubber'), looks.part(g.hubs, 'steel'));
    this.glyphGeom = glyphSolid(job.char);
    const glyph = looks.part(this.glyphGeom, 'paint-accent');
    glyph.position.set(-2, -7.6, CAR_Z + 2.4);
    const box = looks.part(g.trayBox, 'wood');
    const lid = looks.part(g.lid, 'glass', false);
    this.m = {
      pellets: own(g.pellets), puddle: own(g.puddle), body, sprue: own(g.sprue), axles, wheels,
      glass: looks.part(g.glass, 'glass', false), glyph, box, lid,
    };
    this.content.add(...Object.values(this.m));
    this.shape(CAR_STAGES[0], 0);
  }

  shape(stage: string, t: number): void {
    this.stage = stage;
    this.t = t;
    const m = this.m;
    if (!m) return;
    const v = carVisual(stage, t);
    const on = (o: THREE.Object3D, s: number) => { o.visible = s > 0.01; o.scale.setScalar(Math.max(1e-3, s)); };
    on(m.pellets, v.pile * (1 - v.melt));
    on(m.puddle, v.pile * ss(0, 0.6, v.melt));
    m.body.visible = v.body > 0.01;
    m.body.scale.set(1, 1, Math.max(1e-3, v.body));
    on(m.sprue, v.sprue);
    m.axles.visible = v.axles > 0.01;
    m.axles.children.forEach((a) => a.scale.y = 20 * v.axles);
    m.wheels.visible = v.wheels > 0.01;
    m.wheels.position.z = 9 * (1 - smooth(v.wheels));
    m.glass.visible = v.paint > 0.6;
    m.glyph.visible = v.glyph > 0.01;
    m.glyph.scale.setScalar(Math.max(1e-3, v.glyph));
    m.box.visible = v.box > 0.01;
    m.box.scale.z = Math.max(1e-3, ss(0, 0.45, v.box));
    m.box.scale.x = m.box.scale.y = 1;
    m.lid.visible = v.box > 0.4;
    m.lid.position.z = 12 * (1 - ss(0.4, 1, v.box));
    // Plastic: pellet cream -> hot orange -> cold -> livery paint.
    const base = tmp.copy(COLD).lerp(this.color, v.paint);
    this.ctx.looks.appearance(this.plastic!, {
      color: base.lerp(HOT, v.heat * 0.85),
      emissive: tmp.copy(BLACK).lerp(HOT, v.heat),
      emissiveIntensity: 2.2 * v.heat,
      metalness: 0,
      roughness: 0.7 - 0.45 * v.paint,
    });
  }

  place(t: number): void {
    this.placed = t;
    this.bed.visible = t < 0.02;
    this.content.position.z = TRAY_T * (1 - smooth(t));
  }

  restyle(): void {
    const m = this.m;
    if (!m || !this.plastic) return;
    this.plastic.dispose();
    this.plastic = this.ctx.looks.own('product');
    for (const k of ['pellets', 'puddle', 'body', 'sprue'] as const) m[k].material = this.plastic;
    this.shape(this.stage, this.t);
    if (this.placed > 0) this.place(this.placed);
  }

  dispose(): void {
    this.plastic?.dispose();
    this.glyphGeom?.dispose();
    this.root.removeFromParent();
  }
}

export const carProduct: ProductModel = {
  kind: 'car',
  stages: CAR_STAGES,
  size: [40, 26, CAR_H],
  lineSize: 42,
  shatter: {
    burst: [{ kind: 'shard', count: 30 }, { kind: 'crumb', count: 20 }],
    sounds: ['plastic-crack'],
    fragments: { role: 'product', count: 10, size: 3 },
  },
  create: (job: Job, ctx: ProductCtx) => new CarHandle(job, ctx),
};
