import { describe, expect, it } from 'vitest';
import type { Slot } from '../shelf/model';
import { planBackspace } from './backspace';
import type { Job, JobPhase } from './types';

const slot = (o: Partial<Slot> = {}): Slot => ({ id: 1, kind: 'char', char: 'a', state: 'reserved', jobId: 9, ...o });
const job = (phase: JobPhase): Job => ({
  id: 9, slotId: 1, char: 'a', isSpace: false, special: 'none', product: 'letter', stage: 'x', phase,
  stationIndex: 0, progress: 0, pos: [0, 0, 0], defect: false, retries: 0,
});

describe('planBackspace (spec decision table)', () => {
  it('newline marker → newline', () => {
    expect(planBackspace({ kind: 'newline' }, null, 'reject')).toEqual({ type: 'newline' });
  });
  it('queued job or no job → quiet', () => {
    expect(planBackspace(slot(), job('queued'), 'shoot').type).toBe('quiet');
    expect(planBackspace(slot({ jobId: null }), null, 'reject').type).toBe('quiet');
  });
  it('space still in flight → quiet; shelved space → gap', () => {
    expect(planBackspace(slot({ kind: 'space', char: '' }), job('conveyor'), 'shoot').type).toBe('quiet');
    expect(planBackspace(slot({ kind: 'space', char: '', state: 'filled' }), null, 'shoot').type).toBe('gap');
  });
  it('char on the line: reject mode → reject, shoot mode → shoot-line', () => {
    for (const ph of ['conveyor', 'station'] as JobPhase[]) {
      expect(planBackspace(slot(), job(ph), 'reject')).toEqual({ type: 'reject', slot: slot(), jobId: 9 });
      expect(planBackspace(slot(), job(ph), 'shoot')).toEqual({ type: 'shoot-line', slot: slot(), jobId: 9 });
    }
  });
  it('char arcing to the shelf is always shot', () => {
    expect(planBackspace(slot(), job('placing'), 'reject').type).toBe('shoot-line');
  });
  it('shelved char → shoot-shelf', () => {
    expect(planBackspace(slot({ state: 'filled' }), null, 'reject')).toEqual({ type: 'shoot-shelf', slot: slot({ state: 'filled' }) });
  });
});
