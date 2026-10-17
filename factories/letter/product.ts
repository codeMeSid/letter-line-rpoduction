import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLYPH_BASE } from '../../engine/glyphs';
import { letterGeometry } from '../../engine/letterSolid';
import type { ProductCtx, ProductHandle, ProductModel } from '../../engine/product';
import type { Job } from '../../engine/types';
import { LETTER_STAGES, letterVisual } from './visual';

export { LETTER_STAGES };
export const LETTER_H = 26;
export const LETTER_R = 2.3;
export const PALLET = 46;
export const PALLET_T = 3;
const SAND_H = 14;
export const SAND_TOP = PALLET_T + SAND_H; // 17
const FLASK_H = 16;
const FLASK_W = 3;
/** Upright shelf pose: shifts the letter down so its baseline strokes rest on z = 0 (R3). */
const BASE_Z = (1 - GLYPH_BASE) * LETTER_H - LETTER_R;
const SOLID = { height: LETTER_H, radius: LETTER_R };
const FLASH = { height: LETTER_H, radius: LETTER_R * 1.7 };

const IRON = new THREE.Color(0x45474b);
const STEEL = new THREE.Color(0x8d9198);
const CHROME = new THREE.Color(0xe9ecf0);
const WHITE_HOT = new THREE.Color(0xff8c20);
const ORANGE = new THREE.Color(0xff4400);
const RED = new THREE.Color(0x9a1800);
const BLACK = new THREE.Color(0x000000);
/** Emissive gain at white heat (bloom input). */
const GLOW = 3;
const tmp = new THREE.Color();
const tmpV = new THREE.Vector3();
const tmpE = new THREE.Color();

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

function heatColor(h: number, out: THREE.Color): THREE.Color {
  if (h > 0.66) return out.copy(ORANGE).lerp(WHITE_HOT, (h - 0.66) / 0.34);
  if (h > 0.33) return out.copy(RED).lerp(ORANGE, (h - 0.33) / 0.33);
  return out.copy(BLACK).lerp(RED, h / 0.33);
}

let shared: { pallet: THREE.BufferGeometry; half: THREE.BufferGeometry; sand: THREE.BufferGeometry; sprue: THREE.BufferGeometry } | null = null;
/** Geometries shared by every letter handle (never disposed). */
function geoms() {
  if (shared) return shared;
  const s = PALLET / 2;
  const wall = (w: number, d: number, x: number, y: number) => new THREE.BoxGeometry(w, d, FLASK_H).translate(x, y, PALLET_T + FLASK_H / 2);
  // left half of the flask: the -x wall plus half of the front and back walls (U shape opening toward +x)
  const walls = [wall(FLASK_W, PALLET, -s + FLASK_W / 2, 0), wall(s, FLASK_W, -s / 2, s - FLASK_W / 2), wall(s, FLASK_W, -s / 2, -s + FLASK_W / 2)];
  const half = mergeGeometries(walls, false)!;
  for (const w of walls) w.dispose();
  shared = {
    pallet: new THREE.BoxGeometry(PALLET, PALLET, PALLET_T).translate(0, 0, PALLET_T / 2),
    half,
    sand: new THREE.BoxGeometry(PALLET - 2 * FLASK_W, PALLET - 2 * FLASK_W, SAND_H).translate(0, 0, SAND_H / 2),
    // horizontal stub along -x from its attach point (letter-upright coords)
    sprue: new THREE.CylinderGeometry(LETTER_R * 1.3, LETTER_R * 1.6, 8, 12).rotateZ(Math.PI / 2).translate(-4, 0, 0),
  };
  return shared;
}

/** Everything a non-space job has beyond the pallet. */
interface Casting {
  flaskL: THREE.Mesh;
  flaskR: THREE.Mesh;
  sand: THREE.Mesh;
  cavity: THREE.Mesh;
  letter: THREE.Group;
  metal: THREE.Mesh;
  flash: THREE.Mesh;
  sprue: THREE.Mesh;
  mat: THREE.Material;
  /** World-space fill plane (normal −y: keeps y ≤ level), shared by every own() material. */
  plane: THREE.Plane;
  minZ: number;
  zMid: number;
  hz: number;
}

class LetterHandle implements ProductHandle {
  readonly root = new THREE.Group();
  private readonly bed = new THREE.Group();
  private readonly c: Casting | null;
  private stage: string = LETTER_STAGES[0];
  private t = 0;
  private placed = 0;

  constructor(job: Job, private readonly ctx: ProductCtx) {
    const { looks } = ctx;
    const g = geoms();
    this.bed.name = 'bed';
    this.bed.add(looks.part(g.pallet, 'steel'));
    this.root.add(this.bed);
    if (job.isSpace) {
      this.c = null;
      return;
    }
    const solid = letterGeometry(job.char, SOLID);
    const bb = solid.boundingBox!;
    const flaskL = looks.part(g.half, 'paint-accent');
    const flaskR = looks.part(g.half, 'paint-accent');
    flaskR.scale.x = -1;
    const sand = looks.part(g.sand, 'sand');
    sand.position.z = PALLET_T;
    const cavity = looks.part(solid, 'rubber', false);
    cavity.rotation.x = -Math.PI / 2;
    this.bed.add(flaskL, flaskR, sand, cavity);

    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
    const mat = this.ownMaterial(plane);
    const metal = new THREE.Mesh(solid, mat);
    metal.name = 'metal';
    const flash = new THREE.Mesh(letterGeometry(job.char, FLASH), mat);
    flash.name = 'flash';
    flash.scale.y = 0.22;
    const sprue = new THREE.Mesh(g.sprue, mat);
    sprue.name = 'sprue';
    const zMid = (bb.min.z + bb.max.z) / 2;
    // Attach at the leftmost vertex's height (x/z), seated one radius inside the stroke, so the stub always touches a stroke.
    const pos = solid.getAttribute('position');
    let left = 0;
    for (let i = 1; i < pos.count; i++) if (pos.getX(i) < pos.getX(left)) left = i;
    sprue.position.set(pos.getX(left) + LETTER_R, 0, pos.getZ(left)); // sticks out of the letter's left side
    for (const m of [metal, flash, sprue]) m.castShadow = m.receiveShadow = true;
    const letter = new THREE.Group();
    letter.name = 'letter';
    letter.add(metal, sprue); // flash joins in shape() once the letter is full
    this.root.add(letter);
    this.c = { flaskL, flaskR, sand, cavity, letter, metal, flash, sprue, mat, plane, minZ: bb.min.z, zMid, hz: bb.max.z - bb.min.z };
    this.shape(LETTER_STAGES[0], 0); // never show the finished state before the first shape() call
  }

