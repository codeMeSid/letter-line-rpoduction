import * as THREE from 'three';
import { BELT_STRIPE, type Looks } from '../../engine/looks';
import type { Vec3 } from '../../engine/types';
import { BELT_W } from './dims';
import { column, disposeTree, housing, lathe, merged } from './parts';

export interface Conveyor { group: THREE.Group; update(simDt: number, speed: number): void; dispose(): void }

const DRUM_R = 3;
const LEG_SPACING = 60;
const RAIL_Y = BELT_W / 2;

/** Flat-shaded octagonal drum along y: its spin shows in the lit shading and in the line-art crease pass. */
function drum(looks: Looks): THREE.Mesh {
  const g = new THREE.CylinderGeometry(DRUM_R, DRUM_R, BELT_W - 6, 8).toNonIndexed();
  g.computeVertexNormals();
  return looks.part(g, 'steel', false);
}

/** Pairs of 4×4 legs (with foot plates and a cross member) under a segment, from the floor up to local z = -6. */
function segmentLegs(looks: Looks, len: number, floorZ: number): THREE.Mesh {
  const h = floorZ - 6;
  const bays = Math.max(1, Math.ceil(len / LEG_SPACING));
  const geoms: THREE.BufferGeometry[] = [];
  for (let k = 0; k <= bays; k++) {
    const x = Math.min(len - 4, Math.max(4, (len * k) / bays));
    for (const s of [-1, 1]) {
      geoms.push(new THREE.BoxGeometry(4, 4, h).translate(x, s * RAIL_Y, -6 - h / 2));
      geoms.push(new THREE.BoxGeometry(8, 8, 1.5).translate(x, s * RAIL_Y, -floorZ + 0.75));
    }
    geoms.push(new THREE.BoxGeometry(3, BELT_W, 3).translate(x, 0, -6 - h * 0.35));
  }
  return merged(looks, geoms, 'steel');
}

/**
 * Belt conveyor along a layout path (world coords; each point's z is the belt top).
 *  - Horizontal segment a→b: a sub-group at a, yawed to atan2(dy, dx), containing
 *      belt: BoxGeometry(L, BELT_W - 6, 3) top at z=0, role 'belt', uv u scaled by L / BELT_STRIPE
 *            (multiply every uv.x by L / BELT_STRIPE) so the shared stripe texture scrolls along +x;
 *      side rails: two steel boxes (L × 3 × 7) at y = ±(BELT_W/2), z from -6 to +1;
 *      end drums: cylinders (r 3, length BELT_W - 6) along y at x=0 and x=L, z = -1.5,
 *            spun about their axis by simDt*speed/3 rad in update();
 *      legs: pairs every ≤ 60 units, steel 4×4, from the floor (local z = -pointZ) to z=-6.
 *  - Interior path vertices (snake U-turns) get a turntable: lathe disc r = BELT_W/2, 3 thick, role 'steel',
 *    top at z=0. Belts touching an interior vertex are shortened by BELT_W/2 at that end so they meet the disc.
 *  - Vertical segment (same x,y, different z): an elevator shaft housing BELT_W × BELT_W tall, role 'paint',
 *    from the lower z - 6 to the upper z.
 * `extendStart` / `extendEnd` (default 0) lengthen the first/last segment outward (so products at the
 * first/last station sit fully on a belt).
 */
export function buildConveyor(looks: Looks, path: Vec3[], opts: { extendStart?: number; extendEnd?: number } = {}): Conveyor {
  const group = new THREE.Group();
  const drums: THREE.Mesh[] = [];
  const last = path.length - 1;
  const vertical = (i: number) => Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]) < 1e-6;

  for (let i = 0; i < last; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (vertical(i)) {
      const lo = Math.min(a[2], b[2]);
      const shaft = housing(looks, BELT_W, BELT_W, Math.abs(b[2] - a[2]) + 6, 'paint', 3);
      shaft.position.set(a[0], a[1], lo - 6);
      group.add(shaft);
      continue;
    }
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const raw = Math.hypot(dx, dy);
    const ux = dx / raw;
    const uy = dy / raw;
    const trimA = i > 0 ? BELT_W / 2 : -(opts.extendStart ?? 0);
    const trimB = i + 1 < last ? BELT_W / 2 : -(opts.extendEnd ?? 0);
    const len = raw - trimA - trimB;
    if (len < 1) continue; // vertices closer than a turntable: nothing left to draw
    const seg = new THREE.Group();
    seg.position.set(a[0] + ux * trimA, a[1] + uy * trimA, a[2]);
    seg.rotation.z = Math.atan2(dy, dx);

    const bg = new THREE.BoxGeometry(len, BELT_W - 6, 3).translate(len / 2, 0, -1.5);
    const uv = bg.getAttribute('uv');
    for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) * len) / BELT_STRIPE);
    const belt = looks.part(bg, 'belt');
    seg.add(belt);
    for (const s of [-1, 1]) {
      const rail = housing(looks, len, 3, 7, 'steel', 1);
      rail.position.set(len / 2, s * RAIL_Y, -6);
      seg.add(rail);
    }
    for (const x of [0, len]) {
      const d = drum(looks);
      d.position.set(x, 0, -1.5);
      drums.push(d);
      seg.add(d);
    }
    if (a[2] > 7) seg.add(segmentLegs(looks, len, a[2])); // belt top at or below the rails: no room for legs
    group.add(seg);
  }

  // Turntables at snake corners (both neighbours horizontal).
  for (let i = 1; i < last; i++) {
    if (vertical(i - 1) || vertical(i)) continue;
    const R = BELT_W / 2;
    const v = path[i];
    const disc = lathe(looks, [[0, -3], [R, -3], [R, -1], [R - 1.5, 0], [0, 0]], 'steel', 36);
    const pedestal = column(looks, 5, v[2] - 3, 'steel', 16);
    pedestal.position.z = -v[2];
    const t = new THREE.Group();
    t.position.set(v[0], v[1], v[2]);
    t.add(disc, pedestal);
    group.add(t);
  }

  return {
    group,
    update(simDt, speed) {
      const a = (simDt * speed) / DRUM_R;
      for (const d of drums) d.rotation.y += a;
    },
    dispose() {
      disposeTree(group);
    },
  };
}
