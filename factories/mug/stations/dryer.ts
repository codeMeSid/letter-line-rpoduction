import type { StationDef } from '../../../engine/station';
import { beam, column, gear, housing, lathe, pipe } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { controls } from './kit';

const HOOD_Z = 60;

/**
 * Station 5: infrared dryer. A hood on four posts with glowing heater rods over the line and two extraction fans
 * on top; the wet clay dries from dark to pale greenware and steams.
 */
export const dryer: StationDef = {
  id: 'mug-dryer',
  label: 'Dryer',
  footprint: [120, 120],
  height: 100,
  duration: 2,
  spaceDuration: 0.3,
  outputStage: 'dried',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    for (const x of [-42, 42]) for (const y of [-34, 34]) group.add(beam(looks, [x, y, FLOOR], [x, y, HOOD_Z], 6, 'paint'));
    const hood = housing(looks, 100, 80, 12, 'paint', 2);
    hood.position.z = HOOD_Z;
    group.add(hood);
    // Heater rods under the hood: glow while drying.
    const rods = [-24, -8, 8, 24].map((y) => {
      const r = beam(looks, [-36, y, HOOD_Z - 3], [36, y, HOOD_Z - 3], 3, 'glow');
      r.visible = false;
      group.add(r);
      return r;
    });
    // Two extraction fans in shrouds on the hood, ducted to a side stack.
    const fans = [-24, 24].map((x) => {
      const shroud = lathe(looks, [[15, 0], [17, 0], [17, 6], [15, 6]], 'steel', 24);
      shroud.position.set(x, 0, HOOD_Z + 12);
      const rotor = gear(looks, 13, 6, 2, 'steel');
      rotor.position.set(x, 0, HOOD_Z + 14);
      group.add(shroud, rotor);
      return rotor;
    });
    group.add(pipe(looks, [[-24, 0, HOOD_Z + 20], [-24, 0, HOOD_Z + 32], [24, 0, HOOD_Z + 32], [24, 0, HOOD_Z + 20]], 3, 'steel'));
    group.add(column(looks, 5, 20, 'steel', 12).translateY(30).translateZ(HOOD_Z + 12));
    const tick = controls(ctx, group, [42, -34, HOOD_Z + 6], 1);

    const shots = oneShots();
    let spin = 0;
    return {
      begin(job) {
        shots.reset();
        if (!job.isSpace) ctx.audio.play('motor-whir', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        spin += dt * (live ? 16 : 3);
        fans.forEach((f) => { f.rotation.z = spin; });
        rods.forEach((r, i) => { r.visible = live && Math.sin(ctx.now() * 0.01 + i) > -0.9; });
        if (live && t > 0.1 && t < 0.9) ctx.particles.emit('steam', { pos: world(ctx, 0, 0, 26), count: 1, vel: [0, 0, 14], spread: 5, floor: world(ctx, 0, 0, 0)[2] });
        if (job) product?.shape('dried', ss(0.05, 0.95, t));
        tick(live);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
