import type { LayoutMode, Vec3 } from './types';

export const GAP = 60;
export const PER_ROW = 5;
export const ROW_EXTRA = 120;
export const FLOOR_STEP = 140;
export const RETURN_Y = 80;
export const SHELF_FRONT = 160;

export interface LayoutDef { footprint: [number, number]; height: number }

export interface LayoutResult {
  /** Station centres (footprint is centred on the anchor). */
  anchors: Vec3[];
  /** paths[i]: axis-aligned polyline anchors[i] -> anchors[i+1]. */
  paths: Vec3[][];
  /** World z of each floor, ascending (one entry for single-level layouts). */
  floors: number[];
  bounds: { min: Vec3; max: Vec3 };
  shelfOrigin: Vec3;
  shelfAxis: Vec3;
}

interface Cell { col: number; row: number; floor: number }

function cellFor(i: number, mode: LayoutMode): Cell {
  switch (mode) {
    case 'pan':
      return { col: i, row: 0, floor: 0 };
    case 'snake': {
      const row = Math.floor(i / PER_ROW);
      const j = i % PER_ROW;
      return { col: row % 2 === 0 ? j : PER_ROW - 1 - j, row, floor: 0 };
    }
    case 'stacked':
      return { col: i % PER_ROW, row: 0, floor: Math.floor(i / PER_ROW) };
    case 'all': {
      const perFloor = PER_ROW * 2;
      const k = i % perFloor;
      const row = Math.floor(k / PER_ROW);
      const j = k % PER_ROW;
      return { col: row % 2 === 0 ? j : PER_ROW - 1 - j, row, floor: Math.floor(i / perFloor) };
    }
  }
}

export function layoutStations(defs: LayoutDef[], mode: LayoutMode, origin: Vec3): LayoutResult {
  const n = defs.length;
  const cells = defs.map((_, i) => cellFor(i, mode));

  // Column widths = widest footprint in that column, so columns line up across rows/floors.
  const maxCol = cells.reduce((m, c) => Math.max(m, c.col), 0);
  const colW = new Array<number>(maxCol + 1).fill(0);
  cells.forEach((c, i) => { colW[c.col] = Math.max(colW[c.col], defs[i].footprint[0]); });
  const colX: number[] = [];
  let cursor = 0;
  for (let c = 0; c <= maxCol; c++) {
    colX.push(cursor + colW[c] / 2);
    cursor += colW[c] + GAP;
  }
  const rowPitch = defs.reduce((m, d) => Math.max(m, d.footprint[1]), 0) + ROW_EXTRA;

  const [ox, oy, oz] = origin;
  const anchors: Vec3[] = cells.map((c) => [ox + colX[c.col], oy - c.row * rowPitch, oz + c.floor * FLOOR_STEP]);

  const xRight = ox + colX[maxCol] + colW[maxCol] / 2 + GAP / 2;
  const xLeft = ox + colX[0] - colW[0] / 2 - GAP / 2;
  const returnY = oy + RETURN_Y;

  const paths: Vec3[][] = [];
  for (let i = 0; i + 1 < n; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const ca = cells[i];
    const cb = cells[i + 1];
    if (ca.floor === cb.floor && ca.row === cb.row) {
      paths.push([a, b]);
    } else if (ca.floor === cb.floor) {
      // snake row change: U-turn beyond the end of the row (even rows run +x, odd rows -x)
      const xt = ca.row % 2 === 0 ? xRight : xLeft;
      paths.push([a, [xt, a[1], a[2]], [xt, b[1], a[2]], b]);
    } else if (mode === 'stacked') {
      // lift at the right end, return conveyor at y = +80 (behind the line) back to the x start
      paths.push([a, [xRight, a[1], a[2]], [xRight, a[1], b[2]], [xRight, returnY, b[2]], [b[0], returnY, b[2]], b]);
    } else {
      // 'all': floor ends on the left end of its second row; lift there, then cross to row 0
      paths.push([a, [xLeft, a[1], a[2]], [xLeft, a[1], b[2]], [xLeft, b[1], b[2]], b]);
    }
  }

  const floorCount = cells.reduce((m, c) => Math.max(m, c.floor + 1), 1);
  const floors = Array.from({ length: floorCount }, (_, f) => oz + f * FLOOR_STEP);

  const min: Vec3 = [ox, oy, oz];
  const max: Vec3 = [ox, oy, oz];
  if (n > 0) {
    min[0] = min[1] = min[2] = Infinity;
    max[0] = max[1] = max[2] = -Infinity;
    const grow = (x: number, y: number, z: number) => {
      min[0] = Math.min(min[0], x); max[0] = Math.max(max[0], x);
      min[1] = Math.min(min[1], y); max[1] = Math.max(max[1], y);
      min[2] = Math.min(min[2], z); max[2] = Math.max(max[2], z);
    };
    anchors.forEach((a, i) => {
      const [fx, fy] = defs[i].footprint;
      grow(a[0] - fx / 2, a[1] - fy / 2, a[2]);
      grow(a[0] + fx / 2, a[1] + fy / 2, a[2] + defs[i].height);
    });
    for (const p of paths) for (const q of p) grow(q[0], q[1], q[2]);
  }

  return {
    anchors,
    paths,
    floors,
    bounds: { min, max },
    shelfOrigin: [min[0], min[1] - SHELF_FRONT, 0],
    shelfAxis: [1, 0, 0],
  };
}
