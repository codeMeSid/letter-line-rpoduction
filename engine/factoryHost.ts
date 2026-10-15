import { hl, type Cam, type Projector } from '@/lib/hl';
import type { AudioBus } from '../audio/bus';
import { ShelfView } from '../shelf/view';
import type { Director } from './director';
import type { FactoryDef } from './factory';
import { GAP, layoutStations, type LayoutResult } from './layout';
import { CONVEYOR_SPEED, Line } from './line';
import type { ParticleSystem } from './particles';
import { ProductView } from './productView';
import type { Settings } from './settings';
import type { StationInstance } from './station';
import type { Job, LayoutMode, Vec3 } from './types';

const BELT_W = 20;
const BELT_H = 5;
const ROLLER_STEP = 16;
const DASH = 8; // dash + gap length of the belt texture

export interface HostDeps {
  C: Cam;
  P: Projector;
  layers: { bg: SVGGElement; factories: SVGGElement; shelves: SVGGElement };
  director: Director;
  particles: ParticleSystem;
  audio: AudioBus;
  settings: () => Settings;
  now: () => number;
}

/**
 * Mounts one FactoryDef at its world origin: floor, conveyors, stations (paint order), the Line,
 * product views for in-flight jobs and the shelf view. `relayout` rebuilds the visuals for a new mode.
 */
export class FactoryHost {
  readonly line: Line;
  readonly shelfView: ShelfView;
  layout: LayoutResult;
  private floorG: SVGGElement;
  private g: SVGGElement;
  private beltG!: SVGGElement;
  private stationsG!: SVGGElement;
  private productsG!: SVGGElement;
  private instances: StationInstance[] = [];
  private belts: SVGPathElement[] = [];
  private views = new Map<number, ProductView>();
  private simTime = 0;
  private offs: (() => void)[] = [];

  constructor(readonly def: FactoryDef, readonly origin: Vec3, private d: HostDeps, mode: LayoutMode) {
    const HL = hl();
    this.layout = layoutStations(def.stations, mode, origin);
    this.floorG = HL.mk('g', { 'data-floor': def.kind }, d.layers.bg);
    this.g = HL.mk('g', { 'data-factory': def.kind }, d.layers.factories);
    const shelf = d.director.shelf(def.kind);
    this.shelfView = new ShelfView(d.layers.shelves, shelf, def.product, d.C, d.P, this.layout.shelfOrigin);
    this.line = new Line(def.stations, this.layout.anchors, this.layout.paths, (job, i) => this.decide(job, i));
    this.offs.push(
      this.line.onPhase((job) => {
        if (job.phase === 'station') this.instances[job.stationIndex]?.begin(job);
        if (job.phase === 'placing') this.views.get(job.id)?.reparent(this.shelfView.incoming);
      }),
      d.director.attach(def.kind, { line: this.line, firstStage: def.product.stages[0], slotPos: (id) => this.shelfView.slotPos(id) }),
      d.director.events.on('slot:filled', ({ kind, slotId, job }) => {
        if (kind !== def.kind) return;
        this.shelfView.adopt(slotId, job, this.views.get(job.id) ?? null);
        this.views.delete(job.id);
      }),
    );
    this.build();
  }

  relayout(mode: LayoutMode): void {
    this.teardown();
    this.layout = layoutStations(this.def.stations, mode, this.origin);
    this.line.relayout(this.layout.anchors, this.layout.paths);
    this.shelfView.setOrigin(this.layout.shelfOrigin);
    this.build();
  }

  bounds(): { min: Vec3; max: Vec3 } {
    const a = this.layout.bounds;
    const b = this.shelfView.bounds();
    return {
      min: [0, 1, 2].map((i) => Math.min(a.min[i], b.min[i])) as Vec3,
      max: [0, 1, 2].map((i) => Math.max(a.max[i], b.max[i])) as Vec3,
    };
  }

