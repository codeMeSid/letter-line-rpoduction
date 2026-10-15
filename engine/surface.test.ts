import { describe, expect, it } from 'vitest';
import { cylinderSurface, flatSurface, topSurface } from './surface';

describe('flatSurface', () => {
  it('maps cell corners along the axes', () => {
    const s = flatSurface([10, 20, 30], [1, 0, 0], [0, 0, -1], [4, 6]);
    expect(s.at(0, 0)).toEqual([10, 20, 30]);
    expect(s.at(1, 0)).toEqual([14, 20, 30]);
    expect(s.at(0, 1)).toEqual([10, 20, 24]);
    expect(s.curved).toBe(false);
  });
});

describe('cylinderSurface', () => {
  it('faces the viewer at -y by default, top edge at z0 + height', () => {
    const s = cylinderSurface([0, 0, 0], 10, 0, 20);
    const [x, y, z] = s.at(0.5, 0);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(-10);
    expect(z).toBeCloseTo(20);
    expect(s.at(0.5, 1)[2]).toBeCloseTo(0);
    expect(s.curved).toBe(true);
  });

  it('reads +x left to right', () => {
    const s = cylinderSurface([0, 0, 0], 10, 0, 20);
    expect(s.at(1, 0)[0]).toBeGreaterThan(s.at(0, 0)[0]);
  });

  it('honours an explicit facing angle and centre offset', () => {
    const s = cylinderSurface([100, 50, 0], 10, 5, 20, 0, Math.PI / 2);
    const [x, y, z] = s.at(0.5, 0.5);
    expect(x).toBeCloseTo(110);
    expect(y).toBeCloseTo(50);
    expect(z).toBeCloseTo(15);
  });
});

describe('topSurface', () => {
  it('is horizontal at the centre height, top toward +y, reading +x', () => {
    const s = topSurface([0, 0, 5], 10);
    expect(new Set([s.at(0, 0)[2], s.at(1, 1)[2]])).toEqual(new Set([5]));
    expect(s.at(0, 0)[1]).toBeGreaterThan(s.at(0, 1)[1]);
    expect(s.at(1, 0)[0]).toBeGreaterThan(s.at(0, 0)[0]);
    const mid = s.at(0.5, 0.5);
    expect(mid[0]).toBeCloseTo(0);
    expect(mid[1]).toBeCloseTo(0);
  });
});
