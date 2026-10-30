import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, flange, housing, lathe, pipe } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { controls } from './kit';

const TANK_Z = 62;

/**
 * Station 8: glaze curtain. A header tank over the line with a slot and a recirculating pump; a sheet of white glaze falls over the
 * biscuit mug (a pump recirculates it), and the mug turns from biscuit to dull glaze coat.
 */
export const glazer: StationDef = {
  id: 'mug-glazer',
  label: 'Glaze curtain',
  footprint: [130, 120],
  height: 110,
  duration: 1.8,
  spaceDuration: 0.3,
  outputStage: 'glazed',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    // Header tank rides a cross rail over the line, laying its sheet of glaze across the mug.
    for (const y of [-34, 34]) {
      group.add(beam(looks, [-60, y, FLOOR], [-60, y, TANK_Z - 6], 6, 'paint'), beam(looks, [60, y, FLOOR], [60, y, TANK_Z - 6], 6, 'paint'));
      group.add(beam(looks, [-60, y, TANK_Z - 6], [60, y, TANK_Z - 6], 4, 'steel'));
    }
    const head = new THREE.Group();
    const tank = housing(looks, 40, 32, 22, 'paint', 3);
    tank.position.z = TANK_Z - 4;
    const slot = housing(looks, 3, 28, 4, 'steel', 0.5);
    slot.position.z = TANK_Z - 8;
    const glaze = lathe(looks, [[0, TANK_Z + 18], [12, TANK_Z + 18], [12, TANK_Z + 20], [0, TANK_Z + 20]], 'sand', 16);
    const sheet = housing(looks, 1.2, 26, 1, 'sand', 0.2);
    sheet.visible = false;
    head.add(tank, slot, glaze, sheet);
    group.add(head);
    // Sump pump and return line.
    const pump = column(looks, 8, 22, 'paint-accent', 16);
    pump.position.set(-64, -20, FLOOR);
    group.add(pump, pipe(looks, [[-64, -20, FLOOR + 22], [-64, -20, TANK_Z + 40], [-50, -10, TANK_Z + 40], [-50, -10, TANK_Z + 30]], 3, 'steel'));
    const fl = flange(looks, 6, 6);
    fl.position.set(-64, -20, FLOOR + 22);
    group.add(fl);
    const tick = controls(ctx, group, [-68, 34, TANK_Z + 34], 1);

    const shots = oneShots();
    return {
      begin(job) {
        shots.reset();
        if (!job.isSpace) ctx.audio.play('filler-pour', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const falling = live && t > 0.15 && t < 0.85;
        sheet.visible = falling;
        head.position.x = -24 + 48 * ss(0.15, 0.85, t);
        if (falling) {
          sheet.position.z = 0;
          sheet.scale.z = TANK_Z - 8;
          ctx.particles.emit('droplet', { pos: world(ctx, head.position.x, 0, 16), count: 1, vel: [6, 0, 10], spread: 5, floor: world(ctx, 0, 0, 0)[2] });
        }
        if (job) product?.shape('glazed', ss(0.15, 0.9, t));
        tick(live);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
