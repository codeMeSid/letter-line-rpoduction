import type { StationDef } from '../../../engine/station';
import { beam, housing, lathe, piston } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { panelKit } from './panelKit';

const MOUNT = 70;
const STROKE = 50;
const SPRUE_X = 21;

/** Station 5: sprue trimmer. A pneumatic guillotine blade drops beside the tail gate and shears the runner off; it falls down a chute into a scrap bin. */
export const trimmer: StationDef = {
  id: 'car-trimmer',
  label: 'Sprue trimmer',
  footprint: [110, 110],
  height: 110,
  duration: 1.4,
  spaceDuration: 0.3,
  outputStage: 'trimmed',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    for (const y of [-14, 14]) group.add(beam(looks, [SPRUE_X - 8, y, FLOOR], [SPRUE_X - 8, y, MOUNT + 12], 5, 'paint'));
    const bridge = housing(looks, 14, 40, 8, 'paint', 2);
    bridge.position.set(SPRUE_X - 8, 0, MOUNT + 12);
    group.add(bridge);
    const ram = piston(looks, { body: 7, rod: 3, len: STROKE + 6, stroke: STROKE, role: 'steel' });
    ram.group.position.set(SPRUE_X - 8, 0, MOUNT);
    group.add(ram.group);
    const blade = housing(looks, 3, 28, 12, 'copper', 0.5);
    blade.position.set(0, 0, -12);
    ram.rodEnd.add(blade);
    // Anvil + scrap chute + bin.
    const anvil = housing(looks, 6, 28, 4, 'steel', 1);
    anvil.position.set(SPRUE_X - 8 + 4.5, 0, 2);
    const chute = beam(looks, [SPRUE_X + 8, 0, 0], [SPRUE_X + 24, 0, FLOOR + 20], 8, 'steel');
    const bin = lathe(looks, [[0, 0], [10, 0], [12, 16], [0, 16]], 'paint-accent');
    bin.position.set(SPRUE_X + 28, 0, FLOOR);
    group.add(anvil, chute, bin);
    const ui = panelKit(ctx, group, [-46, -44], 70);

    const shots = oneShots();
    let ext = 0;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        ext = ease(ext, live ? ss(0.25, 0.5, t) * (1 - ss(0.65, 0.9, t)) : 0, dt, 28);
        ram.set(ext);
        if (live && t >= 0.5 && shots.once('cut')) {
          ctx.audio.play('crunch', { x: ctx.origin[0] });
          ctx.particles.emit('crumb', { pos: world(ctx, SPRUE_X, 0, 6), count: 8, vel: [8, 0, 10], spread: 4, floor: world(ctx, 0, 0, FLOOR + 20)[2] });
        }
        if (job) product?.shape('trimmed', t);
        ui.tick(live, ext);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
