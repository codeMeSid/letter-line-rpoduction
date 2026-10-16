import * as THREE from 'three';
import type { Looks } from '../engine/looks';
import type { ProductHandle } from '../engine/product';
import type { Job, Vec3 } from '../engine/types';
import { box, column, housing } from '../factories/shared/parts';
import type { Shelf } from './model';

const MARGIN = 12;   // plank overhang past the first/last slot
const GAP_X = 8;     // between neighbouring products
const PLANK = 4;
const BASE = 18;     // lowest plank top above the floor
const HEADROOM = 16;
const BACK = 14;     // each older (higher) row steps back (+y)

/**
 * 3D typewriter shelf. The newest row is the front, lowest plank; older rows rise and step back
 * (paper feed). Products sit on plank tops, reading +x. Shelved handles are owned here.
 */
export class ShelfView {
  readonly group = new THREE.Group();
  private planks = new THREE.Group();
  private placed = new Map<number, ProductHandle>();
  private drawnRows = -1;
  private readonly pitch: number;
  private readonly rowH: number;
  private readonly depth: number;

  constructor(parent: THREE.Object3D, private shelf: Shelf, private size: Vec3, private looks: Looks, private origin: Vec3) {
    parent.add(this.group);
    this.group.add(this.planks);
    this.pitch = size[0] + GAP_X;
    this.rowH = size[2] + HEADROOM + PLANK;
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
    if (job.isSpace) { h.dispose(); return; }
    h.place(1);
    this.group.add(h.root);
    this.placed.get(slotId)?.dispose();
    this.placed.set(slotId, h);
  }

  bounds(): { min: Vec3; max: Vec3 } {
    const n = Math.max(1, this.shelf.rows.length);
    const [ox, oy, oz] = this.origin;
    return {
      min: [ox, oy - this.depth / 2, oz],
      max: [ox + this.width, oy + (n - 1) * BACK + this.depth / 2, oz + BASE + (n - 1) * this.rowH + this.size[2]],
    };
  }

  update(dt: number): boolean {
    if (this.shelf.rows.length !== this.drawnRows) this.drawPlanks();
    const a = 1 - Math.exp(-dt * 8);
    let moving = false;
    for (const [id, h] of this.placed) {
      const slot = this.shelf.getSlot(id);
      if (!slot || slot.state !== 'filled') { h.dispose(); this.placed.delete(id); continue; }
      const t = this.slotPos(id)!;
      const p = h.root.position;
      p.lerp(new THREE.Vector3(...t), a);
      if (p.distanceToSquared(new THREE.Vector3(...t)) > 0.01) moving = true;
    }
    return moving;
  }

  restyle(): void { for (const h of this.placed.values()) h.restyle(); }

  destroy(): void {
    for (const h of this.placed.values()) h.dispose();
    this.placed.clear();
    this.clearPlanks();
    this.group.removeFromParent();
  }

  private level(row: number): number { return this.shelf.rows.length - 1 - row; }

  private cellPos(row: number, col: number): Vec3 {
    const L = this.level(row);
    const [ox, oy, oz] = this.origin;
    return [ox + MARGIN + (col + 0.5) * this.pitch, oy + L * BACK, oz + BASE + L * this.rowH];
  }

  private clearPlanks(): void {
    this.planks.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
    this.planks.clear();
  }

  private drawPlanks(): void {
    this.clearPlanks();
    const n = Math.max(1, this.shelf.rows.length);
    const [ox, oy, oz] = this.origin;
    for (let L = 0; L < n; L++) {
      const y = oy + L * BACK;
      const top = oz + BASE + L * this.rowH;
      const plank = housing(this.looks, this.width, this.depth, PLANK, 'wood', 1);
      plank.position.set(ox + this.width / 2, y, top - PLANK);
      this.planks.add(plank);
      for (const x of [ox + 3, ox + this.width / 2, ox + this.width - 3]) {
        const post = column(this.looks, 2, top - PLANK - oz, 'steel', 10);
        post.position.set(x, y + this.depth / 2 - 3, oz);
        this.planks.add(post);
      }
    }
    const foot = box(this.looks, this.width, 6, 3, 'steel');
    foot.position.set(ox + this.width / 2, oy + this.depth / 2 - 3, oz);
    this.planks.add(foot);
    this.drawnRows = this.shelf.rows.length;
  }
}
