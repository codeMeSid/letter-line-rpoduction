import type * as THREE from 'three';
import type { Looks } from './looks';
import type { LetterMarks } from './settings';
import type { Job, ProductKind, Vec3 } from './types';

export interface ProductCtx { looks: Looks; marks: LetterMarks }

export interface ProductHandle {
  /** Moved by the host to job.pos (stations may add offsets after that). Product local z=0 = resting surface. */
  readonly root: THREE.Object3D;
  /** Continuous: shape(S_k, 1) ≡ shape(S_{k+1}, 0). Idempotent and cheap. */
  shape(stage: string, t: number): void;
  /** Robot hand-off 0..1 (placing arc progress); 1 = final shelf pose. */
  place(t: number): void;
  /** Look changed: recreate own() materials and re-apply the last shape/place. */
  restyle(): void;
  dispose(): void;
}

export interface ProductModel {
  kind: ProductKind;
  stages: readonly string[];  // stages[0] = fresh job
  size: Vec3;                 // shelf slot box in the final (placed) pose
  lineSize: number;           // largest horizontal extent while on the line (conveyor spacing)
  create(job: Job, ctx: ProductCtx): ProductHandle;
}
