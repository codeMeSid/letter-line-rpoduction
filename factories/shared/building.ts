import * as THREE from 'three';
import type { Box2 } from '../../engine/factoryHost';
import type { Looks, MaterialRole } from '../../engine/looks';
import type { Vec3 } from '../../engine/types';
import { beam, box, column, disposeTree, hazardBand, housing, lamp, legs, merged } from './parts';

export interface Building {
  group: THREE.Group;
  height: number;
  /** Reject chute: product enters at the top end and slides down to the bottom end, over the bin. */
  chuteTop: Vec3;
  chuteBottom: Vec3;
  binPos: Vec3;
  /** Centre of the dock opening on the floor box's +x edge, and where the forklift parks inside. */
  dockDoor: Vec3;
  dockPark: Vec3;
  /** Where the sign product stands (in front of the sign board). */
  signAt: Vec3;
  /** Cheap no-op when unchanged. */
  setNight(on: boolean): void;
  dispose(): void;
}

const T = 8;       // wall thickness
const KNEE = 24;   // front knee wall / side walls' front height
const PLINTH = 40; // back wall concrete base
const SIGN = { w: 180, d: 10, h: 110 }; // h fits the sign product (a letter at scale 3 is ~92 tall)
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** Axis-aligned box geometry from extents (indexed, so any two cubes merge). */
export const cube = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
  new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

/**
 * The factory shell: a dollhouse cutaway with no roof. Tall back wall with a clerestory, side walls that
 * slope from a knee wall at the front up to the back wall (so the camera sees in), a +x dock door,
 * a sign above the back wall, and the reject chute + bin against the back wall. World coordinates, z up,
 * floor top at z = 0; the group sits at the world origin. Every mesh is cut-tagged (the cutaway slices the front away).
 */
