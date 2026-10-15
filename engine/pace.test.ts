import { describe, expect, it } from 'vitest';
import { FAST_MUL, paceParams } from './pace';
import { PACES } from './types';

describe('paceParams', () => {
  it('auto follows WPM; others pin speed', () => {
    expect(paceParams('auto')).toEqual({ wpm: true, speedMul: 1, maxInFlight: Infinity, lockFollow: false });
    expect(paceParams('fast').speedMul).toBeCloseTo(1 / 0.35, 9);
    expect(FAST_MUL).toBeCloseTo(1 / 0.35, 9);
    expect(paceParams('detailed')).toEqual({ wpm: false, speedMul: 1, maxInFlight: Infinity, lockFollow: false });
    expect(paceParams('cinematic')).toEqual({ wpm: false, speedMul: 1, maxInFlight: 1, lockFollow: true });
  });
  it('covers every pace', () => {
    for (const p of PACES) expect(paceParams(p)).toBeDefined();
  });
});
