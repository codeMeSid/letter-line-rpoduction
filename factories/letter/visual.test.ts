import { describe, expect, it } from 'vitest';
import { LETTER_STAGES, letterVisual, type LetterVisual } from './visual';

const KEYS: (keyof LetterVisual)[] = ['sand', 'cavity', 'fill', 'heat', 'flaskOpen', 'sandLeft', 'rough', 'polish'];

describe('letterVisual', () => {
  it('is continuous across stage boundaries', () => {
    for (let k = 0; k + 1 < LETTER_STAGES.length; k++) {
      const a = letterVisual(LETTER_STAGES[k], 1);
      const b = letterVisual(LETTER_STAGES[k + 1], 0);
      for (const key of KEYS) expect(b[key], `${LETTER_STAGES[k]}→${LETTER_STAGES[k + 1]} ${key}`).toBeCloseTo(a[key], 9);
    }
  });
  it('progresses monotonically: fill and polish rise, heat falls after pouring, rough falls', () => {
    let prev = letterVisual('flask', 0);
    for (const s of LETTER_STAGES) for (let i = 0; i <= 10; i++) {
      const v = letterVisual(s, i / 10);
      expect(v.fill).toBeGreaterThanOrEqual(prev.fill - 1e-9);
      expect(v.polish).toBeGreaterThanOrEqual(prev.polish - 1e-9);
      expect(v.rough).toBeLessThanOrEqual(prev.rough + 1e-9);
      if (prev.fill >= 1) expect(v.heat).toBeLessThanOrEqual(prev.heat + 1e-9);
      prev = v;
    }
    expect(prev).toMatchObject({ fill: 1, heat: 0, flaskOpen: 1, sandLeft: 0, rough: 0, polish: 1 });
  });
  it('unknown stage = fresh flask', () => {
    expect(letterVisual('nope', 0.5)).toEqual(letterVisual('flask', 0));
  });
});
