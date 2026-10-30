import type { StationDef } from '../../../engine/station';
import { box, housing, lathe, pipe } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { panelKit } from './panelKit';

const GUN_Z = 34;

/** Station 8: spray booth. Glass-walled hood with an extraction duct; a gantry sweeps two atomiser cones along the car while the plastic takes on its livery colour. */
export const paint: StationDef = {
  id: 'car-paint',
  label: 'Spray booth',
  footprint: [120, 120],
  height: 120,
  duration: 2.4,
  spaceDuration: 0.3,
  outputStage: 'painted',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    const roof = housing(looks, 70, 46, 6, 'paint', 2);
    roof.position.z = 60;
    group.add(roof);
    for (const y of [-22, 22]) {
      const wall = box(looks, 70, 1.5, 60 - FLOOR, 'glass');
      wall.position.set(0, y, FLOOR);
      group.add(wall);
    }
    const back = box(looks, 1.5, 44, 60 - FLOOR, 'paint');
    back.position.set(-34, 0, FLOOR);
    group.add(back, pipe(looks, [[-20, 0, 66], [-20, 0, 84], [-50, 40, 90], [-50, 52, FLOOR + 10]], 5, 'steel'));
    // Gantry rail and moving carriage with two atomiser cones.
    const rail = box(looks, 60, 3, 3, 'steel');
    rail.position.set(0, 0, 54);
    const carriage = housing(looks, 10, 12, 10, 'paint-accent', 1);
    carriage.position.set(0, 0, GUN_Z + 12);
    const guns = [-6, 6].map((y) => {
      const g = lathe(looks, [[0, 0], [4.5, 0], [2, 8], [1, 12], [0, 12]], 'copper', 14);
      g.position.set(0, y, GUN_Z);
      g.scale.z = 1;
      return g;
    });
    group.add(rail, carriage, ...guns);
    const ui = panelKit(ctx, group, [50, -44], 70);

    const shots = oneShots();
    return {
      begin() { shots.reset(); },
      update(_dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const sweep = live ? Math.sin(ss(0.1, 0.9, t) * Math.PI * 3) * 14 : 0;
        carriage.position.x = sweep;
        guns.forEach((g) => { g.position.x = sweep; });
        if (live && t > 0.1 && t < 0.9) {
          if (shots.once('spray')) ctx.audio.play('whoosh', { x: ctx.origin[0] });
          for (const y of [-6, 6]) ctx.particles.emit('droplet', { pos: world(ctx, sweep, y, GUN_Z - 2), count: 2, vel: [0, 0, -40], spread: 4, floor: world(ctx, 0, 0, 12)[2] });
        }
        if (job) product?.shape('painted', t);
        ui.tick(live, live ? 0.5 + 0.4 * Math.sin(ctx.now() * 0.01) : 0);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
