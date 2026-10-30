import type { StationDef } from '../../../engine/station';
import { beam, gauge, housing, lamp, lathe, panel, pipe, piston } from '../../shared/parts';
import { FLOOR, ease, ss, stationBase, teardown, world } from '../../shared/stationKit';

const SPOUT_Z = 62;

/** Station 1: flour silo. A tall silo with a cone hopper, a slide gate and a spout pours flour into the mixing bowl on the tray. */
export const flour: StationDef = {
  id: 'donut-flour',
  label: 'Flour silo',
  footprint: [110, 120],
  height: 190,
  duration: 1.3,
  spaceDuration: 0.3,
  outputStage: 'flour',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    const silo = lathe(looks, [[0, 0], [8, 0], [20, 30], [20, 110], [0, 110]], 'paint');
    silo.position.set(0, 44, SPOUT_Z + 4);
    const cap = lathe(looks, [[0, 0], [20, 0], [14, 8], [0, 12]], 'steel');
    cap.position.set(0, 44, SPOUT_Z + 114);
    group.add(silo, cap);
    for (const [x, y] of [[-18, 30], [18, 30], [-18, 58], [18, 58]] as const) group.add(beam(looks, [x, y, FLOOR], [x * 0.9, y > 44 ? 55 : 33, SPOUT_Z + 34], 4, 'steel'));
    group.add(pipe(looks, [[0, 44, SPOUT_Z + 4], [0, 30, SPOUT_Z + 2], [0, 4, SPOUT_Z + 2], [0, 0, SPOUT_Z - 10]], 3, 'steel'));
    const gate = piston(looks, { body: 4, rod: 2, len: 18, stroke: 10, role: 'steel' });
    gate.group.rotation.x = Math.PI / 2;
    gate.group.position.set(10, 22, SPOUT_Z + 2);
    group.add(gate.group);
    const dial = gauge(looks, 5);
    dial.group.position.set(24, 28, 120);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(48, -42, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(-18, 30, SPOUT_Z + 40);
    const hatch = housing(looks, 36, 20, 6, 'paint-accent', 2);
    hatch.position.set(0, 44, SPOUT_Z + 118);
    group.add(dial.group, ctl.group, beacon.group, hatch);

    let ext = 0;
    let on: boolean | null = null;
    return {
      begin(job) { if (!job.isSpace) ctx.audio.play('pour-sand', { x: ctx.origin[0] }); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        ext = ease(ext, live ? ss(0.05, 0.15, t) * (1 - ss(0.88, 0.98, t)) : 0, dt, 20);
        gate.set(ext);
        if (live && t > 0.12 && t < 0.92) {
          ctx.particles.emit('powder', { pos: world(ctx, 0, 0, SPOUT_Z - 12), count: 2, vel: [0, 0, -30], spread: 1.5, floor: world(ctx, 0, 0, 6 + 12 * t)[2] });
        }
        if (job) product?.shape('flour', t);
        dial.set(0.5 + 0.2 * Math.sin(ctx.now() / 600));
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
