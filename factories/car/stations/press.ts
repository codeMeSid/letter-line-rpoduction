import type { StationDef } from '../../../engine/station';
import { beam, housing, lathe, piston } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { panelKit } from './panelKit';

const MOUNT = 96;
const STROKE = 62;    // upper mould half sits on the tray at full stroke

/** Station 3: injection moulding press. A clamp piston closes the two-half mould over the tray; a barrel injects molten plastic; the mould opens on a formed, hot car. */
export const press: StationDef = {
  id: 'car-press',
  label: 'Injection press',
  footprint: [170, 120],
  height: 150,
  duration: 2.6,
  spaceDuration: 0.3,
  outputStage: 'moulded',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    for (const x of [-30, 30]) for (const y of [-26, 26]) group.add(beam(looks, [x, y, FLOOR], [x, y, MOUNT + 14], 3.4, 'steel'));
    const head = housing(looks, 76, 62, 10, 'paint', 2);
    head.position.set(0, 0, MOUNT + 14);
    group.add(head);
    const ram = piston(looks, { body: 10, rod: 4.4, len: STROKE + 8, stroke: STROKE, role: 'steel' });
    ram.group.position.set(0, 0, MOUNT);
    group.add(ram.group);
    const upper = housing(looks, 44, 28, 16, 'steel', 2);
    upper.position.z = -16;
    ram.rodEnd.add(upper);
    // Injection barrel with heater bands and a hopper stub, nozzle pushing in at +x.
    const barrel = lathe(looks, [[0, 0], [7, 0], [7, 36], [0, 36]], 'steel');
    barrel.rotation.y = Math.PI / 2;
    const bands = [8, 18, 28].map((z) => { const b = lathe(looks, [[7, z], [8.4, z], [8.4, z + 4], [7, z + 4]], 'copper'); b.rotation.y = Math.PI / 2; return b; });
    const unit = housing(looks, 20, 20, 24, 'paint-accent', 2);
    unit.position.set(0, 0, FLOOR);
    group.add(barrel, ...bands, unit);
    barrel.position.set(48, 0, 4);
    bands.forEach((b) => b.position.set(48, 0, 4));
    unit.position.set(66, 0, FLOOR);
    const ui = panelKit(ctx, group, [-52, -48], 80);

    const shots = oneShots();
    let ext = 0;
    let adv = 0;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const closed = live ? ss(0.08, 0.28, t) * (1 - ss(0.78, 0.94, t)) : 0;
        ext = ease(ext, closed, dt, 24);
        ram.set(ext);
        adv = ease(adv, live ? ss(0.32, 0.4, t) * (1 - ss(0.62, 0.7, t)) : 0, dt, 24);
        barrel.position.x = 48 - 26 * adv;
        bands.forEach((b) => { b.position.x = 48 - 26 * adv; });
        unit.position.x = 66 - 26 * adv;
        if (live) {
          if (t >= 0.2 && shots.once('close')) ctx.audio.play('mould-clamp', { x: ctx.origin[0] });
          if (t >= 0.34 && shots.once('shot')) ctx.audio.play('injection-thunk', { x: ctx.origin[0] });
          if (t >= 0.8 && shots.once('open')) {
            ctx.audio.play('mould-clamp', { x: ctx.origin[0] });
            ctx.particles.emit('steam', { pos: world(ctx, 0, 0, 12), count: 10, vel: [0, 0, 18], spread: 10, floor: world(ctx, 0, 0, 3)[2] });
          }
        }
        if (job) product?.shape('moulded', t);
        ui.tick(live, ext);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
