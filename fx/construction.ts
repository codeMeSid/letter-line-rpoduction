import * as THREE from 'three';
import { SITE_SIZE, SITE_Y0, type Plot } from '../engine/campus';
import type { Looks, MaterialRole } from '../engine/looks';
import type { Vec3 } from '../engine/types';
import { cube } from '../factories/shared/building';
import { box, column, disposeTree, hazardBand, housing, lamp, merged, pipe } from '../factories/shared/parts';

const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);

const MAST_H = 380;
const MAST_HALF = 12;
const SLEW_Z = MAST_H + 6;   // z of the slewing platform's top
const JIB = 360;
const COUNTER = 120;
const BAY = 18;
const HOOK_DROP = 200;

/** Square-section bar between two points as baked geometry (so lattices can merge into one mesh). */
function strut(a: Vec3, b: Vec3, size: number): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const g = new THREE.BoxGeometry(size, size, va.distanceTo(vb));
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Z, vb.clone().sub(va).normalize()));
  const m = va.add(vb).multiplyScalar(0.5);
  return g.translate(m.x, m.y, m.z);
}

/** Tower-crane mast: four corner legs with a horizontal strut at each storey and one diagonal per face per storey. */
function mastLattice(x: number, y: number, z0: number, z1: number): THREE.BufferGeometry[] {
  const h = MAST_HALF;
  const c: [number, number][] = [[-h, -h], [h, -h], [h, h], [-h, h]];
  const n = Math.round((z1 - z0) / 24);
  const dz = (z1 - z0) / n;
  const out: THREE.BufferGeometry[] = [];
  for (const [cx, cy] of c) out.push(strut([x + cx, y + cy, z0], [x + cx, y + cy, z1], 2.6));
  for (let k = 0; k <= n; k++) {
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = c[i];
      const [bx, by] = c[(i + 1) % 4];
      out.push(strut([x + ax, y + ay, z0 + k * dz], [x + bx, y + by, z0 + k * dz], 1.4));
      if (k < n) {
        const flip = (k + i) % 2 === 0;
        out.push(strut([x + (flip ? ax : bx), y + (flip ? ay : by), z0 + k * dz], [x + (flip ? bx : ax), y + (flip ? by : ay), z0 + (k + 1) * dz], 1.2));
      }
    }
  }
  return out;
}

/** Triangular jib lattice along +x (local), from xa to xb: two bottom chords, one top chord, zig-zag web. */
function jibLattice(xa: number, xb: number, z: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const hw = 7;
  const top = 16;
  for (const y of [-hw, hw]) out.push(strut([xa, y, z], [xb, y, z], 2.4));
  out.push(strut([xa, 0, z + top], [xb, 0, z + top], 2.4));
  const n = Math.max(1, Math.round(Math.abs(xb - xa) / BAY));
  const dx = (xb - xa) / n;
  for (let k = 0; k <= n; k++) out.push(strut([xa + k * dx, -hw, z], [xa + k * dx, hw, z], 1.4));
  for (let k = 0; k < n; k++) {
    for (const s of [-1, 1]) {
      const up = k % 2 === 0;
      const p: Vec3 = [xa + k * dx, up ? s * hw : 0, z + (up ? 0 : top)];
      const q: Vec3 = [xa + (k + 1) * dx, up ? 0 : s * hw, z + (up ? top : 0)];
      out.push(strut(p, q, 1.2));
    }
  }
  return out;
}

/** I-beam (flange 14, depth 16, length `len` along x), centred at (cx, cy) with its bottom at z. */
function iBeam(cx: number, cy: number, z: number, len: number): THREE.BufferGeometry {
  const w = 7;
  const t = 0.9;
  const pts: [number, number][] = [[-w, 0], [w, 0], [w, 2], [t, 2], [t, 14], [w, 14], [w, 16], [-w, 16], [-w, 14], [-t, 14], [-t, 2], [-w, 2]];
  return new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v))), { depth: len, bevelEnabled: false })
    .applyMatrix4(new THREE.Matrix4().makeBasis(Y, Z, X)) // shape x → world y, shape y → world z, extrusion → world x
    .translate(cx - len / 2, cy, z);
}

