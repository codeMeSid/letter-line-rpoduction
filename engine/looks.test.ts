import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Looks, MATERIAL_ROLES, type Appearance, type LookOptions } from './looks';
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
  it('glow is HDR (max channel > 1) in realistic/cutaway so it clears the bloom threshold; flat and lineart stay <= 1', () => {
    const max = (look: LookOptions['look']) => {
      const c = (new Looks({ ...base, look }).material('glow') as THREE.MeshBasicMaterial).color;
      return Math.max(c.r, c.g, c.b);
    };
    expect(max('realistic')).toBeGreaterThan(1);
    expect(max('cutaway')).toBeGreaterThan(1);
    expect(max('flat')).toBeLessThanOrEqual(1);
    expect(max('lineart')).toBeLessThanOrEqual(1);
  });
  it('cutaway glow (basic material) is double-sided so clipped parts do not vanish', () => {
    const c = new Looks({ ...base, look: 'cutaway' });
    expect(c.material('glow')).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(c.material('glow').side).toBe(THREE.DoubleSide);
    expect(new Looks({ ...base, look: 'realistic' }).material('glow').side).toBe(THREE.FrontSide);
  });
  it('mono maps paint-accent to the paint colour', () => {
    const l = new Looks({ ...base, colorMode: 'mono' });
    const a = l.material('paint-accent') as THREE.MeshStandardMaterial;
    const p = l.material('paint') as THREE.MeshStandardMaterial;
    expect(a.color.equals(p.color)).toBe(true);
  });
  describe('appearance', () => {
    const emissive = new THREE.Color(0xff6a10);
    const heat = (emissiveIntensity: number): Appearance => ({
      color: new THREE.Color(0x444444), emissive, emissiveIntensity, metalness: 0.5, roughness: 0.8,
    });
    const closeTo = (a: THREE.Color, b: THREE.Color) => {
      expect(a.r).toBeCloseTo(b.r, 6);
      expect(a.g).toBeCloseTo(b.g, 6);
      expect(a.b).toBeCloseTo(b.b, 6);
    };

    for (const look of ['realistic', 'cutaway'] as const) {
      it(`${look}: standard material takes heat, metalness and roughness`, () => {
        const l = new Looks({ ...base, look });
        const m = l.own('product') as THREE.MeshStandardMaterial;
        expect(m).toBeInstanceOf(THREE.MeshStandardMaterial);
        l.appearance(m, heat(3));
        expect(m.emissiveIntensity).toBe(3);
        expect(m.metalness).toBe(0.5);
        expect(m.roughness).toBe(0.8);
        expect(m.emissive.equals(emissive)).toBe(true);
        expect(m.color.equals(new THREE.Color(0x444444))).toBe(true);
      });
    }
    it('flat: toon material clamps emissive intensity to 1', () => {
      const l = new Looks({ ...base, look: 'flat' });
      const m = l.own('product') as THREE.MeshToonMaterial;
      expect(m).toBeInstanceOf(THREE.MeshToonMaterial);
      l.appearance(m, heat(3));
      expect(m.emissiveIntensity).toBe(1);
      expect(m.emissive.equals(emissive)).toBe(true);
      l.appearance(m, heat(1.5));
      expect(m.emissiveIntensity).toBeCloseTo(0.5, 6);
    });
    it('lineart: basic material is the emissive colour when hot, the background when cold', () => {
      const l = new Looks({ ...base, look: 'lineart' });
      const m = l.own('product') as THREE.MeshBasicMaterial;
      expect(m).toBeInstanceOf(THREE.MeshBasicMaterial);
      l.appearance(m, heat(3));
      closeTo(m.color, emissive);
      l.appearance(m, heat(0));
      expect(m.color.equals(l.background())).toBe(true);
    });
  });
});
