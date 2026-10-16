import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Looks, MaterialRole } from '../../engine/looks';
import type { Vec3 } from '../../engine/types';

const up = (g: THREE.BufferGeometry, h: number) => g.rotateX(Math.PI / 2).translate(0, 0, h / 2);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Dispose every geometry under `root` (parts own theirs; materials belong to Looks) and detach it. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
  });
  root.removeFromParent();
}

/** One mesh from many geometries (sources are disposed). Keeps draw calls down for legs, posts, plates. */
export function merged(looks: Looks, geoms: THREE.BufferGeometry[], role: MaterialRole): THREE.Mesh {
  const g = mergeGeometries(geoms, false);
  for (const s of geoms) s.dispose();
  if (!g) throw new Error('parts.merged: incompatible geometries');
  return looks.part(g, role);
}

/** Role-tagged InstancedMesh (so Looks.apply restyles it like any part). */
function instanced(looks: Looks, geom: THREE.BufferGeometry, role: MaterialRole, mats: THREE.Matrix4[]): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geom, looks.material(role), mats.length);
  mats.forEach((mat, i) => m.setMatrixAt(i, mat));
  m.instanceMatrix.needsUpdate = true;
  m.userData.role = role;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Rounded box, bottom at z=0. */
export function housing(looks: Looks, w: number, d: number, h: number, role: MaterialRole = 'paint', r = 2): THREE.Mesh {
  return looks.part(new RoundedBoxGeometry(w, d, h, 3, Math.min(r, w / 2, d / 2, h / 2)).translate(0, 0, h / 2), role);
}

/** Sharp box, bottom at z=0. */
export function box(looks: Looks, w: number, d: number, h: number, role: MaterialRole): THREE.Mesh {
  return looks.part(new THREE.BoxGeometry(w, d, h).translate(0, 0, h / 2), role);
}

/** Vertical cylinder, bottom at z=0. */
export function column(looks: Looks, r: number, h: number, role: MaterialRole = 'steel', seg = 16): THREE.Mesh {
  return looks.part(up(new THREE.CylinderGeometry(r, r, h, seg), h), role);
}

/** Square-section beam between two points. */
export function beam(looks: Looks, from: Vec3, to: Vec3, size: number, role: MaterialRole = 'steel'): THREE.Mesh {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(size, size, len);
  const m = looks.part(g, role);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
  return m;
}

/** Tube through points (gentle bends), with both ends capped so it never reads as hollow. */
export function pipe(looks: Looks, pts: Vec3[], r: number, role: MaterialRole = 'steel'): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.1);
  const tube = new THREE.TubeGeometry(curve, Math.max(8, pts.length * 12), r, 12, false);
  const z = new THREE.Vector3(0, 0, 1);
  const caps = [0, 1].map((u) => {
    const out = curve.getTangentAt(u).multiplyScalar(u === 0 ? -1 : 1);
    return new THREE.CircleGeometry(r, 12)
      .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(z, out))
      .translate(...curve.getPointAt(u).toArray());
  });
  return merged(looks, [tube, ...caps], role);
}

/**
 * LatheGeometry smooths normals across profile points, which rounds off hard corners (and hides their
 * crease line in line-art). Corners sharper than ~35 degrees get a point 1/1000 unit before and after them,
 * so each flank keeps its own normal; gentle curves stay smooth.
 */
function sharpen(profile: [number, number][]): THREE.Vector2[] {
  const eps = 1e-3;
  const out: THREE.Vector2[] = [];
  profile.forEach(([x, y], i) => {
    const c = new THREE.Vector2(x, y);
    const p = profile[i - 1];
    const n = profile[i + 1];
    if (p && n) {
      const din = c.clone().sub(new THREE.Vector2(...p)).normalize();
      const dout = new THREE.Vector2(...n).sub(c).normalize();
      if (din.dot(dout) < Math.cos(0.6)) {
        out.push(c.clone().addScaledVector(din, -eps), c, c.clone().addScaledVector(dout, eps));
        return;
      }
    }
    out.push(c);
  });
  return out;
}

/** Lathe around the z axis; profile = [radius, z] pairs. */
export function lathe(looks: Looks, profile: [number, number][], role: MaterialRole, seg = 32): THREE.Mesh {
  const g = new THREE.LatheGeometry(sharpen(profile), seg).rotateX(Math.PI / 2);
  return looks.part(g, role);
}

/** Ring plate (radius r, 2 thick) with a 2.5 tall pipe neck (group height 2 + 2.5 = 4.5) and `bolts` instanced
 *  hex bolt heads (1.5 tall, on the plate at z=2) on a circle of 0.8r; group bottom at z=0. The bore stays open (radius 0.4r). */
