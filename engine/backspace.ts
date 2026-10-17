import type { NewlineMarker, Slot } from '../shelf/model';
import type { Job } from './types';

export type BackspacePlan =
  | { type: 'newline' }
  | { type: 'quiet'; slot: Slot }                       // never-seen job, or a space still in flight: no fx
  | { type: 'gap'; slot: Slot }                         // shelved space: broom taps it
  | { type: 'reject'; slot: Slot; jobId: number }       // char on the line, reject mode: hoist → chute
  | { type: 'shoot-line'; slot: Slot; jobId: number }   // char on the line (shoot mode) or arcing to the shelf
  | { type: 'shoot-shelf'; slot: Slot };                // shelved char

/** Binding decision table (spec "Backspace"). `job` = the slot's in-flight job, or null. */
export function planBackspace(target: Slot | NewlineMarker, job: Job | null, inflight: 'reject' | 'shoot'): BackspacePlan {
  if (target.kind === 'newline') return { type: 'newline' };
  const slot = target;
  if (slot.state === 'filled') return slot.kind === 'space' ? { type: 'gap', slot } : { type: 'shoot-shelf', slot };
  if (!job || job.phase === 'queued' || slot.kind === 'space') return { type: 'quiet', slot };
  if (job.phase === 'placing' || inflight === 'shoot') return { type: 'shoot-line', slot, jobId: job.id };
  return { type: 'reject', slot, jobId: job.id };
}
