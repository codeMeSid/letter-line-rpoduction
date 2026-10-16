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
  it('slots run +x along the front plank; new rows push older rows up and back', () => {
    const shelf = new Shelf();
    const v = new ShelfView(new THREE.Group(), shelf, [26, 8, 32], looks, [0, -400, 0]);
    const a = shelf.reserve('char', 'a');
    const b = shelf.reserve('char', 'b');
    const pa = v.slotPos(a.slotId)!;
    const pb = v.slotPos(b.slotId)!;
    expect(pb[0]).toBeGreaterThan(pa[0]);
    expect(pa[1]).toBe(-407); // plank front (-400 - depth 22 / 2) + size[1] 8 / 2
    shelf.newline();
    shelf.reserve('char', 'c');
    const pa2 = v.slotPos(a.slotId)!;
    expect(pa2[2]).toBeGreaterThan(pa[2]);
    expect(pa2[1]).toBeGreaterThan(pa[1]);
  });
  it('row 0 slots sit at the plank front edge so descenders hang over the ledge', () => {
    const shelf = new Shelf();
    const v = new ShelfView(new THREE.Group(), shelf, [26, 8, 32], looks, [0, -400, 0]);
    const s = shelf.reserve('char', 'a');
    const plankFrontY = v.bounds().min[1];
    expect(v.slotPos(s.slotId)![1]).toBeCloseTo(plankFrontY + 8 / 2, 6);
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
  it('span covers the plank width at the front row', () => {
    const v = new ShelfView(new THREE.Group(), new Shelf(), [26, 8, 32], looks, [100, -400, 0]);
    const s = v.span();
    expect(s.x0).toBe(100);
    expect(s.x1).toBeCloseTo(100 + v.width, 6);
    expect(s.y).toBe(-400);
  });
});
