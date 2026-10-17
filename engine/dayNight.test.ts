import { describe, expect, it } from 'vitest';
import { DAY_SHARE, NOON, SUN_COLOR, SUN_NOON, skyAt, skyAtTime } from './dayNight';

describe('skyAt', () => {
  it('noon is exactly today\'s fixed lighting', () => {
    const s = skyAt(NOON);
    s.sunDir.forEach((v, i) => expect(v).toBeCloseTo(SUN_NOON[i], 12));
    expect(s).toMatchObject({ sunColor: SUN_COLOR, sunScale: 1, hemiScale: 1, night: 0 });
    expect(SUN_COLOR).toBe(0xfff4e6);
  });
  it('mid-night is full night with the dim moon', () => {
    const s = skyAt((DAY_SHARE + 1) / 2);
    expect(s.night).toBe(1);
    expect(s.sunScale).toBeCloseTo(0.25, 9);
  });
  it('dusk and dawn edges are half night', () => {
    expect(skyAt(DAY_SHARE).night).toBeCloseTo(0.5, 9);
    expect(skyAt(0).night).toBeCloseTo(0.5, 9);
  });
  it('is continuous, including the wrap at 1 → 0', () => {
    let prev = skyAt(0);
    for (let i = 1; i <= 5001; i++) {
      const s = skyAt((i / 5000) % 1);
      expect(Math.abs(s.night - prev.night)).toBeLessThan(0.03);
      expect(Math.abs(s.sunScale - prev.sunScale)).toBeLessThan(0.03);
      expect(Math.hypot(...s.sunDir.map((v, k) => v - prev.sunDir[k]))).toBeLessThan(0.05);
      expect(Math.hypot(...s.sunDir)).toBeCloseTo(1, 9);
      expect(s.sunDir[2]).toBeGreaterThan(0);
      prev = s;
    }
  });
});

describe('skyAtTime', () => {
  it('starts at noon; off = fixed noon', () => {
    expect(skyAtTime(0, true)).toEqual(skyAt(NOON));
    expect(skyAtTime(999, false)).toEqual(skyAt(NOON));
    expect(skyAtTime(60, true).night).toBeGreaterThan(0.5); // noon + half a cycle is night
  });
});
