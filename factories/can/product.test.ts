import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../../engine/looks';
import { defaultSettings } from '../../engine/settings';
import type { Job } from '../../engine/types';
import { CAN_H, CAN_STAGES, canProduct } from './product';

const opts = { look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' } as const;
const job = (char: string, isSpace = false): Job => ({ id: 1, slotId: 1, char, isSpace, special: 'none', product: 'can', stage: CAN_STAGES[0], phase: 'station', stationIndex: 0, progress: 0, pos: [0, 0, 0], defect: false, retries: 0 });
const make = (ch = 'A', marks = defaultSettings.letterMarks) => canProduct.create(job(ch), { looks: new Looks(opts), marks });
const body = (h: { root: THREE.Object3D }) => h.root.getObjectByName('can') as THREE.Mesh;
const inf = (h: { root: THREE.Object3D }) => [...body(h).morphTargetInfluences!];

describe('canProduct', () => {
  it('declares the can kind, all stages and a shelf box matching the can', () => {
    expect(canProduct.kind).toBe('can');
    expect(canProduct.stages[0]).toBe('coil');
    expect(canProduct.stages).toContain('seamed');
    expect(canProduct.size[2]).toBe(CAN_H);
  });
  it('morphs disc → cup → tall body → trimmed → necked (one profile point count)', () => {
    const h = make();
    const geo = body(h).geometry;
    const morphs = geo.morphAttributes.position!;
    expect(morphs).toHaveLength(4);
    for (const m of morphs) expect(m.count).toBe(geo.getAttribute('position').count);
    h.shape('blank', 1);
    expect(inf(h)).toEqual([1, 0, 0, 0]);
    h.shape('cup', 1);
    expect(inf(h)).toEqual([0, 1, 0, 0]);
    h.shape('body', 1);
    expect(inf(h)).toEqual([0, 0, 1, 0]);
    h.shape('trimmed', 1);
    expect(inf(h)).toEqual([0, 0, 0, 1]);
    h.shape('necked', 1);
    expect(inf(h)).toEqual([0, 0, 0, 0]);
  });
  it('shows coil, strip, sleeve, liquid and lid only in their stages', () => {
    const h = make();
    const vis = (n: string) => h.root.getObjectByName(n)?.visible;
    h.shape('coil', 0);
    expect(body(h).visible).toBe(false);
    expect(h.root.children.filter((c) => c.visible).length).toBe(1); // the coil
    h.shape('printed', 1);
    expect(vis('sleeve')).toBe(true);
    expect(vis('glyph')).toBe(true);
    h.shape('filled', 1);
    expect(h.root.children.some((c) => c.visible && c.name === '' && (c as THREE.Mesh).isMesh)).toBe(true);
    h.shape('seamed', 1);
    expect(h.root.children.some((c) => c.position.z === 48.3)).toBe(true);
  });
  it('space jobs build nothing and survive every call', () => {
    const h = canProduct.create(job('', true), { looks: new Looks(opts), marks: defaultSettings.letterMarks });
    for (const s of CAN_STAGES) h.shape(s, 0.5);
    h.restyle();
    h.dispose();
    expect(h.root.children).toHaveLength(0);
  });
  it('restyle and dispose do not throw, dispose detaches the root', () => {
    const parent = new THREE.Group();
    const h = make();
    parent.add(h.root);
    h.shape('washed', 0.5);
    h.restyle();
    h.dispose();
    expect(parent.children).toHaveLength(0);
  });
});