/**
 * A plot that is not built yet: fenced concrete slab with rebar, a tower crane that slews, a site cabin,
 * a pile of I-beams and a hazard sign at the gate. World coordinates, floor top z = 0, spans the plot x0..x1 and SITE_Y0..SITE_Y0 + SITE_SIZE[1].
 */
export class ConstructionSite {
  readonly group = new THREE.Group();
  private slew = new THREE.Group();
  private lamp: ReturnType<typeof lamp>;
  private glass: THREE.Mesh | null = null;
  private glow: THREE.Mesh | null = null;
  private zTop = 0;
  private t = 0;
  private night = false;

  constructor(looks: Looks, private plot: Plot) {
    const { x0, x1 } = plot;
    const y0 = SITE_Y0;
    const y1 = SITE_Y0 + SITE_SIZE[1];
    const cx = (x0 + x1) / 2;
    const g = this.group;
    const mergeAdd = (gs: THREE.BufferGeometry[], role: MaterialRole, into: THREE.Object3D = g) => {
      if (!gs.length) return null;
      const m = merged(looks, gs, role);
      into.add(m);
      return m;
    };
    const put = <O extends THREE.Object3D>(o: O, x: number, y: number, z: number, into: THREE.Object3D = g): O => { o.position.set(x, y, z); into.add(o); return o; };

    // ---- slab + rebar ----
    const slab = housing(looks, x1 - x0 - 80, y1 - y0 - 80, 4, 'concrete', 2);
    slab.position.set(cx, (y0 + y1) / 2, -4);
    slab.castShadow = false;
    g.add(slab);
    const rebar: THREE.BufferGeometry[] = [];
    const rx = Array.from({ length: 6 }, (_, i) => x0 + 200 + i * 100);
    const ry = Array.from({ length: 4 }, (_, j) => y0 + 180 + j * 70);
    for (const x of rx) for (const y of ry) rebar.push(new THREE.CylinderGeometry(1.1, 1.1, 30, 6).rotateX(Math.PI / 2).translate(x, y, 15));
    for (const y of ry) rebar.push(cube(rx[0] - 4, rx[rx.length - 1] + 4, y - 0.6, y + 0.6, 21, 22.2));
    for (const x of rx) rebar.push(cube(x - 0.6, x + 0.6, ry[0] - 4, ry[ry.length - 1] + 4, 11, 12.2));
    mergeAdd(rebar, 'copper');

    // ---- perimeter fence with a gate at the front centre ----
    const fx0 = x0 + 14;
    const fx1 = x1 - 14;
    const fy0 = y0 + 14;
    const fy1 = y1 - 14;
    const GATE = 90;
    const posts: THREE.BufferGeometry[] = [];
    const rails: THREE.BufferGeometry[] = [];
    const run = (a: Vec3, b: Vec3) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(len / 60));
      for (let k = 0; k <= n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n;
        const y = a[1] + ((b[1] - a[1]) * k) / n;
        posts.push(cube(x - 1.5, x + 1.5, y - 1.5, y + 1.5, 0, 50));
        if (k < n) {
          const nx = a[0] + ((b[0] - a[0]) * (k + 1)) / n;
          const ny = a[1] + ((b[1] - a[1]) * (k + 1)) / n;
          rails.push(strut([x, y, k % 2 ? 46 : 4], [nx, ny, k % 2 ? 4 : 46], 0.9)); // temporary-fence cross brace
        }
      }
      for (const z of [22, 44]) rails.push(strut([a[0], a[1], z], [b[0], b[1], z], 1.6));
    };
    run([fx0, fy0, 0], [cx - GATE / 2, fy0, 0]);
    run([cx + GATE / 2, fy0, 0], [fx1, fy0, 0]);
    run([fx1, fy0, 0], [fx1, fy1, 0]);
    run([fx1, fy1, 0], [fx0, fy1, 0]);
    run([fx0, fy1, 0], [fx0, fy0, 0]);
    for (const x of [cx - GATE / 2, cx + GATE / 2]) posts.push(cube(x - 2.5, x + 2.5, fy0 - 2.5, fy0 + 2.5, 0, 58));
    mergeAdd(posts, 'steel');
    mergeAdd(rails, 'steel');

    // ---- hazard sign on two posts beside the gate (stripes face the road) ----
    const sx = cx - GATE / 2 - 55;
    const sy = y0 + 8;
    mergeAdd([cube(sx - 37, sx - 35, sy - 1, sy + 1, 0, 64), cube(sx + 35, sx + 37, sy - 1, sy + 1, 0, 64)], 'steel');
    const board = hazardBand(looks, 70, 26, 1.2);
    board.rotation.x = Math.PI / 2; // footprint → vertical plane, stripes toward −y
    put(board, sx, sy, 38 + 13);

    // ---- tower crane, back-left ----
    const mx = x0 + 150;
    const my = y0 + 480;
    mergeAdd([cube(mx - 30, mx + 30, my - 30, my + 30, 0, 10)], 'concrete');
    mergeAdd([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => cube(mx + a * 22 - 8, mx + a * 22 + 8, my + b * 22 - 8, my + b * 22 + 8, 10, 22)), 'concrete');
    mergeAdd(mastLattice(mx, my, 10, MAST_H), 'paint-accent');
    put(column(looks, 17, 6, 'steel', 20), mx, my, MAST_H); // slewing ring
    const slew = this.slew;
    slew.name = 'jib';
    slew.position.set(mx, my, SLEW_Z);
    g.add(slew);
    slew.add(housing(looks, 56, 34, 6, 'steel', 1));
    // jib + counter-jib lattices, A-frame and pendant cables
    const J = 6; // lattice bottom chords sit on the platform
    mergeAdd(jibLattice(24, JIB, J), 'paint-accent', slew);
    mergeAdd(jibLattice(-COUNTER, -24, J), 'paint-accent', slew);
    const apex: Vec3 = [0, 0, 70];
    mergeAdd([[8, 8], [-8, 8], [8, -8], [-8, -8]].map(([a, b]) => strut([a, b, J], apex, 2.4)), 'paint-accent', slew);
    mergeAdd([[150, 0, J + 16], [JIB - 30, 0, J + 16], [-COUNTER + 20, 0, J + 16], [-60, 0, J + 16]].map((p) => strut(apex, p as Vec3, 0.9)), 'steel', slew);
    // counterweight (hung under the counter-jib end), winch house
    mergeAdd([cube(-COUNTER - 8, -COUNTER + 14, -16, -1, -14, J), cube(-COUNTER - 8, -COUNTER + 14, 1, 16, -14, J)], 'concrete', slew);
    put(housing(looks, 28, 22, 16, 'paint', 2), -66, 0, J, slew);
    // operator cab beside the jib root, windows toward the jib and to the side
    put(housing(looks, 22, 22, 26, 'paint-accent', 2), 20, -29, 0, slew);
    mergeAdd([cube(31, 32.2, -37, -21, 8, 22), cube(12, 28, -40.2, -39, 8, 22)], 'glass', slew)!.castShadow = false;
    // trolley on the jib, hoist cable, hook block and hook
    const tx = 230;
    put(box(looks, 16, 22, 6, 'steel'), tx, 0, J - 6, slew);
    mergeAdd([cube(tx - 2.6, tx - 1.8, -0.4, 0.4, -HOOK_DROP, J - 6), cube(tx + 1.8, tx + 2.6, -0.4, 0.4, -HOOK_DROP, J - 6)], 'steel', slew);
    put(housing(looks, 10, 12, 14, 'paint-accent', 2), tx, 0, -HOOK_DROP - 14, slew);
    slew.add(pipe(looks, [[tx, 0, -HOOK_DROP - 14], [tx, 0, -HOOK_DROP - 21], [tx + 4, 0, -HOOK_DROP - 27], [tx, 0, -HOOK_DROP - 31], [tx - 4, 0, -HOOK_DROP - 27]], 1.3, 'steel', 6));
    // red-flag lamp at the jib tip
    this.lamp = lamp(looks, 3);
    put(this.lamp.group, JIB - 2, 0, J + 16 + 4, slew);

    // ---- site cabin with lit windows, front-right ----
    const bx = x0 + 740;
    const by = y0 + 120;
    mergeAdd([cube(bx - 62, bx + 62, by - 32, by + 32, 0, 4)], 'steel');
    put(housing(looks, 120, 60, 50, 'paint-accent', 3), bx, by, 4);
    put(housing(looks, 126, 66, 3, 'paint', 1), bx, by, 54);
    put(box(looks, 22, 14, 10, 'steel'), bx - 30, by + 6, 57); // roof AC unit
    const fy = by - 30; // front face
    put(box(looks, 16, 1.5, 34, 'paint'), bx + 38, fy - 0.6, 4); // door
    mergeAdd([cube(bx + 29, bx + 47, fy - 12, fy - 0.5, 0, 4), cube(bx + 29, bx + 47, fy - 18, fy - 12, 0, 2)], 'steel'); // steps
    const winX = [bx - 38, bx - 6];
    this.glass = mergeAdd(winX.map((x) => cube(x - 13, x + 13, fy - 0.8, fy - 0.2, 22, 42)), 'glass');
    this.glow = mergeAdd(winX.map((x) => cube(x - 13, x + 13, fy - 1.4, fy - 0.8, 22, 42)), 'glow');
    mergeAdd(winX.flatMap((x) => [
      cube(x - 14.5, x + 14.5, fy - 1.6, fy - 0.2, 42, 44), cube(x - 14.5, x + 14.5, fy - 1.6, fy - 0.2, 20, 22),
      cube(x - 14.5, x - 13, fy - 1.6, fy - 0.2, 22, 42), cube(x + 13, x + 14.5, fy - 1.6, fy - 0.2, 22, 42),
    ]), 'steel');
    if (this.glass) this.glass.castShadow = false;
    if (this.glow) this.glow.visible = false;

    // ---- I-beam pile: three layers of three, wood dunnage between ----
    const px = x0 + 640;
    const py = y0 + 560;
    const beams: THREE.BufferGeometry[] = [];
    const wood: THREE.BufferGeometry[] = [];
    for (let layer = 0; layer < 3; layer++) {
      const z = 6 + layer * 22;
      for (const dy of [-16, 0, 16]) beams.push(iBeam(px, py + dy, z, 150));
    }
    for (let layer = 0; layer < 3; layer++) for (const dx of [-50, 50]) wood.push(cube(px + dx - 4, px + dx + 4, py - 32, py + 32, layer * 22, layer * 22 + 6));
    mergeAdd(beams, 'steel');
    mergeAdd(wood, 'wood');

    this.zTop = new THREE.Box3().setFromObject(g).max.z;
  }

  /** The site's footprint (the plot span at the construction band) and its real height (the crane). */
  bounds(): { min: Vec3; max: Vec3 } {
    return { min: [this.plot.x0, SITE_Y0, 0], max: [this.plot.x1, SITE_Y0 + SITE_SIZE[1], this.zTop] };
  }

  /** Real-time: the crane slews slowly back and forth. */
  update(realDt: number): void {
    this.t += realDt;
    this.slew.rotation.z = 0.6 * Math.sin(this.t * 0.08);
  }

  /** Cabin windows and the crane lamp light up; a no-op when unchanged. */
  setNight(on: boolean): void {
    if (on === this.night) return;
    this.night = on;
    if (this.glass) this.glass.visible = !on;
    if (this.glow) this.glow.visible = on;
    this.lamp.set(on);
  }

  dispose(): void {
    disposeTree(this.group);
  }
}
