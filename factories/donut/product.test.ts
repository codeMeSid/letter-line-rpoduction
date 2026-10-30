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
  it('declares stages from the pure visual list', () => {
    expect(donutProduct.stages).toBe(DONUT_STAGES);
  });
});
