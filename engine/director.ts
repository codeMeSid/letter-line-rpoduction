import { Clock } from './clock';
import { createEmitter, type Emitter } from './events';
import { specialFor } from './charset';
import { paceParams } from './pace';
import type { Line } from './line';
import type { Settings } from './settings';
import type { Command, Job, JobPhase, ProductKind, SlotRef, Vec3 } from './types';
import { Shelf, type NewlineMarker, type Slot } from '../shelf/model';
import type { SoundName } from '../audio/types';

export const PLACE_TIME = 0.8;  // sim seconds for the robot placement arc
export const PLACE_ARC = 60;    // world units of lift at the middle of the arc

export interface DirectorEvents {
  'job:created': { job: Job };
  'job:phase': { job: Job; prev: JobPhase };
  'slot:reserved': { kind: ProductKind; slot: SlotRef; isSpace: boolean };
  'slot:filled': { kind: ProductKind; slotId: number; job: Job };
  'slot:removed': { kind: ProductKind; slotId: number };
  'slot:debris': { kind: ProductKind; slotId: number };
  'row:new': { kind: ProductKind; row: number };
  'row:shipped': { kind: ProductKind; slots: Slot[] };
  'destroy:shoot': { kind: ProductKind; slotId: number; job: Job | null };
  'destroy:reject': { kind: ProductKind; slotId: number; job: Job | null };
  'destroy:gap': { kind: ProductKind; slotId: number; job: Job | null };
}

/** What a mounted factory gives the director (DOM-free). */
export interface LineHost {
  line: Line;
  /** product stage of a fresh job */
  firstStage: string;
  /** world position of a shelf slot (where the product sits) */
  slotPos(slotId: number): Vec3 | null;
}

/** Task 8 registers one of these; it then owns all backspace behaviour. */
export interface BackspaceHandler {
  handleBackspace(target: Slot | NewlineMarker, ctx: { kind: ProductKind; director: Director }): void;
}

export interface DirectorAudio { play(name: SoundName, opts?: { x?: number }): void }

export interface DirectorOptions {
  settings: () => Settings;
  now: () => number;
  audio?: DirectorAudio;
}

interface Placement { job: Job; kind: ProductKind; from: Vec3; t: number }

/** Routes commands to the active factory, owns one Shelf per factory, the Clock and the event bus. */
export class Director {
  readonly events: Emitter<DirectorEvents> = createEmitter<DirectorEvents>();
  readonly clock = new Clock();
  private hosts = new Map<ProductKind, LineHost>();
  private shelves = new Map<ProductKind, Shelf>();
  private placing = new Map<number, Placement>();
  private nextJobId = 1;
  private backspace: BackspaceHandler | null = null;

  constructor(private o: DirectorOptions) {}

  /** Register a factory's line; returns a detach function. */
  attach(kind: ProductKind, host: LineHost): () => void {
    this.hosts.set(kind, host);
    const off = host.line.onPhase((job, prev) => this.onPhase(kind, job, prev));
    return () => {
      off();
      if (this.hosts.get(kind) === host) this.hosts.delete(kind);
    };
  }

  setBackspaceHandler(h: BackspaceHandler | null): void {
    this.backspace = h;
  }

  shelf(kind: ProductKind): Shelf {
    let s = this.shelves.get(kind);
    if (!s) this.shelves.set(kind, (s = new Shelf()));
    return s;
  }

  /** In-flight jobs of a factory: on the line (enqueue order) then placing. */
  jobsOf(kind: ProductKind): Job[] {
    const line = this.hosts.get(kind)?.line.jobs ?? [];
    const placing = [...this.placing.values()].filter((p) => p.kind === kind).map((p) => p.job);
    return [...line, ...placing];
  }

  speedMul(now: number): number {
    const p = paceParams(this.o.settings().pace);
    return p.wpm ? this.clock.speedMul(now) : p.speedMul;
  }

  handle(cmd: Command): void {
    const kind = this.o.settings().product;
    switch (cmd.type) {
      case 'char':
      case 'space':
        this.type(kind, cmd.type === 'space' ? '' : cmd.char);
        return;
      case 'enter':
        this.enter(kind);
        return;
      case 'backspace':
        this.backspaceCmd(kind);
        return;
    }
  }

