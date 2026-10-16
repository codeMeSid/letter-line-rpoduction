import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BELT_STRIPE, Looks } from '../../engine/looks';
import { BELT_W } from './dims';
import { buildConveyor } from './conveyor';
import type { Vec3 } from '../../engine/types';

const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
const belts = (g: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.userData.role === 'belt') out.push(o as THREE.Mesh); });
  return out;
};

describe('buildConveyor', () => {
  const path: Vec3[] = [[0, 0, 22], [300, 0, 22], [300, -120, 22]];

  it('shortens belts at the interior vertex, extends the ends, and scales belt uv by length', () => {
    const c = buildConveyor(looks, path, { extendStart: 10, extendEnd: 6 });
    const [b0, b1] = belts(c.group);
    b0.geometry.computeBoundingBox();
    b1.geometry.computeBoundingBox();
    expect(b0.geometry.boundingBox!.max.x).toBeCloseTo(300 + 10 - BELT_W / 2, 4);
    expect(b1.geometry.boundingBox!.max.x).toBeCloseTo(120 - BELT_W / 2 + 6, 4);
    const uv = b0.geometry.getAttribute('uv');
    let max = 0;
    for (let i = 0; i < uv.count; i++) max = Math.max(max, uv.getX(i));
    expect(max).toBeCloseTo(b0.geometry.boundingBox!.max.x / BELT_STRIPE, 4);
    // On the top face u grows with +x, so a falling texture offset (scrollBelts) moves stripes toward +x.
    const pos = b0.geometry.getAttribute('position');
    const nor = b0.geometry.getAttribute('normal');
    for (let i = 0; i < uv.count; i++) {
      if (nor.getZ(i) > 0.5) expect(uv.getX(i)).toBeCloseTo(pos.getX(i) / BELT_STRIPE, 4);
    }
    c.dispose();
  });
  it('stands on the floor via leg feet and rises above the belt top', () => {
    const c = buildConveyor(looks, path);
    c.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c.group);
    expect(box.min.z).toBeCloseTo(0, 4); // leg feet stand on the floor (world z = 0)
    expect(box.max.z).toBeGreaterThan(22);
    c.dispose();
  });
  it('spins drums with belt speed and dispose detaches the group', () => {
    const c = buildConveyor(looks, path);
    const root = new THREE.Group().add(c.group);
    const drum = c.group.children[0].children.find((o) => o.position.z === -1.5)!;
    const r0 = drum.rotation.y;
    c.update(0.5, 60);
    expect(drum.rotation.y - r0).toBeCloseTo((0.5 * 60) / 3, 6);
    c.dispose();
    expect(root.children).toHaveLength(0);
  });
  it('vertical segment builds an elevator shaft spanning both heights', () => {
    const c = buildConveyor(looks, [[0, 0, 22], [0, 0, 100]]);
    c.group.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(c.group);
    expect(b.min.z).toBeCloseTo(16, 4);
    expect(b.max.z).toBeCloseTo(100, 4);
    expect(b.max.x - b.min.x).toBeCloseTo(BELT_W, 4);
    c.dispose();
  });
});
