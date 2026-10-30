import type { StationDef } from '../../../engine/station';
import { column, gear, housing, lathe } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { controls, portal } from './controls';

/**
 * Station 2: blanking press. A die set punches a 28 wide disc out of the strip; the lattice of scrap is chopped into the bin beside the line
 * by a flywheel-driven chopper.
 */
export const blanker: StationDef = {
  id: 'can-blanker',
  label: 'Blanking press',
  footprint: [100, 120],
  height: 150,
  duration: 1.6,
  spaceDuration: 0.3,
  outputStage: 'blank',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    const press = portal(ctx, 74, 9, 1);
    // Punch + cutting edge on the ram.
    const punch = column(looks, 14.4, 6, 'steel', 32);
    punch.position.z = -6;
    const edge = lathe(looks, [[12.6, 0], [14.8, 0], [14.8, 1.2], [12.6, 1.2]], 'copper', 32);
    edge.position.z = -9;
    press.ram.rodEnd.add(punch, edge);
    // Lower die shoe under the belt level strip table.
    const table = housing(looks, 40, 70, 3, 'paint-accent', 1);
    table.position.z = -4;
    const dieRing = lathe(looks, [[14.8, -1.5], [20, -1.5], [20, 0], [14.8, 0]], 'steel', 32);
    group.add(table, dieRing);
    // Scrap chopper: flywheel + housing at the exit side.
    const chop = housing(looks, 26, 30, 36, 'paint', 3);
    chop.position.set(36, -50, FLOOR);
    const wheel = gear(looks, 11, 14, 4, 'steel');
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(36, -33, FLOOR + 22);
    group.add(chop, wheel);
    const ui = controls(ctx, [-48, -52], [-30, -36, 70], [30, -36, 160]);

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
        ext = ease(ext, live ? ss(0.25, 0.45, t) * (1 - ss(0.55, 0.72, t)) : 0, dt, 30);
        press.ram.set(ext);
        spin += dt * (live ? 5 : 0.4);
        wheel.rotation.z = spin;
        if (live && t >= 0.45 && shots.once('cut')) {
          ctx.particles.emit('spark', { pos: world(ctx, 0, 0, 3), count: 5, spread: 8, vel: [0, 0, 6], floor: world(ctx, 0, 0, 0)[2] });
        }
        if (job) product?.shape('blank', ss(0.2, 0.75, t));
        ui.tick(live, ext);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
