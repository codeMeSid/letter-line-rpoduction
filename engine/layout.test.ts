import { describe, expect, it } from 'vitest';
import { FLOOR_STEP, GAP, layoutStations, PER_ROW, RETURN_Y, type LayoutDef } from './layout';
import type { LayoutMode, Vec3 } from './types';

const MODES: LayoutMode[] = ['pan', 'snake', 'stacked', 'all'];
const origin: Vec3 = [1600, 10, 0];

function mkDefs(n: number): LayoutDef[] {
  // varied footprints to stress column alignment
  return Array.from({ length: n }, (_, i) => ({ footprint: [80 + (i % 3) * 20, 70 + (i % 4) * 15] as [number, number], height: 60 + i }));
}

describe('layoutStations', () => {
  it.each(MODES)('%s: anchor/path counts match for many sizes', (mode) => {
    for (const n of [0, 1, 2, 5, 6, 9, 10, 11, 14, 25]) {
      const r = layoutStations(mkDefs(n), mode, origin);
      expect(r.anchors).toHaveLength(n);
      expect(r.paths).toHaveLength(Math.max(0, n - 1));
    }
  });

  it.each(MODES)('%s: station footprints never overlap', (mode) => {
    for (const n of [5, 6, 10, 11, 14, 25]) {
      const defs = mkDefs(n);
      const { anchors } = layoutStations(defs, mode, origin);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (anchors[i][2] !== anchors[j][2]) continue; // different floors
          const [fi, fj] = [defs[i].footprint, defs[j].footprint];
          const dx = Math.abs(anchors[i][0] - anchors[j][0]);
          const dy = Math.abs(anchors[i][1] - anchors[j][1]);
          const overlapX = dx < (fi[0] + fj[0]) / 2;
          const overlapY = dy < (fi[1] + fj[1]) / 2;
          expect(overlapX && overlapY, `${mode} n=${n} stations ${i},${j}`).toBe(false);
        }
      }
    }
  });

  it.each(MODES)('%s: each path runs anchor i -> anchor i+1 with axis-aligned segments', (mode) => {
    const r = layoutStations(mkDefs(25), mode, origin);
    r.paths.forEach((p, i) => {
      expect(p[0]).toEqual(r.anchors[i]);
      expect(p[p.length - 1]).toEqual(r.anchors[i + 1]);
      for (let k = 1; k < p.length; k++) {
        const changed = [0, 1, 2].filter((a) => p[k][a] !== p[k - 1][a]).length;
        expect(changed, `${mode} path ${i} seg ${k}`).toBe(1);
      }
    });
  });

  it.each(MODES)('%s: deterministic', (mode) => {
    const a = layoutStations(mkDefs(17), mode, origin);
    const b = layoutStations(mkDefs(17), mode, origin);
    expect(b).toEqual(a);
  });

  it.each(MODES)('%s: bounds contain anchors/paths; shelf is in front of the line', (mode) => {
    const r = layoutStations(mkDefs(12), mode, origin);
    for (const pt of [...r.anchors, ...r.paths.flat()]) {
      for (let a = 0; a < 3; a++) {
        expect(pt[a]).toBeGreaterThanOrEqual(r.bounds.min[a]);
        expect(pt[a]).toBeLessThanOrEqual(r.bounds.max[a]);
      }
    }
    expect(r.shelfOrigin).toEqual([r.bounds.min[0], r.bounds.max[1] + 160, 0]);
    expect(r.shelfAxis).toEqual([1, 0, 0]);
  });

  it('pan: one straight row along +x with GAP between footprints', () => {
    const defs = mkDefs(6);
    const r = layoutStations(defs, 'pan', [0, 0, 0]);
    r.anchors.forEach((a) => expect([a[1], a[2]]).toEqual([0, 0]));
    for (let i = 1; i < 6; i++) {
      const gap = r.anchors[i][0] - defs[i].footprint[0] / 2 - (r.anchors[i - 1][0] + defs[i - 1].footprint[0] / 2);
      expect(gap).toBe(GAP);
    }
    expect(r.floors).toEqual([0]);
  });

  it('snake: rows of 5 alternating direction, stacked along +y, U-turn at row end', () => {
    const defs = mkDefs(12);
    const r = layoutStations(defs, 'snake', [0, 0, 0]);
    const pitch = Math.max(...defs.map((d) => d.footprint[1])) + 120;
    r.anchors.forEach((a, i) => expect(a[1]).toBe(Math.floor(i / PER_ROW) * pitch));
    expect(r.anchors[1][0]).toBeGreaterThan(r.anchors[0][0]);
    expect(r.anchors[6][0]).toBeLessThan(r.anchors[5][0]);
    expect(r.anchors[5][0]).toBe(r.anchors[4][0]); // turn happens in the same column
    expect(r.anchors[10][0]).toBe(r.anchors[0][0]);
    const turn = r.paths[4];
    expect(turn.length).toBe(4);
    expect(turn[1][0]).toBeGreaterThan(r.anchors[4][0]); // swings out past the end of row
    expect(r.paths[5][1][0]).toBeLessThan(r.anchors[5][0]); // odd row turns on the left
    expect(r.floors).toEqual([0]);
  });

  it('stacked: floors of 5 at z=140*floor, lift + return conveyor at y=-80', () => {
    const r = layoutStations(mkDefs(11), 'stacked', [0, 0, 0]);
    r.anchors.forEach((a, i) => {
      expect(a[2]).toBe(Math.floor(i / 5) * FLOOR_STEP);
      expect(a[1]).toBe(0);
    });
    for (let i = 0; i < 4; i++) expect(r.anchors[i + 1][0]).toBeGreaterThan(r.anchors[i][0]);
    expect(r.anchors[5][0]).toBe(r.anchors[0][0]);
    const lift = r.paths[4];
    expect(lift.some((p) => p[1] === RETURN_Y && p[2] === 140)).toBe(true);
    expect(lift.some((p, k) => k > 0 && p[2] !== lift[k - 1][2] && p[0] === lift[k - 1][0] && p[1] === lift[k - 1][1])).toBe(true);
    expect(r.floors).toEqual([0, 140, 280]);
  });

  it('all: floors of 10 as a 2-row snake, floors 140 apart', () => {
    const r = layoutStations(mkDefs(23), 'all', [0, 0, 0]);
    expect(r.anchors[9][2]).toBe(0);
    expect(r.anchors[10][2]).toBe(140);
    expect(r.anchors[20][2]).toBe(280);
    expect(r.anchors[5][1]).toBeGreaterThan(r.anchors[0][1]);
    expect(r.anchors[10][1]).toBe(r.anchors[0][1]);
    expect(r.anchors[9][0]).toBe(r.anchors[0][0]); // floor ends where the next begins (same column)
    expect(r.floors).toEqual([0, 140, 280]);
  });

  it('applies the origin', () => {
    const a = layoutStations(mkDefs(8), 'snake', [0, 0, 0]);
    const b = layoutStations(mkDefs(8), 'snake', [1600, 30, 5]);
    b.anchors.forEach((p, i) => expect(p).toEqual([a.anchors[i][0] + 1600, a.anchors[i][1] + 30, a.anchors[i][2] + 5]));
  });

  it('handles an empty station list', () => {
    const r = layoutStations([], 'snake', origin);
    expect(r.anchors).toEqual([]);
    expect(r.paths).toEqual([]);
    expect(r.bounds.min).toEqual(origin);
    expect(r.bounds.max).toEqual(origin);
  });
});
