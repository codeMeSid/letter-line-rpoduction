import { describe, expect, it } from 'vitest';
import { loopLength, patrolLoop, sampleLoop } from './patrol';

describe('patrol', () => {
  const pts = patrolLoop([0, -100, 0], [400, 0, 90], 45);
  it('is the inflated rectangle front-left → front-right → back-right → back-left at floor height', () => {
    expect(pts).toEqual([[-45, -145, 0], [445, -145, 0], [445, 45, 0], [-45, 45, 0]]);
    expect(loopLength(pts)).toBe(2 * (490 + 190));
  });
  it('samples by arc length with wrap and heading', () => {
    expect(sampleLoop(pts, 0)).toEqual({ pos: [-45, -145, 0], heading: 0 });
    expect(sampleLoop(pts, 100).pos).toEqual([55, -145, 0]);
    expect(sampleLoop(pts, 490 + 10)).toEqual({ pos: [445, -135, 0], heading: Math.PI / 2 });
    expect(sampleLoop(pts, loopLength(pts) + 100).pos).toEqual([55, -145, 0]);
    expect(sampleLoop(pts, -10).pos).toEqual([-45, -135, 0]);
  });
});