export function flange(looks: Looks, r: number, bolts: number, role: MaterialRole = 'steel'): THREE.Group {
  const g = new THREE.Group();
  const ri = r * 0.4;
  const rc = r * 0.55;
  // Plate with a short pipe neck; hole stays open so a pipe can run through.
  g.add(lathe(looks, [[ri, 0], [r, 0], [r, 2], [rc, 2], [rc, 4.5], [ri, 4.5], [ri, 0]], role, 32));
  const br = Math.max(0.5, r * 0.07);
  const mats: THREE.Matrix4[] = [];
  for (let i = 0; i < bolts; i++) {
    const a = (i / bolts) * Math.PI * 2;
    mats.push(new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8, 2),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a),
      new THREE.Vector3(1, 1, 1),
    ));
  }
  if (bolts > 0) g.add(instanced(looks, up(new THREE.CylinderGeometry(br, br, 1.5, 6), 1.5), role, mats));
  return g;
}

/** Hydraulic cylinder hanging from z=0: body (radius `body`, length `len`) above the mount line at z∈[0, len],
 *  rod (radius `rod`) below it; set(ext 0..1) slides the rod's lower end from z=0 down to z=-stroke. Rod visible length = stroke + 4. */
export function piston(looks: Looks, o: { body: number; rod: number; len: number; stroke: number; role?: MaterialRole }): { group: THREE.Group; rodEnd: THREE.Object3D; set(ext: number): void } {
  const { body, rod, len, stroke } = o;
  const gl = 2.5; // end caps
  const group = new THREE.Group();
  // Rod gland: a ring whose hole is the rod, so the rod's bottom cap never z-fights the body.
  group.add(lathe(looks, [[rod, 0], [body * 1.15, 0], [body * 1.15, gl], [rod, gl], [rod, 0]], 'steel', 24));
  const barrel = column(looks, body, Math.max(0.1, len - 2 * gl), o.role ?? 'paint', 24);
  barrel.position.z = gl;
  const cap = column(looks, body * 1.15, gl, 'steel', 24);
  cap.position.z = len - gl;
  group.add(barrel, cap);
  // Hydraulic ports on the barrel.
  for (const z of [gl + 3, len - gl - 3]) {
    const port = column(looks, body * 0.2, body * 0.9, 'steel', 10);
    port.rotation.y = Math.PI / 2;
    port.position.set(body * 0.6, 0, z);
    group.add(port);
  }
  // Mounting lug with a cross pin.
  const lug = housing(looks, body * 1.4, 3, 6, 'steel', 1);
  lug.position.z = len;
  const pin = column(looks, 1.2, 6, 'steel', 10);
  pin.rotation.x = Math.PI / 2; // axis → -y
  pin.position.set(0, 3, len + 3.5);
  group.add(lug, pin);
  const rodEnd = new THREE.Group();
  rodEnd.add(column(looks, rod, stroke + 4, 'steel', 16));
  group.add(rodEnd);
  return {
    group,
    rodEnd,
    set(ext) {
      rodEnd.position.z = -stroke * clamp01(ext);
    },
  };
}

/** Spur gear: ExtrudeGeometry of a toothed outline (teeth × trapezoid teeth), axis z, bottom at z=0. */
export function gear(looks: Looks, r: number, teeth: number, thick: number, role: MaterialRole = 'steel'): THREE.Mesh {
  const root = r * 0.82;
  const pitch = (Math.PI * 2) / teeth;
  const shape = new THREE.Shape();
  let first = true;
  for (let i = 0; i < teeth; i++) {
    const c = (i + 0.25) * pitch;
    const pts: [number, number][] = [
      [root, c - 0.22 * pitch], [r, c - 0.12 * pitch], [r, c + 0.12 * pitch], [root, c + 0.22 * pitch],
    ];
    for (const [rad, a] of pts) {
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      if (first) shape.moveTo(x, y);
      else shape.lineTo(x, y);
      first = false;
    }
  }
  shape.closePath();
  const hole = (x: number, y: number, hr: number) => {
    const p = new THREE.Path();
    p.absarc(x, y, hr, 0, Math.PI * 2, true);
    shape.holes.push(p);
  };
  hole(0, 0, r * 0.22);
  if (r >= 12) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      hole(Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58, r * 0.12);
    }
  }
  return looks.part(new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 10 }), role);
}

/**
 * Round dial facing −y: housing ring (steel), face (glow), needle (rubber, name 'needle', rotates about y; set(v 0..1) maps to -135°..135°).
 * The glow face is an illuminated scale ring around a dark centre: a full HDR disc blooms into a white blob and hides the needle.
 */
