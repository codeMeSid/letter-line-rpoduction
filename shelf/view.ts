import * as THREE from 'three';
import type { Looks } from '../engine/looks';
import type { ProductHandle } from '../engine/product';
import type { Job, Vec3 } from '../engine/types';
import { box, column, housing } from '../factories/shared/parts';
import type { Shelf } from './model';

const MARGIN = 12;   // plank overhang past the first/last slot
const GAP_X = 8;     // between neighbouring products
const PLANK = 4;
const BASE = 18;     // plank top above the floor (every row)
const ROW_PITCH = 40; // each older row steps back (+y, toward the robot) on the same level
/** ponytail: only the newest rows are shown (older handles are hidden, kept); forklift row shipping (later plan) replaces this window. */
const VISIBLE_ROWS = 3;

/**
 * 3D typewriter shelf as a flat tray (R24): the newest row is the front plank, older rows step back at the same
 * height, so the first line still reads above later ones on screen and the robot reaches over them. Products
 * stand on plank tops, reading +x. Shelved handles are owned here.
 */
export class ShelfView {
  readonly group = new THREE.Group();
  private planks = new THREE.Group();
  private placed = new Map<number, ProductHandle>();
  private drawnRows = -1;
  private readonly pitch: number;
  private readonly depth: number;

  constructor(parent: THREE.Object3D, private shelf: Shelf, private size: Vec3, private looks: Looks, private origin: Vec3) {
    parent.add(this.group);
    this.group.add(this.planks);
    this.pitch = size[0] + GAP_X;
    this.depth = size[1] + 14;
  }

  get width(): number { return MARGIN * 2 + this.shelf.cols * this.pitch; }

  setOrigin(o: Vec3): void { this.origin = o; this.drawnRows = -1; }

  slotPos(slotId: number): Vec3 | null {
    if (!this.shelf.getSlot(slotId)) return null;
    const { row, col } = this.shelf.slotPos(slotId);
    return this.cellPos(row, col);
  }

  span(): { x0: number; x1: number; y: number; z: number } {
    const [ox, oy, oz] = this.origin;
    return { x0: ox, x1: ox + this.width, y: oy, z: oz + BASE };
  }

  adopt(slotId: number, job: Job, h: ProductHandle | null): void {
    if (!h) return;
    if (job.isSpace) { this.drop(h); return; }
    h.place(1);
    this.group.add(h.root);
    const old = this.placed.get(slotId);
    if (old) this.drop(old);
    this.placed.set(slotId, h);
  }

  bounds(): { min: Vec3; max: Vec3 } {
    const n = this.shown();
    const [ox, oy, oz] = this.origin;
    return {
      min: [ox, oy - this.depth / 2, oz],
      max: [ox + this.width, oy + (n - 1) * ROW_PITCH + this.depth / 2, oz + BASE + this.size[2]],
    };
  }

  update(dt: number): boolean {
    if (this.shelf.rows.length !== this.drawnRows) this.drawPlanks();
    const a = 1 - Math.exp(-dt * 8);
    let moving = false;
    for (const [id, h] of this.placed) {
      const slot = this.shelf.getSlot(id);
      if (!slot || slot.state !== 'filled') { this.drop(h); this.placed.delete(id); continue; }
      h.root.visible = this.level(this.shelf.slotPos(id).row) < VISIBLE_ROWS;
      const t = this.slotPos(id)!;
      const p = h.root.position;
      p.lerp(new THREE.Vector3(...t), a);
      if (p.distanceToSquared(new THREE.Vector3(...t)) > 0.01) moving = true;
    }
    return moving;
  }

  restyle(): void { for (const h of this.placed.values()) h.restyle(); }

  destroy(): void {
    for (const h of this.placed.values()) this.drop(h);
    this.placed.clear();
    this.clearPlanks();
    this.group.removeFromParent();
  }

  /** dispose() then detach: handles do not remove themselves from their parent. */
  private drop(h: ProductHandle): void {
    h.dispose();
    h.root.removeFromParent();
  }

  private level(row: number): number { return this.shelf.rows.length - 1 - row; }

  /** Rows drawn (planks) and shown (handles): the newest VISIBLE_ROWS. */
  private shown(): number { return Math.min(VISIBLE_ROWS, Math.max(1, this.shelf.rows.length)); }

  private cellPos(row: number, col: number): Vec3 {
    const L = this.level(row);
    const [ox, oy, oz] = this.origin;
    // y: the product stands just in front of the plank (its back face flush with the plank's front face), so a descender below the plank top stays visible.
    return [ox + MARGIN + (col + 0.5) * this.pitch, oy + L * ROW_PITCH - this.depth / 2 - this.size[1] / 2, oz + BASE];
  }

  private clearPlanks(): void {
    this.planks.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
    this.planks.clear();
  }

  private drawPlanks(): void {
    this.clearPlanks();
    const n = this.shown();
    const [ox, oy, oz] = this.origin;
    const top = oz + BASE;
    for (let L = 0; L < n; L++) {
      const y = oy + L * ROW_PITCH;
      const plank = housing(this.looks, this.width, this.depth, PLANK, 'wood', 1);
      plank.position.set(ox + this.width / 2, y, top - PLANK);
      this.planks.add(plank);
      for (const x of [ox + 3, ox + this.width / 2, ox + this.width - 3]) {
        const post = column(this.looks, 2, top - PLANK - oz, 'steel', 10);
        post.position.set(x, y + this.depth / 2 - 3, oz);
        this.planks.add(post);
      }
      const foot = box(this.looks, this.width, 6, 3, 'steel');
      foot.position.set(ox + this.width / 2, y + this.depth / 2 - 3, oz);
      this.planks.add(foot);
    }
    this.drawnRows = this.shelf.rows.length;
  }
}
