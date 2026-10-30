import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../../engine/looks';
import { defaultSettings } from '../../engine/settings';
import type { Job } from '../../engine/types';
import { CAR_H, CAR_STAGES, carProduct } from './product';

const opts = { look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' } as const;
const job = (char: string, isSpace = false): Job => ({ id: 1, slotId: 1, char, isSpace, special: 'none', product: 'car', stage: CAR_STAGES[0], phase: 'station', stationIndex: 0, progress: 0, pos: [0, 0, 0], defect: false, retries: 0 });
const make = (ch = 'A') => carProduct.create(job(ch), { looks: new Looks(opts), marks: defaultSettings.letterMarks });
const vis = (h: { root: THREE.Object3D }) => {
  const seen: THREE.Object3D[] = [];
  h.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { let p: THREE.Object3D | null = o, v = true; while (p) { v &&= p.visible; p = p.parent; } if (v) seen.push(o); } });
  return seen.length;
};

describe('carProduct', () => {
  it('declares the car kind, its stages and a shelf box', () => {
    expect(carProduct.kind).toBe('car');
    expect(carProduct.stages[0]).toBe('pellets');
    expect(carProduct.size[2]).toBe(CAR_H);
  });
  it('takes shape stage by stage (more visible parts as it is built)', () => {
    const h = make();
    h.shape('pellets', 0);
    const empty = vis(h);
    h.shape('moulded', 1);
    const body = vis(h);
    h.shape('boxed', 1);
    expect(body).toBeGreaterThan(empty);
    expect(vis(h)).toBeGreaterThan(body);
    expect(h.root.getObjectByName('car')!.visible).toBe(true);
    h.dispose();
  });
  it('glyph stays visible when boxed', () => {
    const h = make('A');
    h.shape('boxed', 1);
    let seen = false;
    h.root.traverse((o) => { if (o.visible && (o as THREE.Mesh).geometry && o.parent?.visible) seen ||= o.position.y === -7.6; });
    expect(seen).toBe(true);
    h.dispose();
  });
  it('place hides the tray; restyle keeps the shape', () => {
    const h = make('Z');
    h.shape('boxed', 1);
    h.place(1);
    expect(h.root.getObjectByName('bed')!.visible).toBe(false);
    h.restyle();
    expect(h.root.getObjectByName('car')!.visible).toBe(true);
    h.dispose();
  });
  it('a space job is a bare tray', () => {
    const h = carProduct.create(job('', true), { looks: new Looks(opts), marks: defaultSettings.letterMarks });
    expect(h.root.getObjectByName('car')).toBeUndefined();
    h.shape('boxed', 1);
    h.place(1);
    h.dispose();
  });
});
