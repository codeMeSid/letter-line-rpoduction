import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks, MATERIAL_ROLES, type LookOptions } from './looks';
import { LOOKS } from './types';

const base: LookOptions = { look: 'realistic', theme: 'dark', colorMode: 'accent', quality: 'high' };

describe('Looks', () => {
  it('has a material for every role in every look', () => {
    for (const look of LOOKS) {
      const l = new Looks({ ...base, look });
      for (const role of MATERIAL_ROLES) expect(l.material(role), `${look}/${role}`).toBeInstanceOf(THREE.Material);
      l.dispose();
    }
  });
  it('shares one material per role and look', () => {
    const l = new Looks(base);
    expect(l.material('steel')).toBe(l.material('steel'));
    expect(l.own('product')).not.toBe(l.own('product'));
  });
  it('part tags role and swaps material on apply', () => {
    const l = new Looks(base);
    const m = l.part(new THREE.BoxGeometry(1, 1, 1), 'paint');
    const root = new THREE.Group().add(m);
    expect(m.userData.role).toBe('paint');
    const before = m.material;
    l.set({ ...base, look: 'flat' });
    l.apply(root);
    expect(m.material).not.toBe(before);
    expect(m.material).toBe(l.material('paint'));
  });
  it('apply skips meshes without a role (own materials)', () => {
    const l = new Looks(base);
    const own = l.own('product');
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), own);
    l.set({ ...base, look: 'lineart' });
    l.apply(new THREE.Group().add(m));
    expect(m.material).toBe(own);
  });
  it('cutaway materials are double-sided; lineart non-hot roles use the background colour', () => {
    const c = new Looks({ ...base, look: 'cutaway' });
    expect(c.material('paint').side).toBe(THREE.DoubleSide);
    const la = new Looks({ ...base, look: 'lineart' });
    const bg = la.background();
    expect((la.material('steel') as THREE.MeshBasicMaterial).color.equals(bg)).toBe(true);
    expect((la.material('molten') as THREE.MeshBasicMaterial).color.equals(bg)).toBe(false);
  });
  it('mono maps paint-accent to the paint colour', () => {
    const l = new Looks({ ...base, colorMode: 'mono' });
    const a = l.material('paint-accent') as THREE.MeshStandardMaterial;
    const p = l.material('paint') as THREE.MeshStandardMaterial;
    expect(a.color.equals(p.color)).toBe(true);
  });
  it('appearance applies heat to emissive-capable materials and to lineart basic', () => {
    for (const look of LOOKS) {
      const l = new Looks({ ...base, look });
      const m = l.own('product');
      expect(() => l.appearance(m, { color: new THREE.Color(0x444444), emissive: new THREE.Color(0xff6a10), emissiveIntensity: 3, metalness: 0.5, roughness: 0.8 })).not.toThrow();
    }
  });
});
