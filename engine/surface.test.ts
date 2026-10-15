import { describe, expect, it } from 'vitest';
import { loadHL } from '../lib/hl.node';
import { CHARSET } from './charset';
import { CAM_AZ, cylinderSurface, facesCamera, flatSurface, glyphPaths, topSurface } from './surface';

const HL = loadHL();
const C = HL.Cam(45, 0.5, 1);
C.ox = C.oy = 0;
const P = HL.proj(C);

/** Parses `M x y L x y …` runs into point lists. */
function runs(d: string): [number, number][][] {
  return d
    .split('M')
    .filter(Boolean)
    .map((r) => r.split('L').map((pt) => pt.split(' ').map(Number) as [number, number]));
}

describe('facesCamera', () => {
  it('matches the kernel facing() convention at azimuth 45°', () => {
    const front = HL.facing(C);
    for (let deg = 0; deg < 360; deg += 5) {
      const a = (deg * Math.PI) / 180;
      const nu = Math.cos(a);
      const nv = Math.sin(a);
      if (Math.abs(nu + nv) < 1e-3) continue; // grazing: either answer is fine
      expect(facesCamera(nu, nv), `${deg}°`).toBe(front({ u: 0, v: 0, nu, nv }));
    }
    expect(facesCamera(Math.SQRT1_2, Math.SQRT1_2)).toBe(true);
    expect(facesCamera(-Math.SQRT1_2, -Math.SQRT1_2)).toBe(false);
  });
});

describe('flatSurface', () => {
  it('maps cell corners along the axes', () => {
    const s = flatSurface([10, 20, 30], [1, 0, 0], [0, 0, -1], [4, 6]);
    expect(s.at(0, 0)).toEqual([10, 20, 30]);
    expect(s.at(1, 0)).toEqual([14, 20, 30]);
    expect(s.at(0, 1)).toEqual([10, 20, 24]);
    expect(s.visible(0.5, 0.5)).toBe(true);
  });
});

describe('cylinderSurface', () => {
  it('puts the cell centre at facingAngle, top edge at z0 + height', () => {
    const s = cylinderSurface([100, 50, 0], 10, 5, 20, CAM_AZ, Math.PI / 2);
    const [x, y, z] = s.at(0.5, 0.5);
    expect(x).toBeCloseTo(100 + 10 * Math.SQRT1_2);
    expect(y).toBeCloseTo(50 + 10 * Math.SQRT1_2);
    expect(z).toBeCloseTo(15);
    expect(s.at(0.5, 0)[2]).toBeCloseTo(25);
    expect(s.at(0.5, 1)[2]).toBeCloseTo(5);
  });

  it('reads left to right on screen and faces the camera by default', () => {
    const s = cylinderSurface([0, 0, 0], 10, 0, 20);
    const sx = (u: number): number => P(...s.at(u, 0.5))[0];
    expect(sx(0.25)).toBeLessThan(sx(0.5));
    expect(sx(0.5)).toBeLessThan(sx(0.75));
    expect(s.visible(0.5, 0)).toBe(true);
  });

  it('culls the part of a wide arc that faces away', () => {
    const s = cylinderSurface([0, 0, 0], 10, 0, 20, CAM_AZ, Math.PI * 2);
    expect(s.visible(0.5, 0)).toBe(true);
    expect(s.visible(0, 0)).toBe(false); // directly behind
  });
});

describe('topSurface', () => {
  it('is horizontal at the centre height and upright on screen', () => {
    const s = topSurface([0, 0, 40], 10);
    expect(new Set([s.at(0, 0)[2], s.at(1, 1)[2]])).toEqual(new Set([40]));
    const [ax] = P(...s.at(0, 0.5));
    const [bx] = P(...s.at(1, 0.5));
    expect(bx).toBeGreaterThan(ax);
    const [, ty] = P(...s.at(0.5, 0));
    const [, by] = P(...s.at(0.5, 1));
    expect(by).toBeGreaterThan(ty);
    const mid = P(...s.at(0.5, 0.5));
    const centre = P(0, 0, 40);
    expect(mid[0]).toBeCloseTo(centre[0]);
    expect(mid[1]).toBeCloseTo(centre[1]);
  });
});

describe('glyphPaths', () => {
  it('is non-empty for a front-facing cylinder, for every CHARSET char', () => {
    const s = cylinderSurface([0, 0, 0], 20, 0, 30, CAM_AZ, 1.2);
    for (const ch of CHARSET) expect(glyphPaths(ch, s, P), ch).toMatch(/^M/);
  });

  it('is empty for a fully back-facing arc', () => {
    const s = cylinderSurface([0, 0, 0], 20, 0, 30, CAM_AZ + Math.PI, 1.2);
    for (const ch of ['A', 'o', '%']) expect(glyphPaths(ch, s, P), ch).toBe('');
  });

  it('culls per segment on a wide arc: stems round the side vanish, the crossbar middle stays', () => {
    const wide = cylinderSurface([0, 0, 0], 20, 0, 30, CAM_AZ, Math.PI * 2);
    const r = runs(glyphPaths('H', wide, P));
    expect(r).toHaveLength(1); // both stems are > 90° round the side
    const xs = r[0].map((q) => q[0]);
    expect(Math.min(...xs)).toBeGreaterThan(-20);
    expect(Math.max(...xs)).toBeLessThan(20);
  });

  it('emits several runs when only part of a stroke is hidden', () => {
    // The right-hand part of the glyph rotates round the back.
    const s = cylinderSurface([0, 0, 0], 20, 0, 30, CAM_AZ + 1.2, 2.4);
    const d = glyphPaths('O', s, P);
    expect(d).not.toBe('');
    const all = runs(d).flat();
    expect(all.every((q) => q.every(Number.isFinite))).toBe(true);
  });

  it('projects a flat glyph with the supplied projector, honouring scale and offset', () => {
    const s = flatSurface([0, 0, 0], [1, 0, 0], [0, 1, 0], [10, 10]);
    const id = (x: number, y: number): [number, number] => [x, y];
    expect(glyphPaths('I', s, (x, y) => id(x, y))).toMatch(/^M/);
    const base = runs(glyphPaths('l', s, id))[0]; // single vertical stroke at u 0.35 → x 5
    expect(base[0][0]).toBeCloseTo(5);
    const shifted = runs(glyphPaths('l', s, id, { offset: [0.1, 0] }))[0];
    expect(shifted[0][0]).toBeCloseTo(6);
    const half = runs(glyphPaths('l', s, id, { scale: 0.5 }))[0];
    expect(half[0][0]).toBeCloseTo(5); // centred on the cell centre
    expect(half[1][1] - half[0][1]).toBeCloseTo((base[1][1] - base[0][1]) / 2);
  });

  it('falls back to ? for unknown characters', () => {
    const s = cylinderSurface([0, 0, 0], 20, 0, 30);
    expect(glyphPaths('~', s, P)).toBe(glyphPaths('?', s, P));
  });
});
