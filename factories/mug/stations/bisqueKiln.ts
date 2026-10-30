import type { StationDef } from '../../../engine/station';
import { column, housing, pipe } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { controls } from './kit';

const TOP = 66;

/**
 * Station 6: bisque kiln. A firebrick chamber open toward the viewer: back and side walls, a roof with a flue stack, glowing
 * heating elements down the inside; the greenware glows red then settles to pale terracotta biscuit.
 */
export const bisqueKiln: StationDef = {
  id: 'mug-bisque',
  label: 'Bisque kiln',
  footprint: [130, 130],
  height: 120,
  duration: 2.4,
  spaceDuration: 0.3,
  outputStage: 'bisque',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 56, 50, [100, 90]));
    const wall = (w: number, d: number, x: number, y: number) => {
      const m = housing(looks, w, d, TOP - FLOOR, 'concrete', 1);
      m.position.set(x, y, FLOOR);
      group.add(m);
    };
    wall(96, 8, 0, 36);
    wall(8, 76, -44, 0);
    wall(8, 76, 44, 0);
    const roof = housing(looks, 100, 80, 10, 'paint', 2);
    roof.position.set(0, 0, TOP);
    group.add(roof);
    // Heating elements on the inner walls (shown while firing) and a flue.
    const elements = [-36, 36].flatMap((x) => [-14, 14].map((y) => {
      const e = column(looks, 1.4, 40, 'glow', 8);
      e.position.set(x, y, -8);
      e.visible = false;
      group.add(e);
      return e;
    }));
    const back = column(looks, 1.4, 40, 'glow', 8);
    back.position.set(0, 30, -8);
    back.visible = false;
    group.add(back);
    elements.push(back);
    const stack = column(looks, 7, 36, 'steel', 16);
    stack.position.set(30, 20, TOP + 10);
    group.add(stack, pipe(looks, [[30, 20, TOP + 10], [30, 20, TOP + 4]], 4, 'steel'));
    const tick = controls(ctx, group, [-44, 36, TOP + 14]);
    const roar = ctx.audio.loop('kiln-roar', { x: ctx.origin[0], gain: 0.2 });

    const shots = oneShots();
    return {
      begin(job) {
        shots.reset();
        if (!job.isSpace) ctx.audio.play('hiss', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const lit = live && t > 0.05 && t < 0.95;
        elements.forEach((e, i) => { e.visible = lit && Math.sin(ctx.now() * 0.012 + i * 2) > -0.8; });
        if (lit) ctx.particles.emit('smoke', { pos: world(ctx, 30, 20, TOP + 48), count: 1, vel: [0, 0, 16], spread: 3, floor: world(ctx, 0, 0, 0)[2] });
        if (lit && t > 0.3) ctx.particles.emit('ember', { pos: world(ctx, 0, 0, 20), count: 1, vel: [0, 0, 10], spread: 4, floor: world(ctx, 0, 0, 0)[2] });
        if (job) product?.shape('bisque', ss(0, 1, t));
        tick(live);
      },
      finish: () => 'pass',
      destroy() { roar.stop(); teardown(group); },
    };
  },
};
