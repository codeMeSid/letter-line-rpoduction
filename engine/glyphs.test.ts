import { describe, expect, it } from 'vitest';
import { CHARSET } from './charset';
import { GLYPHS, GLYPH_W, glyph } from './glyphs';

describe('glyphs', () => {
  it('covers every CHARSET char with at least one stroke', () => {
    for (const ch of CHARSET) expect(glyph(ch).length, ch).toBeGreaterThanOrEqual(1);
  });

  it('has no glyphs outside CHARSET', () => {
    expect(Object.keys(GLYPHS).sort().join('')).toBe([...CHARSET].sort().join(''));
  });

  it('keeps every point finite and inside the unit cell (u 0..0.7, v 0..1)', () => {
    for (const ch of CHARSET)
      for (const stroke of glyph(ch)) {
        expect(stroke.length, ch).toBeGreaterThanOrEqual(2);
        for (const [u, v] of stroke) {
          expect(Number.isFinite(u) && Number.isFinite(v), ch).toBe(true);
          expect(u, `${ch} u`).toBeGreaterThanOrEqual(0);
          expect(u, `${ch} u`).toBeLessThanOrEqual(GLYPH_W);
          expect(v, `${ch} v`).toBeGreaterThanOrEqual(0);
          expect(v, `${ch} v`).toBeLessThanOrEqual(1);
        }
      }
  });

  it('gives every glyph a distinct shape', () => {
    const seen = new Map<string, string>();
    for (const ch of CHARSET) {
      const key = JSON.stringify(glyph(ch));
      expect(seen.get(key), `${ch} duplicates ${seen.get(key)}`).toBeUndefined();
      seen.set(key, ch);
    }
  });

  it('uses x-height 0.55 for lowercase (x-line 0.25, baseline 0.8) with ascender/descender', () => {
    const vs = (ch: string): number[] => glyph(ch).flatMap((s) => s.map((q) => q[1]));
    expect(Math.min(...vs('o'))).toBeCloseTo(0.25, 2);
    expect(Math.max(...vs('o'))).toBeCloseTo(0.8, 2);
    expect(Math.min(...vs('b'))).toBe(0);
    expect(Math.max(...vs('p'))).toBe(1);
    expect(Math.max(...vs('g'))).toBeGreaterThan(0.9);
  });

  it('falls back to ? for unknown characters', () => {
    expect(glyph('~')).toBe(GLYPHS['?']);
    expect(glyph('')).toBe(GLYPHS['?']);
    expect(glyph('é')).toBe(GLYPHS['?']);
    expect(glyph('toString')).toBe(GLYPHS['?']);
    expect(glyph('A')).toBe(GLYPHS.A);
  });
});