  /** Newest in-flight job position (camera follow). */
  newest(): Vec3 | null {
    const jobs = this.d.director.jobsOf(this.def.kind);
    return jobs.length ? jobs[jobs.length - 1].pos : null;
  }

  /** Anchor of the station with the most jobs at or heading to it (camera cinematic). */
  busiest(): Vec3 | null {
    const counts = new Array<number>(this.def.stations.length).fill(0);
    for (const j of this.line.jobs) {
      if (j.phase === 'station') counts[j.stationIndex]++;
      else if (j.phase === 'conveyor') counts[j.stationIndex + 1]++;
      else counts[0]++;
    }
    let best = -1;
    counts.forEach((c, i) => { if (c > 0 && (best < 0 || c >= counts[best])) best = i; });
    return best < 0 ? null : this.layout.anchors[best];
  }

  /** World span of about three stations. */
  followSpan(): number {
    const fp = Math.max(...this.def.stations.map((s) => Math.max(...s.footprint)));
    return 3 * (fp + GAP);
  }

  /** Visual update (sim keeps running in the Director even when this host is culled). */
  update(simDt: number, realDt: number): boolean {
    this.simTime += simDt;
    const off = String(-((this.simTime * CONVEYOR_SPEED) % (DASH * 2)));
    for (const b of this.belts) b.setAttribute('stroke-dashoffset', off);

    const at: (Job | null)[] = this.def.stations.map(() => null);
    for (const j of this.line.jobs) if (j.phase === 'station') at[j.stationIndex] = j;
    this.instances.forEach((inst, i) => inst.update(simDt, at[i], at[i]?.progress ?? 0));

    const marks = this.d.settings().letterMarks;
    const live = new Set<number>();
    for (const job of this.d.director.jobsOf(this.def.kind)) {
      live.add(job.id);
      let v = this.views.get(job.id);
      if (!v) {
        v = new ProductView(job.phase === 'placing' ? this.shelfView.incoming : this.productsG, this.def.product, job, this.d.P);
        this.views.set(job.id, v);
      }
      v.sync(marks);
    }
    for (const [id, v] of this.views) if (!live.has(id)) { v.destroy(); this.views.delete(id); }
    this.shelfView.update(realDt, marks);
    return true; // belts always run
  }

  destroy(): void {
    this.teardown();
    for (const off of this.offs) off();
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    this.shelfView.destroy();
    this.floorG.remove();
    this.g.remove();
  }

  // ---- internals ----

  private decide(job: Job, i: number): 'pass' | 'reject' {
    const verdict = this.instances[i]?.finish(job) ?? 'pass';
    const out = this.def.stations[i].outputStage;
    if (verdict === 'pass' && out) job.stage = out;
    return verdict;
  }

  private build(): void {
    const HL = hl();
    const { P } = this.d;
    this.drawFloor();
    this.beltG = HL.mk('g', { 'data-belts': '' }, this.g);
    this.stationsG = HL.mk('g', { 'data-stations': '' }, this.g);
    this.productsG = HL.mk('g', { 'data-products': '' }, this.g);
    this.drawBelts();

    // Paint order (Global 5): ascending x + y, then z.
    const order = this.layout.anchors.map((a, i) => ({ a, i })).sort((p, q) => p.a[0] + p.a[1] - (q.a[0] + q.a[1]) || p.a[2] - q.a[2]);
    const layers: SVGGElement[] = [];
    for (const { i } of order) layers[i] = HL.mk('g', { 'data-station': this.def.stations[i].id }, this.stationsG);
    this.instances = this.def.stations.map((s, i) => s.create({
      P, layer: layers[i], origin: this.layout.anchors[i],
      particles: this.d.particles, audio: this.d.audio, settings: this.d.settings, now: this.d.now,
    }));
    // In-flight products re-attach to the fresh group.
    for (const v of this.views.values()) v.reparent(v.job.phase === 'placing' ? this.shelfView.incoming : this.productsG);
  }

