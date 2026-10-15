import type { Job, ProductKind, Vec3 } from './types';
import type { LetterMarks } from './settings';
import type { StationCtx } from './station';

export interface ProductRenderer {
  kind: ProductKind;
  stages: string[];                            // ordered visual stages
  draw(g: SVGGElement, job: Job, marks: LetterMarks, P: StationCtx['P']): void; // draws at world origin
  size: Vec3;                                  // bounding size for shelf slot spacing
}
