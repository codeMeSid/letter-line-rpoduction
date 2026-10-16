import * as THREE from 'three';
import type { AudioBus } from '../audio/bus';
import { buildConveyor, type Conveyor } from '../factories/shared/conveyor';
import { BELT_TOP } from '../factories/shared/dims';
import { hazardBand, housing } from '../factories/shared/parts';
import { ShelfView } from '../shelf/view';
import type { Director } from './director';
import type { FactoryDef } from './factory';
import { GAP, layoutStations, type LayoutResult } from './layout';
import { CONVEYOR_SPEED, Line } from './line';
import type { Looks } from './looks';
import type { ParticleSystem } from './particles';
import type { ProductHandle } from './product';
import type { Settings } from './settings';
import type { StationInstance } from './station';
import type { Job, LayoutMode, Vec3 } from './types';

export interface HostDeps {
  parent: THREE.Object3D;
  looks: Looks;
  director: Director;
  particles: ParticleSystem;
  audio: AudioBus;
  settings: () => Settings;
  now: () => number;
}

const FLOOR_PAD = 70;

/**
 * Mounts one FactoryDef in 3D at its world origin: floor, conveyors, stations, the Line, product
 * handles for in-flight jobs (shelved ones belong to the ShelfView). Layout anchors sit at belt-top height.
 */
export class FactoryHost {
  readonly root = new THREE.Group();
  readonly line: Line;
  readonly shelfView: ShelfView;
  layout: LayoutResult;
  private world = new THREE.Group();
  private products = new THREE.Group();
  private instances: StationInstance[] = [];
  private conveyors: Conveyor[] = [];
  private handles = new Map<number, ProductHandle>();
  private shaped = new Map<number, string>();
  private offs: (() => void)[] = [];

  constructor(readonly def: FactoryDef, readonly origin: Vec3, private d: HostDeps, mode: LayoutMode) {
    d.parent.add(this.root);
    this.root.add(this.world, this.products);
    this.layout = this.computeLayout(mode);
    this.shelfView = new ShelfView(this.root, d.director.shelf(def.kind), def.product.size, d.looks, this.layout.shelfOrigin);
    this.line = new Line(def.stations, this.layout.anchors, this.layout.paths, (job, i) => this.decide(job, i), { minGap: def.product.lineSize + 8 });
    this.offs.push(
      d.director.attach(def.kind, { line: this.line, firstStage: def.product.stages[0], slotPos: (id) => this.shelfView.slotPos(id) }),
      d.director.events.on('job:created', ({ job }) => { if (job.product === def.kind) this.handleOf(job); }),
      this.line.onPhase((job) => {
        if (job.phase === 'station') this.begin(job);
      }),
      d.director.events.on('slot:filled', ({ kind, slotId, job }) => {
        if (kind !== def.kind) return;
        const h = this.handles.get(job.id) ?? null;
        this.handles.delete(job.id);
        this.shaped.delete(job.id);
        this.shelfView.adopt(slotId, job, h);
      }),
    );
    this.build();
  }

  relayout(mode: LayoutMode): void {
    this.teardown();
    this.layout = this.computeLayout(mode);
    this.line.relayout(this.layout.anchors, this.layout.paths);
    this.shelfView.setOrigin(this.layout.shelfOrigin);
    this.build();
    // the old instances are gone: hand every job that is mid-station to its rebuilt instance
    for (const job of this.line.jobs) if (job.phase === 'station') this.begin(job);
  }

  restyle(): void {
    for (const h of this.handles.values()) h.restyle();
    for (const i of this.instances) i.restyle?.();
    this.shelfView.restyle();
  }

