import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, gauge, housing, lamp, lathe, panel } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { BED_T } from '../product';

const RAIL_Z = 40;
const SPAN = 30;     // wire travels y -SPAN..SPAN
const RING_UP = 42;

/**
 * Station 4: wire cutter and former. A taut wire on a gantry carriage sweeps across the tray under the dough column,
 * then a forming ring drops over it and rounds it into a ball.
 */
export const cutter: StationDef = {
  id: 'cookie-cutter',
  label: 'Wire cutter',
  footprint: [100, 110],
  height: 80,
  duration: 1.8,
  spaceDuration: 0.3,
  outputStage: 'cut',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    for (const x of [-26, 26]) {
      group.add(beam(looks, [x, -SPAN - 6, RAIL_Z], [x, SPAN + 6, RAIL_Z], 4, 'steel'));
      for (const y of [-SPAN - 6, SPAN + 6]) group.add(beam(looks, [x, y, FLOOR], [x, y, RAIL_Z], 5, 'paint'));
    }
    const driveBox = housing(looks, 14, 14, 20, 'paint-accent', 2);
    driveBox.position.set(0, SPAN + 18, RAIL_Z - 10);
    group.add(driveBox, beam(looks, [-26, SPAN + 18, RAIL_Z + 6], [26, SPAN + 18, RAIL_Z + 6], 3, 'steel'));

    // Carriage: bridge on the rails, two hangers, the cutting wire just over the tray.
    const carriage = new THREE.Group();
    carriage.add(beam(looks, [-30, 0, RAIL_Z + 4], [30, 0, RAIL_Z + 4], 6, 'paint'));
    for (const x of [-20, 20]) carriage.add(beam(looks, [x, 0, RAIL_Z + 4], [x, 0, BED_T + 3], 2.5, 'steel'));
    carriage.add(beam(looks, [-20, 0, BED_T + 3], [20, 0, BED_T + 3], 0.7, 'steel'));
    group.add(carriage);

    const ring = lathe(looks, [[8.8, 0], [11, 0], [11, 7], [8.8, 7]], 'steel', 28);
    const ringArm = beam(looks, [11, 0, 7], [26, 0, RAIL_Z - 8], 3, 'steel');
    ring.add(ringArm);
    group.add(ring);

    const dial = gauge(looks, 5);
    dial.group.position.set(-40, 30, 30);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(46, -44, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(-26, -SPAN - 6, RAIL_Z + 8);
    group.add(dial.group, ctl.group, beacon.group);

    const shots = oneShots();
    let sweep = 0;
    let drop = 0;
    let on: boolean | null = null;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        sweep = live ? ss(0.05, 0.4, t) * (1 - ss(0.45, 0.6, t)) : sweep * Math.exp(-5 * dt);
        drop = live ? ss(0.55, 0.75, t) * (1 - ss(0.85, 1, t)) : drop * Math.exp(-5 * dt);
        carriage.position.y = -SPAN + 2 * SPAN * sweep;
        ring.position.z = BED_T + (1 - drop) * RING_UP;
        if (job) product?.shape('cut', t);
        if (live && t > 0.2 && shots.once('slice')) ctx.audio.play('gob-shear', { x: ctx.origin[0] });
        if (live && sweep > 0.1 && sweep < 0.95) ctx.particles.emit('crumb', { pos: world(ctx, 0, carriage.position.y, BED_T + 3), count: 1, vel: [0, 0, 6], spread: 4, floor: world(ctx, 0, 0, BED_T)[2] });
        dial.set(live ? 0.3 + 0.5 * sweep : 0.2);
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
