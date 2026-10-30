import type { StationDef } from '../../../engine/station';
import { beam, legs, lathe, pipe } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { panelKit } from './panelKit';

const SPOUT_Z = 44;
const PILE_TOP = 8;  // tray 3 + heap

/** Station 1: pellet hopper. A hopper silo on legs, a screw feeder and a spout drop plastic pellets onto the tray. */
export const hopper: StationDef = {
  id: 'car-hopper',
  label: 'Pellet hopper',
  footprint: [110, 120],
  height: 150,
  duration: 1.8,
  spaceDuration: 0.3,
  outputStage: 'pellets',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    const silo = lathe(looks, [[5, 70], [22, 100], [22, 140], [16, 150], [0, 152]], 'paint');
    silo.position.set(0, 40, 0);
    const band = lathe(looks, [[22, 110], [23, 110], [23, 118], [22, 118]], 'paint-accent');
    band.position.set(0, 40, 0);
    const frame = legs(looks, 34, 34, 70 - FLOOR, 3);
    frame.position.set(0, 40, FLOOR);
    const gate = lathe(looks, [[0, 0], [8, 0], [8, 6], [0, 6]], 'steel');
    gate.position.set(0, 40, 62);
    // Screw feeder tube from the silo cone to the spout over the tray.
    const feeder = pipe(looks, [[0, 40, 66], [0, 22, 56], [0, 6, SPOUT_Z + 6], [0, 0, SPOUT_Z]], 4.4, 'steel');
    const screw = beam(looks, [0, 38, 66], [0, 24, 58], 3, 'copper');
    group.add(silo, band, frame, gate, feeder, screw);
    const ui = panelKit(ctx, group, [50, -40], 70);

    const shots = oneShots();
    return {
      begin() { shots.reset(); },
      update(_dt, job, t, product) {
        const live = !!job && !job.isSpace;
        if (live && t > 0.05 && t < 0.85) {
          if (shots.once('pour')) ctx.audio.play('pour-sand', { x: ctx.origin[0] });
          ctx.particles.emit('pellet', { pos: world(ctx, 0, 0, SPOUT_Z - 2), count: 2, vel: [0, 0, -30], spread: 1.2, floor: world(ctx, 0, 0, PILE_TOP * ss(0, 1, t))[2] });
        }
        silo.position.x = live ? Math.sin(ctx.now() * 0.09) * 0.4 : 0; // vibrator
        if (job) product?.shape('pellets', t);
        ui.tick(live, live ? t : 0);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
