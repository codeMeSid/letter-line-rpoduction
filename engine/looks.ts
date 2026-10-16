import * as THREE from 'three';
import type { ColorKey } from './particles';
import type { Look, Quality } from './types';

export const MATERIAL_ROLES = [
  'steel', 'paint', 'paint-accent', 'rubber', 'belt', 'copper', 'glass', 'molten', 'liquid',
  'wood', 'concrete', 'sand', 'product', 'glow',
] as const;
export type MaterialRole = (typeof MATERIAL_ROLES)[number];

export interface LookOptions { look: Look; theme: 'light' | 'dark'; colorMode: 'accent' | 'mono'; quality: Quality }
export interface Appearance { color: THREE.Color; emissive: THREE.Color; emissiveIntensity: number; metalness: number; roughness: number }

interface RoleSpec { color: number; metal: number; rough: number; emissive?: number; emissiveIntensity?: number; basic?: boolean; transmission?: number }

const SPEC: Record<MaterialRole, RoleSpec> = {
  steel: { color: 0x8c929a, metal: 0.85, rough: 0.35 },
  paint: { color: 0x2f4f63, metal: 0.25, rough: 0.55 },
  'paint-accent': { color: 0xe3a817, metal: 0.15, rough: 0.5 },
  rubber: { color: 0x1a1b1d, metal: 0, rough: 0.9 },
  belt: { color: 0x2a2b2e, metal: 0, rough: 0.85 },
  copper: { color: 0xb8683a, metal: 0.9, rough: 0.3 },
  glass: { color: 0xdff5ef, metal: 0, rough: 0.05, transmission: 0.92 },
  molten: { color: 0xff7a1a, metal: 0, rough: 0.6, emissive: 0xff5a00, emissiveIntensity: 3 },
  liquid: { color: 0x7fb7c9, metal: 0.1, rough: 0.08 },
  wood: { color: 0x9a6b3f, metal: 0, rough: 0.75 },
  concrete: { color: 0x5d5f62, metal: 0, rough: 0.95 },
  sand: { color: 0xb59767, metal: 0, rough: 1 },
  product: { color: 0x45474b, metal: 0.55, rough: 0.85 },
  glow: { color: 0xffd27a, metal: 0, rough: 1, basic: true },
};
/** Roles recoloured in colorMode 'mono'. */
const MONO: Partial<Record<MaterialRole, number>> = { 'paint-accent': SPEC.paint.color, copper: SPEC.steel.color };
const HOT = new Set<MaterialRole>(['molten', 'glow']);
/** Glow colour multiplier in the lit looks (bloom input). */
const GLOW_HDR = 2.5;

const BG: Record<Look, Record<'light' | 'dark', number>> = {
  realistic: { dark: 0x0d0f12, light: 0xdcdfe3 },
  cutaway: { dark: 0x0d0f12, light: 0xdcdfe3 },
  flat: { dark: 0x1a1d22, light: 0xeae6dd },
  lineart: { dark: 0x0b0c0e, light: 0xf3f1ec },
};
const EDGE: Record<'light' | 'dark', number> = { dark: 0xd9dce0, light: 0x1c1e21 };
const PARTICLE: Record<ColorKey, number> = {
  mid: 0x9aa0a6, hi: 0xf2f2f2, edge: 0x5a5f66, molten: 0xff7a1a, drink: 0x3a1a0e,
  neon: 0xff3df0, flash: 0xfff4c2, glass: 0x9fd8c8, label: 0xd92b2b,
};

let toonRamp: THREE.DataTexture | null = null;
function ramp(): THREE.DataTexture {
  if (toonRamp) return toonRamp;
  toonRamp = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.needsUpdate = true;
  return toonRamp;
}

/** Darkens back faces so cut-open hollow parts read as section cuts. */
function tintBackFaces(shader: { fragmentShader: string }): void {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <dithering_fragment>',
    '#include <dithering_fragment>\n  if (!gl_FrontFacing) gl_FragColor.rgb *= 0.35;',
  );
}

export const BELT_STRIPE = 16; // world units per stripe period on belts

/**
 * The look system (Global Constraint: materials only from here). A look = role → shared material.
 * Per-instance animated materials come from `own(role)`; meshes using them carry no `userData.role`
 * and are restyled by their owner.
 */
export class Looks {
  readonly beltTexture: THREE.DataTexture;
  private o: LookOptions;
  private table = new Map<MaterialRole, THREE.Material>();

  constructor(o: LookOptions) {
    this.o = o;
    const px = new Uint8Array(4 * 8);
    for (let i = 0; i < 8; i++) px.set(i < 2 ? [70, 72, 76, 255] : [40, 41, 44, 255], i * 4);
    this.beltTexture = new THREE.DataTexture(px, 8, 1, THREE.RGBAFormat);
    this.beltTexture.wrapS = this.beltTexture.wrapT = THREE.RepeatWrapping;
    this.beltTexture.colorSpace = THREE.SRGBColorSpace;
    this.beltTexture.needsUpdate = true;
  }

