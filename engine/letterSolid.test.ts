import { describe, expect, it } from 'vitest';
import { CHARSET } from './charset';
import { GLYPH_BASE } from './glyphs';
import { letterGeometry } from './letterSolid';

const O = { height: 26, radius: 2.3 };

describe('letterGeometry', () => {
  it('fits the glyph cell plus radius: z within the cell, centred on x, thickness ±radius', () => {
    for (const ch of CHARSET) {
      const g = letterGeometry(ch, O);
      const bb = g.boundingBox!;
      expect(g.getAttribute('position').count, ch).toBeGreaterThan(0);
      expect(bb.min.z, ch).toBeGreaterThanOrEqual(-O.radius - 1e-6);
      expect(bb.max.z, ch).toBeLessThanOrEqual(O.height + O.radius + 1e-6);
      expect(bb.min.x + bb.max.x, ch).toBeCloseTo(0, 6);
      expect(bb.max.x - bb.min.x, ch).toBeLessThanOrEqual(0.7 * O.height + 2 * O.radius + 1e-6);
      expect(bb.min.y, ch).toBeGreaterThanOrEqual(-O.radius - 1e-6);
      expect(bb.max.y, ch).toBeLessThanOrEqual(O.radius + 1e-6);
    }
  });
  it('shares a baseline: glyph cell position is kept, no per-glyph z shift', () => {
    const minZ = (ch: string) => letterGeometry(ch, O).boundingBox!.min.z;
    // baseline − radius; the tessellated end-cap sphere (10 segments) falls short of the true radius by ~5%, never beyond
    const want = (1 - GLYPH_BASE) * O.height - O.radius;
    expect(minZ('A')).toBeGreaterThanOrEqual(want - 1e-6);
    expect(minZ('A')).toBeLessThan(want + 0.1 * O.radius);
    expect(minZ('g')).toBeLessThan(minZ('A'));
    expect(minZ('-')).toBeGreaterThan(0.3 * O.height);
  });
  it('caches per char and size', () => {
    expect(letterGeometry('A', O)).toBe(letterGeometry('A', O));
    expect(letterGeometry('A', { height: 20, radius: 2.3 })).not.toBe(letterGeometry('A', O));
  });
  it('unknown characters render as ?', () => {
    expect(letterGeometry('~', O).getAttribute('position').count).toBe(letterGeometry('?', O).getAttribute('position').count);
  });
});
