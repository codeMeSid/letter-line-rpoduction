import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks } from '../../engine/looks';
import { meshes } from '../../fx/testkit';
import { buildBuilding } from './building';

const looks = new Looks({ look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' });
const box = { x0: -100, x1: 900, y0: -600, y1: 150 };

describe('buildBuilding', () => {
  const b = buildBuilding(looks, box, 320);
  it('every mesh is role-tagged and cut-tagged', () => {
    const ms = meshes(b.group);
    expect(ms.length).toBeGreaterThan(30);
    for (const m of ms) { expect(m.userData.role).toBeTruthy(); expect(m.userData.cut).toBe(true); }
  });
  it('stays within the floor box (dock apron may stick out 80 on +x), back wall reaches full height', () => {
    const bb = new THREE.Box3().setFromObject(b.group);
    expect(bb.min.x).toBeGreaterThanOrEqual(box.x0 - 1);
    expect(bb.max.x).toBeLessThanOrEqual(box.x1 + 80);
    expect(bb.min.y).toBeGreaterThanOrEqual(box.y0 - 1);
    expect(bb.max.y).toBeLessThanOrEqual(box.y1 + 1);
    expect(bb.max.z).toBeGreaterThanOrEqual(320);
    expect(b.height).toBe(320);
  });
  it('front of the building stays low (open dollhouse front)', () => {
    const front = meshes(b.group).filter((m) => new THREE.Box3().setFromObject(m).max.y < box.y0 + 40);
    for (const m of front) {
      const bb = new THREE.Box3().setFromObject(m);
      const isDockFrame = bb.min.x > box.x1 - 200; // dock door frame on the +x front corner
      if (!isDockFrame) expect(bb.max.z).toBeLessThanOrEqual(30);
    }
  });
  it('anchors sit inside the building: chute on the back wall above the bin, dock on +x near the front', () => {
    expect(b.chuteTop[1]).toBeGreaterThan(box.y1 - 70);
    expect(b.chuteTop[2]).toBeGreaterThan(b.chuteBottom[2]);
    expect(b.binPos[2]).toBe(0);
    expect(b.dockDoor[0]).toBeCloseTo(box.x1, 0);
    expect(b.dockDoor[1]).toBeLessThan(box.y0 + 200);
    expect(b.dockPark[0]).toBeLessThan(box.x1);
  });
  it('night swaps window glass for glow', () => {
    const shown = (role: string) => meshes(b.group).filter((m) => m.userData.role === role && m.visible).length;
    b.setNight(false);
    const day = shown('glow');
    expect(shown('glass')).toBeGreaterThan(0);
    b.setNight(true);
    expect(shown('glow')).toBeGreaterThan(day);
    expect(shown('glass')).toBe(0);
    b.setNight(false);
  });
  it('the sign board is not coplanar with the eave cap front face (z-fight)', () => {
    const board = meshes(b.group).find((m) => m.userData.role === 'paint' && new THREE.Box3().setFromObject(m).max.z > 320 + 40)!;
    const bb = new THREE.Box3().setFromObject(board);
    expect(bb.min.y).toBeLessThan(box.y1 - 8 - 2 - 0.2); // in front of the cap (cap front = y1 - T - 2)
    expect(b.signAt[1]).toBeCloseTo(bb.min.y - 14, 6);
  });
  it('dispose detaches and disposes geometry', () => {
    const p = new THREE.Group();
    const c = buildBuilding(looks, box, 320);
    p.add(c.group);
    const g = meshes(c.group)[0].geometry;
    let gone = false;
    g.addEventListener('dispose', () => { gone = true; });
    c.dispose();
    expect(gone).toBe(true);
    expect(c.group.parent).toBeNull();
  });
});
