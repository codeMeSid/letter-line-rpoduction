import type { Job, Vec3 } from './types';
import type { Settings } from './settings';
import type { AudioBus } from '../audio/bus';
import type { ParticleSystem } from './particles';

export interface StationCtx {
  P: (x: number, y: number, z: number) => [number, number];
  layer: SVGGElement;          // this station's own group, already positioned in paint order
  origin: Vec3;                // station anchor in world coords (station draws relative to it)
  particles: ParticleSystem;   // engine/particles.ts
  audio: AudioBus;             // audio/bus.ts
  settings: () => Settings;
  now: () => number;           // ms
}

export interface StationDef {
  id: string;                  // e.g. 'furnace'
  label: string;               // short human name for HUD/camera
  footprint: [number, number]; // world size x,y used by layout
  height: number;              // world z extent (for camera fit)
  duration: number;            // sim seconds to process one job at speedMul 1
  spaceDuration?: number;      // seconds for a space carrier (default 0.25)
  outputStage?: string;        // product stage after this station finishes a job
  create(ctx: StationCtx): StationInstance;
}

export interface StationInstance {
  begin(job: Job): void;                       // job arrived at anchor
  update(dt: number, job: Job | null, t: number): void; // every frame; t = job progress 0..1
  finish(job: Job): 'pass' | 'reject';         // inspection may return 'reject'
  destroy(): void;
}
