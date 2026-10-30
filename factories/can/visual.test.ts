import { describe, expect, it } from 'vitest';
import { canVisual, CAN_STAGES, type CanVisual } from './visual';

const KEYS = Object.keys(canVisual('coil', 0)) as (keyof CanVisual)[];

describe('canVisual', () => {
  it('is continuous across stage boundaries', () => {
    for (let k = 0; k + 1 < CAN_STAGES.length; k++) {
      const a = canVisual(CAN_STAGES[k], 1);
      const b = canVisual(CAN_STAGES[k + 1], 0);
      for (const key of KEYS) expect(b[key], `${CAN_STAGES[k]}→${CAN_STAGES[k + 1]} ${key}`).toBeCloseTo(a[key], 9);
    }
  });
  it('progresses: morph, ink, fill and lid never go back', () => {
    let prev = canVisual('coil', 0);
    for (const s of CAN_STAGES) {
      for (let i = 0; i <= 10; i++) {
        const v = canVisual(s, i / 10);
        for (const key of ['morph', 'ink', 'fill', 'lid'] as const) expect(v[key], `${s} ${key}`).toBeGreaterThanOrEqual(prev[key] - 1e-9);
        expect(v.dirt).toBeLessThanOrEqual(prev.dirt + 1e-9);
        prev = v;
      }
    }
    expect(prev).toMatchObject({ morph: 4, dirt: 0, ink: 1, fill: 1, lid: 1, body: 1, coil: 0, strip: 0 });
  });
  it('unknown stage = fresh coil', () => {
    expect(canVisual('nope', 0.5)).toEqual(canVisual('coil', 0));
    expect(canVisual('coil', 0)).toMatchObject({ coil: 1, body: 0 });
  });
});
