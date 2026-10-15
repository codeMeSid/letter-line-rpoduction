import { hl, type Cam, type Projector, type Spring } from '@/lib/hl';
import { ProductView } from '../engine/productView';
import type { ProductRenderer } from '../engine/product';
import type { LetterMarks } from '../engine/settings';
import type { Job, Vec3 } from '../engine/types';
import type { Shelf } from './model';

const MARGIN = 10;   // plank overhang past the first/last slot
const GAP_X = 6;     // between neighbouring products
const THICK = 4;     // plank thickness
const BASE = 14;     // bottom plank top above the floor
const HEADROOM = 14; // between a product top and the plank above
const BACK = 12;     // each higher plank steps back (bleacher) so lower rows never hide upper ones

interface Placed { view: ProductView; sp: [Spring, Spring, Spring] }

/**
 * Draws one factory's shelf: plank solids with end brackets, products at their slots.
 * Row 0 is the top plank; each new row adds a plank below the text and the older rows rise
 * (paper feed), growing the shelf upward/backward. Space slots show nothing; debris slots get an
 * empty `<g>` that Task 8 fills (`debrisGroup`).
 */
export class ShelfView {
  readonly g: SVGGElement;
  /** products arriving (placement arc) paint here: above planks, below shelved products */
  readonly incoming: SVGGElement;
  private planks: SVGGElement;
  private products: SVGGElement;
  private placed = new Map<number, Placed>();
  private debris = new Map<number, SVGGElement>();
  private drawnRows = -1;
  private readonly pitch: number;
  private readonly rowH: number;
  private readonly depth: number;

  constructor(
    parent: Element,
    private shelf: Shelf,
    private renderer: ProductRenderer,
    private C: Cam,
    private P: Projector,
    private origin: Vec3,
  ) {
    const HL = hl();
    this.g = HL.mk('g', { 'data-shelf': renderer.kind }, parent);
    this.planks = HL.mk('g', {}, this.g);
    this.incoming = HL.mk('g', {}, this.g);
    this.products = HL.mk('g', {}, this.g);
    const [sx, sy, sz] = renderer.size;
    this.pitch = sx + GAP_X;
    this.rowH = sz + HEADROOM;
    this.depth = sy + 8;
  }

  get width(): number {
    return MARGIN * 2 + this.shelf.cols * this.pitch;
  }

  setOrigin(o: Vec3): void {
    this.origin = o;
    this.drawnRows = -1; // force plank rebuild
  }

  /** World point where the product of `slotId` sits (on its plank), or null if the slot is gone. */
  slotPos(slotId: number): Vec3 | null {
    if (!this.shelf.getSlot(slotId)) return null;
    const { row, col } = this.shelf.slotPos(slotId);
    return this.cellPos(row, col);
  }

  /** Take over a finished product (its view from the line, or a fresh one if it was never drawn). */
  adopt(slotId: number, job: Job, view: ProductView | null): void {
    if (job.isSpace) { view?.destroy(); return; } // space slots show nothing
    const v = view ?? new ProductView(this.products, this.renderer, job, this.P);
    v.reparent(this.products);
    const HL = hl();
    const at = job.pos;
    this.placed.get(slotId)?.view.destroy();
    this.placed.set(slotId, { view: v, sp: [HL.spring(at[0]), HL.spring(at[1]), HL.spring(at[2])] });
  }

  debrisGroup(slotId: number): SVGGElement | null {
    return this.debris.get(slotId) ?? null;
  }

  bounds(): { min: Vec3; max: Vec3 } {
    const n = this.shelf.rows.length;
    const [ox, oy, oz] = this.origin;
    return {
      min: [ox, oy - (n - 1) * BACK - this.depth / 2, oz],
      max: [ox + this.width, oy + this.depth / 2, oz + BASE + (n - 1) * this.rowH + this.renderer.size[2]],
    };
  }

  /** Sync with the model: planks on row-count change, product positions (sprung), debris groups. */
  update(dt: number, marks: LetterMarks): boolean {
    const HL = hl();
    if (this.shelf.rows.length !== this.drawnRows) this.drawPlanks();
    let moving = false;
    const live = new Set<number>();
    this.shelf.rows.forEach((row, r) => row.forEach((slot, c) => {
      live.add(slot.id);
      const target = this.cellPos(r, c);
      const p = this.placed.get(slot.id);
      if (p && slot.state === 'filled') {
        const pos = p.sp.map((s, i) => {
          s.t = target[i];
          if (HL.stepS(s, dt)) moving = true;
          return s.x;
        }) as Vec3;
        p.view.sync(marks, pos);
      }
      if (slot.state === 'debris') {
        let d = this.debris.get(slot.id);
        if (!d) this.debris.set(slot.id, (d = HL.mk('g', { 'data-debris': slot.id }, this.products)));
        const [sx, sy] = this.P(...target);
        const [ox, oy] = this.P(0, 0, 0);
        d.setAttribute('transform', `translate(${HL.r2(sx - ox)} ${HL.r2(sy - oy)})`);
      }
    }));
    for (const [id, p] of this.placed) {
      const s = this.shelf.getSlot(id);
      if (!live.has(id) || s?.state !== 'filled') { p.view.destroy(); this.placed.delete(id); }
    }
    for (const [id, d] of this.debris) if (!live.has(id)) { d.remove(); this.debris.delete(id); }
    return moving;
  }

  destroy(): void {
    this.g.remove();
    this.placed.clear();
    this.debris.clear();
  }

  private level(row: number): number {
    return this.shelf.rows.length - 1 - row;
  }

  private cellPos(row: number, col: number): Vec3 {
    const L = this.level(row);
    const [ox, oy, oz] = this.origin;
    return [ox + MARGIN + (col + 0.5) * this.pitch, oy - L * BACK, oz + BASE + L * this.rowH];
  }

  private drawPlanks(): void {
    const HL = hl();
    const front = HL.facing(this.C);
    this.planks.replaceChildren();
    const n = this.shelf.rows.length;
    const [ox, oy, oz] = this.origin;
    const x0 = ox;
    const x1 = ox + this.width;
    const hd = this.depth / 2;
    const box = (u0: number, v0: number, u1: number, v1: number, z0: number, z1: number) => {
      const [ring, inner] = HL.rings(u0, v0, u1, v1, 1.5, 1);
      HL.put(HL.solid(this.planks), HL.prism(this.P, front, ring, inner, z0, z1));
    };
    // Back (top) level first: higher planks sit further back, so this is back-to-front paint order.
    for (let L = n - 1; L >= 0; L--) {
      const y = oy - L * BACK;
      const top = oz + BASE + L * this.rowH;
      box(x0 + 2, y - hd + 2, x0 + 6, y - hd + 6, oz, top - THICK); // brackets (back corners)
      box(x1 - 6, y - hd + 2, x1 - 2, y - hd + 6, oz, top - THICK);
      box(x0, y - hd, x1, y + hd, top - THICK, top);
    }
    this.drawnRows = n;
  }
}