export function buildBuilding(looks: Looks, floor: Box2, height: number): Building {
  const { x0, x1, y0, y1 } = floor;
  const H = height;
  const W = x1 - x0;
  const D = y1 - y0;
  const cx = (x0 + x1) / 2;
  const group = new THREE.Group();
  const wallH = (y: number) => KNEE + ((H - KNEE) * (y - y0)) / D; // side wall top at world y

  const part = (g: THREE.BufferGeometry, role: MaterialRole) => { const m = looks.part(g, role); group.add(m); return m; };
  const mergeAdd = (gs: THREE.BufferGeometry[], role: MaterialRole) => (gs.length ? (() => { const m = merged(looks, gs, role); group.add(m); return m; })() : null);
  const place = <O extends THREE.Object3D>(o: O, x: number, y: number, z: number): O => { o.position.set(x, y, z); group.add(o); return o; };

  // ---- back wall (y1 - T .. y1) ----
  const by = y1 - T;
  part(cube(x0, x1, by - 0.5, y1 + 0.5, 0, PLINTH), 'concrete');
  const zw0 = H - 90; // clerestory band
  const zw1 = H - 40;
  part(cube(x0, x1, by, y1, PLINTH, zw0), 'paint');
  part(cube(x0, x1, by, y1, zw1, H - 4), 'paint');
  part(cube(x0, x1, by - 2, y1, H - 4, H), 'steel'); // eave cap
  // girts: horizontal ribs on the inner face give the cladding its scale; one amber safety stripe
  const ribs: THREE.BufferGeometry[] = [];
  for (let z = PLINTH + 24; z < zw0 - 12; z += 48) ribs.push(cube(x0, x1, by - 1.4, by, z, z + 4));
  mergeAdd(ribs, 'steel');
  part(cube(x0, x1, by - 0.6, by, 100, 108), 'paint-accent');

  // pilasters: corners and every <= 160 along the back wall, flush with the outer face
  const nBack = Math.ceil(W / 160);
  const backCols = Array.from({ length: nBack + 1 }, (_, k) => Math.min(x1 - 6.3, Math.max(x0 + 6.3, x0 + (W * k) / nBack)));
  // windows: panes ~50 wide every 64, except where a pilaster stands
  const nPane = Math.max(0, Math.floor((W - 16) / 64));
  const pane0 = x0 + (W - (nPane - 1) * 64) / 2;
  const panes: number[] = [];
  for (let k = 0; k < nPane; k++) {
    const px = pane0 + k * 64;
    if (backCols.every((c) => Math.abs(c - px) >= 34)) panes.push(px);
  }
  const mid = (by + y1) / 2;
  const piers: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const frames: THREE.BufferGeometry[] = [];
  let edge = x0;
  for (const px of panes) {
    if (px - 25 > edge + 0.01) piers.push(cube(edge, px - 25, by, y1, zw0, zw1));
    edge = px + 25;
    glass.push(cube(px - 25, px + 25, mid - 0.75, mid + 0.75, zw0, zw1));
    glow.push(cube(px - 25, px + 25, mid - 1.2, mid - 0.6, zw0 + 1, zw1 - 1));
    // frame on the inner face: head, sill, two jambs, one mullion and one transom
    frames.push(
      cube(px - 26, px + 26, by - 1.4, by, zw1 - 2, zw1), cube(px - 27, px + 27, by - 2.6, by, zw0 - 2, zw0 + 1),
      cube(px - 26, px - 24, by - 1.4, by, zw0, zw1), cube(px + 24, px + 26, by - 1.4, by, zw0, zw1),
      cube(px - 0.6, px + 0.6, by - 1.2, by, zw0, zw1), cube(px - 25, px + 25, by - 1.2, by, (zw0 + zw1) / 2 - 0.6, (zw0 + zw1) / 2 + 0.6),
    );
  }
  if (edge < x1 - 0.01) piers.push(cube(edge, x1, by, y1, zw0, zw1));
  mergeAdd(piers, 'paint');
  mergeAdd(frames, 'steel');
  const glassMesh = mergeAdd(glass, 'glass');
  if (glassMesh) glassMesh.castShadow = false;
  const glowMesh = mergeAdd(glow, 'glow');
  if (glowMesh) glowMesh.visible = false;

  // wall lamps, mid-bay every <= 160, on short brackets
  const lamps: { set(on: boolean): void }[] = [];
  const brackets: THREE.BufferGeometry[] = [];
  for (let k = 0; k < nBack; k++) {
    const lx = x0 + (W * (k + 0.5)) / nBack;
    const l = lamp(looks, 4);
    place(l.group, lx, by - 9, 150);
    brackets.push(cube(lx - 1.5, lx + 1.5, by - 9, by, 144, 147));
    lamps.push(l);
  }
  mergeAdd(brackets, 'steel');

  // ---- side walls (x0 and x1): sloped, dock opening in the +x one ----
  const prism = (pts: [number, number][], lo: number, hi: number) =>
    new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v))), { depth: hi - lo, bevelEnabled: false })
      .applyMatrix4(new THREE.Matrix4().makeBasis(Y, Z, X)) // shape x → world y, shape y → world z, extrusion → world x
      .translate(lo, y0, 0);
  const DOCK_A = 30;
  const DOCK_B = 140;
  const sides: { lo: number; hi: number; cap: [number, number]; spans: [number, number][] }[] = [
    { lo: x0, hi: x0 + T, cap: [x0 - 0.5, x0 + T + 1], spans: [[0, D]] },
    { lo: x1 - T, hi: x1, cap: [x1 - T - 1, x1 + 0.5], spans: [[0, DOCK_A], [DOCK_B, D]] },
  ];
  const walls: THREE.BufferGeometry[] = [];
  const copings: THREE.BufferGeometry[] = [];
  const plinths: THREE.BufferGeometry[] = [];
  for (const s of sides) {
    for (const [a, c] of s.spans) {
      const ha = wallH(y0 + a);
      const hc = wallH(y0 + c);
      walls.push(prism([[a, 0], [c, 0], [c, hc], [a, ha]], s.lo, s.hi));
      copings.push(prism([[a, ha], [c, hc], [c, hc + 3], [a, ha + 3]], s.cap[0], s.cap[1]));
      plinths.push(prism([[a, 0], [c, 0], [c, 12], [a, 12]], s.cap[0], s.cap[1]));
    }
  }
  mergeAdd(walls, 'paint');
  mergeAdd(copings, 'concrete'); // not steel: a sloped metal cap edge-on in the cutaway view catches the env map and blooms white
  mergeAdd(plinths, 'concrete');

  // ---- front knee wall ----
  part(cube(x0, x1, y0 - 0.5, y0 + T + 0.5, 0, 10), 'concrete');
  part(cube(x0, x1, y0, y0 + T, 10, KNEE - 2), 'paint');
  part(cube(x0, x1, y0 - 0.5, y0 + T + 0.5, KNEE - 2, KNEE), 'steel');

  // ---- columns: four corners + every <= 160 along the side walls (the back wall's are in backCols) ----
  const cols: THREE.BufferGeometry[] = [];
  const colAt = (x: number, y: number, h: number) => cols.push(cube(x - 6, x + 6, y - 6, y + 6, 0, h));
  for (const x of backCols) colAt(x, y1 - 6.3, H);
  const nSide = Math.ceil(D / 160);
  for (const x of [x0 + 6.3, x1 - 6.3]) {
    colAt(x, y0 + 6.3, KNEE + 2);
    for (let k = 1; k < nSide; k++) {
      const y = y0 + (D * k) / nSide;
      if (x > cx && y - y0 > DOCK_A - 6 && y - y0 < DOCK_B + 6) continue; // not in the dock opening
      colAt(x, y, wallH(y));
    }
  }
  mergeAdd(cols, 'steel');

  // ---- dock door (+x side) ----
  const doorX = x1 - T / 2;
  const doorY = y0 + (DOCK_A + DOCK_B) / 2;
  place(column(looks, 3, 82, 'steel', 14), doorX, y0 + DOCK_A + 3, 0);
  place(column(looks, 3, 82, 'steel', 14), doorX, y0 + DOCK_B - 3, 0);
  group.add(beam(looks, [doorX, y0 + DOCK_A, 80], [doorX, y0 + DOCK_B, 80], 4));
  place(housing(looks, 8, DOCK_B - DOCK_A + 6, 14, 'paint-accent', 1.5), doorX, doorY, 82); // roll-up shutter box
  place(hazardBand(looks, 14, DOCK_B - DOCK_A, 0.6), x1 - 4, doorY, 0); // threshold
  place(box(looks, 70, 120, 2, 'concrete'), x1 + 35, doorY, -2); // apron
  for (const y of [y0 + 32, y0 + 138]) {
    place(column(looks, 3.5, 30, 'paint-accent', 12), x1 + 58, y, 0);
    place(column(looks, 3.7, 4, 'rubber', 12), x1 + 58, y, 20);
  }

  // ---- sign (rises above the back wall, centred) ----
  const sy = y1 - SIGN.d / 2; // board flush with the back face
  const sz = H - 30;
  place(box(looks, SIGN.w, SIGN.d, SIGN.h, 'paint'), cx, sy, sz);
  const fw = SIGN.w + 6;
  mergeAdd([
    cube(cx - fw / 2, cx + fw / 2, sy - 7, sy + 5, sz - 3, sz), cube(cx - fw / 2, cx + fw / 2, sy - 7, sy + 5, sz + SIGN.h, sz + SIGN.h + 3),
    cube(cx - fw / 2, cx - fw / 2 + 3, sy - 7, sy + 5, sz, sz + SIGN.h), cube(cx + fw / 2 - 3, cx + fw / 2, sy - 7, sy + 5, sz, sz + SIGN.h),
  ], 'steel');
  const signAt: Vec3 = [cx, y1 - SIGN.d - 14, sz + 6];

  // ---- reject chute (steel U-trough on two legs) + bin ----
  const chuteTop: Vec3 = [cx - 70, y1 - 34, 150];
  const chuteBottom: Vec3 = [cx + 70, y1 - 34, 58];
  const run = chuteBottom[0] - chuteTop[0];
  const drop = chuteTop[2] - chuteBottom[2];
  const L = Math.hypot(run, drop);
  const trough = new THREE.Group();
  const hl = L / 2;
  const tg = [cube(-hl, hl, -13, 13, -2.5, 0), cube(-hl, hl, -13, -11, 0, 9), cube(-hl, hl, 11, 13, 0, 9), cube(-hl - 2, -hl, -13, 13, -2.5, 14)];
  for (let s = -hl + 20; s < hl; s += 40) tg.push(cube(s - 1, s + 1, -11, 11, -5, -2.5)); // underside ribs
  trough.add(merged(looks, tg, 'steel'));
  const flap = box(looks, 2, 24, 10, 'rubber');
  flap.position.set(hl, 0, -8);
  trough.add(flap);
  place(trough, cx, y1 - 34, (chuteTop[2] + chuteBottom[2]) / 2).rotation.y = Math.atan2(drop, run);
  for (const u of [0.18, 0.82]) {
    const z = chuteTop[2] - drop * u - 5.5;
    place(legs(looks, 12, 26, z, 3), chuteTop[0] + run * u, y1 - 34, z);
  }
  const binPos: Vec3 = [cx + 120, y1 - 34, 0];
  const [bx, by0, bz] = binPos;
  mergeAdd([
    cube(bx - 30, bx + 30, by0 - 22, by0 + 22, 8, 11), cube(bx - 30, bx + 30, by0 - 22, by0 - 20, 11, 46), cube(bx - 30, bx + 30, by0 + 20, by0 + 22, 11, 46),
    cube(bx - 30, bx - 28, by0 - 20, by0 + 20, 11, 46), cube(bx + 28, bx + 30, by0 - 20, by0 + 20, 11, 46),
  ], 'paint');
  mergeAdd([
    cube(bx - 31, bx + 31, by0 - 23, by0 - 19, 43, 46), cube(bx - 31, bx + 31, by0 + 19, by0 + 23, 43, 46),
    cube(bx - 31, bx - 27, by0 - 19, by0 + 19, 43, 46), cube(bx + 27, bx + 31, by0 - 19, by0 + 19, 43, 46),
  ], 'steel');
  part(cube(bx - 20, bx + 20, by0 - 22.4, by0 - 22, 20, 30), 'paint-accent'); // label plate
  const forks: THREE.BufferGeometry[] = [];
  for (const sx of [-24, 24]) for (const sy2 of [-16, 16]) {
    const wheel = column(looks, 4, 3, 'rubber', 14);
    wheel.rotation.y = Math.PI / 2; // axis → x
    place(wheel, bx + sx - 1.5, by0 + sy2, bz + 4);
    forks.push(cube(bx + sx - 3, bx + sx + 3, by0 + sy2 - 3, by0 + sy2 + 3, 8, 9.5), cube(bx + sx - 2.6, bx + sx - 1.8, by0 + sy2 - 2, by0 + sy2 + 2, 1, 8), cube(bx + sx + 1.8, bx + sx + 2.6, by0 + sy2 - 2, by0 + sy2 + 2, 1, 8));
  }
  mergeAdd(forks, 'steel');

  // ---- done: cut-tag everything (the cutaway slices the building too) and re-pick materials ----
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.userData.cut = true; });
  looks.apply(group);

  let night = false;
  return {
    group, height: H, chuteTop, chuteBottom, binPos, signAt,
    dockDoor: [x1, doorY, 0],
    dockPark: [x1 - 110, doorY, 0],
    setNight(on) {
      if (on === night) return;
      night = on;
      if (glassMesh) glassMesh.visible = !on;
      if (glowMesh) glowMesh.visible = on;
      for (const l of lamps) l.set(on);
    },
    dispose() { disposeTree(group); },
  };
}
