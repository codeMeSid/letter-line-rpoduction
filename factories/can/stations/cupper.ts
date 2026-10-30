import type { StationDef } from '../../../engine/station';
import { column, gear, housing, pipe } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { controls, portal } from './controls';

const PUNCH_L = 24;

/**
 * Station 3: cupping press. The punch pushes the flat disc through a draw die and a shallow cup stands up around it;
 * a flywheel on the crankshaft and a lubricant line feed the press.
 */
export const cupper: StationDef = {
  id: 'can-cupper',
  label: 'Cupping press',
  footprint: [100, 120],
  height: 150,
  duration: 1.8,
  spaceDuration: 0.3,
  outputStage: 'cup',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    const press = portal(ctx, 96, PUNCH_L, 2);
    const holder = column(looks, 11, 6, 'steel', 24);
    holder.position.z = -6;
    const punch = column(looks, 8.2, PUNCH_L - 6, 'copper', 28);
    punch.position.z = -PUNCH_L;
    press.ram.rodEnd.add(holder, punch);
    // Flywheel and gearbox on the crank side.
    const box = housing(looks, 22, 22, 26, 'paint', 3);
    box.position.set(0, 48, FLOOR);
    const fly = gear(looks, 15, 18, 5, 'steel');
    fly.rotation.x = Math.PI / 2;
    fly.position.set(0, 36, 40);
    group.add(box, fly, pipe(looks, [[8, 48, FLOOR + 26], [8, 48, 60], [10, 20, 78], [6, 10, 66]], 1.6, 'copper', 8));
    const ui = controls(ctx, [-48, -52], [-30, -36, 60], [30, -36, 160]);

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
        ext = ease(ext, live ? ss(0.2, 0.5, t) * (1 - ss(0.62, 0.85, t)) : 0, dt, 26);
        press.ram.set(ext);
        spin += dt * (live ? 4 : 0.3);
        fly.rotation.z = spin;
        if (live && t >= 0.5 && shots.once('draw')) {
          ctx.particles.emit('powder', { pos: world(ctx, 0, 0, 6), count: 5, spread: 7, vel: [0, 0, 8], floor: world(ctx, 0, 0, 0)[2] });
        }
        if (job) product?.shape('cup', ss(0.25, 0.62, t));
        ui.tick(live, ext);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
