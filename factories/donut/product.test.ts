import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../../engine/looks';
import { defaultSettings } from '../../engine/settings';
import { job } from '../letter/stations/testkit';
import { DONUT_STAGES, donutProduct } from './product';

const ctx = () => ({ looks: new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' }), marks: defaultSettings.letterMarks });

describe('donutProduct', () => {
  it('shapes every stage, stands up on place(1), restyles and disposes', () => {
    const h = donutProduct.create({ ...job('A'), product: 'donut' }, ctx());
    for (const s of DONUT_STAGES) for (const t of [0, 0.5, 1]) h.shape(s, t);
    expect(h.root.getObjectByName('bed')!.visible).toBe(true);
    h.place(1);
    expect(h.root.getObjectByName('bed')!.visible).toBe(false);
    h.restyle();
    h.dispose();
    expect(h.root.parent).toBeNull();
  });
  it('a space is a bare tray', () => {
    const h = donutProduct.create({ ...job('', true), product: 'donut' }, ctx());
    h.shape('lettered', 1);
    h.place(1);
    h.dispose();
  });
  it('partial ring draws a growing arc, not bands round the whole circle', () => {
    const h = donutProduct.create({ ...job('A'), product: 'donut' }, ctx());
    h.shape('ring', 0.5);
    let ang = 0, count = 0;
    h.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.geometry.type !== 'TorusGeometry' || !m.visible) return;
      const { start, count: c } = m.geometry.drawRange;
      const idx = m.geometry.index!, pos = m.geometry.attributes.position;
      let lo = Infinity, hi = -Infinity;
      for (let k = start; k < start + c; k++) {
        const a = Math.atan2(pos.getY(idx.getX(k)), pos.getX(idx.getX(k)));
        lo = Math.min(lo, a); hi = Math.max(hi, a);
      }
      if (c < idx.count) { ang = hi - lo; count++; }
    });
    expect(count).toBeGreaterThan(0);
    expect(ang).toBeGreaterThan(Math.PI * 0.8);
    expect(ang).toBeLessThan(Math.PI * 1.2);
    h.dispose();
  });
  it('declares stages from the pure visual list', () => {
    expect(donutProduct.stages).toBe(DONUT_STAGES);
  });
});
