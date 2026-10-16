import type * as THREE from 'three';
import type { AudioBus } from '../audio/bus';
import type { Looks } from './looks';
import type { ParticleSystem } from './particles';
import type { ProductHandle } from './product';
import type { Settings } from './settings';
import type { Job, Vec3 } from './types';

export interface StationCtx {
  /**
   * Station root, already positioned at `origin`. Build in local coords: z=0 = belt top, floor at z=-BELT_TOP.
   * The host tags every mesh `userData.cut` (sliced by the cutaway look) after create(); set `userData.cut = false`
   * on meshes that must stay whole (e.g. the robot rig in front of the line).
   */
  group: THREE.Group;
  origin: Vec3;
  looks: Looks;
  particles: ParticleSystem;   // world coordinates
  audio: AudioBus;
  settings: () => Settings;
  now: () => number;           // ms
  /** Jobs of this factory currently flying to the shelf (robot station tracks them). */
  placing: () => Job[];
  product: (jobId: number) => ProductHandle | null;
  /** Front shelf plank: x range, centre-line y and top z (world). */
  shelfSpan: () => { x0: number; x1: number; y: number; z: number };
}

export interface StationDef {
  id: string;
  label: string;
  footprint: [number, number]; // world x, y (≥ BELT_W)
  height: number;              // world z extent above the belt (camera fit)
  duration: number;            // sim seconds per job at speedMul 1
  spaceDuration?: number;      // default 0.25
  outputStage?: string;        // product stage after this station passes a job
  create(ctx: StationCtx): StationInstance;
}

export interface StationInstance {
  begin(job: Job, product: ProductHandle | null): void;
  /** Every frame. job/product null = idle (ambient motion only). t = job progress 0..1. May offset product.root (it is positioned before this call). */
  update(dt: number, job: Job | null, t: number, product: ProductHandle | null): void;
  finish(job: Job): 'pass' | 'reject';
  /** Look changed: rebuild any own() materials. */
  restyle?(): void;
  destroy(): void;
}