  private ownMaterial(plane: THREE.Plane): THREE.Material {
    const mat = this.ctx.looks.own('product');
    mat.clippingPlanes = [plane];
    mat.clipShadows = true; // shadows follow the fill plane too
    return mat;
  }

  shape(stage: string, t: number): void {
    this.stage = stage;
    this.t = t;
    const c = this.c;
    if (!c) return;
    const v = letterVisual(stage, t);

    // The sand slumps to a pad as the casting is knocked out, then drains away entirely (sandLeft 0.2 → 0).
    const sandH = v.sand * (0.15 + 0.85 * v.sandLeft) * Math.min(1, v.sandLeft / 0.2);
    c.sand.visible = sandH > 0.01;
    c.sand.scale.set(0.6 + 0.4 * v.sandLeft, 0.6 + 0.4 * v.sandLeft, Math.max(1e-3, sandH));
    c.cavity.scale.set(v.cavity, 0.15, v.cavity);
    c.cavity.position.set(0, -c.zMid * v.cavity, SAND_TOP - 0.25);
    c.cavity.visible = v.cavity > 0.01 && v.sandLeft > 0.5 && v.fill < 1;
    c.flaskL.position.x = -26 * v.flaskOpen;
    c.flaskR.position.x = 26 * v.flaskOpen;
    c.flaskL.visible = c.flaskR.visible = v.flaskOpen < 0.98;

    if (this.placed === 0) {
      c.letter.rotation.x = -Math.PI / 2;
      c.letter.position.y = -c.zMid;
      c.letter.position.z = THREE.MathUtils.lerp(PALLET_T + LETTER_R, SAND_TOP - 0.4 * LETTER_R, v.sandLeft);
    }
    c.metal.visible = v.fill > 0;
    // Attached only while shown: Box3.setFromObject ignores visibility, and the fat flash would otherwise inflate the letter's bounds (R3).
    const flashOn = v.rough > 0.01 && v.fill >= 1;
    if (flashOn !== (c.flash.parent === c.letter)) {
      if (flashOn) c.letter.add(c.flash);
      else c.letter.remove(c.flash);
    }
    c.flash.scale.y = 0.22 * v.rough;
    c.sprue.visible = v.rough > 0.01 && v.fill > 0;
    c.sprue.scale.setScalar(v.rough);

    // Fill level in world y (flat pose: the letter's bottom edge is its lowest y).
    const y0 = this.root.getWorldPosition(tmpV).y + c.letter.position.y + c.minZ;
    c.plane.constant = v.fill >= 1 ? 1e6 : y0 + v.fill * c.hz;

    const hot = v.fill > 0 ? v.heat : 0;
    const color = v.polish > 0 ? tmp.copy(STEEL).lerp(CHROME, v.polish) : tmp.copy(STEEL).lerp(IRON, v.rough);
    this.ctx.looks.appearance(c.mat, {
      color,
      emissive: heatColor(hot, tmpE),
      emissiveIntensity: GLOW * hot,
      metalness: 0.5 + 0.5 * v.polish,
      roughness: v.polish > 0 ? THREE.MathUtils.lerp(0.45, 0.1, v.polish) : THREE.MathUtils.lerp(0.45, 0.85, v.rough),
    });
  }

  place(t: number): void {
    this.placed = t;
    this.bed.visible = t <= 0.02;
    const c = this.c;
    if (!c) return;
    const e = smooth(t);
    c.letter.rotation.x = (-Math.PI / 2) * (1 - e);
    c.letter.position.y = -c.zMid * (1 - e);
    c.letter.position.z = (PALLET_T + LETTER_R) * (1 - e) - BASE_Z * e;
  }

  restyle(): void {
    const c = this.c;
    if (c) {
      const old = c.mat;
      c.mat = this.ownMaterial(c.plane);
      c.metal.material = c.flash.material = c.sprue.material = c.mat;
      old.dispose();
    }
    this.shape(this.stage, this.t);
    if (this.placed > 0) this.place(this.placed);
  }

  dispose(): void {
    this.c?.mat.dispose();
    this.root.removeFromParent(); // shared / cached geometries are never disposed
  }
}

export const letterProduct: ProductModel = {
  kind: 'letter',
  stages: LETTER_STAGES,
  size: [Math.ceil(0.7 * LETTER_H + 2 * LETTER_R), 2 * LETTER_R, LETTER_H + 2 * LETTER_R], // y = exact thickness: the shelf stands the back face flush with the plank front
  lineSize: PALLET,
  shatter: {
    burst: [{ kind: 'spark', count: 36 }, { kind: 'smoke', count: 6 }],
    sounds: ['metal-crumple'],
    fragments: { role: 'steel', count: 9, size: 3.2 },
  },
  create: (job: Job, ctx: ProductCtx) => new LetterHandle(job, ctx),
};
