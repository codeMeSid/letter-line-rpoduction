import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, gauge, housing, lamp, lathe, panel, pipe, piston } from '../../shared/parts';
import { FLOOR, ease, helix, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';

const HEAD_Z = 96;   // mixer head underside at rest
const STROKE = 52;   // hook tip reaches into the dough

/** Station 2: planetary dough mixer. A column carries a motor head with a spiral dough hook that lowers into the bowl and kneads the flour into dough. */
export const mixer: StationDef = {
  id: 'donut-mixer',
  label: 'Dough mixer',
  footprint: [110, 120],
  height: 150,
  duration: 1.5,
  spaceDuration: 0.3,
  outputStage: 'dough',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    const column = housing(looks, 16, 14, HEAD_Z + 30, 'paint', 3);
    column.position.set(0, 46, FLOOR);
    const head = housing(looks, 26, 70, 26, 'paint-accent', 5);
    head.position.set(0, 20, HEAD_Z);
    const motor = lathe(looks, [[0, 0], [9, 0], [9, 16], [0, 16]], 'steel');
    motor.position.set(0, 46, HEAD_Z + 26);
    group.add(column, head, motor);

    // Spinning hook: shaft + helix, hung from the head, lowered by `lower`.
    const lower = new THREE.Group();
    lower.position.set(0, 0, HEAD_Z);
    const spin = new THREE.Group();
    spin.add(beam(looks, [0, 0, 0], [0, 0, -34], 3, 'steel'), pipe(looks, helix(6, 2.2, -36, -12, 0, 0, 12), 1.6, 'steel'));
    lower.add(spin);
    group.add(lower);
    const press = piston(looks, { body: 5, rod: 2, len: 20, stroke: 10, role: 'steel' });
    press.group.position.set(18, 20, HEAD_Z - 2);
    group.add(press.group);
    const dial = gauge(looks, 5);
    dial.group.position.set(24, 28, 110);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(48, -42, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(-18, 28, HEAD_Z + 34);
    group.add(dial.group, ctl.group, beacon.group);

    const shots = oneShots();
    let ext = 0;
    let on: boolean | null = null;
    return {
      begin(job) { shots.reset(); if (!job.isSpace) ctx.audio.play('mixer-churn', { x: ctx.origin[0] }); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        ext = ease(ext, live ? ss(0.08, 0.22, t) * (1 - ss(0.88, 1, t)) : 0, dt, 14);
        lower.position.z = HEAD_Z - STROKE * ext;
        press.set(ext);
        spin.rotation.z += dt * (live ? 10 : 0.4) * (0.3 + ext);
        if (live && ext > 0.6) {
          ctx.particles.emit('powder', { pos: world(ctx, 0, 0, 16), count: 1, vel: [0, 0, 8], spread: 4, floor: world(ctx, 0, 0, 0)[2] });
        }
        if (job) product?.shape('dough', t);
        dial.set(0.45 + 0.35 * ext);
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
