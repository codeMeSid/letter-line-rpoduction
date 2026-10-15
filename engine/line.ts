import type { StationDef } from './station';
import type { Job, JobPhase, Vec3 } from './types';

export const CONVEYOR_SPEED = 40; // world units / sim second
export const MIN_GAP = 14;        // world units between jobs on a conveyor segment
export const DEFAULT_SPACE_DURATION = 0.25;

export type Verdict = 'pass' | 'reject';
export type DecideFn = (job: Job, stationIndex: number) => Verdict;
/** Called after a job's phase changed; `prev` is the phase it left. */
export type PhaseCb = (job: Job, prev: JobPhase) => void;

interface Track { dist: number; elapsed: number; decided: boolean }
interface Poly { pts: Vec3[]; cum: number[]; len: number }

function toPoly(pts: Vec3[]): Poly {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  }
  return { pts, cum, len: cum[cum.length - 1] };
}

function pointAt(p: Poly, d: number): Vec3 {
  if (d <= 0) return [...p.pts[0]];
  if (d >= p.len) return [...p.pts[p.pts.length - 1]];
  let k = 1;
  while (p.cum[k] < d) k++;
  const seg = p.cum[k] - p.cum[k - 1];
  const t = seg > 0 ? (d - p.cum[k - 1]) / seg : 0;
  const a = p.pts[k - 1];
  const b = p.pts[k];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Pure pipeline: queue -> station 0 -> conveyor 0 -> station 1 -> ... -> last station -> leaves ('placing').
 * Each station holds one job; a conveyor segment keeps FIFO order and MIN_GAP spacing.
 */
export class Line {
  /** Every job currently in the line (queued, in a station or on a conveyor), in enqueue order. */
  jobs: Job[] = [];

  private anchors: Vec3[] = [];
  private polys: Poly[] = [];
  private queue: Job[] = [];
  private occupant: (Job | null)[];
  private segs: Job[][];         // segs[i]: jobs on conveyor i, head (furthest ahead) first
  private tracks = new Map<number, Track>();
  private callbacks = new Set<PhaseCb>();
  private pending: { job: Job; prev: JobPhase; phase: JobPhase }[] = [];

  constructor(
    private stations: StationDef[],
    anchors: Vec3[],
    paths: Vec3[][],
    private decide: DecideFn = () => 'pass',
  ) {
    if (stations.length === 0) throw new Error('Line needs at least one station');
    this.occupant = stations.map(() => null);
    this.segs = stations.slice(1).map(() => []);
    this.setLayout(anchors, paths);
  }

  onPhase(cb: PhaseCb): () => void {
    this.callbacks.add(cb);
    return () => {
      this.callbacks.delete(cb);
    };
  }

  /** Add a job to the back of the queue (phase 'queued'). No phase callback fires for the enqueue itself. */
  enqueue(job: Job): void {
    job.phase = 'queued';
    job.stationIndex = -1;
    job.progress = 0;
    job.pos = [...this.anchors[0]];
    this.jobs.push(job);
    this.queue.push(job);
    this.tracks.set(job.id, { dist: 0, elapsed: 0, decided: false });
  }

  /**
   * Remove a job from anywhere in the line: sets its phase to 'destroyed' and returns it, or null if
   * it is not in the line. No phase callback fires; events still pending for it are dropped.
   */
  remove(jobId: number): Job | null {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job) return null;
    this.detach(job);
    job.phase = 'destroyed';
    return job;
  }

  /** Swap in a new geometry; in-flight jobs keep stationIndex/progress and get new positions. */
  relayout(anchors: Vec3[], paths: Vec3[][]): void {
    this.setLayout(anchors, paths);
    for (const job of this.jobs) {
      if (job.phase === 'conveyor') {
        const tr = this.tracks.get(job.id)!;
        tr.dist = job.progress * this.polys[job.stationIndex].len;
      }
      this.updatePos(job);
    }
  }

  tick(simDt: number): void {
    if (!(simDt > 0)) return;
    const n = this.stations.length;
    for (let i = n - 1; i >= 0; i--) {
      this.updateStation(i, simDt);
      if (i >= 1) this.updateConveyor(i - 1, simDt);
      else this.intake();
    }
    for (const job of this.jobs) if (job.phase === 'conveyor') this.updatePos(job);
    this.flush();
  }

  // ---- internals ----

  private setLayout(anchors: Vec3[], paths: Vec3[][]): void {
    if (anchors.length !== this.stations.length || paths.length !== this.stations.length - 1) {
      throw new Error('anchors/paths do not match station count');
    }
    this.anchors = anchors;
    this.polys = paths.map(toPoly);
  }

  /** Phase events are queued during tick() and delivered after all mutation passes complete. */
  private emit(job: Job, prev: JobPhase): void {
    this.pending.push({ job, prev, phase: job.phase });
  }

  /** Deliver queued events; callbacks may call remove()/enqueue(). Stale events (job changed since) are skipped. */
  private flush(): void {
    const events = this.pending;
    this.pending = [];
    for (const e of events) {
      if (e.job.phase !== e.phase) continue;
      for (const cb of [...this.callbacks]) cb(e.job, e.prev);
    }
  }

  private durationOf(i: number, job: Job): number {
    const s = this.stations[i];
    return job.isSpace ? (s.spaceDuration ?? DEFAULT_SPACE_DURATION) : s.duration;
  }

  private detach(job: Job): void {
    this.jobs.splice(this.jobs.indexOf(job), 1);
    this.tracks.delete(job.id);
    const q = this.queue.indexOf(job);
    if (q >= 0) this.queue.splice(q, 1);
    const o = this.occupant.indexOf(job);
    if (o >= 0) this.occupant[o] = null;
    for (const seg of this.segs) {
      const k = seg.indexOf(job);
      if (k >= 0) seg.splice(k, 1);
    }
  }

  private enterStation(i: number, job: Job, prev: JobPhase): void {
    this.occupant[i] = job;
    job.phase = 'station';
    job.stationIndex = i;
    job.progress = 0;
    job.pos = [...this.anchors[i]];
    const tr = this.tracks.get(job.id)!;
    tr.elapsed = 0;
    tr.decided = false;
    this.emit(job, prev);
  }

  private intake(): void {
    if (this.occupant[0] || this.queue.length === 0) return;
    this.enterStation(0, this.queue.shift()!, 'queued');
  }

  private updateStation(i: number, dt: number): void {
    const job = this.occupant[i];
    if (!job) return;
    const tr = this.tracks.get(job.id)!;
    if (!tr.decided) {
      tr.elapsed += dt;
      const dur = this.durationOf(i, job);
      job.progress = dur > 0 ? Math.min(1, tr.elapsed / dur) : 1;
      if (job.progress < 1) return;
      tr.decided = true;
      if (this.decide(job, i) === 'reject') {
        this.detach(job);
        job.phase = 'rejected';
        this.emit(job, 'station');
        return;
      }
    }
    // Finished and accepted: leave if there is room downstream, otherwise wait with progress 1.
    if (i === this.stations.length - 1) {
      this.detach(job);
      job.phase = 'placing';
      this.emit(job, 'station');
      return;
    }
    const seg = this.segs[i];
    const tail = seg[seg.length - 1];
    if (tail && this.tracks.get(tail.id)!.dist < MIN_GAP) return;
    this.occupant[i] = null;
    job.phase = 'conveyor';
    job.progress = 0;
    tr.dist = 0;
    seg.push(job);
    this.updatePos(job);
    this.emit(job, 'station');
  }

  /** Advance conveyor `s` (feeding station s+1). */
  private updateConveyor(s: number, dt: number): void {
    const seg = this.segs[s];
    const len = this.polys[s].len;
    const move = CONVEYOR_SPEED * dt;
    let ahead: Track | null = null;
    for (let k = 0; k < seg.length; ) {
      const job = seg[k];
      const tr = this.tracks.get(job.id)!;
      const limit = ahead ? ahead.dist - MIN_GAP : len;
      tr.dist = Math.max(tr.dist, Math.min(tr.dist + move, limit));
      if (!ahead && tr.dist >= len && !this.occupant[s + 1]) {
        seg.splice(k, 1);
        this.enterStation(s + 1, job, 'conveyor');
        continue; // next job becomes the head
      }
      ahead = tr;
      k++;
    }
  }

  private updatePos(job: Job): void {
    if (job.phase === 'queued') {
      job.pos = [...this.anchors[0]];
    } else if (job.phase === 'station') {
      job.pos = [...this.anchors[job.stationIndex]];
    } else if (job.phase === 'conveyor') {
      const poly = this.polys[job.stationIndex];
      const d = Math.min(this.tracks.get(job.id)!.dist, poly.len);
      job.progress = poly.len > 0 ? d / poly.len : 1;
      job.pos = pointAt(poly, d);
    }
  }
}