export function gauge(looks: Looks, r: number): { group: THREE.Group; set(v: number): void } {
  const group = new THREE.Group();
  const d = r * 0.3;
  // rotation.x = π/2 sends a part's +z (its front) to −y.
  const bezel = lathe(looks, [[r * 0.84, 0], [r, 0], [r, d], [r * 0.84, d], [r * 0.84, 0]], 'steel', 28);
  const ring = lathe(looks, [[r * 0.6, 0], [r * 0.86, 0], [r * 0.86, r * 0.06], [r * 0.6, r * 0.06], [r * 0.6, 0]], 'glow', 28);
  ring.position.y = -r * 0.1; // recessed behind the bezel lip
  const centre = column(looks, r * 0.62, r * 0.08, 'paint', 28);
  centre.position.y = -r * 0.1;
  const stem = column(looks, r * 0.18, r * 0.5, 'steel', 10);
  stem.rotation.x = -Math.PI / 2; // axis → +y, behind the dial
  for (const m of [bezel, ring, centre]) m.rotation.x = Math.PI / 2;
  group.add(bezel, ring, centre, stem);
  for (let k = 0; k < 7; k++) {
    const a = ((-135 + k * 45) * Math.PI) / 180;
    const tick = looks.part(new THREE.BoxGeometry(r * 0.07, r * 0.04, r * 0.2), 'rubber', false);
    tick.position.set(Math.sin(a) * r * 0.73, -r * 0.18, Math.cos(a) * r * 0.73);
    tick.rotation.y = a;
    group.add(tick);
  }
  const needle = looks.part(new THREE.BoxGeometry(r * 0.09, r * 0.04, r * 0.9).translate(0, 0, r * 0.33), 'rubber', false);
  needle.name = 'needle';
  needle.position.y = -r * 0.21;
  const hub = column(looks, r * 0.14, r * 0.08, 'steel', 12);
  hub.rotation.x = Math.PI / 2;
  hub.position.y = -r * 0.23;
  group.add(needle, hub);
  return {
    group,
    set(v) {
      needle.rotation.y = ((-135 + clamp01(v) * 270) * Math.PI) / 180;
    },
  };
}

/** Small sphere lamp; set(on) swaps userData.role glow↔rubber and its material via looks.material(role). children[0] is the sphere. */
export function lamp(looks: Looks, r: number): { group: THREE.Group; set(on: boolean): void } {
  const group = new THREE.Group();
  const bulb = looks.part(new THREE.SphereGeometry(r, 14, 10), 'rubber');
  const collar = column(looks, r * 1.15, r * 0.7, 'steel', 14);
  collar.position.z = -r * 1.2;
  group.add(bulb, collar);
  return {
    group,
    set(on) {
      const role: MaterialRole = on ? 'glow' : 'rubber';
      bulb.userData.role = role;
      bulb.material = looks.material(role);
      bulb.castShadow = !on;
    },
  };
}

const BLINK_MS = [900, 1450, 2300];

/** Control box (paint) w × 10 × h with 3 lamps blinking at different rates and 2 buttons (paint-accent, rubber); update(now ms). Front faces −y. */
export function panel(looks: Looks, w: number, h: number): { group: THREE.Group; update(now: number): void } {
  const group = new THREE.Group();
  group.add(housing(looks, w, 10, h, 'paint', 1.5));
  // Indicator lamps: rotation.x = π/2 points a lamp's axis out of the front face (−y).
  const lampR = Math.min(2.2, w / 12);
  const lamps = BLINK_MS.map((_, i) => {
    const l = lamp(looks, lampR);
    l.group.rotation.x = Math.PI / 2;
    l.group.position.set((i - 1) * w * 0.26, -5 - lampR * 0.45, h * 0.8);
    group.add(l.group);
    return l;
  });
  // Push buttons, each in a steel bezel.
  const br = Math.min(3, w / 10);
  [['paint-accent', -1], ['rubber', 1]].forEach(([role, s]) => {
    const x = (s as number) * w * 0.2;
    const bezel = column(looks, br * 1.3, 0.8, 'steel', 16);
    const cap = column(looks, br, 2.5, role as MaterialRole, 16);
    for (const m of [bezel, cap]) {
      m.rotation.x = Math.PI / 2;
      m.position.set(x, -5, h * 0.42);
    }
    group.add(bezel, cap);
  });
  // Louvre ribs.
  for (let k = 0; k < 4; k++) {
    const rib = box(looks, w * 0.5, 0.6, 0.8, 'rubber');
    rib.position.set(0, -5, h * 0.1 + k * 1.7);
    group.add(rib);
  }
  // Corner screws.
  const mats: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  for (const sx of [-1, 1]) for (const sz of [2.5, h - 2.5]) {
    mats.push(new THREE.Matrix4().compose(new THREE.Vector3(sx * (w / 2 - 2.5), -5, sz), q, new THREE.Vector3(1, 1, 1)));
  }
  group.add(instanced(looks, up(new THREE.CylinderGeometry(0.9, 0.9, 0.8, 6), 0.8), 'steel', mats));
  const state = lamps.map(() => false);
  return {
    group,
    update(now) {
      lamps.forEach((l, i) => {
        const on = (now / BLINK_MS[i]) % 1 < 0.5;
        if (on !== state[i]) {
          state[i] = on;
          l.set(on);
        }
      });
    },
  };
}

