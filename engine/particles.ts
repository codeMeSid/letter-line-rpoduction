import type { Vec3 } from './types';

export type ColorKey = 'mid' | 'hi' | 'edge' | 'molten' | 'drink' | 'neon' | 'flash' | 'glass' | 'label';

export const MAX_PARTICLES = 4000;
const GRAVITY = 380; // world units / s² along -z

export const PARTICLE_KINDS = [
  'sand', 'powder', 'spark', 'ember', 'glow', 'liquid', 'droplet', 'foam',
  'shard', 'smoke', 'steam', 'water', 'flash', 'crumb', 'confetti', 'pellet',
] as const;
export type ParticleKind = (typeof PARTICLE_KINDS)[number];

/** `floor`: z where particles land (default 0, never above the emit point; pass the floor z on upper levels). */
export interface EmitOpts { pos: Vec3; count: number; spread?: number; vel?: Vec3; life?: number; size?: number; floor?: number }

export interface KindSpec {
  color: ColorKey | ColorKey[]; // array = random pick per particle
  grav: number;                 // multiple of GRAVITY (negative rises)
  drag: number;                 // velocity damping per second (0..)
  life: number;                 // seconds
  size: number;                 // world units (radius)
  bounce: number;               // restitution on the floor
  additive?: boolean;
  streak?: boolean;             // drawn as a short line along velocity
  grow?: number;                // size multiplier at end of life
}

const SPECS: Record<ParticleKind, KindSpec> = {
  sand:     { color: 'mid', grav: 1, drag: 0.2, life: 1.2, size: 0.8, bounce: 0.1 },
  powder:   { color: 'hi', grav: 0.6, drag: 1.5, life: 1.0, size: 0.7, bounce: 0 },
  spark:    { color: 'flash', grav: 0.8, drag: 0.5, life: 0.5, size: 0.6, bounce: 0.4, additive: true, streak: true },
  ember:    { color: 'molten', grav: -0.08, drag: 0.8, life: 1.4, size: 0.9, bounce: 0, additive: true },
  glow:     { color: 'molten', grav: 0, drag: 2, life: 0.6, size: 4, bounce: 0, additive: true, grow: 1.6 },
  liquid:   { color: 'drink', grav: 1, drag: 0.1, life: 1.0, size: 1.2, bounce: 0 },
  droplet:  { color: 'glass', grav: 1, drag: 0.1, life: 0.9, size: 0.7, bounce: 0.2 },
  foam:     { color: 'hi', grav: 0.3, drag: 1.2, life: 1.4, size: 1.4, bounce: 0, grow: 1.5 },
  shard:    { color: 'glass', grav: 1, drag: 0.2, life: 2.5, size: 1.1, bounce: 0.3, streak: true },
  smoke:    { color: 'edge', grav: -0.1, drag: 1.2, life: 2.0, size: 3, bounce: 0, grow: 2.5 },
  steam:    { color: 'mid', grav: -0.15, drag: 1.0, life: 1.6, size: 2.5, bounce: 0, grow: 2.2 },
  water:    { color: 'glass', grav: 1, drag: 0.05, life: 0.8, size: 0.9, bounce: 0 },
  flash:    { color: 'flash', grav: 0, drag: 0, life: 0.15, size: 10, bounce: 0, additive: true, grow: 1.8 },
  crumb:    { color: 'mid', grav: 1, drag: 0.2, life: 1.5, size: 0.9, bounce: 0.25 },
  confetti: { color: ['molten', 'neon', 'glass', 'label', 'flash'], grav: 0.25, drag: 1.5, life: 2.4, size: 1.2, bounce: 0 },
  pellet:   { color: 'label', grav: 1, drag: 0.1, life: 1.2, size: 1.0, bounce: 0.35 },
};

/** Spec of a particle kind by its index in PARTICLE_KINDS. */
export function specOf(kindIndex: number): Readonly<KindSpec> {
  return SPECS[PARTICLE_KINDS[kindIndex]];
}

const rnd = (s: number) => (Math.random() * 2 - 1) * s;

/**
 * Pooled world-space particles: gravity on z, floor at the emitting z. DOM-free simulation only;
 * `engine/particlesView.ts` draws it.
 */
