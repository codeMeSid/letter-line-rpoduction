import { describe, expect, it } from 'vitest';
import { Clock } from './clock';

describe('Clock', () => {
  it('is idle with no keys', () => {
    const c = new Clock();
    expect(c.wpm(1000)).toBe(0);
    expect(c.speedMul(1000)).toBe(1);
  });

  it('computes wpm as keys-in-10s / 5 * 6', () => {
    const c = new Clock();
    for (let i = 0; i < 25; i++) c.recordKey(1000 + i * 100);
    expect(c.wpm(4000)).toBeCloseTo(30);
    expect(c.speedMul(4000)).toBeCloseTo(1.5);
  });

  it('forgets keys older than 10 seconds', () => {
    const c = new Clock();
    for (let i = 0; i < 10; i++) c.recordKey(i * 10);
    expect(c.wpm(100)).toBeCloseTo(12);
    expect(c.wpm(10_090)).toBeCloseTo(0); // all keys <= now-10000
    expect(c.speedMul(10_090)).toBe(1);
  });

  it('keeps a key exactly 9999 ms old but drops one exactly 10000 ms old', () => {
    const c = new Clock();
    c.recordKey(0);
    expect(c.wpm(9_999)).toBeCloseTo(1.2);
    expect(c.wpm(10_000)).toBe(0);
  });

  it('clamps speedMul to 4', () => {
    const c = new Clock();
    for (let i = 0; i < 500; i++) c.recordKey(i);
    expect(c.speedMul(500)).toBe(4);
  });
});
