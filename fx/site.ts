import * as THREE from 'three';
import type { AudioBus } from '../audio/bus';
import type { Director } from '../engine/director';
import type { FactoryHost } from '../engine/factoryHost';
import type { Looks } from '../engine/looks';
import type { ParticleSystem } from '../engine/particles';
import type { ProductHandle } from '../engine/product';
import type { Settings } from '../engine/settings';
import type { Job } from '../engine/types';
import { buildBuilding, type Building } from '../factories/shared/building';
import { SHELF_ROWS } from '../shelf/model';
import { Broom } from './broom';
import { Forklift } from './forklift';
import { Hoist, type HoistAnchors } from './hoist';

export interface SiteDeps { looks: Looks; director: Director; audio: AudioBus; particles: ParticleSystem; settings: () => Settings }

export const BUILDING_MIN_H = 320;
const SIGN_SCALE = 3;

/** Everything around one built factory's machines: building shell, sign, reject hoist, shelf broom, dock forklift; later workers. */
export class FactorySite {
  readonly group = new THREE.Group();
  building!: Building;
  /** Created once (not in build()), so a rebuild never interrupts a trip in progress. */
  readonly hoist: Hoist;
  readonly broom: Broom;
  readonly forklift: Forklift;
  private sign: ProductHandle | null = null;

  constructor(readonly host: FactoryHost, private d: SiteDeps, parent: THREE.Object3D) {
    parent.add(this.group);
    this.build();
    this.hoist = new Hoist(d.looks, d.audio, this.anchors());
    this.broom = new Broom(d.looks, d.audio, d.particles, () => { const s = host.shelfView.span(); return [s.x1 + 20, s.y, s.z]; });
    this.forklift = new Forklift(d.looks, d.audio, this.building.dockPark, this.building.dockDoor);
    this.group.add(this.hoist.group, this.broom.group, this.forklift.group);
  }

  /** After host.relayout(): the floor box changed. */
  rebuild(): void {
    this.clear();
    this.build();
    this.hoist.setAnchors(this.anchors());
    this.forklift.setDock(this.building.dockPark, this.building.dockDoor);
  }

  update(realDt: number, night: number): void {
    this.building.setNight(night > 0.5); // setNight is a no-op when unchanged
    this.hoist.update(realDt);
    this.broom.update(realDt);
    const shelf = this.d.director.shelf(this.host.def.kind);
    if (!this.forklift.busy && shelf.readyToShip()) {
      const row = shelf.rows[0];
      this.forklift.fetch(
        () => this.host.shelfView.rowEnd(row),
        () => {
          if (shelf.rows[0] !== row || !shelf.readyToShip()) return null; // gone, or backspaced down to three rows while it drove over
          const load = this.host.shelfView.releaseRow(row);
          this.d.director.shipRow(this.host.def.kind);
          return load;
        },
      );
    }
    this.forklift.update(realDt, 1 + Math.max(0, shelf.rows.length - SHELF_ROWS - 1)); // rows waiting: it hurries
  }

  restyle(): void {
    this.sign?.restyle();
    this.hoist.restyle();
    this.forklift.restyle();
  }

  dispose(): void {
    this.hoist.dispose();
    this.broom.dispose();
    this.forklift.dispose();
    this.clear();
    this.group.removeFromParent();
  }

  private anchors(): HoistAnchors {
    const { chuteTop, chuteBottom, binPos, height } = this.building;
    return { chuteTop, chuteBottom, binPos, ceil: height };
  }

  private build(): void {
    const height = Math.max(BUILDING_MIN_H, this.host.layout.bounds.max[2] + 160);
    this.building = buildBuilding(this.d.looks, this.host.floorBox(), height);
    this.group.add(this.building.group);
    const def = this.host.def;
    const stage = def.product.stages[def.product.stages.length - 1];
    const job: Job = {
      id: -1, slotId: -1, char: 'A', isSpace: false, special: 'none', product: def.kind, stage, phase: 'shelved',
      stationIndex: def.stations.length - 1, progress: 1, pos: [...this.building.signAt], defect: false, retries: 0,
    };
    const h = def.product.create(job, { looks: this.d.looks, marks: this.d.settings().letterMarks });
    h.shape(stage, 1);
    h.place(1);
    h.root.scale.setScalar(SIGN_SCALE);
    h.root.position.set(...this.building.signAt);
    this.group.add(h.root);
    this.sign = h;
  }

  private clear(): void {
    if (this.sign) { this.sign.dispose(); this.sign.root.removeFromParent(); this.sign = null; }
    this.building?.dispose();
  }
}
