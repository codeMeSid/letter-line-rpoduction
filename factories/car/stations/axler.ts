import type { StationDef } from '../../../engine/station';
import { beam, housing, piston, column } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { panelKit } from './panelKit';

const AX = [-10, 10];
const AXLE_Z = 6.2;
const STROKE = 32;

/** Station 6: axle press. Two magazines drop steel rods in front of two pneumatic pushers that press them through the chassis. */
export const axler: StationDef = {
  id: 'car-axler',
  label: 'Axle press',
  footprint: [100, 130],
  height: 110,
  duration: 1.6,
  spaceDuration: 0.3,
  outputStage: 'axled',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    const rams = AX.map((x) => {
      const mag = column(looks, 2.4, 40, 'steel', 12);
      mag.position.set(x, 22, AXLE_Z + 2);
      const p = piston(looks, { body: 4.6, rod: 2, len: STROKE + 6, stroke: STROKE, role: 'steel' });
      p.group.rotation.x = -Math.PI / 2; // body toward +y, rod toward the car (-y)
      p.group.position.set(x, 42, AXLE_Z);
      group.add(mag, p.group);
      return p;
    });
    const rail = housing(looks, 40, 12, 12, 'paint', 2);
    rail.position.set(0, 60, AXLE_Z - 6);
    const stop = housing(looks, 36, 4, 10, 'steel', 1);
    stop.position.set(0, -16, 1);
    group.add(rail, stop, beam(looks, [0, 60, FLOOR], [0, 60, AXLE_Z - 6], 10, 'paint'));
    const ui = panelKit(ctx, group, [-48, 40], 70);

    const shots = oneShots();
    let ext = 0;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        ext = ease(ext, live ? ss(0.25, 0.55, t) * (1 - ss(0.65, 0.9, t)) : 0, dt, 26);
        rams.forEach((r) => r.set(ext));
        if (live && t >= 0.45 && shots.once('press')) {
          ctx.audio.play('press-thump', { x: ctx.origin[0] });
          for (const x of AX) ctx.particles.emit('spark', { pos: world(ctx, x, -8, AXLE_Z), count: 3, vel: [0, -6, 4], spread: 3, floor: world(ctx, 0, 0, 0)[2] });
        }
        if (job) product?.shape('axled', t);
        ui.tick(live, ext);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
