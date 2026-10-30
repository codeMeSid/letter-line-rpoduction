import { describe, expect, it } from 'vitest';
import { COOKIE_STAGES, cookieVisual, type CookieVisual } from './visual';

const KEYS = Object.keys(cookieVisual('bowl', 0)) as (keyof CookieVisual)[];

describe('cookieVisual', () => {
  it('is continuous across stage boundaries', () => {
    for (let k = 0; k + 1 < COOKIE_STAGES.length; k++) {
      const a = cookieVisual(COOKIE_STAGES[k], 1);
      const b = cookieVisual(COOKIE_STAGES[k + 1], 0);
      for (const key of KEYS) expect(b[key], `${COOKIE_STAGES[k]}→${COOKIE_STAGES[k + 1]} ${key}`).toBeCloseTo(a[key], 9);
    }
  });
  it('progresses: chips, bake, icing, sprinkles and cup never go back', () => {
    let prev = cookieVisual('bowl', 0);
    for (const s of COOKIE_STAGES) for (let i = 0; i <= 10; i++) {
      const v = cookieVisual(s, i / 10);
      for (const key of ['chips', 'bake', 'sprinkles', 'cup'] as const) expect(v[key]).toBeGreaterThanOrEqual(prev[key] - 1e-9);
      if (v.bake >= 1 && v.cup >= 0 && s !== 'cooled' && s !== 'iced' && s !== 'sprinkled' && s !== 'packed') expect(v.icing).toBe(0);
      prev = v;
    }
  });
  it('ends as a finished cookie; unknown stage = empty bowl', () => {
    expect(cookieVisual('packed', 1)).toMatchObject({ bowl: 0, h: 5.5, chips: 1, icing: 1, sprinkles: 1, cup: 1 });
    expect(cookieVisual('nope', 0.5)).toEqual(cookieVisual('bowl', 0));
    expect(cookieVisual('bowl', 0)).toMatchObject({ bowl: 1, h: 0, layers: 0 });
  });
});
