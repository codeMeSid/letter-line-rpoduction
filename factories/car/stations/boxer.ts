import type { StationDef } from '../../../engine/station';
import { beam, box, housing, piston } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown } from '../../shared/stationKit';
import { panelKit } from './panelKit';

const MOUNT = 100;
const STROKE = 56;

/** Station 11: boxer. A magazine of flat carton blanks feeds a forming plunger that erects the tray around the car, then a lid press seats the window lid. */
export const boxer: StationDef = {
  id: 'car-boxer',
  label: 'Boxer',
  footprint: [120, 120],
  height: 140,
  duration: 2.2,
  spaceDuration: 0.3,
  outputStage: 'boxed',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    // Magazine of blanks at the back: a slanted stack of thin cardboard sheets on a frame.
    const blanks = Array.from({ length: 6 }, (_, i) => {
      const b = box(looks, 36, 24, 1.2, 'wood');
      b.position.set(-50, 40, 30 + i * 2.2);
      return b;
    });
    group.add(...blanks, beam(looks, [-50, 40, FLOOR], [-50, 40, 28], 14, 'paint'));
    for (const x of [-26, 26]) group.add(beam(looks, [x, 30, FLOOR], [x, 30, MOUNT + 14], 6, 'paint'));
    const bridge = housing(looks, 60, 22, 8, 'paint', 2);
    bridge.position.set(0, 30, MOUNT + 14);
    group.add(bridge, beam(looks, [0, 30, MOUNT + 10], [0, 0, MOUNT + 10], 6, 'paint'));
    const ram = piston(looks, { body: 9, rod: 3.8, len: STROKE + 8, stroke: STROKE, role: 'steel' });
    ram.group.position.set(0, 0, MOUNT);
    const pad = housing(looks, 34, 20, 4, 'steel', 1);
    pad.position.z = -16;
    const cup = housing(looks, 8, 8, 6, 'rubber', 1.5);
    cup.position.z = -22;
    ram.rodEnd.add(pad, cup);
    group.add(ram.group);
    const ui = panelKit(ctx, group, [50, -44], 80);

    const shots = oneShots();
    let ext = 0;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        ext = ease(ext, live ? ss(0.5, 0.8, t) * (1 - ss(0.85, 1, t)) : 0, dt, 24);
        ram.set(ext);
        blanks.forEach((b, i) => { b.visible = !live || t > 0.4 || i < 5; });
        if (live) {
          if (t >= 0.15 && shots.once('erect')) ctx.audio.play('bend-squeak', { x: ctx.origin[0] });
          if (t >= 0.7 && shots.once('press')) ctx.audio.play('press-thump', { x: ctx.origin[0] });
        }
        if (job) product?.shape('boxed', t);
        ui.tick(live, ext);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