  private teardown(): void {
    for (const inst of this.instances) inst.destroy();
    this.instances = [];
    this.belts = [];
    for (const v of this.views.values()) v.reparent(this.d.layers.factories); // keep views alive across rebuild
    this.g.replaceChildren();
    this.floorG.replaceChildren();
  }

  /** Floor slab outline + grid, and a low back wall (building shell), in the bg layer. */
  private drawFloor(): void {
    const HL = hl();
    const { P, C } = this.d;
    const b = this.bounds();
    const pad = 60;
    const [x0, y0, x1, y1] = [b.min[0] - pad, b.min[1] - pad, b.max[0] + pad, b.max[1] + pad];
    const step = 80;
    let d = '';
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) d += HL.seg(P(x, y0, 0), P(x, y1, 0));
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) d += HL.seg(P(x0, y, 0), P(x1, y, 0));
    HL.mk('path', { d, class: 'lo nf' }, this.floorG);
    HL.mk('path', { d: HL.poly(HL.ringAt(P, HL.rrect(x0, y0, x1, y1, 16), 0)), class: 'lo nf' }, this.floorG);
    const front = HL.facing(C);
    const wall = (u0: number, v0: number, u1: number, v1: number) => {
      const [ring, inner] = HL.rings(u0, v0, u1, v1, 2, 1.5);
      HL.put(HL.solid(this.floorG), HL.prism(P, front, ring, inner, 0, 24));
    };
    wall(x0, y0, x1, y0 + 6);
    wall(x0, y0, x0 + 6, y1);
  }

  private drawBelts(): void {
    const HL = hl();
    const { P, C } = this.d;
    const front = HL.facing(C);
    const segs: { a: Vec3; b: Vec3 }[] = [];
    for (const path of this.layout.paths) for (let k = 0; k + 1 < path.length; k++) segs.push({ a: path[k], b: path[k + 1] });
    segs.sort((s, t) => s.a[0] + s.b[0] + s.a[1] + s.b[1] - (t.a[0] + t.b[0] + t.a[1] + t.b[1]));
    // Mezzanine outlines for upper floors.
    const lb = this.layout.bounds;
    for (const z of this.layout.floors.slice(1)) {
      const ring = HL.rrect(lb.min[0] - 20, lb.min[1] - 20, lb.max[0] + 20, lb.max[1] + 20, 10);
      HL.mk('path', { d: HL.poly(HL.ringAt(P, ring, z)), class: 'lo nf' }, this.beltG);
    }
    const hw = BELT_W / 2;
    for (const { a, b } of segs) {
      if (a[0] === b[0] && a[1] === b[1]) {
        // vertical lift between floors
        const [ring, inner] = HL.rings(a[0] - hw, a[1] - hw, a[0] + hw, a[1] + hw, 3, 2);
        HL.put(HL.solid(this.beltG), HL.prism(P, front, ring, inner, Math.min(a[2], b[2]) - BELT_H, Math.max(a[2], b[2])));
        continue;
      }
      const z = a[2];
      const [u0, u1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
      const [v0, v1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
      const [ring, inner] = HL.rings(u0 - hw, v0 - hw, u1 + hw, v1 + hw, 4, 2);
      HL.put(HL.solid(this.beltG), HL.prism(P, front, ring, inner, z - BELT_H, z));
      // roller marks across the belt
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
      let rollers = '';
      for (let s = ROLLER_STEP / 2; s < len; s += ROLLER_STEP) {
        const cx = a[0] + ux * s, cy = a[1] + uy * s;
        rollers += HL.seg(P(cx - uy * (hw - 3), cy + ux * (hw - 3), z), P(cx + uy * (hw - 3), cy - ux * (hw - 3), z));
      }
      HL.mk('path', { d: rollers, class: 'lo nf' }, this.beltG);
      // moving belt texture: dashed centre line whose offset tracks sim time
      this.belts.push(HL.mk('path', { d: HL.seg(P(...a), P(...b)), class: 'lo nf', 'stroke-dasharray': `${DASH} ${DASH}` }, this.beltG));
    }
  }
}
