import type { StationDef } from '../../../engine/station';
import { beam, housing, lathe, piston } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { panelKit } from './panelKit';

const PAD_Z = 10;     // pad centre height (door panel)
const STROKE = 12;

/** Station 9: pad printer. An ink cup and etched plate sit beside the car; a silicone pad on a pneumatic arm picks the glyph and stamps it on the door. */
export const printer: StationDef = {
  id: 'car-printer',
  label: 'Pad printer',
  footprint: [120, 130],
  height: 100,
  duration: 1.8,
  spaceDuration: 0.3,
  outputStage: 'printed',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    // Pad carriage in front (-y side), arm pointing at the car door.
    const ram = piston(looks, { body: 7, rod: 3, len: 40, stroke: STROKE, role: 'steel' });
    ram.group.rotation.x = Math.PI / 2; // body toward -y, rod toward +y (the car)
    ram.group.position.set(0, -24, PAD_Z);
    const pad = lathe(looks, [[0, 0], [5, 0], [6, 3], [3, 6], [0, 6]], 'rubber', 18);
    pad.rotation.x = Math.PI; // dome toward the car
    ram.rodEnd.add(pad);
    group.add(ram.group);
    group.add(beam(looks, [0, -44, FLOOR], [0, -44, PAD_Z - 8], 8, 'paint'));
    // Ink cup + cliché plate to the side.
    const cup = lathe(looks, [[0, 0], [8, 0], [9, 6], [7, 6], [7, 2], [0, 2]], 'steel', 20);
    cup.position.set(-36, -34, 0);
    const plate = housing(looks, 22, 12, 3, 'steel', 1);
    plate.position.set(-36, -34, -3);
    const ink = lathe(looks, [[0, 2], [6.4, 2], [6.4, 3.4], [0, 3.4]], 'paint-accent', 18);
    ink.position.set(-36, -34, 0);
    group.add(cup, plate, ink);
    const ui = panelKit(ctx, group, [48, 40], 70);

    const shots = oneShots();
    let ext = 0;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        ext = ease(ext, live ? ss(0.2, 0.5, t) * (1 - ss(0.62, 0.9, t)) : 0, dt, 24);
        ram.set(ext);
        if (live && t >= 0.5 && shots.once('stamp')) {
          ctx.audio.play('coder-tick', { x: ctx.origin[0] });
          ctx.particles.emit('flash', { pos: world(ctx, 0, -9, PAD_Z), count: 1, vel: [0, 0, 0], spread: 0.5, floor: world(ctx, 0, 0, 0)[2] });
        }
        if (job) product?.shape('printed', t);
        ui.tick(live, ext);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
