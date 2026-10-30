import { describe, expect, it } from 'vitest';
import { MUG_STAGES, mugVisual } from './visual';

const KEYS = Object.keys(mugVisual('tub', 0)) as (keyof ReturnType<typeof mugVisual>)[];

describe('mugVisual', () => {
  it('is continuous across stage boundaries', () => {
    for (let k = 0; k + 1 < MUG_STAGES.length; k++) {
      const a = mugVisual(MUG_STAGES[k], 1);
      const b = mugVisual(MUG_STAGES[k + 1], 0);
      for (const key of KEYS) expect(b[key], `${MUG_STAGES[k]}→${MUG_STAGES[k + 1]} ${key}`).toBeCloseTo(a[key], 9);
    }
  });

  it('progresses: body, handle, glaze, gloss, print never go back; ends finished', () => {
    let prev = mugVisual('tub', 0);
    for (const s of MUG_STAGES) {
      for (let i = 0; i <= 10; i++) {
        const v = mugVisual(s, i / 10);
        for (const key of ['body', 'handle', 'fire', 'glaze', 'gloss', 'print'] as const) expect(v[key], `${s} ${key}`).toBeGreaterThanOrEqual(prev[key] - 1e-9);
        prev = v;
      }
    }
    expect(prev).toMatchObject({ tub: 0, body: 1, handle: 1, wet: 0, heat: 0, glaze: 1, gloss: 1, print: 1 });
  });

  it('unknown stage = fresh empty tub', () => {
    expect(mugVisual('nope', 0.5)).toEqual(mugVisual('tub', 0));
    expect(mugVisual('tub', 0)).toMatchObject({ tub: 1, fill: 0, body: 0 });
  });
});
