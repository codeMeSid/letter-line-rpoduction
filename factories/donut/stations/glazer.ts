import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { DON_R } from '../product';
import { donutVisual } from '../visual';
import { beam, gauge, housing, lamp, lathe, panel, pipe } from '../../shared/parts';
import { FLOOR, ease, ss, stationBase, teardown, world } from '../../shared/stationKit';

const HEAD_Z = 66;   // curtain slot height

/** Station 7: glazer. A heated glaze tank and pump feed a curtain head; a pink glaze waterfall falls on the ring while the tray turns to coat it all round. */
export const glazer: StationDef = {
  id: 'donut-glazer',
  label: 'Glazer',
  footprint: [110, 120],
  height: 110,
  duration: 1.5,
  spaceDuration: 0.3,
  outputStage: 'glazed',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    const tank = lathe(looks, [[0, 0], [20, 0], [20, 50], [16, 56], [0, 56]], 'steel');
    tank.position.set(-4, 48, FLOOR);
    const pump = housing(looks, 16, 16, 14, 'paint-accent', 3);
    pump.position.set(26, 48, FLOOR);
    for (const x of [-24, 24]) group.add(beam(looks, [x, 32, FLOOR], [x, 32, HEAD_Z + 8], 5, 'paint'));
    const head = housing(looks, 56, 14, 8, 'paint', 2);
    head.position.set(0, 24, HEAD_Z);
    const slot = lathe(looks, [[0, 0], [4, 0], [4, 7], [0, 7]], 'copper', 12);
    slot.position.set(DON_R, 0, HEAD_Z - 7);
    group.add(tank, pump, head, slot);
    group.add(pipe(looks, [[-4, 48, FLOOR + 56], [-4, 40, HEAD_Z + 14], [0, 24, HEAD_Z + 4]], 2.4, 'steel'));
    group.add(pipe(looks, [[26, 48, FLOOR + 14], [26, 38, FLOOR + 20], [20, 24, HEAD_Z - 2], [DON_R, 4, HEAD_Z + 2]], 2, 'copper'));
    // Glaze curtain: thin sheet from the slot to the ring top.
    const curtain = looks.part(new THREE.BoxGeometry(1, 1, 1), 'liquid', false);
    curtain.visible = false;
    group.add(curtain);
    const dial = gauge(looks, 5);
    dial.group.position.set(-24, 28, HEAD_Z - 16);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(48, -42, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(24, 32, HEAD_Z + 14);
    group.add(dial.group, ctl.group, beacon.group);

    let flow = 0;
    let on: boolean | null = null;
    return {
      begin(job) { if (!job.isSpace) ctx.audio.play('filler-pour', { x: ctx.origin[0] }); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const glaze = donutVisual('glazed', t).glaze;
        flow = ease(flow, live ? ss(0.04, 0.12, t) * (1 - ss(0.92, 1, t)) : 0, dt, 18);
        const fall = HEAD_Z - 7 - 17;
        curtain.visible = flow > 0.05;
        curtain.scale.set(1.4, 8, fall);
        curtain.position.set(DON_R, 0, 17 + fall / 2);
        if (live && flow > 0.3) ctx.particles.emit('droplet', { pos: world(ctx, DON_R, 0, 20), count: 2, vel: [0, 0, 0], spread: 6, floor: world(ctx, 0, 0, 4)[2] });
        if (job) product?.shape('glazed', t);
        if (product) product.root.rotation.z = live && t < 1 ? -glaze * Math.PI * 2 : 0;
        dial.set(0.55 + 0.1 * Math.sin(ctx.now() / 500));
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