export class ParticleSystem {
  /** live particle count; slots [0, count) are alive */
  count = 0;
  /** multiplier applied to `count` in emit (set to 0.2 under reduced motion) */
  density = 1;
  readonly kind = new Uint8Array(MAX_PARTICLES);
  readonly col = new Uint8Array(MAX_PARTICLES); // index into the kind's colour list
  readonly p = new Float32Array(MAX_PARTICLES * 3);
  readonly v = new Float32Array(MAX_PARTICLES * 3);
  private floor = new Float32Array(MAX_PARTICLES);
  readonly age = new Float32Array(MAX_PARTICLES);
  readonly life = new Float32Array(MAX_PARTICLES);
  readonly size = new Float32Array(MAX_PARTICLES);
  private cursor = 0; // ring cursor for overwriting the oldest when full

  emit(kind: ParticleKind, o: EmitOpts): void {
    const spec = SPECS[kind];
    const k = PARTICLE_KINDS.indexOf(kind);
    const n = Math.max(o.count > 0 ? 1 : 0, Math.round(o.count * this.density));
    const spread = o.spread ?? 4;
    const vel = o.vel ?? [0, 0, 0];
    const ncol = Array.isArray(spec.color) ? spec.color.length : 1;
    for (let j = 0; j < n; j++) {
      let i: number;
      if (this.count < MAX_PARTICLES) i = this.count++;
      else { i = this.cursor; this.cursor = (this.cursor + 1) % MAX_PARTICLES; }
      this.kind[i] = k;
      this.col[i] = Math.floor(Math.random() * ncol);
      this.p[i * 3] = o.pos[0] + rnd(spread * 0.3);
      this.p[i * 3 + 1] = o.pos[1] + rnd(spread * 0.3);
      this.p[i * 3 + 2] = o.pos[2];
      this.v[i * 3] = vel[0] + rnd(spread * 6);
      this.v[i * 3 + 1] = vel[1] + rnd(spread * 6);
      this.v[i * 3 + 2] = vel[2] + rnd(spread * 3);
      this.floor[i] = Math.min(o.floor ?? 0, o.pos[2]);
      this.age[i] = 0;
      this.life[i] = (o.life ?? spec.life) * (0.7 + Math.random() * 0.6);
      this.size[i] = o.size ?? spec.size;
    }
  }

  /** Advance by dt seconds; returns true while particles are alive. */
  update(dt: number): boolean {
    for (let i = 0; i < this.count; ) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); continue; }
      const s = SPECS[PARTICLE_KINDS[this.kind[i]]];
      const damp = Math.max(0, 1 - s.drag * dt);
      const b = i * 3;
      this.v[b] *= damp;
      this.v[b + 1] *= damp;
      this.v[b + 2] = this.v[b + 2] * damp - GRAVITY * s.grav * dt;
      this.p[b] += this.v[b] * dt;
      this.p[b + 1] += this.v[b + 1] * dt;
      this.p[b + 2] += this.v[b + 2] * dt;
      if (this.p[b + 2] < this.floor[i]) {
        this.p[b + 2] = this.floor[i];
        this.v[b + 2] = -this.v[b + 2] * s.bounce;
        this.v[b] *= 0.6;
        this.v[b + 1] *= 0.6;
      }
      i++;
    }
    return this.count > 0;
  }

  /** z of particle i (tests). */
  zOf(i: number): number {
    return this.p[i * 3 + 2];
  }

  clear(): void {
    this.count = 0;
    this.cursor = 0;
  }

  /** swap-remove: move the last live particle into slot i */
  private kill(i: number): void {
    const j = --this.count;
    if (i === j) return;
    this.kind[i] = this.kind[j];
    this.col[i] = this.col[j];
    for (let a = 0; a < 3; a++) { this.p[i * 3 + a] = this.p[j * 3 + a]; this.v[i * 3 + a] = this.v[j * 3 + a]; }
    this.floor[i] = this.floor[j];
    this.age[i] = this.age[j];
    this.life[i] = this.life[j];
    this.size[i] = this.size[j];
  }
}
