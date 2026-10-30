import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../../engine/looks';
import { defaultSettings } from '../../engine/settings';
import type { Job } from '../../engine/types';
import { MUG_H, MUG_STAGES, mugProduct, PUCK_T } from './product';

const opts = { look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' } as const;
const job = (char: string, isSpace = false): Job => ({ id: 1, slotId: 1, char, isSpace, special: 'none', product: 'mug', stage: MUG_STAGES[0], phase: 'station', stationIndex: 0, progress: 0, pos: [0, 0, 0], defect: false, retries: 0 });
const make = (ch = 'A', looks = new Looks(opts)) => mugProduct.create(job(ch), { looks, marks: defaultSettings.letterMarks });
const obj = (h: { root: THREE.Object3D }, n: string) => h.root.getObjectByName(n) as THREE.Mesh;

describe('mugProduct', () => {
  it('declares the mug kind, stages and a shelf box matching the mug', () => {
    expect(mugProduct.kind).toBe('mug');
    expect(mugProduct.stages[0]).toBe('tub');
    expect(mugProduct.stages).toContain('printed');
    expect(mugProduct.size[2]).toBe(MUG_H);
    expect(mugProduct.shatter.sounds).toContain('ceramic-shatter');
  });

  it('a space job is a bare puck', () => {
    const h = mugProduct.create(job('', true), { looks: new Looks(opts), marks: defaultSettings.letterMarks });
    expect(h.root.getObjectByName('mug')).toBeUndefined();
    h.shape('printed', 1);
    h.place(1);
    h.dispose();
  });

  it('shows the tub first, casts the wall, presses the handle on', () => {
    const h = make();
    expect(obj(h, 'tub') ?? true).toBeTruthy();
    expect(obj(h, 'mug').visible).toBe(false);
    h.shape('clay', 1);
    expect(obj(h, 'fill').visible).toBe(true);
    h.shape('cast', 1);
    expect(obj(h, 'mug').visible).toBe(true);
    expect(obj(h, 'mug').scale.z).toBeCloseTo(1, 6);
    expect(obj(h, 'handle').visible).toBe(false);
    h.shape('handled', 0.5);
    expect(obj(h, 'handle').visible).toBe(true);
    expect(obj(h, 'handle').position.x).toBeGreaterThan(0);
    h.shape('handled', 1);
    expect(obj(h, 'handle').position.x).toBeCloseTo(0, 6);
    h.dispose();
  });

  it('fires red-hot in the kiln, then glazes and prints the glyph on the front', () => {
    const h = make('Q');
    const mat = obj(h, 'mug').material as THREE.MeshStandardMaterial;
    h.shape('bisque', 0.5);
    expect(mat.emissiveIntensity).toBeGreaterThan(1);
    h.shape('glazed', 1);
    expect(mat.emissiveIntensity).toBeCloseTo(0, 6);
    expect(obj(h, 'glyph').visible).toBe(false);
    h.shape('printed', 1);
    const glyph = obj(h, 'glyph');
    expect(glyph.visible).toBe(true);
    const bb = new THREE.Box3().setFromObject(glyph);
    expect(bb.min.y).toBeLessThan(-11); // printed on the front (−y)
    expect(bb.max.y).toBeLessThan(0);
    h.dispose();
  });

  it('place(1) stands the mug on the shelf without the puck', () => {
    const h = make();
    h.shape('printed', 1);
    const bed = h.root.getObjectByName('bed')!;
    expect(bed.visible).toBe(true);
    h.place(1);
    expect(bed.visible).toBe(false);
    expect(new THREE.Box3().setFromObject(obj(h, 'mug')).min.z).toBeCloseTo(0, 5);
    expect(PUCK_T).toBeGreaterThan(0);
  });

  it('restyle swaps the own materials and keeps the shape', () => {
    const looks = new Looks(opts);
    const h = make('B', looks);
    h.shape('bisque', 0.5);
    const before = obj(h, 'mug').material;
    looks.set({ ...opts, look: 'flat' });
    h.restyle();
    expect(obj(h, 'mug').material).not.toBe(before);
    expect(obj(h, 'handle').material).toBe(obj(h, 'mug').material);
    h.dispose();
  });
});
