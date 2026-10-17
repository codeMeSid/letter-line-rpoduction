import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../engine/looks';
import type { ProductHandle } from '../engine/product';
import type { Job } from '../engine/types';
import { Shelf } from './model';
import { ShelfView } from './view';

const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
const handle = (): ProductHandle & { disposed: boolean; placedT: number } => {
  const h = { root: new THREE.Group(), disposed: false, placedT: -1, shape() {}, place(t: number) { h.placedT = t; }, restyle() {}, dispose() { h.disposed = true; } };
  return h;
};
const job = (slotId: number, isSpace = false): Job => ({ id: slotId, slotId, char: 'a', isSpace, special: 'none', product: 'letter', stage: 'polished', phase: 'shelved', stationIndex: 6, progress: 1, pos: [0, 0, 0], defect: false, retries: 0 });

describe('ShelfView', () => {
  it('slots run +x along the front plank; new rows push older rows 40 back at the same height', () => {
    const shelf = new Shelf();
    const v = new ShelfView(new THREE.Group(), shelf, [26, 8, 32], looks, [0, -400, 0]);
    const a = shelf.reserve('char', 'a');
    const b = shelf.reserve('char', 'b');
    const pa = v.slotPos(a.slotId)!;
    const pb = v.slotPos(b.slotId)!;
    expect(pb[0]).toBeGreaterThan(pa[0]);
    expect(pa[1]).toBe(-415); // plank front (-400 - depth 22 / 2) - size[1] 8 / 2: the letter stands in front of the plank
    shelf.newline();
    shelf.reserve('char', 'c');
    const pa2 = v.slotPos(a.slotId)!;
    expect(pa2[2]).toBe(pa[2]);
    expect(pa2[1]).toBe(pa[1] + 40);
  });
  it('draws a plank group per row; a new row makes older planks glide back', () => {
    const shelf = new Shelf();
    const v = new ShelfView(new THREE.Group(), shelf, [26, 8, 32], looks, [0, -400, 0]);
    v.update(0);
    const first = shelf.rows[0];
    expect(v.rowEnd(first)![1]).toBe(-400);
    shelf.newline();
    v.update(1 / 60);
    const moved = v.rowEnd(first)![1] + 400;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(40);
    expect(v.rowEnd(shelf.rows[1])![1]).toBe(-400); // the new row appears in place at the front
    v.update(2);
    expect(v.rowEnd(first)![1]).toBeCloseTo(-360, 3);
    for (let r = 0; r < 3; r++) shelf.newline();
    v.update(0);
    expect(shelf.rows).toHaveLength(5);
    const planks = v.group.children.filter((o) => (o as THREE.Group).isGroup && o.children.some((c) => c.userData.role === 'wood'));
    expect(planks).toHaveLength(5); // every row is drawn: nothing is hidden any more
  });
  it('shows every row\'s products; a row that left the shelf loses its plank (geometry disposed)', () => {
    const shelf = new Shelf();
    const v = new ShelfView(new THREE.Group(), shelf, [26, 8, 32], looks, [0, -400, 0]);
    const hs = [0, 1, 2, 3].map((r) => {
      if (r) shelf.newline();
      const s = shelf.reserve('char', 'a');
      shelf.markFilled(s.slotId);
      const h = handle();
      v.adopt(s.slotId, job(s.slotId), h);
      return h;
    });
    v.update(1 / 60);
    expect(hs.map((h) => h.root.visible)).toEqual([true, true, true, true]);
    const oldest = shelf.rows[0];
    let disposed = 0;
    v.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.addEventListener('dispose', () => disposed++); });
    shelf.shipRow();
    v.update(1 / 60);
    expect(v.rowEnd(oldest)).toBeNull();
    expect(disposed).toBe(5); // plank, three posts and foot of the shipped row
  });
  it('releaseRow hands over the plank and its products undisposed', () => {
    const shelf = new Shelf();
    const v = new ShelfView(new THREE.Group(), shelf, [26, 8, 32], looks, [0, -400, 0]);
    const slots = ['a', 'b'].map((ch) => shelf.reserve('char', ch));
    shelf.newline();
    const c = shelf.reserve('char', 'c');
    const hs = [...slots, c].map((s) => {
      shelf.markFilled(s.slotId);
      const h = handle();
      v.adopt(s.slotId, job(s.slotId), h);
      return h;
    });
    v.update(1 / 60);
    const row0 = shelf.rows[0];
    const cBefore = v.slotPos(c.slotId);
    let disposed = 0;
    v.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.addEventListener('dispose', () => disposed++); });
    const load = v.releaseRow(row0)!;
    expect(load.handles).toEqual([hs[0], hs[1]]);
    expect(hs.slice(0, 2).every((h) => !h.disposed)).toBe(true);
    expect(hs[0].root.parent).toBe(load.group);
    expect(hs[1].root.parent).toBe(load.group);
    expect(load.group.parent).toBeNull();
    const woods = (root: THREE.Object3D) => { let n = 0; root.traverse((o) => { if (o.userData.role === 'wood') n++; }); return n; };
    expect(woods(load.group)).toBe(1);
    expect(woods(v.group)).toBe(1); // only the second row's plank is left in the view
    expect(v.slotPos(c.slotId)).toEqual(cBefore);
    expect(hs[2].root.parent).toBe(v.group);
    v.update(1 / 60); // between release and shipRow the view must not redraw the released row
    expect(woods(v.group)).toBe(1);
    expect(v.rowEnd(row0)).toBeNull();
    expect(v.releaseRow(row0)).toBeNull();
    expect(v.release(slots[0].slotId)).toBeNull(); // the products left with the load
    shelf.shipRow();
    v.update(1 / 60);
    expect(disposed).toBe(0); // the view never disposes what it handed over
  });
  it('rowEnd is the plank +x end at plank top', () => {
    const shelf = new Shelf();
    const v = new ShelfView(new THREE.Group(), shelf, [26, 8, 32], looks, [100, -400, 5]);
    shelf.reserve('char', 'a');
    expect(v.rowEnd(shelf.rows[0])).toEqual([100 + v.width, -400, 5 + 18]);
    expect(v.rowEnd([])).toBeNull(); // unknown row
    v.setOrigin([40, -300, 0]);
    v.update(0);
    expect(v.rowEnd(shelf.rows[0])).toEqual([40 + v.width, -300, 18]); // planks rebuilt snapped at the new origin
  });
  it('with 4 rows (3 kept + the one the forklift is fetching) every plank and post stays behind the robot rail centre line (span.y + 150)', () => {
    const shelf = new Shelf();
    const v = new ShelfView(new THREE.Group(), shelf, [26, 8, 32], looks, [0, -400, 0]);
    for (let r = 0; r < 4; r++) {
      if (r) shelf.newline();
      shelf.reserve('char', 'a');
    }
    expect(shelf.rows).toHaveLength(4);
    v.update(0);
    v.group.updateMatrixWorld(true);
    const limit = v.span().y + 150; // robot rail; the carriage face (limit - 20) is only grazed by 1 unit, at floor level below the carriage
    let n = 0;
    v.group.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      n++;
      expect(new THREE.Box3().setFromObject(o).max.y).toBeLessThan(limit);
    });
    expect(n).toBe(4 * 5); // a plank, three posts and a foot per row
  });
  it('row 0 slots stand just in front of the plank (back face flush with its front face)', () => {
    const shelf = new Shelf();
    const v = new ShelfView(new THREE.Group(), shelf, [26, 8, 32], looks, [0, -400, 0]);
    const s = shelf.reserve('char', 'a');
    const plankFrontY = v.bounds().min[1];
    expect(v.slotPos(s.slotId)![1]).toBeCloseTo(plankFrontY - 8 / 2, 6);
  });
  it('adopt places the product, damps it to its slot, disposes on removal; spaces are disposed', () => {
    const shelf = new Shelf();
    const v = new ShelfView(new THREE.Group(), shelf, [26, 8, 32], looks, [0, -400, 0]);
    const s = shelf.reserve('char', 'a');
    shelf.markFilled(s.slotId);
    const h = handle();
    v.adopt(s.slotId, job(s.slotId), h);
    expect(h.placedT).toBe(1);
    for (let i = 0; i < 200; i++) v.update(1 / 60);
    const want = v.slotPos(s.slotId)!;
    expect(h.root.position.distanceTo(new THREE.Vector3(...want))).toBeLessThan(0.05);
    shelf.remove(s.slotId);
    v.update(1 / 60);
    expect(h.disposed).toBe(true);
    expect(h.root.parent).toBeNull();
    const sp = shelf.reserve('space', '');
    const hs = handle();
    new THREE.Group().add(hs.root); // the host parks in-flight handles under its products group
    v.adopt(sp.slotId, job(sp.slotId, true), hs);
    expect(hs.disposed).toBe(true);
    expect(hs.root.parent).toBeNull();
  });
  it('re-adopting a slot disposes and detaches the old handle; destroy disposes and detaches all', () => {
    const shelf = new Shelf();
    const v = new ShelfView(new THREE.Group(), shelf, [26, 8, 32], looks, [0, -400, 0]);
    const s = shelf.reserve('char', 'a');
    shelf.markFilled(s.slotId);
    const h1 = handle();
    const h2 = handle();
    v.adopt(s.slotId, job(s.slotId), h1);
    v.adopt(s.slotId, job(s.slotId), h2);
    expect(h1.disposed).toBe(true);
    expect(h1.root.parent).toBeNull();
    expect(h2.disposed).toBe(false);
    v.destroy();
    expect(h2.disposed).toBe(true);
    expect(h2.root.parent).toBeNull();
  });
  it('release hands the handle to the caller: a dying slot no longer disposes it; a second release is null', () => {
    const shelf = new Shelf();
    const v = new ShelfView(new THREE.Group(), shelf, [26, 8, 32], looks, [0, -400, 0]);
    const s = shelf.reserve('char', 'a');
    shelf.markFilled(s.slotId);
    const h = handle();
    v.adopt(s.slotId, job(s.slotId), h);
    expect(v.release(s.slotId)).toBe(h);
    shelf.markDying(s.slotId);
    v.update(1 / 60);
    expect(h.disposed).toBe(false);
    expect(v.release(s.slotId)).toBeNull();
  });
  it('span covers the plank width at the front row', () => {
    const v = new ShelfView(new THREE.Group(), new Shelf(), [26, 8, 32], looks, [100, -400, 0]);
    const s = v.span();
    expect(s.x0).toBe(100);
    expect(s.x1).toBeCloseTo(100 + v.width, 6);
    expect(s.y).toBe(-400);
  });
});
