import { describe, expect, it } from 'vitest';
import { DONUT_STAGES, donutVisual, type DonutVisual } from './visual';

const KEYS = Object.keys(donutVisual('bowl', 0)) as (keyof DonutVisual)[];

describe('donutVisual', () => {
  it('is continuous across stage boundaries', () => {
    for (let k = 0; k + 1 < DONUT_STAGES.length; k++) {
      const a = donutVisual(DONUT_STAGES[k], 1);
      const b = donutVisual(DONUT_STAGES[k + 1], 0);
      for (const key of KEYS) expect(b[key], `${DONUT_STAGES[k]}→${DONUT_STAGES[k + 1]} ${key}`).toBeCloseTo(a[key], 9);
    }
  });
  it('progresses: ring, cook, glaze, sprinkles and icing never go back', () => {
    let prev = donutVisual('bowl', 0);
    for (const s of DONUT_STAGES) {
      for (let i = 0; i <= 10; i++) {
        const v = donutVisual(s, i / 10);
        for (const key of ['ring', 'cook', 'glaze', 'sprinkles', 'icing', 'mix'] as const) expect(v[key], `${s} ${key}`).toBeGreaterThanOrEqual(prev[key] - 1e-9);
        prev = v;
      }
    }
  });
  it('ends as a fully finished donut with no bowl', () => {
    expect(donutVisual('lettered', 1)).toEqual({ bowl: 0, fill: 0.9, mix: 1, ring: 1, cook: 1, glaze: 1, sprinkles: 1, icing: 1 });
  });
});
