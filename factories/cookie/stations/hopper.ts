import type * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, gauge, gear, housing, lamp, lathe, panel, pipe } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';

const HX = [-33, -11, 11, 33];
const HY = 36;
const HZ = 50;           // hopper cone tip height
const SPOUT_Z = 30;      // spout mouth above the bowl

/**
 * Station 1: ingredient dosing. Four hoppers (flour, sugar, butter, eggs) on a steel stand; an agitator turns on the active
 * hopper and its pipe discharges into the bowl, one layer after the other.
 */
export const hopper: StationDef = {
  id: 'cookie-hopper',
  label: 'Ingredient hoppers',
  footprint: [100, 110],
  height: 110,
  duration: 2,
  spaceDuration: 0.3,
  outputStage: 'batch',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    const roles = ['product', 'sand', 'paint-accent', 'copper'] as const;
    const agitators: THREE.Mesh[] = [];
    for (const [i, x] of HX.entries()) {
      const body = lathe(looks, [[0, 0], [2.5, 0], [2.5, 6], [10, 22], [10, 44], [0, 44]], roles[i], 24);
      body.position.set(x, HY, HZ);
      const lid = lathe(looks, [[0, 0], [11, 0], [11, 2.5], [0, 2.5]], 'steel', 24);
      lid.position.set(x, HY, HZ + 44);
      const agitator = gear(looks, 7, 6, 1.5, 'steel');
      agitator.position.set(x, HY, HZ + 47);
      agitators.push(agitator);
      group.add(body, lid, agitator, pipe(looks, [[x, HY, HZ], [x, HY, HZ - 6], [x * 0.4, 18, 42], [0, 0, SPOUT_Z]], 2, 'steel'));
    }
    for (const x of [-44, 44]) for (const y of [HY - 12, HY + 12]) group.add(beam(looks, [x, y, FLOOR], [x, y, HZ + 8], 4, 'paint'));
    group.add(beam(looks, [-44, HY, HZ + 8], [44, HY, HZ + 8], 4, 'paint'));
    const nozzle = lathe(looks, [[0, 0], [4, 0], [4, 5], [2, 7], [0, 7]], 'steel', 16);
    nozzle.position.set(0, 0, SPOUT_Z - 7);
    const dial = gauge(looks, 5);
    dial.group.position.set(50, 20, 40);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(-46, -44, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(44, HY, HZ + 14);
    const motor = housing(looks, 16, 12, 10, 'paint', 2);
    motor.position.set(0, HY + 14, HZ + 8);
    group.add(nozzle, dial.group, ctl.group, beacon.group, motor);

    const shots = oneShots();
    let spin = 0;
    let on: boolean | null = null;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const active = live ? Math.min(3, Math.floor(t * 4)) : -1;
        spin += dt * 6;
        agitators.forEach((a, i) => { a.rotation.z = i === active ? spin * 3 : a.rotation.z; });
        if (job) product?.shape('batch', t);
        if (live && shots.once('pour')) ctx.audio.play('pour-sand', { x: ctx.origin[0] });
        if (live && t < 0.97) {
          const pos = world(ctx, 0, 0, SPOUT_Z - 7);
          ctx.particles.emit('powder', { pos, count: 2, vel: [0, 0, -30], spread: 2, floor: world(ctx, 0, 0, 2)[2] });
        }
        dial.set(live ? 0.3 + 0.4 * ss(0, 1, t) : 0.2);
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
