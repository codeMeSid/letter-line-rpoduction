import type { StationDef } from '../../../engine/station';
import { beam, gauge, housing, lamp, panel, pipe } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';

const ROOF_Z = 70;

/** Station 3: proofing cabinet. A humid, warm hood over the belt with heater coils, a steam line and glowing lamps; the dough rises in the bowl. */
export const proofer: StationDef = {
  id: 'donut-proofer',
  label: 'Proofing cabinet',
  footprint: [110, 120],
  height: 90,
  duration: 1.4,
  spaceDuration: 0.3,
  outputStage: 'proofed',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    const roof = housing(looks, 100, 64, 12, 'paint', 3);
    roof.position.set(0, 0, ROOF_Z);
    const back = housing(looks, 96, 8, ROOF_Z + 12 - FLOOR, 'paint', 2);
    back.position.set(0, 34, FLOOR);
    group.add(roof, back);
    for (const x of [-46, 46]) for (const y of [-28, 28]) group.add(beam(looks, [x, y, FLOOR], [x, y, ROOF_Z], 5, 'steel'));
    // Heater coils under the roof.
    for (const y of [-14, 0, 14]) group.add(pipe(looks, [[-40, y, ROOF_Z - 4], [40, y, ROOF_Z - 4], [40, y + 7, ROOF_Z - 4], [-40, y + 7, ROOF_Z - 4]], 1.6, 'copper'));
    const lamps = [-24, 24].map((x) => {
      const l = lamp(looks, 3);
      l.group.position.set(x, 0, ROOF_Z - 6);
      group.add(l.group);
      return l;
    });
    group.add(pipe(looks, [[-40, 34, FLOOR + 8], [-40, 34, ROOF_Z + 4], [-30, 22, ROOF_Z - 2]], 2.4, 'steel'));
    const dial = gauge(looks, 5);
    dial.group.position.set(30, 38, ROOF_Z - 6);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(48, -42, FLOOR);
    group.add(dial.group, ctl.group);

    const shots = oneShots();
    let on: boolean | null = null;
    return {
      begin(job) { shots.reset(); if (!job.isSpace) ctx.audio.play('oven-hum', { x: ctx.origin[0] }); },
      update(_dt, job, t, product) {
        const live = !!job && !job.isSpace;
        if (live && t > 0.1 && t < 0.9) ctx.particles.emit('steam', { pos: world(ctx, -30, 22, ROOF_Z - 6), count: 1, vel: [4, -6, -4], spread: 2, floor: world(ctx, 0, 0, 0)[2] });
        if (job) product?.shape('proofed', t);
        dial.set(0.55 + 0.1 * Math.sin(ctx.now() / 500) + 0.2 * ss(0, 0.5, t));
        ctl.update(ctx.now());
        if (live !== on) { on = live; for (const l of lamps) l.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
