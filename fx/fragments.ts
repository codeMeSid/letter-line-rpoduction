import * as THREE from 'three';
import type { Looks, MaterialRole } from '../engine/looks';
import type { Vec3 } from '../engine/types';

const CAP = 128;      // chunks per role pool; extra chunks of an over-full burst are dropped
const LIFE = 2.5;     // seconds a chunk lives
const SHRINK = 0.4;   // last seconds of life: scale down to nothing
const GRAVITY = 380;  // world units / s² along -z (same as engine/particles)
const BOUNCE = 0.35;
const FRICTION = 0.6; // xy velocity kept per floor contact

// record layout of one chunk in a pool's Float32Array
const [PX, PY, PZ, VX, VY, VZ, AX, AY, AZ, RATE, ANGLE, AGE, SIZE, FLOOR, SX, SY, SZ] = Array.from({ length: 17 }, (_, i) => i);
const STRIDE = 17;

interface Pool { mesh: THREE.InstancedMesh; n: number; data: Float32Array; dirty: boolean }

export interface Pile { group: THREE.Group; dispose(): void }

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// scratch (no per-frame allocation)
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();

/** Pooled steel-chunk debris: instanced flying chunks (burst) and static heaps (pile). One shared geometry. */
export class Fragments {
  readonly group = new THREE.Group();
  private geo = new THREE.IcosahedronGeometry(1, 0);
  private pools = new Map<MaterialRole, Pool>();
  private piles = new Set<Pile>();

  constructor(private looks: Looks) {}

  burst(role: MaterialRole, pos: Vec3, count: number, size: number, floor: number): void {
    const pool = this.pool(role);
    for (let k = 0; k < count && pool.n < CAP; k++) {
      const d = pool.data;
      const o = pool.n++ * STRIDE;
      const ang = rnd(0, Math.PI * 2);
      const out = rnd(60, 160);
      d[o + PX] = pos[0] + rnd(-size, size);
      d[o + PY] = pos[1] + rnd(-size, size);
      d[o + PZ] = pos[2] + rnd(-size, size);
      d[o + VX] = Math.cos(ang) * out;
      d[o + VY] = Math.sin(ang) * out;
      d[o + VZ] = rnd(80, 200);
      _a.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize();
      d[o + AX] = _a.x; d[o + AY] = _a.y; d[o + AZ] = _a.z;
      d[o + RATE] = rnd(4, 14) * (Math.random() < 0.5 ? -1 : 1);
      d[o + ANGLE] = rnd(0, Math.PI * 2);
      d[o + AGE] = 0;
      d[o + SIZE] = size;
      d[o + FLOOR] = Math.min(floor, pos[2]);
      d[o + SX] = rnd(0.6, 1.3); d[o + SY] = rnd(0.6, 1.3); d[o + SZ] = rnd(0.4, 1);
    }
    this.write(pool);
  }

  /** A static heap of `count` chunks lying around `pos` (+ a liquid puddle), for debris mode. */
  pile(role: MaterialRole, pos: Vec3, count: number, size: number, puddle: boolean): Pile {
    const group = new THREE.Group();
    const own: THREE.BufferGeometry[] = [];
    for (let i = 0; i < count; i++) {
      const m = this.looks.part(this.geo, role);
      const sx = size * rnd(0.7, 1.3);
      const sy = size * rnd(0.7, 1.3);
      const sz = size * rnd(0.4, 0.7);
      m.scale.set(sx, sy, sz);
      m.rotation.set(rnd(0, 6.28), rnd(0, 6.28), rnd(0, 6.28));
      m.position.set(pos[0] + rnd(-6, 6), pos[1] + rnd(-6, 6), pos[2] + sz * 0.5);
      group.add(m);
    }
    if (puddle) {
      const g = new THREE.CylinderGeometry(9, 9, 0.6, 20).rotateX(Math.PI / 2);
      own.push(g);
      const disc = this.looks.part(g, 'liquid', false);
      disc.position.set(pos[0], pos[1], pos[2] + 0.3);
      group.add(disc);
    }
    this.group.add(group);
    const pile: Pile = {
      group,
      dispose: () => {
        for (const g of own) g.dispose();
        group.removeFromParent();
        this.piles.delete(pile);
      },
    };
    this.piles.add(pile);
    return pile;
  }

  update(dt: number): void {
    for (const pool of this.pools.values()) {
      if (pool.n === 0 && !pool.dirty) continue;
      const d = pool.data;
      for (let i = 0; i < pool.n; ) {
        const o = i * STRIDE;
        d[o + AGE] += dt;
        if (d[o + AGE] >= LIFE) { // swap-remove: the last live chunk takes this slot
          pool.n--;
          if (i !== pool.n) d.copyWithin(o, pool.n * STRIDE, pool.n * STRIDE + STRIDE);
          continue;
        }
        d[o + ANGLE] += d[o + RATE] * dt;
        d[o + VZ] -= GRAVITY * dt;
        d[o + PX] += d[o + VX] * dt;
        d[o + PY] += d[o + VY] * dt;
        d[o + PZ] += d[o + VZ] * dt;
        const rest = d[o + FLOOR] + d[o + SIZE] * 0.5; // a chunk's centre rests half its size above the floor
        if (d[o + PZ] < rest) {
          d[o + PZ] = rest;
          d[o + VZ] = d[o + VZ] < -25 ? -d[o + VZ] * BOUNCE : 0;
          d[o + VX] *= FRICTION;
          d[o + VY] *= FRICTION;
          d[o + RATE] *= FRICTION;
        }
        i++;
      }
      this.write(pool);
    }
  }

  dispose(): void {
    for (const pool of [...this.pools.values()]) pool.mesh.dispose();
    for (const pile of [...this.piles]) pile.dispose();
    this.pools.clear();
    this.geo.dispose();
    this.group.clear();
    this.group.removeFromParent();
  }

  private pool(role: MaterialRole): Pool {
    let p = this.pools.get(role);
    if (!p) {
      const mesh = new THREE.InstancedMesh(this.geo, this.looks.material(role), CAP);
      mesh.userData.role = role;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.count = 0;
      this.group.add(mesh);
      this.pools.set(role, (p = { mesh, n: 0, data: new Float32Array(CAP * STRIDE), dirty: false }));
    }
    return p;
  }

  /** Matrices for every live chunk; `dirty` makes the frame after the last chunk dies flush count = 0. */
  private write(pool: Pool): void {
    const d = pool.data;
    for (let i = 0; i < pool.n; i++) {
      const o = i * STRIDE;
      const left = LIFE - d[o + AGE];
      const k = d[o + SIZE] * (left < SHRINK ? Math.max(0, left / SHRINK) : 1);
      _p.set(d[o + PX], d[o + PY], d[o + PZ]);
      _a.set(d[o + AX], d[o + AY], d[o + AZ]);
      _q.setFromAxisAngle(_a, d[o + ANGLE]);
      _s.set(k * d[o + SX], k * d[o + SY], k * d[o + SZ]);
      pool.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    pool.mesh.count = pool.n;
    pool.mesh.instanceMatrix.needsUpdate = true;
    pool.dirty = pool.n > 0;
  }
}
