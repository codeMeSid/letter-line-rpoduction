import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, flange, gauge, housing, lamp, lathe, panel, pipe } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';

const TANK_Z = 96;
const NOZZLE_X = 0;
const NOZZLE_Z = 62;     // valve tip above the neck (neck top at puck 3 + 52 = 55)
const SPOKES = 8;
const BOWL_R = 26;
const BOWL_Y = 58;     // carousel centre; the starwheel edge stays 20 off the belt axis

/**
 * Station 9: rotary filler. A bowl of liquid on a central column with a ring of filling valves, a rotating starwheel carousel and
 * a pipe to the nozzle over the neck; the stream pours, the liquid rises (with foam) in the bottle.
 */
export const filler: StationDef = {
  id: 'bottle-filler',
  label: 'Rotary filler',
  footprint: [130, 170],
  height: 140,
  duration: 2.2,
  spaceDuration: 0.3,
  outputStage: 'filled',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    // Carousel: column, drum, bowl, ring of valves and starwheel.
    const carousel = new THREE.Group();
    carousel.position.set(0, BOWL_Y, 0);
    const trunk = column(looks, 12, TANK_Z - FLOOR, 'steel', 20);
    trunk.position.z = FLOOR;
    const drum = lathe(looks, [[0, 40], [BOWL_R + 4, 40], [BOWL_R + 4, 62], [BOWL_R, 66], [BOWL_R, TANK_Z], [0, TANK_Z]], 'paint');
    const liquid = lathe(looks, [[0, TANK_Z], [BOWL_R - 1, TANK_Z], [BOWL_R - 1, TANK_Z + 4], [0, TANK_Z + 4]], 'liquid');
    const rim = lathe(looks, [[BOWL_R, TANK_Z], [BOWL_R + 2, TANK_Z], [BOWL_R + 2, TANK_Z + 5], [BOWL_R - 1, TANK_Z + 5]], 'steel');
    carousel.add(trunk, drum, liquid, rim);
    for (let i = 0; i < SPOKES; i++) {
      const a = (i / SPOKES) * Math.PI * 2;
      const valve = column(looks, 2.4, 22, 'steel', 10);
      valve.position.set(Math.cos(a) * (BOWL_R + 1), Math.sin(a) * (BOWL_R + 1), 44);
      const head = column(looks, 3.4, 4, 'copper', 10);
      head.position.copy(valve.position).setZ(66);
      carousel.add(valve, head);
    }
    const star = lathe(looks, [[BOWL_R + 4, 10], [BOWL_R + 12, 10], [BOWL_R + 12, 14], [BOWL_R + 4, 14]], 'paint-accent', 8);
    star.position.z = 4;
    carousel.add(star);
    group.add(carousel);
    // Fixed sections: filler pipe from the bowl over to the nozzle, nozzle valve above the line.
    const nozzleHead = column(looks, 4, 6, 'copper', 12);
    nozzleHead.position.set(NOZZLE_X, 0, NOZZLE_Z + 4);
    const nozzleFlange = flange(looks, 7, 6);
    nozzleFlange.position.set(NOZZLE_X, 0, NOZZLE_Z + 14);
    group.add(nozzleHead, nozzleFlange, pipe(looks, [[0, BOWL_Y, TANK_Z + 4], [0, 40, TANK_Z + 14], [0, 8, NOZZLE_Z + 24], [NOZZLE_X, 0, NOZZLE_Z + 14]], 3, 'steel'));
    const pillar = beam(looks, [34, 0, FLOOR], [34, 0, NOZZLE_Z + 30], 6, 'paint');
    group.add(pillar, beam(looks, [34, 0, NOZZLE_Z + 28], [0, 0, NOZZLE_Z + 28], 5, 'paint'));
    const stream = column(looks, 1.4, 1, 'liquid', 10);
    stream.visible = false;
    group.add(stream);
    const dial = gauge(looks, 5);
    dial.group.position.set(-34, -26, 72);
    const ctl = panel(looks, 22, 34);
    ctl.group.position.set(-56, -44, FLOOR);
    const beacon = lamp(looks, 2.6);
    beacon.group.position.set(34, 0, NOZZLE_Z + 36);
    group.add(dial.group, ctl.group, beacon.group);

    const shots = oneShots();
    let spin = 0;
    let on: boolean | null = null;
    return {
      begin(job) {
        shots.reset();
        if (!job.isSpace) ctx.audio.play('filler-pour', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        spin += dt * (live ? 1.1 : 0.15);
        carousel.rotation.z = spin;
        const pouring = live && t > 0.1 && t < 0.92;
        stream.visible = pouring;
        if (pouring) {
          // Stream falls from the nozzle to the liquid surface in the bottle, foam spills at the end.
          const surf = 3 + 29 * ss(0, 0.9, (t - 0.1) / 0.8) + 3;
          stream.position.set(NOZZLE_X, 0, surf);
          stream.scale.set(1 + 0.1 * Math.sin(ctx.now() * 0.03), 1 + 0.1 * Math.sin(ctx.now() * 0.03), Math.max(0.01, NOZZLE_Z + 2 - surf));
          ctx.particles.emit('liquid', { pos: world(ctx, 0, 0, surf + 2), count: 1, vel: [0, 0, 12], spread: 3, floor: world(ctx, 0, 0, 0)[2] });
          if (t > 0.6) ctx.particles.emit('foam', { pos: world(ctx, 0, 0, surf + 4), count: 1, vel: [0, 0, 8], spread: 4, floor: world(ctx, 0, 0, 0)[2] });
        }
        if (job) product?.shape('filled', ss(0.1, 0.95, t));
        liquid.position.z = -1.5 * Math.sin(ctx.now() / 700);
        ctl.update(ctx.now());
        dial.set(0.5 + 0.25 * Math.sin(ctx.now() / 900));
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