  get opts(): LookOptions { return this.o; }

  set(o: LookOptions): void {
    for (const m of this.table.values()) m.dispose();
    this.table.clear();
    this.o = o;
  }

  material(role: MaterialRole): THREE.Material {
    let m = this.table.get(role);
    if (!m) this.table.set(role, (m = this.make(role)));
    return m;
  }

  /** Fresh per-instance material for animated parts; the caller disposes it. */
  own(role: MaterialRole): THREE.Material {
    return this.make(role);
  }

  part<G extends THREE.BufferGeometry>(geom: G, role: MaterialRole, shadows = true): THREE.Mesh<G, THREE.Material> {
    const m = new THREE.Mesh(geom, this.material(role));
    m.userData.role = role;
    m.castShadow = shadows && !HOT.has(role);
    m.receiveShadow = shadows;
    return m;
  }

  /** Swap every role-tagged mesh under `root` to the current look's material. */
  apply(root: THREE.Object3D): void {
    root.traverse((o) => {
      const role = o.userData.role as MaterialRole | undefined;
      if (role && (o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = this.material(role);
    });
  }

  /** Set an own() material's appearance in whatever way the current look supports. */
  appearance(mat: THREE.Material, a: Appearance): void {
    if (mat instanceof THREE.MeshStandardMaterial) {
      mat.color.copy(a.color);
      mat.emissive.copy(a.emissive);
      mat.emissiveIntensity = a.emissiveIntensity;
      mat.metalness = a.metalness;
      mat.roughness = a.roughness;
    } else if (mat instanceof THREE.MeshToonMaterial) {
      mat.color.copy(a.color).lerp(new THREE.Color(0xffffff), a.metalness * 0.3);
      mat.emissive.copy(a.emissive);
      mat.emissiveIntensity = Math.min(1, a.emissiveIntensity / 3);
    } else if (mat instanceof THREE.MeshBasicMaterial) {
      const hot = Math.min(1, a.emissiveIntensity / 3);
      mat.color.copy(this.o.look === 'lineart' ? this.background() : a.color).lerp(a.emissive, hot);
    }
  }

  background(): THREE.Color { return new THREE.Color(BG[this.o.look][this.o.theme]); }
  edgeColor(): THREE.Color { return new THREE.Color(EDGE[this.o.theme]); }
  particleColor(k: ColorKey): THREE.Color { return new THREE.Color(PARTICLE[k]); }

  /** Advance every belt's stripes by `dist` world units (all belts share one speed). */
  scrollBelts(dist: number): void {
    this.beltTexture.offset.x = (this.beltTexture.offset.x - dist / BELT_STRIPE) % 1;
  }

  dispose(): void {
    for (const m of this.table.values()) m.dispose();
    this.table.clear();
    this.beltTexture.dispose();
  }

  private make(role: MaterialRole): THREE.Material {
    const { look, colorMode, quality } = this.o;
    const s = SPEC[role];
    const color = new THREE.Color(colorMode === 'mono' ? MONO[role] ?? s.color : s.color);
    const map = role === 'belt' ? this.beltTexture : null;
    if (look === 'lineart') {
      return new THREE.MeshBasicMaterial({ color: HOT.has(role) ? color : this.background(), toneMapped: false });
    }
    if (s.basic) {
      // Lit looks go through the bloom chain: glow is HDR (x2.5) so it clears the 0.9 bloom threshold after ACES.
      const lit = look === 'realistic' || look === 'cutaway';
      const m = new THREE.MeshBasicMaterial({ color: lit ? color.multiplyScalar(GLOW_HDR) : color, toneMapped: false });
      if (look === 'cutaway') m.side = THREE.DoubleSide; // clipped glow parts must not vanish
      return m;
    }
    if (look === 'flat') {
      return new THREE.MeshToonMaterial({
        color, map, gradientMap: ramp(),
        emissive: s.emissive ?? 0x000000, emissiveIntensity: s.emissive ? 1 : 0,
        transparent: role === 'glass', opacity: role === 'glass' ? 0.4 : 1,
      });
    }
    const glass = role === 'glass';
    const m = glass && quality === 'high'
      ? new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: s.rough, transmission: s.transmission ?? 0.9, thickness: 1.5, ior: 1.5 })
      : new THREE.MeshStandardMaterial({
        color, map, metalness: s.metal, roughness: s.rough,
        emissive: s.emissive ?? 0x000000, emissiveIntensity: s.emissiveIntensity ?? 0,
        transparent: glass, opacity: glass ? 0.35 : 1,
      });
    if (look === 'cutaway') {
      m.side = THREE.DoubleSide;
      m.onBeforeCompile = tintBackFaces;
      m.customProgramCacheKey = () => 'cutaway-backface';
    }
    return m;
  }
}
