import { describe, expect, it } from 'vitest';
import { CONVEYOR_SPEED, Line, MIN_GAP, type DecideFn } from './line';
import { layoutStations } from './layout';
import type { StationDef } from './station';
import type { Job, JobPhase } from './types';

function mkStation(id: string, duration: number, extra: Partial<StationDef> = {}): StationDef {
  return {
    id, label: id, footprint: [60, 60], height: 40, duration,
    create() { throw new Error('not used in pure tests'); },
    ...extra,
  };
}

let nextId = 1;
function mkJob(over: Partial<Job> = {}): Job {
  const id = nextId++;
  return {
    id, slotId: id, char: 'a', isSpace: false, special: 'none', product: 'bottle', stage: 'raw',
    phase: 'queued', stationIndex: -1, progress: 0, pos: [0, 0, 0], defect: false, retries: 0, ...over,
  };
}

function build(defs: StationDef[], decide?: DecideFn) {
  const lay = layoutStations(defs, 'pan', [0, 0, 0]);
  const line = new Line(defs, lay.anchors, lay.paths, decide);
  return { line, lay };
}

function run(line: Line, seconds: number, dt = 0.05, each?: () => void) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    line.tick(dt);
    each?.();
  }
}

describe('Line', () => {
  it('carries a job queued -> station -> conveyor -> station -> placing with phase callbacks', () => {
    const { line } = build([mkStation('a', 1), mkStation('b', 1)]);
    const log: string[] = [];
    line.onPhase((j, prev) => log.push(`${prev}>${j.phase}@${j.stationIndex}`));
    const job = mkJob();
    line.enqueue(job);
    expect(job.phase).toBe('queued');
    expect(job.stationIndex).toBe(-1);
    run(line, 10);
    expect(log).toEqual(['queued>station@0', 'station>conveyor@0', 'conveyor>station@1', 'station>placing@1']);
    expect(line.jobs).toHaveLength(0);
    expect(job.phase).toBe('placing');
  });

  it('station 0 has no inbound conveyor: queued jobs enter it immediately when free', () => {
    const { line, lay } = build([mkStation('a', 1), mkStation('b', 1)]);
    const job = mkJob();
    line.enqueue(job);
    line.tick(0.01);
    expect(job.phase).toBe('station');
    expect(job.stationIndex).toBe(0);
    expect(job.pos).toEqual(lay.anchors[0]);
  });

  it('keeps FIFO order through the whole line', () => {
    const { line } = build([mkStation('a', 0.5), mkStation('b', 1.2), mkStation('c', 0.3)]);
    const placed: number[] = [];
    line.onPhase((j) => { if (j.phase === 'placing') placed.push(j.id); });
    const jobs = [mkJob(), mkJob(), mkJob(), mkJob(), mkJob()];
    jobs.forEach((j) => line.enqueue(j));
    run(line, 60);
    expect(placed).toEqual(jobs.map((j) => j.id));
  });

  it('never holds more than one job per station', () => {
    const { line } = build([mkStation('a', 0.2), mkStation('b', 1), mkStation('c', 0.2)]);
    for (let i = 0; i < 6; i++) line.enqueue(mkJob());
    run(line, 30, 0.05, () => {
      for (let s = 0; s < 3; s++) {
        const inStation = line.jobs.filter((j) => j.phase === 'station' && j.stationIndex === s);
        expect(inStation.length).toBeLessThanOrEqual(1);
      }
    });
  });

  it('a finished job waits in its station (progress 1) while the conveyor is full', () => {
    const { line } = build([mkStation('a', 0.1), mkStation('b', 1000)]);
    const jobs = Array.from({ length: 12 }, () => mkJob());
    jobs.forEach((j) => line.enqueue(j));
    run(line, 30);
    expect(jobs[0].phase).toBe('station');
    expect(jobs[0].stationIndex).toBe(1);
    // conveyor is 120 long: heads at 120, 106, ... , 8 -> 9 jobs
    expect(jobs.filter((j) => j.phase === 'conveyor')).toHaveLength(9);
    const waiting = jobs.filter((j) => j.phase === 'station' && j.stationIndex === 0);
    expect(waiting).toHaveLength(1);
    expect(waiting[0].progress).toBe(1);
    expect(jobs.filter((j) => j.phase === 'queued')).toHaveLength(1);
    expect(jobs[1].progress).toBe(1);
  });

  it('keeps MIN_GAP between jobs queued up on a conveyor segment', () => {
    const { line } = build([mkStation('a', 0.05), mkStation('b', 20)]);
    for (let i = 0; i < 4; i++) line.enqueue(mkJob());
    let minGap = Infinity;
    run(line, 15, 0.05, () => {
      const onBelt = line.jobs.filter((j) => j.phase === 'conveyor').sort((x, y) => y.pos[0] - x.pos[0]);
      for (let i = 1; i < onBelt.length; i++) minGap = Math.min(minGap, onBelt[i - 1].pos[0] - onBelt[i].pos[0]);
    });
    expect(minGap).toBeGreaterThanOrEqual(MIN_GAP - 1e-9);
    expect(minGap).toBeLessThan(Infinity);
  });

  it('moves at CONVEYOR_SPEED along the path', () => {
    const { line, lay } = build([mkStation('a', 0.1), mkStation('b', 5)]);
    const job = mkJob();
    line.enqueue(job);
    line.tick(0.1); // enters station 0, progress 1 only after next tick
    line.tick(0.1); // leaves to conveyor
    expect(job.phase).toBe('conveyor');
    const x0 = job.pos[0];
    line.tick(1);
    expect(job.pos[0] - x0).toBeCloseTo(CONVEYOR_SPEED, 6);
    expect(job.pos[0]).toBeLessThan(lay.anchors[1][0]);
  });

  it('follows multi-segment (U-turn) paths and stays on them', () => {
    const defs = Array.from({ length: 7 }, (_, i) => mkStation(`s${i}`, 0.1));
    const lay = layoutStations(defs, 'snake', [0, 0, 0]);
    const line = new Line(defs, lay.anchors, lay.paths);
    const job = mkJob();
    line.enqueue(job);
    const onPath = (p: Job['pos'], path: Job['pos'][]) => path.some((q, k) => {
      if (k === 0) return false;
      const a = path[k - 1];
      return [0, 1, 2].every((ax) => p[ax] >= Math.min(a[ax], q[ax]) - 1e-9 && p[ax] <= Math.max(a[ax], q[ax]) + 1e-9);
    });
    run(line, 60, 0.05, () => {
      if (job.phase === 'conveyor') expect(onPath(job.pos, lay.paths[job.stationIndex])).toBe(true);
    });
    expect(job.phase).toBe('placing');
  });

  it('uses spaceDuration (default 0.25 s) for space carriers', () => {
    const { line } = build([mkStation('a', 10, { spaceDuration: 0.5 }), mkStation('b', 10)]);
    const sp = mkJob({ isSpace: true, char: '' });
    line.enqueue(sp);
    run(line, 0.45);
    expect(sp.phase).toBe('station');
    expect(sp.stationIndex).toBe(0);
    run(line, 0.2);
    expect(sp.phase).toBe('conveyor');

    const { line: l2 } = build([mkStation('a', 10), mkStation('b', 10)]);
    const sp2 = mkJob({ isSpace: true, char: '' });
    l2.enqueue(sp2);
    run(l2, 0.2);
    expect(sp2.phase).toBe('station');
    run(l2, 0.3);
    expect(sp2.phase).toBe('conveyor');
  });

  it('consults decide(job, stationIndex) once when a station finishes; reject removes the job', () => {
    const calls: [number, number][] = [];
    const rejectId = { v: -1 };
    const { line } = build([mkStation('a', 0.5), mkStation('b', 0.5), mkStation('c', 0.5)], (j, i) => {
      calls.push([j.id, i]);
      return j.id === rejectId.v && i === 1 ? 'reject' : 'pass';
    });
    const [a, b] = [mkJob(), mkJob()];
    rejectId.v = a.id;
    const events: string[] = [];
    line.onPhase((j, prev) => events.push(`${j.id}:${prev}>${j.phase}`));
    line.enqueue(a);
    line.enqueue(b);
    run(line, 30);
    expect(a.phase).toBe('rejected');
    expect(b.phase).toBe('placing');
    expect(line.jobs).toHaveLength(0);
    expect(events).toContain(`${a.id}:station>rejected`);
    expect(calls.filter(([id]) => id === a.id)).toEqual([[a.id, 0], [a.id, 1]]);
    expect(calls.filter(([id]) => id === b.id)).toEqual([[b.id, 0], [b.id, 1], [b.id, 2]]);
  });

  it('a rejected job frees its station for the next job', () => {
    const { line } = build([mkStation('a', 1), mkStation('b', 1)], () => 'reject');
    const [a, b] = [mkJob(), mkJob()];
    line.enqueue(a);
    line.enqueue(b);
    run(line, 1.2);
    expect(a.phase).toBe('rejected');
    expect(b.phase).toBe('station');
    expect(b.stationIndex).toBe(0);
  });

  it('remove() frees a station so the queue advances', () => {
    const { line } = build([mkStation('a', 5), mkStation('b', 1)]);
    const [a, b] = [mkJob(), mkJob()];
    line.enqueue(a);
    line.enqueue(b);
    run(line, 1);
    expect(a.phase).toBe('station');
    expect(b.phase).toBe('queued');
    expect(line.remove(a.id)).toBe(true);
    expect(line.jobs).toEqual([b]);
    line.tick(0.05);
    expect(b.phase).toBe('station');
    expect(b.stationIndex).toBe(0);
  });

  it('remove() works for queued jobs and jobs on a conveyor; unknown ids return false', () => {
    const { line } = build([mkStation('a', 0.1), mkStation('b', 50)]);
    const [a, b, c] = [mkJob(), mkJob(), mkJob()];
    [a, b, c].forEach((j) => line.enqueue(j));
    run(line, 4);
    expect(a.phase).toBe('station'); // a reached station 1 (long)
    expect(b.phase).toBe('conveyor');
    expect(line.remove(b.id)).toBe(true);
    expect(line.remove(b.id)).toBe(false);
    expect(line.remove(9999)).toBe(false);
    expect(line.jobs.map((j) => j.id)).toEqual([a.id, c.id]);
    run(line, 3);
    expect(c.phase).toBe('conveyor'); // not stuck behind removed job
    expect(line.remove(c.id)).toBe(true);
    const d = mkJob();
    line.enqueue(d);
    expect(line.remove(d.id)).toBe(true);
    expect(line.jobs.map((j) => j.id)).toEqual([a.id]);
  });

  it('relayout keeps stationIndex/progress and recomputes pos', () => {
    const defs = [mkStation('a', 0.1), mkStation('b', 0.1), mkStation('c', 1000)];
    const lay = layoutStations(defs, 'pan', [0, 0, 0]);
    const line = new Line(defs, lay.anchors, lay.paths);
    const [a, b] = [mkJob(), mkJob()];
    line.enqueue(a);
    run(line, 8); // a sits in station 2
    expect(a.stationIndex).toBe(2);
    line.enqueue(b);
    run(line, 1.75); // b ~halfway along conveyor 0 (len 120)
    expect(b.phase).toBe('conveyor');
    const progress = b.progress;
    expect(progress).toBeGreaterThan(0.2);
    expect(progress).toBeLessThan(0.8);

    const lay2 = layoutStations(defs, 'pan', [1000, 200, 0]);
    line.relayout(lay2.anchors, lay2.paths);
    expect(b.phase).toBe('conveyor');
    expect(b.stationIndex).toBe(0);
    expect(b.progress).toBeCloseTo(progress, 9);
    expect(b.pos[0]).toBeCloseTo(lay2.anchors[0][0] + (lay2.anchors[1][0] - lay2.anchors[0][0]) * progress, 6);
    expect(b.pos[1]).toBe(200);
    expect(a.pos).toEqual(lay2.anchors[2]);

    // new geometry with a longer segment: progress preserved, travel continues from the right place
    const wide = layoutStations(defs.map((d) => ({ ...d, footprint: [160, 60] as [number, number] })), 'pan', [0, 0, 0]);
    line.relayout(wide.anchors, wide.paths);
    expect(b.progress).toBeCloseTo(progress, 9);
    const len = wide.anchors[1][0] - wide.anchors[0][0];
    expect(b.pos[0]).toBeCloseTo(wide.anchors[0][0] + len * progress, 6);
    run(line, 0.5);
    expect(b.pos[0]).toBeGreaterThan(wide.anchors[0][0] + len * progress);
  });

  it('relayout rejects mismatched geometry', () => {
    const { line, lay } = build([mkStation('a', 1), mkStation('b', 1)]);
    expect(() => line.relayout(lay.anchors.slice(1), lay.paths)).toThrow();
    expect(() => line.relayout(lay.anchors, [])).toThrow();
  });

  it('ignores non-positive dt', () => {
    const { line } = build([mkStation('a', 1), mkStation('b', 1)]);
    const job = mkJob();
    line.enqueue(job);
    line.tick(0);
    line.tick(-1);
    line.tick(NaN);
    expect(job.phase).toBe('queued' as JobPhase);
  });
});
