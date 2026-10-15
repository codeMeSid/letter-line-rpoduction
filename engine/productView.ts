import { hl, type Projector } from '@/lib/hl';
import type { ProductRenderer } from './product';
import type { LetterMarks } from './settings';
import type { Job, Vec3 } from './types';

/**
 * One `<g>` per job. Drawn once at world origin by the factory's ProductRenderer and moved with a
 * translate (Global Constraint 4); redrawn only when the job's stage or the letter marks change.
 */
export class ProductView {
  readonly g: SVGGElement;
  private drawnKey = '';
  private lastT = '';

  constructor(parent: Element, private renderer: ProductRenderer, readonly job: Job, private P: Projector) {
    this.g = hl().mk('g', { 'data-job': job.id }, parent);
  }

  /** Redraw if needed and move to `pos` (defaults to job.pos). */
  sync(marks: LetterMarks, pos: Vec3 = this.job.pos): void {
    const key = `${this.job.stage}|${marks.emboss ? 1 : 0}${marks.label ? 1 : 0}${marks.cap ? 1 : 0}${marks.shape ? 1 : 0}`;
    if (key !== this.drawnKey) {
      this.g.replaceChildren();
      this.renderer.draw(this.g, this.job, marks, this.P);
      this.drawnKey = key;
    }
    const [sx, sy] = this.P(pos[0], pos[1], pos[2]);
    const [ox, oy] = this.P(0, 0, 0);
    const t = `translate(${Math.round((sx - ox) * 100) / 100} ${Math.round((sy - oy) * 100) / 100})`;
    if (t !== this.lastT) {
      this.g.setAttribute('transform', t);
      this.lastT = t;
    }
  }

  /** Move the group under another parent (e.g. from the factory into the shelf layer). */
  reparent(parent: Element): void {
    parent.appendChild(this.g);
  }

  destroy(): void {
    this.g.remove();
  }
}
