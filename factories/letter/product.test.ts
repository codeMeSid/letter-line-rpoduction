import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { letterGeometry } from '../../engine/letterSolid';
import { Looks, type LookOptions } from '../../engine/looks';
import { defaultSettings } from '../../engine/settings';
import { Shelf } from '../../shelf/model';
import { ShelfView } from '../../shelf/view';
import type { Job } from '../../engine/types';
import { LETTER_H, LETTER_R, letterProduct, LETTER_STAGES } from './product';

const opts: LookOptions = { look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' };
const job = (char: string, isSpace = false): Job => ({ id: 1, slotId: 1, char, isSpace, special: 'none', product: 'letter', stage: 'flask', phase: 'station', stationIndex: 0, progress: 0, pos: [0, 0, 22], defect: false, retries: 0 });
const metal = (root: THREE.Object3D) => root.getObjectByName('metal') as THREE.Mesh;

describe('letterProduct', () => {
  it('stages match the visual table', () => {
    expect(letterProduct.stages).toEqual(LETTER_STAGES);
  });
  it('declares a metal shatter style', () => {
    expect(letterProduct.shatter.sounds).toContain('metal-crumple');
    expect(letterProduct.shatter.fragments.count).toBeGreaterThan(0);
  });
  it('metal appears during the pour, clipped to the fill level, and ends chrome', () => {
    const looks = new Looks(opts);
    const h = letterProduct.create(job('A'), { looks, marks: defaultSettings.letterMarks });
    expect(metal(h.root).visible).toBe(false); // a fresh handle is already the empty flask
    h.shape('moulded', 1);
    expect(metal(h.root).visible).toBe(false);
    h.shape('poured', 0.5);
    const m = metal(h.root);
    expect(m.visible).toBe(true);
    const mat = m.material as THREE.MeshStandardMaterial;
    expect(mat.clipShadows).toBe(true);
    expect(mat.clippingPlanes).toHaveLength(1);
    expect(mat.clippingPlanes![0].constant).toBeLessThan(1e5);
    expect(mat.emissiveIntensity).toBeGreaterThan(1);
    h.shape('polished', 1);
    expect(mat.clippingPlanes![0].constant).toBeGreaterThan(1e5);
    expect(mat.metalness).toBeCloseTo(1, 2);
    expect(mat.emissiveIntensity).toBeCloseTo(0, 6);
    expect((h.root.getObjectByName('sprue') as THREE.Mesh).scale.x).toBeCloseTo(0, 6);
  });
  it('restyle preserves fill and heat with a new material', () => {
    const looks = new Looks(opts);
    const h = letterProduct.create(job('g'), { looks, marks: defaultSettings.letterMarks });
    h.shape('poured', 0.5);
    const before = metal(h.root).material as THREE.MeshStandardMaterial;
    const c = before.clippingPlanes![0].constant;
    looks.set({ ...opts, look: 'flat' });
    h.restyle();
    const after = metal(h.root).material as THREE.MeshToonMaterial;
    expect(after).not.toBe(before);
    expect(after.clippingPlanes![0].constant).toBeCloseTo(c, 6);
    expect(after.emissiveIntensity).toBeGreaterThan(0);
  });
  it('place(1) stands the letter upright on z=0 and hides the bed', () => {
    const looks = new Looks(opts);
    const h = letterProduct.create(job('A'), { looks, marks: defaultSettings.letterMarks });
    h.shape('polished', 1);
    h.place(1);
    const letter = h.root.getObjectByName('letter')!;
    expect(letter.rotation.x).toBeCloseTo(0, 6);
    expect(h.root.getObjectByName('bed')!.visible).toBe(false);
    h.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(letter);
    expect(b.min.z).toBeGreaterThanOrEqual(-1e-6); // baseline strokes rest on z=0 (R3); sphere tessellation lifts ≤ 0.15
    expect(b.min.z).toBeLessThan(0.25);
  });
  it('the sand drains after the cast and the flash is removed by grinding', () => {
    const looks = new Looks(opts);
    const h = letterProduct.create(job('A'), { looks, marks: defaultSettings.letterMarks });
    const flash = () => h.root.getObjectByName('flash');
    const sand = h.root.getObjectByName('bed')!.children.find((o) => o.userData.role === 'sand')!;
    h.shape('cooled', 1);
    expect(sand.visible).toBe(true);
    expect(flash()).toBeDefined();
    h.shape('cast', 1);
    expect(sand.visible).toBe(false);
    h.shape('ground', 1);
    expect(flash()).toBeUndefined();
  });
  it.each(['A', 'T', '-'])('the sprue attaches on a stroke of %s', (ch) => {
    const h = letterProduct.create(job(ch), { looks: new Looks(opts), marks: defaultSettings.letterMarks });
    const at = h.root.getObjectByName('sprue')!.position;
    const pos = letterGeometry(ch, { height: LETTER_H, radius: LETTER_R }).getAttribute('position');
    let best = Infinity;
    for (let i = 0; i < pos.count; i++) best = Math.min(best, Math.hypot(pos.getX(i) - at.x, pos.getY(i) - at.y, pos.getZ(i) - at.z));
    expect(best).toBeLessThanOrEqual(LETTER_R + 1e-3);
  });
  it('a shelved descender stands entirely in front of the plank, back face flush with it', () => {
    expect(letterProduct.size[1]).toBe(2 * LETTER_R);
    const looks = new Looks(opts);
    const shelf = new Shelf();
    const v = new ShelfView(new THREE.Group(), shelf, letterProduct.size, looks, [0, -400, 0]);
    const slot = shelf.reserve('char', 'g');
    shelf.markFilled(slot.slotId);
    const h = letterProduct.create({ ...job('g'), slotId: slot.slotId }, { looks, marks: defaultSettings.letterMarks });
    h.shape('polished', 1);
    v.adopt(slot.slotId, { ...job('g'), slotId: slot.slotId }, h);
    for (let i = 0; i < 600; i++) v.update(1 / 60);
    v.group.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(h.root.getObjectByName('letter')!);
    const plankFrontY = v.bounds().min[1];
    expect(b.min.z).toBeLessThan(v.span().z - 1); // a real descender, below the plank top
    expect(b.max.y).toBeLessThanOrEqual(plankFrontY + 1e-6);
    expect(b.max.y).toBeGreaterThan(plankFrontY - 1e-3);
  });
  it('a space job is a bare pallet that survives every stage', () => {
    const looks = new Looks(opts);
    const h = letterProduct.create(job('', true), { looks, marks: defaultSettings.letterMarks });
    expect(h.root.getObjectByName('metal')).toBeUndefined();
    for (const s of LETTER_STAGES) for (const t of [0, 0.5, 1]) expect(() => h.shape(s, t)).not.toThrow();
    expect(() => { h.place(0.5); h.restyle(); h.dispose(); }).not.toThrow();
  });
  it('dispose releases the own material', () => {
    const looks = new Looks(opts);
    const h = letterProduct.create(job('A'), { looks, marks: defaultSettings.letterMarks });
    const mat = metal(h.root).material as THREE.Material;
    let disposed = false;
    mat.addEventListener('dispose', () => { disposed = true; });
    h.dispose();
    expect(disposed).toBe(true);
  });
});
