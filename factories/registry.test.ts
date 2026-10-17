import { describe, expect, it } from 'vitest';
import { PAD_RIGHT, ROAD } from '../engine/campus';
import { FLOOR_PAD } from '../engine/factoryHost';
import { layoutStations } from '../engine/layout';
import { LAYOUT_MODES, PRODUCT_KINDS } from '../engine/types';
import { shelfWidth } from '../shelf/view';
import { FACTORIES, PLOTS, factoryOrigin, plotOf } from './registry';
import { BELT_TOP } from './shared/dims';

describe('campus plots', () => {
  it('one plot per kind, in order, ROAD apart', () => {
    expect(PLOTS.map((p) => p.kind)).toEqual(PRODUCT_KINDS);
    for (let i = 1; i < PLOTS.length; i++) expect(PLOTS[i].x0 - PLOTS[i - 1].x1).toBe(ROAD);
    expect(plotOf('letter').built).toBe(true);
    expect(plotOf('car').built).toBe(!!FACTORIES.car);
  });
  it('every layout of a built factory (floor pad, shelf, dock pad) fits inside its plot', () => {
    for (const p of PLOTS.filter((q) => q.built)) {
      const def = FACTORIES[p.kind]!;
      const o = factoryOrigin(p.kind);
      for (const m of LAYOUT_MODES) {
        const b = layoutStations(def.stations, m, [o[0], o[1], BELT_TOP]).bounds;
        expect(b.min[0] - FLOOR_PAD, m).toBeGreaterThanOrEqual(p.x0);
        expect(Math.max(b.max[0], b.min[0] + shelfWidth(def.product.size)) + PAD_RIGHT, m).toBeLessThanOrEqual(p.x1);
      }
    }
  });
});
