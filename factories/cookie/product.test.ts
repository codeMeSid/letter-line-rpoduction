import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../../engine/looks';
import type { Job } from '../../engine/types';
import { job as letterJob } from '../letter/stations/testkit';
import { chipSpot, cookieProduct, COOKIE_STAGES, topZ } from './product';

const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
const ctx = { looks, marks: { emboss: true, label: true, cap: true, shape: true } };
const make = (ch = 'A', isSpace = false) => cookieProduct.create({ ...letterJob(ch, isSpace), product: 'cookie' } as Job, ctx);
const vis = (h: ReturnType<typeof make>, name: string) => h.root.getObjectByName(name)!.visible;

describe('cookieProduct', () => {
  it('declares stages, size and shatter', () => {
    expect(cookieProduct.kind).toBe('cookie');
    expect(cookieProduct.stages).toEqual(COOKIE_STAGES);
    expect(cookieProduct.shatter.burst.length).toBeGreaterThan(0);
  });
  it('builds up: bowl → dough → icing glyph → cup, every stage shapes without throwing', () => {
    const h = make();
    for (const s of COOKIE_STAGES) for (const t of [0, 0.5, 1]) h.shape(s, t);
    h.shape('batch', 1);
    expect(vis(h, 'dough')).toBe(false);
    h.shape('extruded', 1);
    expect(vis(h, 'dough')).toBe(true);
    h.shape('cooled', 1);
    expect(vis(h, 'icing')).toBe(false);
    h.shape('iced', 0.5);
    const icing = h.root.getObjectByName('icing') as THREE.Mesh;
    expect(icing.visible).toBe(true);
    expect(icing.geometry.drawRange.count).toBeLessThan((icing.geometry.index ?? icing.geometry.getAttribute('position')).count);
    h.shape('packed', 1);
    expect(vis(h, 'cup')).toBe(true);
    h.dispose();
  });
  it('place() hides the baking disc and lowers the cookie; restyle keeps the shape', () => {
    const h = make();
    h.shape('packed', 1);
    const z0 = h.root.getObjectByName('cookie')!.position.z;
    h.place(1);
    expect(vis(h, 'bed')).toBe(false);
    expect(h.root.getObjectByName('cookie')!.position.z).toBeLessThan(z0);
    h.restyle();
    expect(vis(h, 'icing')).toBe(true);
    h.dispose();
  });
  it('a space job is just the baking disc', () => {
    const h = make('', true);
    expect(h.root.getObjectByName('cookie')).toBeUndefined();
    h.shape('packed', 1);
    h.place(1);
    h.dispose();
  });
  it('chips rest on the dough surface', () => {
    for (let i = 0; i < 10; i++) {
      const [x, y, z] = chipSpot(i, 12, 5.5);
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(12);
      expect(z).toBeLessThanOrEqual(5.5);
      expect(z).toBeGreaterThan(0);
    }
    expect(topZ(0)).toBe(1);
    expect(topZ(1)).toBeCloseTo(0.4, 6);
  });
});
