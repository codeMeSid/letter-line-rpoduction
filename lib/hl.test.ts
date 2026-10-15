import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KERNEL_PATH, loadHL } from './hl.node';

/** sha256 of the whole vendored file (shasum -a 256 public/hairline/kernel.js). */
const KERNEL_FILE_SHA256 = '47ebec7647174e04e4f59c0305277c2a1dab83a763676946b17fa1694e7952fe';
const HEADER = '/* hairline kernel sha256:';

describe('vendored kernel', () => {
  const src = readFileSync(KERNEL_PATH);

  it('keeps its header line intact', () => {
    const first = src.toString('utf8').split('\n', 1)[0];
    expect(first.startsWith(HEADER)).toBe(true);
    expect(first).toMatch(/^\/\* hairline kernel sha256:[0-9a-f]{64} \*\/$/);
  });

  it('header hash equals sha256 of everything after the first line', () => {
    const nl = src.indexOf(0x0a);
    expect(nl).toBeGreaterThan(0);
    const header = src.subarray(0, nl).toString('utf8');
    const declared = /^\/\* hairline kernel sha256:([0-9a-f]{64}) \*\/$/.exec(header)?.[1];
    expect(declared).toBeDefined();
    expect(createHash('sha256').update(src.subarray(nl + 1)).digest('hex')).toBe(declared);
  });

  it('is unchanged (whole-file sha256 matches the recorded value)', () => {
    expect(createHash('sha256').update(src).digest('hex')).toBe(KERNEL_FILE_SHA256);
  });
});

describe('HL wrapper', () => {
  const HL = loadHL();

  it('proj/unproj round-trip for Cam(45, 0.5, 1)', () => {
    const C = HL.Cam(45, 0.5, 1);
    const P = HL.proj(C);
    for (const [x, y, z] of [
      [0, 0, 0],
      [120, -40, 0],
      [35, 80, 25],
    ] as const) {
      const [sx, sy] = P(x, y, z);
      const [ux, uy] = HL.unproj(C, sx, sy, z);
      expect(ux).toBeCloseTo(x, 6);
      expect(uy).toBeCloseTo(y, 6);
    }
  });

  it('rings + prism return non-empty path strings', () => {
    const C = HL.Cam(45, 0.5, 1);
    const P = HL.proj(C);
    const [ring, inner] = HL.rings(-10, -10, 10, 10, 3, 1);
    const { sil, crease } = HL.prism(P, HL.facing(C), ring, inner, 0, 20);
    expect(sil.length).toBeGreaterThan(0);
    expect(crease.length).toBeGreaterThan(0);
  });

  it('tween reaches its target after 700ms', () => {
    const tw = HL.tween(0);
    HL.tset(tw, 1, 0, 0);
    expect(HL.tval(tw, 0)).toBe(0);
    expect(HL.tval(tw, 350)).toBeGreaterThan(0);
    expect(HL.tval(tw, 350)).toBeLessThan(1);
    expect(HL.tval(tw, 700)).toBe(1);
    expect(HL.tdone(tw, 700)).toBe(true);
  });
});