type Pt = [number, number];
/** Clip a polygon to the half plane f(p) >= 0 (Sutherland–Hodgman). */
function clipHalf(poly: Pt[], f: (p: Pt) => number): Pt[] {
  const out: Pt[] = [];
  poly.forEach((cur, i) => {
    const prev = poly[(i + poly.length - 1) % poly.length];
    const fc = f(cur);
    const fp = f(prev);
    if ((fc >= 0) !== (fp >= 0)) {
      const t = fp / (fp - fc);
      out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
    }
    if (fc >= 0) out.push(cur);
  });
  return out;
}

/**
 * Diagonal hazard stripes: alternating paint-accent / rubber thin boxes covering w × d at height h (bottom z=0).
 * Stripes are 45° parallelograms clipped to the rectangle (so the band edge is flush), extruded h (accent) / h/2 (rubber).
 */
export function hazardBand(looks: Looks, w: number, d: number, h: number): THREE.Group {
  const group = new THREE.Group();
  const rect: Pt[] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  const sw = Math.max(2, Math.min(w, d) * 0.5) * Math.SQRT2; // stripe width along u = x - y
  const u0 = -(w + d) / 2;
  const count = Math.ceil((w + d) / sw);
  const shapes: [THREE.Shape[], THREE.Shape[]] = [[], []];
  for (let k = 0; k < count; k++) {
    const lo = u0 + k * sw;
    const hi = lo + sw;
    const poly = clipHalf(clipHalf(rect, ([x, y]) => x - y - lo), ([x, y]) => hi - (x - y));
    if (poly.length >= 3) shapes[k % 2].push(new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y))));
  }
  // The dark stripes sit at half height: that step is the only edge line-art can draw between two same-coloured stripes.
  (['paint-accent', 'rubber'] as const).forEach((role, i) => {
    if (shapes[i].length) group.add(looks.part(new THREE.ExtrudeGeometry(shapes[i], { depth: i === 0 ? h : h / 2, bevelEnabled: false }), role, false));
  });
  return group;
}

/** Guard railing: posts every ≤ 30 along the polyline, two rails at 0.55h and h, all steel 1.5 thick. */
export function railing(looks: Looks, pts: Vec3[], h: number): THREE.Group {
  const group = new THREE.Group();
  const posts: THREE.BufferGeometry[] = [];
  const post = (x: number, y: number, z: number) => {
    posts.push(up(new THREE.CylinderGeometry(0.75, 0.75, h + 0.75, 8), h + 0.75).translate(x, y, z));
    posts.push(new THREE.BoxGeometry(5, 5, 1).translate(x, y, z + 0.5));
  };
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (len < 1e-6) continue;
    const n = Math.ceil(len / 30);
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      post(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    }
    for (const z of [0.55 * h, h]) group.add(beam(looks, [a[0], a[1], a[2] + z], [b[0], b[1], b[2] + z], 1.5));
  }
  if (posts.length) group.add(merged(looks, posts, 'steel'));
  return group;
}

/** Four legs (steel, size×size) from z=-h up to z=0 at the corners of w × d (inset size), with feet plates. */
export function legs(looks: Looks, w: number, d: number, h: number, size = 4): THREE.Group {
  const group = new THREE.Group();
  const geoms: THREE.BufferGeometry[] = [];
  const cx = w / 2 - size / 2;
  const cy = d / 2 - size / 2;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    geoms.push(new THREE.BoxGeometry(size, size, h).translate(sx * cx, sy * cy, -h / 2));
    geoms.push(new THREE.BoxGeometry(size * 2, size * 2, 1.5).translate(sx * cx, sy * cy, -h + 0.75));
  }
  // Stretchers tie the legs into a frame.
  const t = size * 0.5;
  for (const s of [-1, 1]) {
    geoms.push(new THREE.BoxGeometry(Math.max(0.1, w - 2 * size), t, t).translate(0, s * cy, -h * 0.4));
    geoms.push(new THREE.BoxGeometry(t, Math.max(0.1, d - 2 * size), t).translate(s * cx, 0, -h * 0.4));
  }
  group.add(merged(looks, geoms, 'steel'));
  return group;
}
