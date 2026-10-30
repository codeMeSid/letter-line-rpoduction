import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, gauge, gear, housing, lamp, panel, pipe } from '../../shared/parts';
import { FLOOR, oneShots, stationBase, teardown, world } from '../../shared/stationKit';

const HALF_X = 62;
const TOP_Z = 70;

/** Station 7: cooling tunnel. An open frame over the belt carries a plenum with four fans blowing down on the cookie; the oven glow fades. */
export const cooler: StationDef = {
  id: 'cookie-cooler',
  label: 'Cooling tunnel',
  footprint: [160, 110],
  height: 100,
  duration: 2,
  spaceDuration: 0.3,
  outputStage: 'cooled',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    for (const x of [-HALF_X, HALF_X]) for (const y of [-34, 34]) group.add(beam(looks, [x, y, FLOOR], [x, y, TOP_Z], 6, 'paint'));
    for (const y of [-34, 34]) group.add(beam(looks, [-HALF_X, y, TOP_Z], [HALF_X, y, TOP_Z], 5, 'paint'), beam(looks, [-HALF_X, y, 24], [HALF_X, y, 24], 3, 'steel'));
    const plenum = housing(looks, 2 * HALF_X, 74, 10, 'paint', 2);
    plenum.position.set(0, 0, TOP_Z);
    group.add(plenum);
    // Louvred side panel behind the belt.
    for (let x = -HALF_X + 8; x <= HALF_X - 8; x += 8) {
      const slat = housing(looks, 2, 4, 36, 'steel', 0.3);
      slat.position.set(x, 36, 4);
      slat.rotation.x = 0.5;
      group.add(slat);
    }
    const fans: THREE.Mesh[] = [];
    for (const x of [-36, -12, 12, 36]) {
      const shroud = column(looks, 11, 6, 'paint-accent', 24);
      shroud.position.set(x, 0, TOP_Z + 10);
      const rotor = gear(looks, 9, 6, 1.5, 'steel');
      rotor.position.set(x, 0, TOP_Z + 14);
      fans.push(rotor);
      group.add(shroud, rotor, pipe(looks, [[x, 0, TOP_Z + 10], [x, 0, TOP_Z + 2]], 4, 'steel'));
    }
    const dial = gauge(looks, 5);
    dial.group.position.set(-HALF_X, -38, 40);
    const ctl = panel(looks, 22, 34);
    ctl.group.position.set(HALF_X + 24, -40, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(HALF_X, 34, TOP_Z + 12);
    group.add(dial.group, ctl.group, beacon.group);

    const shots = oneShots();
    let spin = 0;
    let on: boolean | null = null;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        spin += dt * (live ? 22 : 4);
        fans.forEach((f, i) => { f.rotation.z = i % 2 ? spin : -spin; });
        if (job) product?.shape('cooled', t);
        if (live && shots.once('blow')) ctx.audio.play('whoosh', { x: ctx.origin[0] });
        if (live && t < 0.8) ctx.particles.emit('steam', { pos: world(ctx, 0, 0, 20), count: 1, vel: [0, 0, 14], spread: 3, floor: world(ctx, 0, 0, 0)[2] });
        dial.set(live ? 0.7 - 0.4 * t : 0.2);
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
