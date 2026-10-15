import { describe, expect, it } from 'vitest';
import { loadHL } from '../lib/hl.node';
import { fitBox } from './camera';

describe('fitBox', () => {
  it('contains the projected box and matches the viewport aspect', () => {
    const HL = loadHL();
    const P = HL.proj(HL.Cam(45, 0.5, 1));
    const b = fitBox(P, [0, 0, 0], [100, 100, 50], 10, 16 / 9);
    expect(b.w / b.h).toBeCloseTo(16 / 9);
    for (const p of [[0, 0, 0], [100, 100, 50], [100, 0, 0], [0, 100, 50]] as const) {
      const [x, y] = P(p[0], p[1], p[2]);
      expect(x).toBeGreaterThanOrEqual(b.x + 10 - 1e-9);
      expect(x).toBeLessThanOrEqual(b.x + b.w - 10 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(b.y);
      expect(y).toBeLessThanOrEqual(b.y + b.h);
    }
  });
});
