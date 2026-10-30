import type { StationDef } from '../../../engine/station';
import { beam, column, flange, housing, lathe } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { controls } from './kit';

const SPOUT_Z = 60;

/**
 * Station 1: clay hopper. A steel-legged hopper with a gate and spout over the tub; a stream of clay lumps drops in
 * and the tub fills.
 */
export const clayBin: StationDef = {
  id: 'mug-claybin',
  label: 'Clay hopper',
  footprint: [120, 120],
  height: 130,
  duration: 1.6,
  spaceDuration: 0.3,
  outputStage: 'clay',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    for (const x of [-34, 34]) for (const y of [-30, 30]) group.add(beam(looks, [x, y, FLOOR], [x, y, 72], 6, 'paint'));
    group.add(beam(looks, [-34, 0, 72], [34, 0, 72], 6, 'paint'));
    group.add(lathe(looks, [[5, 76], [38, 124], [38, 130], [34, 130], [5, 80]], 'paint', 24));
    const spout = column(looks, 5, 16, 'steel', 16);
    spout.position.z = SPOUT_Z + 2;
    const ring = flange(looks, 9, 6);
    ring.position.z = SPOUT_Z + 16;
    const gate = housing(looks, 20, 8, 5, 'paint-accent', 1);
    gate.position.set(0, 0, 72);
    const gateRam = column(looks, 2, 24, 'steel', 8);
    gateRam.rotation.y = Math.PI / 2;
    gateRam.position.set(10, 0, 74);
    const motor = housing(looks, 16, 16, 20, 'paint-accent', 2);
    motor.position.set(0, 0, 130);
    const lump = column(looks, 3.6, 1, 'sand', 10);
    lump.visible = false;
    group.add(spout, ring, gate, gateRam, motor, lump);
    const tick = controls(ctx, group, [34, 30, 78]);

    const shots = oneShots();
    return {
      begin(job) {
        shots.reset();
        if (!job.isSpace) ctx.audio.play('pour-sand', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const open = live && t > 0.08 && t < 0.92;
        gate.position.x = open ? 12 : 0;
        gateRam.position.x = 10 + gate.position.x;
        lump.visible = open;
        if (open) {
          // Lumps fall from the spout onto the rising clay surface in the tub.
          const surf = 1.8 + 12 * ss(0.1, 0.95, t) + 1;
          lump.position.z = surf;
          lump.scale.z = Math.max(0.01, SPOUT_Z - surf);
          ctx.particles.emit('crumb', { pos: world(ctx, 0, 0, surf + 2), count: 1, vel: [0, 0, 14], spread: 3, floor: world(ctx, 0, 0, 0)[2] });
        }
        if (job) product?.shape('clay', ss(0.1, 0.95, t));
        tick(live);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
