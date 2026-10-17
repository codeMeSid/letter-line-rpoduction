import { describe, expect, it } from 'vitest';
import { campusLayout, flightPose, PAD_LEFT, ROAD, type Pose } from './campus';

describe('campusLayout', () => {
  it('places plots left to right, ROAD apart, factory origin PAD_LEFT in', () => {
    const p = campusLayout([{ kind: 'letter', width: 1500, built: true }, { kind: 'bottle', width: 900, built: false }]);
    expect(p.map((q) => [q.x0, q.x1])).toEqual([[0, 1500], [1500 + ROAD, 2400 + ROAD]]);
    expect(p[0].origin).toEqual([PAD_LEFT, 0, 0]);
    expect(p[1].origin).toEqual([1500 + ROAD + PAD_LEFT, 0, 0]);
    expect(p.map((q) => q.built)).toEqual([true, false]);
  });
});

describe('flightPose', () => {
  const a: Pose = { target: [0, 0, 0], extent: 300 };
  const b: Pose = { target: [3000, -100, 0], extent: 400 };
  it('starts at A and ends at B', () => {
    expect(flightPose(0, a, b, 2000)).toEqual(a);
    expect(flightPose(1, a, b, 2000)).toEqual(b);
  });
  it('pulls out on A, is wide and halfway at mid-pan, pushes in on B', () => {
    expect(flightPose(0.2, a, b, 2000).target).toEqual(a.target);
    expect(flightPose(0.25, a, b, 2000).extent).toBe(2000);
    const m = flightPose(0.5, a, b, 2000);
    expect(m.extent).toBe(2000);
    expect(m.target[0]).toBeCloseTo(1500, 6);
    expect(m.target[1]).toBeCloseTo(-50, 6);
    expect(flightPose(0.8, a, b, 2000).target).toEqual(b.target);
  });
  it('is continuous and clamps u', () => {
    let prev = flightPose(0, a, b, 2000);
    for (let i = 1; i <= 1000; i++) {
      const p = flightPose(i / 1000, a, b, 2000);
      expect(Math.abs(p.extent - prev.extent)).toBeLessThan(20);
      expect(Math.abs(p.target[0] - prev.target[0])).toBeLessThan(20);
      prev = p;
    }
    expect(flightPose(-1, a, b, 2000)).toEqual(a);
    expect(flightPose(7, a, b, 2000)).toEqual(b);
  });
});
