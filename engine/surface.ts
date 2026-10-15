import { GLYPH_W } from './glyphs';
import type { Vec3 } from './types';

export const FRONT_ANGLE = -Math.PI / 2; // surfaces face the viewer at −y

/**
 * A 2D parameter space laid onto the world. (u, v) are normalised cell coordinates: u 0..1 runs
 * left→right as seen by the viewer (+x), v 0..1 runs top→bottom (v = 0 is the top edge).
 */
export interface Surface {
  at(u: number, v: number): Vec3;
  /** Straight (u, v) lines bend in 3D, so they get subdivided before use. */
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
    curved: false,
  };
}

/**
 * Wraps the cell around a vertical cylinder. u = 0.5 sits at `facingAngle` (radians around z; the
 * default points at the viewer at −y); the cell width spans `arc` radians. v = 0 is at z0 + height.
 * Reads +x (left→right on screen) for the front side.
 */
export function cylinderSurface(
  center: Vec3,
  radius: number,
  z0: number,
  height: number,
  facingAngle: number = FRONT_ANGLE,
  arc: number = Math.PI / 2,
): Surface {
  return {
    at: (u, v) => {
      const a = facingAngle + (u - 0.5) * arc;
      return [center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a), z0 + (1 - v) * height];
    },
    curved: true,
  };
}

/**
 * Flat horizontal disc face (cap / lid) at z = center[2]. The cell is the largest 0.7:1 rectangle
 * inside the disc, reading +x with the top toward +y (away from the viewer).
 */
export function topSurface(center: Vec3, radius: number): Surface {
  const h = radius * 1.6;
  const w = h * GLYPH_W;
  return flatSurface([center[0] - w / 2, center[1] + h / 2, center[2]], [1, 0, 0], [0, -1, 0], [w, h]);
}
