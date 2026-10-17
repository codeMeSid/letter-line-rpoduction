import * as THREE from 'three';
import type { AudioBus } from '../audio/bus';
import { planBackspace } from '../engine/backspace';
import type { BackspaceHandler, Director } from '../engine/director';
import type { FactoryHost } from '../engine/factoryHost';
import type { Looks } from '../engine/looks';
import type { ParticleSystem } from '../engine/particles';
import type { ProductHandle } from '../engine/product';
import type { Settings } from '../engine/settings';
import type { ProductKind, Vec3 } from '../engine/types';
import type { NewlineMarker, Slot } from '../shelf/model';
import { BELT_TOP } from '../factories/shared/dims';
import { Fragments } from './fragments';
import { Shotgun } from './shotgun';

export interface DestroyerDeps {
  director: Director; looks: Looks; particles: ParticleSystem; audio: AudioBus; settings: () => Settings;
  hosts: Map<ProductKind, FactoryHost>;
  flash(pos: Vec3): void;
  shake(mag: number): void;
}

/** The director's BackspaceHandler: runs the spec's decision table with the shared shotgun and fragment pool. */
export class Destroyer implements BackspaceHandler {
  readonly group = new THREE.Group();
  private gun: Shotgun;
  private frags: Fragments;
  /** Products handed over by a host/shelf and waiting for their shot: disposed on hit, or on dispose(). */
  private held = new Set<ProductHandle>();

  constructor(private d: DestroyerDeps) {
    this.gun = new Shotgun({ looks: d.looks, particles: d.particles, audio: d.audio, flash: d.flash, shake: d.shake });
    this.frags = new Fragments(d.looks);
    this.group.add(this.gun.group, this.gun.shells, this.frags.group);
  }

  handleBackspace(target: Slot | NewlineMarker, { kind, director }: { kind: ProductKind; director: Director }): void {
    const host = this.d.hosts.get(kind);
    const shelf = director.shelf(kind);
    const job = target.kind === 'newline' ? null : director.jobsOf(kind).find((j) => j.id === target.jobId) ?? null;
    const plan = planBackspace(target, job, this.d.settings().inflightBackspace);
    switch (plan.type) {
      case 'newline':
        shelf.removeNewline();
        return;
      case 'quiet':
        if (plan.slot.jobId !== null) director.destroyJob(plan.slot.jobId);
        this.removeSlot(kind, plan.slot.id);
        return;
      case 'gap': // ponytail: Task 16 sends the broom; until then the gap just closes
        this.removeSlot(kind, plan.slot.id);
        this.d.audio.play('whoosh');
        return;
      case 'reject': // ponytail: Task 16 adds the hoist; until then rejects are shot
      case 'shoot-line': {
        const h = host?.release(plan.jobId) ?? null;
        // a placing job's z includes the robot's arc, so it falls to the factory floor; belt and station jobs
        // fall from belt height to the floor of their own level (upper floors in the 'all' layout)
        const floor = job?.phase === 'placing' ? host?.origin[2] ?? 0 : (job?.pos[2] ?? BELT_TOP) - BELT_TOP;
        director.destroyJob(plan.jobId);
        this.removeSlot(kind, plan.slot.id);
        if (h) this.shoot(kind, h, floor, () => {});
        return;
      }
      case 'shoot-shelf': {
        const h = host?.shelfView.release(plan.slot.id) ?? null;
        shelf.markDying(plan.slot.id);
        if (!h) { this.removeSlot(kind, plan.slot.id); return; }
        this.shoot(kind, h, 0, () => this.removeSlot(kind, plan.slot.id));
        return;
      }
    }
  }

  update(dt: number): void {
    this.gun.update(dt);
    this.frags.update(dt);
  }

  /** Look changed: products waiting for their shot are not in a host or shelf any more, so restyle them here. */
  restyle(): void {
    for (const h of this.held) h.restyle();
  }

  dispose(): void {
    for (const h of this.held) this.drop(h);
    this.held.clear();
    this.gun.dispose();
    this.frags.dispose();
    this.group.removeFromParent();
  }

  private removeSlot(kind: ProductKind, slotId: number): void {
    this.d.director.shelf(kind).remove(slotId);
    this.d.director.events.emit('slot:removed', { kind, slotId });
  }

  private drop(h: ProductHandle): void {
    h.dispose();
    h.root.removeFromParent();
  }

  /** Hold the product where it is, shoot it, shatter it per its product style, then `after()`. */
  private shoot(kind: ProductKind, h: ProductHandle, floor: number, after: () => void): void {
    this.group.attach(h.root);
    this.held.add(h);
    const model = this.d.hosts.get(kind)!.def.product;
    const p = h.root.position;
    const at: Vec3 = [p.x, p.y, p.z + model.size[2] / 2];
    this.gun.shoot(at, floor, () => {
      const st = model.shatter;
      for (const b of st.burst) this.d.particles.emit(b.kind, { pos: at, count: b.count, spread: 6, floor });
      for (const s of st.sounds) this.d.audio.play(s, { x: at[0] });
      this.frags.burst(st.fragments.role, at, st.fragments.count, st.fragments.size, floor);
      this.held.delete(h);
      this.drop(h);
      after();
    });
  }
}
