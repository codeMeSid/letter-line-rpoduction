import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, gauge, gear, housing, lamp, lathe, panel } from '../../shared/parts';
import { FLOOR, oneShots, stationBase, teardown, world } from '../../shared/stationKit';
import { BED_T, CHIP_N, chipSpot } from '../product';
import { BALL_H, BALL_R } from '../visual';

const BRIDGE_Z = 66;
const TIP_Z = 36;

/**
 * Station 5: chocolate chip depositor. A chip hopper with a dosing wheel feeds a head that rides an x-y gantry; the head
 * visits ten spots on the dough and drops one chip on each.
 */
export const depositor: StationDef = {
  id: 'cookie-depositor',
  label: 'Chip depositor',
  footprint: [100, 110],
  height: 110,
  duration: 2.4,
  spaceDuration: 0.3,
  outputStage: 'chipped',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    for (const x of [-42, 42]) {
      group.add(beam(looks, [x, -40, BRIDGE_Z], [x, 40, BRIDGE_Z], 4, 'steel'));
      for (const y of [-40, 40]) group.add(beam(looks, [x, y, FLOOR], [x, y, BRIDGE_Z], 5, 'paint'));
    }

    const bridge = new THREE.Group();
    bridge.add(beam(looks, [-46, 0, BRIDGE_Z + 5], [46, 0, BRIDGE_Z + 5], 5, 'paint'));
    const head = new THREE.Group();
    head.add(housing(looks, 12, 12, 10, 'paint-accent', 2));
    const tube = lathe(looks, [[0, 0], [2.6, 0], [2.6, 10], [0, 10]], 'steel', 12);
    tube.position.z = -10;
    head.add(tube);
    head.position.z = TIP_Z + 10; // tube bottom (10 below the head origin) at TIP_Z
    bridge.add(head);
    group.add(bridge);

    // Chip hopper with dosing wheel on the side rail, hose to the head.
    const hopperBody = lathe(looks, [[0, 0], [3, 0], [3, 4], [11, 20], [11, 30], [0, 30]], 'paint', 24);
    hopperBody.position.set(0, 52, 30);
    const wheel = gear(looks, 6, 8, 2, 'steel');
    wheel.position.set(0, 52, 62);
    const stem = column(looks, 3, 30 - FLOOR, 'paint', 12);
    stem.position.set(0, 52, FLOOR);
    const dial = gauge(looks, 5);
    dial.group.position.set(-36, 52, 30);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(46, -44, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(42, 40, BRIDGE_Z + 6);
    group.add(hopperBody, wheel, stem, dial.group, ctl.group, beacon.group);
    group.add(beam(looks, [0, 52, 32], [0, 20, TIP_Z + 24], 1.8, 'rubber'));

    const shots = oneShots();
    let hx = 0;
    let hy = 0;
    let dropped = -1;
    let on: boolean | null = null;
    return {
      begin() { shots.reset(); dropped = -1; },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const i = Math.min(CHIP_N - 1, Math.floor((Math.min(t, 0.9) / 0.9) * CHIP_N));
        const [sx, sy] = chipSpot(i, BALL_R, BALL_H);
        const k = 1 - Math.exp(-14 * dt);
        hx += ((live ? sx : 0) - hx) * k;
        hy += ((live ? sy : 0) - hy) * k;
        bridge.position.y = hy;
        head.position.x = hx;
        wheel.rotation.z += dt * (live ? 4 : 0);
        if (job) product?.shape('chipped', t);
        if (live && t < 0.93) {
          if (i !== dropped) {
            dropped = i;
            ctx.particles.emit('pellet', { pos: world(ctx, hx, hy, TIP_Z), count: 3, vel: [0, 0, -20], spread: 1, floor: world(ctx, 0, 0, BED_T)[2] });
          }
          if (shots.once('feed')) ctx.audio.play('pour-sand', { x: ctx.origin[0] });
        }
        dial.set(live ? 0.3 + 0.4 * t : 0.2);
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
