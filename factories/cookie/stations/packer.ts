import type { StationDef } from '../../../engine/station';
import { beam, column, gauge, lamp, lathe, panel, piston } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { BED_T } from '../product';

const HEAD_Z = 112;
const STROKE = 52;
const DIE_H = 8;
const DIE_REST = 62; // die bottom while raised

/**
 * Station 10: cup former. A magazine of paper cup blanks stands behind the belt; a hydraulic die descends over the cookie
 * and the paper cup forms up around it, then the die lifts away.
 */
export const packer: StationDef = {
  id: 'cookie-packer',
  label: 'Cup former',
  footprint: [100, 110],
  height: 150,
  duration: 2,
  spaceDuration: 0.3,
  outputStage: 'packed',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    for (const y of [-34, 34]) group.add(beam(looks, [0, y, FLOOR], [0, y, HEAD_Z + 4], 6, 'paint'));
    group.add(beam(looks, [0, -34, HEAD_Z], [0, 34, HEAD_Z], 8, 'paint'));
    const ram = piston(looks, { body: 8, rod: 3.5, len: 38, stroke: STROKE, role: 'paint' });
    ram.group.position.z = DIE_REST + DIE_H; // rod end at rest; the body stands above it up to the bridge
    group.add(ram.group);
    // Forming die: a bell on the rod end that closes over the cup from outside, with a glowing heater band.
    const die = lathe(looks, [[0, DIE_H], [18.5, DIE_H], [18.5, 0], [16.4, 0], [16.4, DIE_H - 2], [0, DIE_H - 2]], 'steel', 32);
    die.position.z = -DIE_H;
    die.add(lathe(looks, [[18.5, 2], [19.7, 2], [19.7, 7], [18.5, 7]], 'molten', 32));
    ram.rodEnd.add(die);
    // Cup magazine: a tower with stacked paper blanks.
    const tower = column(looks, 3, 44, 'steel', 12);
    tower.position.set(0, 52, FLOOR);
    group.add(tower);
    for (let i = 0; i < 5; i++) {
      const blank = lathe(looks, [[0, 0], [9, 0], [10.5, 3.5], [10, 3.7], [8.6, 0.4], [0, 0.4]], 'sand', 24);
      blank.position.set(0, 52, FLOOR + 8 + i * 5);
      group.add(blank);
    }
    const dial = gauge(looks, 5);
    dial.group.position.set(-44, 40, 40);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(46, -44, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(0, 34, HEAD_Z + 8);
    group.add(dial.group, ctl.group, beacon.group);

    const shots = oneShots();
    let down = 0;
    let on: boolean | null = null;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        down = live ? ss(0.1, 0.45, t) * (1 - ss(0.7, 0.95, t)) : down * Math.exp(-5 * dt);
        ram.set(down); // die bottom: DIE_REST raised, BED_T + DIE_H pressed
        if (job) product?.shape('packed', t);
        if (live && t > 0.4 && shots.once('press')) ctx.audio.play('cap-press', { x: ctx.origin[0] });
        if (live && t > 0.5 && t < 0.8) ctx.particles.emit('steam', { pos: world(ctx, 0, 0, BED_T + 8), count: 1, vel: [4, 0, 10], spread: 4, floor: world(ctx, 0, 0, 0)[2] });
        dial.set(live ? 0.5 + 0.3 * down : 0.2);
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
