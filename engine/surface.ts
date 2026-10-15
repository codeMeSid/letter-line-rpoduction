import { GLYPH_W, glyph } from './glyphs';
import type { Vec3 } from './types';

/** Camera azimuth (radians) of the one world camera, `HL.Cam(45, 0.5, 1)`. */
export const CAM_AZ = Math.PI / 4;

/**
 * Same test as the kernel's `facing(C)` (public/hairline/kernel.js): a surface normal (nx, ny) on
 * the ground plane faces the camera when `nx*sin(az) + ny*cos(az) >= -1e-6`.
 * At az = 45° the viewer sits toward +x +y, so normal (cos45°, sin45°) faces it.
 */
export function facesCamera(nx: number, ny: number): boolean {
  return nx * Math.sin(CAM_AZ) + ny * Math.cos(CAM_AZ) >= -1e-6;
}

/**
 * A 2D parameter space laid onto the world. (u, v) are normalised cell coordinates: u 0..1 runs
 * left→right as seen by the camera, v 0..1 runs top→bottom (v = 0 is the top edge).
 */
export interface Surface {
  at(u: number, v: number): Vec3;
  /** False where the surface normal points away from the camera (segment is culled). */
  visible(u: number, v: number): boolean;
  /** Straight (u, v) lines bend in 3D, so they get subdivided before projecting. */
  curved: boolean;
}

/** Flat rectangle: `origin` is the (u,v)=(0,0) corner; axes are unit vectors; `size` = [width, height] in world units. */
export function flatSurface(origin: Vec3, uAxis: Vec3, vAxis: Vec3, size: [number, number]): Surface {
  return {
    at: (u, v) => [
      origin[0] + uAxis[0] * u * size[0] + vAxis[0] * v * size[1],
      origin[1] + uAxis[1] * u * size[0] + vAxis[1] * v * size[1],
      origin[2] + uAxis[2] * u * size[0] + vAxis[2] * v * size[1],
    ],
    visible: () => true,
    curved: false,
  };
}

/**
 * Wraps the cell around a vertical cylinder. u = 0.5 sits at `facingAngle` (radians around z; the
 * default 45° points at the camera); the cell width spans `arc` radians. v = 0 is at z0 + height.
 * Reading direction is left→right on screen for the front side.
 */
export function cylinderSurface(
  center: Vec3,
  radius: number,
  z0: number,
  height: number,
  facingAngle: number = CAM_AZ,
  arc: number = Math.PI / 2,
): Surface {
  // Screen X grows as the angle decreases around the camera-facing side, so subtract.
  const angle = (u: number): number => facingAngle - (u - 0.5) * arc;
  return {
    at: (u, v) => {
      const a = angle(u);
      return [center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a), z0 + (1 - v) * height];
    },
    visible: (u) => {
      const a = angle(u);
      return facesCamera(Math.cos(a), Math.sin(a));
    },
    curved: true,
  };
}

/**
 * Flat horizontal disc face (cap / lid) at z = center[2]. The cell is the largest 0.7:1 rectangle
 * inside the disc, upright on screen (reads left→right, top toward the back).
 */
export function topSurface(center: Vec3, radius: number): Surface {
  const h = radius * 1.6;
  const w = h * GLYPH_W;
  const s = Math.SQRT1_2;
  // Screen-right = (1, -1)/√2 on the ground; screen-down = (1, 1)/√2 (toward the camera).
  return flatSurface(
    [center[0] + (-w / 2 + -h / 2) * s, center[1] + (w / 2 - h / 2) * s, center[2]],
    [s, -s, 0],
    [s, s, 0],
    [w, h],
  );
}

export interface GlyphPathOpts {
  /** Scales the glyph about the cell centre (default 1). */
  scale?: number;
  /** Shift in normalised cell units [du, dv] (default [0, 0]). */
  offset?: [number, number];
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
/** Max (u, v) step before projecting a stroke onto a curved surface. */
const MAX_STEP = 0.05;

type Project = (x: number, y: number, z: number) => [number, number];

/**
 * One SVG path `d` of open polylines for `ch` laid onto `surface` and projected with `P`.
 * Glyph (0..0.7, 0..1) maps onto surface (0..1, 0..1). Segments on back-facing parts are culled,
 * which splits strokes into several `M…L…` runs; a fully hidden glyph returns ''.
 */
export function glyphPaths(ch: string, surface: Surface, P: Project, opts: GlyphPathOpts = {}): string {
  const scale = opts.scale ?? 1;
  const [du, dv] = opts.offset ?? [0, 0];
  const toU = (u: number): number => 0.5 + (u / GLYPH_W - 0.5) * scale + du;
  const toV = (v: number): number => 0.5 + (v - 0.5) * scale + dv;

  let d = '';
  let run: [number, number][] = [];
  const flush = (): void => {
    if (run.length >= 2) d += 'M' + run.map((q) => `${q[0]} ${q[1]}`).join('L');
    run = [];
  };

  for (const stroke of glyph(ch)) {
    let prev: { u: number; v: number; vis: boolean; s: [number, number] } | null = null;
    const visit = (u: number, v: number): void => {
      const [x, y, z] = surface.at(u, v);
      const [sx, sy] = P(x, y, z);
      const cur = { u, v, vis: surface.visible(u, v), s: [r2(sx), r2(sy)] as [number, number] };
      if (prev && prev.vis && cur.vis) {
        if (run.length === 0) run.push(prev.s);
        run.push(cur.s);
      } else {
        flush();
      }
      prev = cur;
    };
    for (let i = 0; i < stroke.length; i++) {
      const u1 = toU(stroke[i][0]);
      const v1 = toV(stroke[i][1]);
      if (i > 0 && surface.curved) {
        const [u0, v0] = [toU(stroke[i - 1][0]), toV(stroke[i - 1][1])];
        const n = Math.ceil(Math.hypot(u1 - u0, v1 - v0) / MAX_STEP);
        for (let k = 1; k < n; k++) visit(u0 + ((u1 - u0) * k) / n, v0 + ((v1 - v0) * k) / n);
      }
      visit(u1, v1);
    }
    flush();
    prev = null;
  }
  return d;
}
