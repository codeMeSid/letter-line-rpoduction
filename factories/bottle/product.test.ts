import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../../engine/looks';
import { defaultSettings } from '../../engine/settings';
import type { Job } from '../../engine/types';
import { BOTTLE_H, BOTTLE_STAGES, bottleProduct, PUCK_T } from './product';

const opts = { look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' } as const;
const job = (char: string, isSpace = false): Job => ({ id: 1, slotId: 1, char, isSpace, special: 'none', product: 'bottle', stage: BOTTLE_STAGES[0], phase: 'station', stationIndex: 0, progress: 0, pos: [0, 0, 0], defect: false, retries: 0 });
const make = (ch = 'A', marks = defaultSettings.letterMarks, looks = new Looks(opts)) => bottleProduct.create(job(ch), { looks, marks });
const body = (h: { root: THREE.Object3D }) => h.root.getObjectByName('bottle') as THREE.Mesh;
const inf = (h: { root: THREE.Object3D }) => [...body(h).morphTargetInfluences!];

describe('bottleProduct', () => {
  it('declares the bottle kind with all stages and a shelf box matching the bottle', () => {
    expect(bottleProduct.kind).toBe('bottle');
    expect(bottleProduct.stages[0]).toBe('tub');
    expect(bottleProduct.stages).toContain('labelled');
    expect(bottleProduct.size[2]).toBe(BOTTLE_H);
    expect(bottleProduct.shatter.puddle).toBe(true);
    expect(bottleProduct.shatter.fragments.role).toBe('glass');
  });

  it('a space job is a bare puck', () => {
    const h = bottleProduct.create(job('', true), { looks: new Looks(opts), marks: defaultSettings.letterMarks });
    expect(h.root.getObjectByName('bottle')).toBeUndefined();
    h.shape('labelled', 1);
    h.place(1);
    h.dispose();
  });

  it('morphs gob → parison → bottle (one profile point count) and clears the glass', () => {
    const h = make();
    const geo = body(h).geometry;
    const morphs = geo.morphAttributes.position!;
    expect(morphs).toHaveLength(2);
    for (const m of morphs) expect(m.count).toBe(geo.getAttribute('position').count);
    h.shape('gob', 1);
    expect(inf(h)).toEqual([1, 0]);
    h.shape('parison', 1);
    expect(inf(h)).toEqual([0, 1]);
    h.shape('bottle-hot', 1);
    expect(inf(h)).toEqual([0, 0]);
    const mat = body(h).material as THREE.MeshPhysicalMaterial;
    expect(mat.emissiveIntensity).toBeGreaterThan(1);
    h.shape('bottle', 1);
    expect(mat.emissiveIntensity).toBeCloseTo(0, 6);
    expect(mat.transmission).toBeGreaterThan(0.9);
    h.dispose();
  });

  it('hides everything but the tub at first, and the tub once the gob is cut', () => {
    const h = make();
    expect(body(h).visible).toBe(false);
    expect(h.root.getObjectByName('layer0')!.visible).toBe(false);
    h.shape('batch', 1);
    for (let i = 0; i < 4; i++) expect(h.root.getObjectByName(`layer${i}`)!.visible).toBe(true);
    h.shape('melted', 1);
    expect(h.root.getObjectByName('layer0')!.visible).toBe(true); // 3 % of the batch is still stuck in the tub
    h.shape('gob', 1);
    expect(body(h).visible).toBe(true);
    h.dispose();
  });

  it('fills, caps and wraps the label with the glyph printed on it', () => {
    const h = make('Q');
    const foam = h.root.getObjectByName('foam')!;
    h.shape('filled', 0.7);
    expect(foam.visible).toBe(true);
    h.shape('filled', 1);
    expect(foam.visible).toBe(false);
    const label = h.root.getObjectByName('label') as THREE.Mesh;
    expect(label.visible).toBe(false);
    h.shape('labelled', 0.5);
    expect(label.geometry.drawRange.count).toBe(6 * 24);
    expect(h.root.getObjectByName('glyph')!.visible).toBe(false);
    h.shape('labelled', 1);
    expect(label.geometry.drawRange.count).toBe(6 * 48);
    const glyph = h.root.getObjectByName('glyph')!;
    expect(glyph.visible).toBe(true);
    const bb = new THREE.Box3().setFromObject(glyph);
    expect(bb.min.y).toBeLessThan(-9); // printed on the front (−y) of the body
    expect(bb.max.y).toBeLessThan(0);
    h.dispose();
  });

  it('place(1) stands the bottle on the shelf without the puck', () => {
    const h = make();
    h.shape('labelled', 1);
    const bed = h.root.getObjectByName('bed')!;
    expect(bed.visible).toBe(true);
    h.place(1);
    expect(bed.visible).toBe(false);
    expect(new THREE.Box3().setFromObject(h.root.getObjectByName('bottle')!).min.z).toBeCloseTo(0, 5);
    expect(PUCK_T).toBeGreaterThan(0);
  });

  it('restyle swaps the own materials and keeps the shape', () => {
    const looks = new Looks(opts);
    const h = make('B', defaultSettings.letterMarks, looks);
    h.shape('bottle-hot', 1);
    const before = body(h).material;
    looks.set({ ...opts, look: 'flat' });
    h.restyle();
    expect(body(h).material).not.toBe(before);
    expect(inf(h)).toEqual([0, 0]);
    h.dispose();
  });
});