  /** Advance every line and the placement arcs. Returns true while anything is in flight. */
  update(simDt: number): boolean {
    const maxInFlight = paceParams(this.o.settings().pace).maxInFlight;
    for (const h of this.hosts.values()) h.line.maxInFlight = maxInFlight;
    for (const h of this.hosts.values()) h.line.tick(simDt);
    for (const p of [...this.placing.values()]) {
      p.t = Math.min(1, p.t + simDt / PLACE_TIME);
      const to = this.hosts.get(p.kind)?.slotPos(p.job.slotId) ?? null;
      if (!to) { this.drop(p.job); continue; } // slot gone (shipped/removed)
      const e = p.t * p.t * (3 - 2 * p.t);
      p.job.progress = p.t;
      p.job.pos = [
        p.from[0] + (to[0] - p.from[0]) * e,
        p.from[1] + (to[1] - p.from[1]) * e,
        p.from[2] + (to[2] - p.from[2]) * e + Math.sin(Math.PI * p.t) * PLACE_ARC,
      ];
      if (p.t >= 1) { p.job.pos = [...to]; this.shelve(p); }
    }
    for (const h of this.hosts.values()) if (h.line.jobs.length) return true;
    return this.placing.size > 0;
  }

  /** Remove an in-flight job (line or placement) and mark it destroyed. Returns it, or null. */
  destroyJob(jobId: number): Job | null {
    for (const h of this.hosts.values()) {
      const j = h.line.jobs.find((x) => x.id === jobId);
      if (j) {
        const prev = j.phase;
        h.line.remove(jobId);
        this.events.emit('job:phase', { job: j, prev });
        return j;
      }
    }
    const p = this.placing.get(jobId);
    if (!p) return null;
    this.drop(p.job);
    return p.job;
  }

  // ---- internals ----

  private type(kind: ProductKind, char: string): void {
    const host = this.hosts.get(kind);
    if (!host) return; // no factory mounted for this product yet
    this.clock.recordKey(this.o.now());
    const shelf = this.shelf(kind);
    const rowsBefore = shelf.rows.length;
    const isSpace = char === '';
    const slot = shelf.reserve(isSpace ? 'space' : 'char', char);
    if (shelf.rows.length > rowsBefore) this.events.emit('row:new', { kind, row: slot.row });
    const job: Job = {
      id: this.nextJobId++, slotId: slot.slotId, char, isSpace, special: isSpace ? 'none' : specialFor(char),
      product: kind, stage: host.firstStage, phase: 'queued', stationIndex: -1, progress: 0,
      pos: [0, 0, 0], defect: false, retries: 0,
    };
    shelf.attachJob(slot.slotId, job.id);
    host.line.enqueue(job);
    this.events.emit('slot:reserved', { kind, slot, isSpace });
    this.events.emit('job:created', { job });
    this.o.audio?.play('key-clack', { x: job.pos[0] });
  }

  private enter(kind: ProductKind): void {
    const shelf = this.shelf(kind);
    shelf.newline();
    this.events.emit('row:new', { kind, row: shelf.rows.length - 1 });
    if (!this.o.settings().forklift) return;
    // ponytail: ships the oldest closed row; forklift visuals and in-flight jobs bound for it are Task 10
    const slots = shelf.shipRow();
    if (slots) this.events.emit('row:shipped', { kind, slots });
  }

  private backspaceCmd(kind: ProductKind): void {
    const shelf = this.shelf(kind);
    const target = shelf.peekLast();
    if (!target || target.kind === 'busy') return; // busy: Task 8 retries after the next removal
    if (this.backspace) {
      this.backspace.handleBackspace(target, { kind, director: this });
      return;
    }
    if (target.kind === 'newline') {
      shelf.removeNewline();
      return;
    }
    if (target.jobId !== null) this.destroyJob(target.jobId);
    shelf.remove(target.id);
    this.events.emit('slot:removed', { kind, slotId: target.id });
  }

  private onPhase(kind: ProductKind, job: Job, prev: JobPhase): void {
    this.events.emit('job:phase', { job, prev });
    if (job.phase === 'placing') {
      this.placing.set(job.id, { job, kind, from: [...job.pos], t: 0 });
    } else if (job.phase === 'rejected') {
      // ponytail: straight back onto the line; Task 8 adds the chute, Task 10 the defect flow
      job.retries++;
      job.stage = this.hosts.get(kind)?.firstStage ?? job.stage;
      this.hosts.get(kind)?.line.enqueue(job);
    }
  }

  private shelve(p: Placement): void {
    this.placing.delete(p.job.id);
    const shelf = this.shelf(p.kind);
    const prev = p.job.phase;
    p.job.phase = 'shelved';
    shelf.markFilled(p.job.slotId);
    this.events.emit('job:phase', { job: p.job, prev });
    this.events.emit('slot:filled', { kind: p.kind, slotId: p.job.slotId, job: p.job });
    if (shelf.slotPos(p.job.slotId).col === shelf.cols - 1) this.o.audio?.play('ding', { x: p.job.pos[0] });
  }

  private drop(job: Job): void {
    this.placing.delete(job.id);
    const prev = job.phase;
    job.phase = 'destroyed';
    this.events.emit('job:phase', { job, prev });
  }
}
