import * as THREE from 'three';
import type { Looks } from '../engine/looks';
import type { ProductHandle } from '../engine/product';
import type { Job, Vec3 } from '../engine/types';
import { box, column, disposeTree, housing } from '../factories/shared/parts';
import { SHELF_COLS, type Shelf, type Slot } from './model';

const MARGIN = 12;   // plank overhang past the first/last slot
const GAP_X = 8;     // between neighbouring products
const PLANK = 4;
const BASE = 18;     // plank top above the floor (every row)
const ROW_PITCH = 40; // each older row steps back (+y, toward the robot) on the same level

/** Plank length for a product slot size (MARGIN both ends + one pitch per column). */
export const shelfWidth = (size: Vec3, cols = SHELF_COLS): number => MARGIN * 2 + cols * (size[0] + GAP_X);

/**
 * 3D typewriter shelf as a flat tray (R24): the newest row is the front plank, older rows step back at the same
 * height, so the first line still reads above later ones on screen and the robot reaches over them. Products
 * stand on plank tops, reading +x. Shelved handles are owned here. Every row has its own plank group (keyed by the
 * model's row array, which keeps its identity until the forklift ships it); adding a row makes the older planks glide back.
 */
export class ShelfView {
  readonly group = new THREE.Group();
  /** One group per row, origin = the plank's x/z origin and its current (damped) y. */
  private rowGroups = new Map<Slot[], THREE.Group>();
  /** Rows handed to the forklift: gone from the view but still in the model until `shipRow`. */
  private released = new WeakSet<Slot[]>();
  private placed = new Map<number, ProductHandle>();
  private readonly end: Vec3 = [0, 0, 0];
  private readonly pitch: number;
  private readonly depth: number;

  constructor(parent: THREE.Object3D, private shelf: Shelf, private size: Vec3, private looks: Looks, private origin: Vec3) {
    parent.add(this.group);
    this.pitch = size[0] + GAP_X;
    this.depth = size[1] + 14;
  }

  get width(): number { return shelfWidth(this.size, this.shelf.cols); }

  /** The planks are rebuilt snapped at the new origin on the next update/rowEnd. */
  setOrigin(o: Vec3): void { this.origin = o; this.clearPlanks(); }

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

  /** Hand a shelved product to an fx (shotgun): no longer owned or damped here; the caller disposes it. */
  release(slotId: number): ProductHandle | null {
    const h = this.placed.get(slotId) ?? null;
    this.placed.delete(slotId);
    return h;
  }

  /** Forklift: hand over a row's plank and its products (world transforms kept); this view forgets them. */
  releaseRow(row: Slot[]): { group: THREE.Group; handles: ProductHandle[] } | null {
    const plank = this.rowGroups.get(row);
    if (!plank) return null;
    const load = new THREE.Group();
    this.group.add(load);
    load.attach(plank);
    this.rowGroups.delete(row);
    this.released.add(row);
    const handles: ProductHandle[] = [];
    for (const s of row) {
      const h = this.placed.get(s.id);
      if (!h) continue;
      this.placed.delete(s.id);
      load.attach(h.root);
      handles.push(h);
    }
    load.removeFromParent();
    return { group: load, handles };
  }

  /**
   * The +x end of a row's plank at its top (plank centre line y, damped like the plank itself), or null when the row
   * has no plank here (unknown, shipped or released). The returned tuple is reused: copy it, do not keep it.
   */
  rowEnd(row: Slot[]): Vec3 | null {
    this.syncRows();
    const g = this.rowGroups.get(row);
    if (!g) return null;
    const [ox, , oz] = this.origin;
    this.end[0] = ox + this.width;
    this.end[1] = g.position.y;
    this.end[2] = oz + BASE;
    return this.end;
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
    this.syncRows();
    const a = 1 - Math.exp(-dt * 8);
    let moving = false;
    const rows = this.shelf.rows;
    const oy = this.origin[1];
    for (let r = 0; r < rows.length; r++) {
      const g = this.rowGroups.get(rows[r]);
      if (!g) continue;
      const dy = oy + this.level(r) * ROW_PITCH - g.position.y;
      if (Math.abs(dy) > 0.01) { g.position.y += dy * a; moving = true; } else g.position.y += dy;
    }
    for (const [id, h] of this.placed) {
      const slot = this.shelf.getSlot(id);
      if (!slot || slot.state !== 'filled') { this.drop(h); this.placed.delete(id); continue; }
      const t = this.slotPos(id)!;
      const p = h.root.position;
      p.x += (t[0] - p.x) * a;
      p.y += (t[1] - p.y) * a;
      p.z += (t[2] - p.z) * a;
      const dx = t[0] - p.x;
      const dy = t[1] - p.y;
      const dz = t[2] - p.z;
      if (dx * dx + dy * dy + dz * dz > 0.01) moving = true;
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

  /** Every row is drawn; the forklift keeps their number down. */
  private shown(): number { return Math.max(1, this.shelf.rows.length); }

  private cellPos(row: number, col: number): Vec3 {
    const L = this.level(row);
    const [ox, oy, oz] = this.origin;
    // y: the product stands just in front of the plank (its back face flush with the plank's front face), so a descender below the plank top stays visible.
    return [ox + MARGIN + (col + 0.5) * this.pitch, oy + L * ROW_PITCH - this.depth / 2 - this.size[1] / 2, oz + BASE];
  }

  private clearPlanks(): void {
    for (const g of this.rowGroups.values()) disposeTree(g);
    this.rowGroups.clear();
  }

  /** Drop the planks of rows that left the shelf (not released ones: they are the forklift's), build planks for new rows in place. */
  private syncRows(): void {
    const rows = this.shelf.rows;
    for (const [row, g] of this.rowGroups) {
      if (!rows.includes(row)) { disposeTree(g); this.rowGroups.delete(row); }
    }
    const [ox, oy, oz] = this.origin;
    for (let r = 0; r < rows.length; r++) {
      if (this.rowGroups.has(rows[r]) || this.released.has(rows[r])) continue;
      const g = this.buildPlank();
      g.position.set(ox, oy + this.level(r) * ROW_PITCH, oz);
      this.group.add(g);
      this.rowGroups.set(rows[r], g);
    }
  }

  /** One row's plank, three posts and foot, in the row's local frame (origin = plank x start / centre line y / floor z). */
  private buildPlank(): THREE.Group {
    const g = new THREE.Group();
    const plank = housing(this.looks, this.width, this.depth, PLANK, 'wood', 1);
    plank.position.set(this.width / 2, 0, BASE - PLANK);
    g.add(plank);
    for (const x of [3, this.width / 2, this.width - 3]) {
      const post = column(this.looks, 2, BASE - PLANK, 'steel', 10);
      post.position.set(x, this.depth / 2 - 3, 0);
      g.add(post);
    }
    const foot = box(this.looks, this.width, 6, 3, 'steel');
    foot.position.set(this.width / 2, this.depth / 2 - 3, 0);
    g.add(foot);
    return g;
  }
}
