import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { column, housing, lathe } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { controls, portal } from './controls';

const TOOL = 22;
const NECK_Z = 38;    // die bottom at full stroke, just under where the neck starts

/**
 * Station 8: necker. A die cap descends over the open end and presses the shoulder and neck in (and rolls the flange);
 * the multi-pocket turret beside the line stands for the other necking stages the can has already been through.
 */
export const necker: StationDef = {
  id: 'can-necker',
  label: 'Necker',
  footprint: [100, 140],
  height: 150,
  duration: 1.8,
  spaceDuration: 0.3,
  outputStage: 'necked',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    const press = portal(ctx, 96, TOOL, NECK_Z);
    press.ram.rodEnd.add(lathe(looks, [[12.6, -22], [17, -22], [17, 0], [0, 0], [0, -3], [10.9, -3], [10.9, -12], [12.6, -22]], 'copper', 32));
    // Turret with pockets, spun by its gearbox.
    const turret = new THREE.Group();
    turret.position.set(0, 44, 0);
    turret.add(lathe(looks, [[0, 14], [26, 14], [26, 20], [0, 20]], 'steel', 36));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const pocket = column(looks, 5, 4, 'paint-accent', 14);
      pocket.position.set(Math.cos(a) * 19, Math.sin(a) * 19, 20);
      const die = lathe(looks, [[0, 0], [3.6, 0], [3.6, 12], [0, 12]], 'copper', 10);
      die.position.copy(pocket.position).setZ(24);
      turret.add(pocket, die);
    }
    const shaft = column(looks, 5, 14 - FLOOR - 22, 'steel', 14);
    shaft.position.set(0, 44, FLOOR + 22);
    const gearbox = housing(looks, 30, 30, 22, 'paint', 3);
    gearbox.position.set(0, 44, FLOOR);
    group.add(turret, shaft, gearbox);
    const ui = controls(ctx, [-48, -56], [-36, -36, 60], [34, -36, 160]);

    const shots = oneShots();
    let ext = 0;
    let spin = 0;
    return {
      begin(job) {
        shots.reset();
        if (!job.isSpace) ctx.audio.play('press-thump', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        ext = ease(ext, live ? ss(0.12, 0.45, t) * (1 - ss(0.66, 0.9, t)) : 0, dt, 26);
        press.ram.set(ext);
        spin += dt * (live ? 1.6 : 0.2);
        turret.rotation.z = spin;
        if (live && t >= 0.45 && shots.once('neck')) {
          ctx.particles.emit('spark', { pos: world(ctx, 0, 0, 46), count: 4, spread: 5, vel: [0, 0, 6], floor: world(ctx, 0, 0, 0)[2] });
        }
        if (job) product?.shape('necked', ss(0.28, 0.5, t));
        ui.tick(live, ext);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
