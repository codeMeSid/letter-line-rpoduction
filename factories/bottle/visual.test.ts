import { describe, expect, it } from 'vitest';
import { BOTTLE_STAGES, bottleVisual, type BottleVisual } from './visual';

const KEYS = Object.keys(bottleVisual('tub', 0)) as (keyof BottleVisual)[];

describe('bottleVisual', () => {
  it('is continuous across stage boundaries', () => {
    for (let k = 0; k + 1 < BOTTLE_STAGES.length; k++) {
      const a = bottleVisual(BOTTLE_STAGES[k], 1);
      const b = bottleVisual(BOTTLE_STAGES[k + 1], 0);
      for (const key of KEYS) expect(b[key], `${BOTTLE_STAGES[k]}→${BOTTLE_STAGES[k + 1]} ${key}`).toBeCloseTo(a[key], 9);
    }
  });

  it('progresses: morph, fill, cap and label never go back; heat only falls once the bottle is formed', () => {
    let prev = bottleVisual('tub', 0);
    for (const s of BOTTLE_STAGES) {
      for (let i = 0; i <= 10; i++) {
        const v = bottleVisual(s, i / 10);
        for (const key of ['morph', 'fill', 'cap', 'label', 'emboss', 'clear'] as const) expect(v[key], `${s} ${key}`).toBeGreaterThanOrEqual(prev[key] - 1e-9);
        if (v.morph >= 2) expect(v.heat).toBeLessThanOrEqual(prev.heat + 1e-9);
        prev = v;
      }
    }
    expect(prev).toMatchObject({ morph: 2, heat: 0, clear: 1, fill: 1, cap: 1, label: 1 });
  });

  it('unknown stage = fresh empty tub', () => {
    expect(bottleVisual('nope', 0.5)).toEqual(bottleVisual('tub', 0));
    expect(bottleVisual('tub', 0)).toMatchObject({ tub: 1, layers: 0, gob: 0 });
  });
});