  bounds(): { min: Vec3; max: Vec3 } {
    const a = this.layout.bounds;
    const b = this.shelfView.bounds();
    return {
      min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), 0],
      max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
    };
  }

  /** Newest job on the line; a job arcing to the shelf only when nothing else is on the line (follow camera). */
  newest(): Vec3 | null {
    const onLine = this.line.jobs.filter((j) => j.phase !== 'queued');
    const jobs = onLine.length ? onLine : this.d.director.jobsOf(this.def.kind).filter((j) => j.phase === 'placing');
    return jobs.at(-1)?.pos ?? null;
  }

  busiest(): Vec3 | null {
    const counts = new Array<number>(this.def.stations.length).fill(0);
    for (const j of this.line.jobs) {
      if (j.phase === 'station') counts[j.stationIndex]++;
      else if (j.phase === 'conveyor') counts[j.stationIndex + 1]++;
    }
    let best = -1;
    counts.forEach((c, i) => { if (c > 0 && (best < 0 || c >= counts[best])) best = i; });
    return best < 0 ? null : this.layout.anchors[best];
  }

  followSpan(): number {
    const fp = Math.max(...this.def.stations.map((s) => Math.max(...s.footprint)));
    return 2.5 * (fp + GAP);
  }

  update(simDt: number, realDt: number): boolean {
    for (const c of this.conveyors) c.update(simDt, CONVEYOR_SPEED);
    const at: (Job | null)[] = this.def.stations.map(() => null);
    const live = new Set<number>();
    for (const job of this.d.director.jobsOf(this.def.kind)) {
      live.add(job.id);
      const h = this.handleOf(job);
      h.root.visible = job.phase !== 'queued';
      h.root.position.set(job.pos[0], job.pos[1], job.pos[2]);
      if (job.phase === 'station') { at[job.stationIndex] = job; this.shaped.delete(job.id); continue; }
      // off-station: the last station's outputStage must be applied before the placing arc starts
      if (this.shaped.get(job.id) !== job.stage) { h.shape(job.stage, 1); this.shaped.set(job.id, job.stage); }
      if (job.phase === 'placing') h.place(job.progress);
    }
    this.instances.forEach((inst, i) => {
      const j = at[i];
      inst.update(simDt, j, j?.progress ?? 0, j ? this.handles.get(j.id) ?? null : null);
    });
    for (const [id, h] of this.handles) {
      if (!live.has(id)) { this.drop(h); this.handles.delete(id); this.shaped.delete(id); }
    }
    this.shelfView.update(realDt);
    return true;
  }

  destroy(): void {
    this.teardown();
    for (const off of this.offs) off();
    for (const h of this.handles.values()) this.drop(h);
    this.handles.clear();
    this.shelfView.destroy();
    this.root.removeFromParent();
  }

  // ---- internals ----

  private computeLayout(mode: LayoutMode): LayoutResult {
    return layoutStations(this.def.stations, mode, [this.origin[0], this.origin[1], BELT_TOP]);
  }

  private handleOf(job: Job): ProductHandle {
    let h = this.handles.get(job.id);
    if (!h) {
      h = this.def.product.create(job, { looks: this.d.looks, marks: this.d.settings().letterMarks });
      h.root.position.set(job.pos[0], job.pos[1], job.pos[2]);
      h.root.visible = false;
      this.handles.set(job.id, h);
      this.products.add(h.root);
    }
    return h;
  }

  /** A product handle is dispose()d by its owner, which also detaches it (handles do not detach themselves). */
  private drop(h: ProductHandle): void {
    h.dispose();
    h.root.removeFromParent();
  }

  private begin(job: Job): void {
    const h = this.handleOf(job);
    h.root.position.set(job.pos[0], job.pos[1], job.pos[2]); // begin() sees the product on the station, not at the origin
    this.instances[job.stationIndex]?.begin(job, h);
  }

  /** Machines are what the cutaway section slices: tag every mesh `userData.cut` (unless it opted out with `cut = false`) and re-pick its material. */
  private cutTag(group: THREE.Object3D): void {
    group.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.userData.cut !== false) o.userData.cut = true; });
    this.d.looks.apply(group);
  }

  private decide(job: Job, i: number): 'pass' | 'reject' {
    const verdict = this.instances[i]?.finish(job) ?? 'pass';
    const out = this.def.stations[i].outputStage;
    if (verdict === 'pass' && out) job.stage = out;
    return verdict;
  }

  private build(): void {
    const { looks } = this.d;
    const b = this.layout.bounds;
    const s = this.shelfView.bounds();
    const x0 = Math.min(b.min[0], s.min[0]) - FLOOR_PAD;
    const x1 = Math.max(b.max[0], s.max[0]) + FLOOR_PAD;
    const y0 = Math.min(b.min[1], s.min[1]) - FLOOR_PAD;
    const y1 = Math.max(b.max[1], s.max[1]) + FLOOR_PAD;
    const floor = housing(looks, x1 - x0, y1 - y0, 4, 'concrete', 2);
    floor.position.set((x0 + x1) / 2, (y0 + y1) / 2, -4);
    floor.castShadow = false;
    this.world.add(floor);
    const walk = hazardBand(looks, x1 - x0 - 40, 6, 0.4);
    walk.position.set((x0 + x1) / 2, b.min[1] - 24, 0);
    this.world.add(walk);
    const ext = this.def.product.lineSize / 2 + 6;
    this.layout.paths.forEach((p, i) => {
      const c = buildConveyor(looks, p, { extendStart: i === 0 ? ext : 0, extendEnd: i === this.layout.paths.length - 1 ? ext : 0 });
      this.conveyors.push(c);
      this.world.add(c.group);
      this.cutTag(c.group);
    });
    const kind = this.def.kind;
    this.instances = this.def.stations.map((st, i) => {
      const group = new THREE.Group();
      const o = this.layout.anchors[i];
      group.position.set(o[0], o[1], o[2]);
      this.world.add(group);
      const inst = st.create({
        group, origin: o, looks, particles: this.d.particles, audio: this.d.audio, settings: this.d.settings, now: this.d.now,
        placing: () => this.d.director.jobsOf(kind).filter((j) => j.phase === 'placing'),
        product: (id) => this.handles.get(id) ?? null,
        shelfSpan: () => this.shelfView.span(),
      });
      this.cutTag(group);
      return inst;
    });
  }

  private teardown(): void {
    for (const i of this.instances) i.destroy();
    this.instances = [];
    for (const c of this.conveyors) c.dispose();
    this.conveyors = [];
    this.world.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
    this.world.clear();
  }
}
