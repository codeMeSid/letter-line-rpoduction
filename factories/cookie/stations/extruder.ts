import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, gauge, housing, lamp, lathe, panel, pipe, piston } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { BED_T } from '../product';

const RAM_TOP = 96;     // ram rod end at rest
const RAM_STROKE = 40;
const FUNNEL_X = -36;
const BARREL_Z = 40;
const TIP_Z = 19;       // nozzle mouth, just over the finished dough column

/**
 * Station 3: dough extruder. A ram presses dough from the funnel through a barrel to a nozzle over the tray; a dough column
 * grows up from the tray to meet the nozzle.
 */
export const extruder: StationDef = {
  id: 'cookie-extruder',
  label: 'Dough extruder',
  footprint: [100, 110],
  height: 150,
  duration: 2,
  spaceDuration: 0.3,
  outputStage: 'extruded',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    const funnel = lathe(looks, [[0, 0], [4, 0], [4, 4], [14, 22], [14, 24], [0, 24]], 'paint-accent', 24);
    funnel.position.set(FUNNEL_X, 0, BARREL_Z + 4);
    const barrel = pipe(looks, [[FUNNEL_X, 0, BARREL_Z], [-6, 0, BARREL_Z], [0, 0, BARREL_Z - 4], [0, 0, 30]], 5, 'steel', 16);
    const nozzle = lathe(looks, [[0, 0], [3.5, 0], [3.5, 3], [6.5, 12], [6.5, 14], [0, 14]], 'steel', 24);
    nozzle.position.set(0, 0, TIP_Z);
    const drive = housing(looks, 16, 22, 26, 'paint', 3);
    drive.position.set(-54, 0, BARREL_Z - 12);
    group.add(funnel, barrel, nozzle, drive, pipe(looks, [[-46, 0, BARREL_Z], [FUNNEL_X - 4, 0, BARREL_Z]], 3, 'copper'));

    const ram = piston(looks, { body: 6, rod: 3, len: 36, stroke: RAM_STROKE, role: 'paint' });
    ram.group.position.set(FUNNEL_X, 0, RAM_TOP);
    const plunger = lathe(looks, [[0, 0], [12.5, 0], [12.5, 3], [0, 3]], 'steel', 24);
    plunger.position.z = -3;
    ram.rodEnd.add(plunger);
    group.add(ram.group);
    for (const y of [-30, 30]) group.add(beam(looks, [FUNNEL_X, y, FLOOR], [FUNNEL_X, y, RAM_TOP + 40], 5, 'paint'));
    group.add(beam(looks, [FUNNEL_X, -30, RAM_TOP + 40], [FUNNEL_X, 30, RAM_TOP + 40], 6, 'paint'));
    // Dough strand between the nozzle and the dough on the tray.
    const strand = looks.part(new THREE.CylinderGeometry(3.4, 3.4, 1, 12).rotateX(Math.PI / 2), 'sand');
    strand.visible = false;
    const dial = gauge(looks, 5);
    dial.group.position.set(30, 30, 50);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(46, -44, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(FUNNEL_X, 30, RAM_TOP + 48);
    group.add(dial.group, ctl.group, beacon.group, strand);

    const shots = oneShots();
    let ext = 0;
    let on: boolean | null = null;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        ext = live ? ss(0.2, 1, t) : ext * Math.exp(-4 * dt);
        ram.set(ext);
        if (job) product?.shape('extruded', t);
        // strand: from nozzle tip down to the growing dough top while extruding
        const top = BED_T + 14 * ss(0.25, 1, t);
        strand.visible = live && t > 0.25 && t < 0.97;
        strand.scale.z = Math.max(1e-3, TIP_Z - top);
        strand.position.z = (TIP_Z + top) / 2;
        if (live && shots.once('press')) ctx.audio.play('press-thump', { x: ctx.origin[0] });
        if (live && t > 0.3 && t < 0.95) ctx.particles.emit('crumb', { pos: world(ctx, 0, 0, TIP_Z), count: 1, vel: [0, 0, -12], spread: 3, floor: world(ctx, 0, 0, BED_T)[2] });
        dial.set(live ? 0.3 + 0.5 * ext : 0.2);
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
