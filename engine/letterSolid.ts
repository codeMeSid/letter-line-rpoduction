import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glyph } from './glyphs';

export interface LetterSolidOpts { height: number; radius: number }

const cache = new Map<string, THREE.BufferGeometry>();
const Y = new THREE.Vector3(0, 1, 0);

/**
 * Thick-stroke letter built from the single-stroke glyph: a cylinder per segment plus a sphere at every
 * stroke point, merged into one geometry. Upright in the x/z plane, reading +x, facing −y (thickness
 * along y). Normalised: bottom at z = 0, x-extent centred on 0. Cached per (char, height, radius) —
 * callers must NOT dispose it.
 */
export function letterGeometry(ch: string, o: LetterSolidOpts): THREE.BufferGeometry {
  const key = `${ch}|${o.height}|${o.radius}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const parts: THREE.BufferGeometry[] = [];
  for (const stroke of glyph(ch)) {
    const pts = stroke.map(([u, v]) => new THREE.Vector3(u * o.height, 0, (1 - v) * o.height));
    for (const p of pts) parts.push(new THREE.SphereGeometry(o.radius, 10, 6).translate(p.x, p.y, p.z));
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const len = a.distanceTo(b);
      if (len < 1e-6) continue;
      const g = new THREE.CylinderGeometry(o.radius, o.radius, len, 10, 1, true);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, b.clone().sub(a).normalize()));
      const m = a.clone().add(b).multiplyScalar(0.5);
      parts.push(g.translate(m.x, m.y, m.z));
    }
  }
  const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  for (const p of parts) p.dispose();
  merged.computeBoundingBox();
  const bb = merged.boundingBox!;
  merged.translate(-(bb.min.x + bb.max.x) / 2, 0, -bb.min.z);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  cache.set(key, merged);
  return merged;
}
