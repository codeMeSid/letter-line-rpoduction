import { describe, expect, it } from 'vitest';
import { CAR_STAGES, carVisual } from './visual';

describe('carVisual', () => {
  it('is continuous across stage boundaries', () => {
    for (let i = 0; i < CAR_STAGES.length - 1; i++) {
      expect(carVisual(CAR_STAGES[i], 1)).toEqual(carVisual(CAR_STAGES[i + 1], 0));
    }
  });
  it('starts empty and ends complete', () => {
    expect(carVisual(CAR_STAGES[0], 0)).toMatchObject({ pile: 0, body: 0, wheels: 0, box: 0 });
    expect(carVisual('boxed', 1)).toMatchObject({ body: 1, wheels: 1, paint: 1, glyph: 1, box: 1, sprue: 0, heat: 0 });
  });
  it('unknown stage = fresh tray', () => {
    expect(carVisual('nope', 0.5)).toEqual(carVisual('pellets', 0));
  });
});
