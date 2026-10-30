import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, gauge, housing, lamp, panel, pipe } from '../../shared/parts';
import { FLOOR, oneShots, stationBase, teardown, world } from '../../shared/stationKit';

const HALF_X = 92;
const ROOF_Z = 76;
const FRONT_Y = -36;

/**
 * Station 6: tunnel oven. Insulated shell over the belt with glowing top and bottom heating elements seen through a
 * glass front window, rubber curtains at both mouths, gas burner manifold and a roof chimney; the dough spreads and browns.
 */
export const oven: StationDef = {
  id: 'cookie-oven',
  label: 'Tunnel oven',
  footprint: [220, 110],
  height: 130,
  duration: 2.6,
  spaceDuration: 0.3,
  outputStage: 'baked',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    const roof = housing(looks, 2 * HALF_X, 80, 12, 'paint', 2);
    roof.position.set(0, 4, ROOF_Z);
    const back = housing(looks, 2 * HALF_X, 6, ROOF_Z - FLOOR, 'steel', 1);
    back.position.set(0, 40, FLOOR);
    group.add(roof, back);
    for (const x of [-HALF_X, HALF_X]) {
      for (const y of [-FRONT_Y, FRONT_Y]) group.add(beam(looks, [x, y, FLOOR], [x, y, ROOF_Z], 8, 'paint'));
      const lintel = housing(looks, 8, 80, ROOF_Z - 50, 'paint', 1);
      lintel.position.set(x, 4, 50);
      group.add(lintel);
    }
    const window = housing(looks, 2 * HALF_X - 16, 1.5, 48, 'glass', 0.3);
    window.position.set(0, FRONT_Y, 4);
    group.add(window);
    for (let x = -HALF_X + 14; x <= HALF_X - 14; x += 30) group.add(beam(looks, [x, FRONT_Y, 2], [x, FRONT_Y, 54], 3, 'steel'));
    group.add(beam(looks, [-HALF_X, FRONT_Y, 2], [HALF_X, FRONT_Y, 2], 3, 'steel'), beam(looks, [-HALF_X, FRONT_Y, 54], [HALF_X, FRONT_Y, 54], 3, 'steel'));

    // Heating elements: glowing strips above and below the belt, pulsing while a job bakes.
    const strips: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      for (const z of [44, -12]) {
        const strip = housing(looks, 22, 5, 2, 'molten', 0.4);
        strip.position.set(-HALF_X + 20 + i * 30, -4, z);
        strips.push(strip);
        group.add(strip);
      }
    }
    // Burner manifold along the base with feed pipes; chimney on the roof.
    group.add(pipe(looks, [[-HALF_X + 6, 46, FLOOR + 8], [HALF_X - 6, 46, FLOOR + 8]], 3.5, 'copper'));
    for (let i = 0; i < 6; i++) {
      const x = -HALF_X + 20 + i * 30;
      group.add(pipe(looks, [[x, 46, FLOOR + 8], [x, 30, -14]], 1.6, 'copper'));
    }
    const chimney = column(looks, 6, 36, 'steel', 20);
    chimney.position.set(60, 30, ROOF_Z + 12);
    const cap = column(looks, 9, 3, 'paint', 20);
    cap.position.set(60, 30, ROOF_Z + 48);
    group.add(chimney, cap);

    // Rubber curtains at the mouths.
    const curtains: THREE.Mesh[] = [];
    for (const x of [-HALF_X - 3, HALF_X + 3]) {
      for (const y of [-14, 0, 14]) {
        const flap = housing(looks, 1.5, 10, 36, 'rubber', 0.4);
        flap.geometry.translate(0, 0, -36);
        flap.position.set(x, y, 52);
        curtains.push(flap);
        group.add(flap);
      }
    }
    const dial = gauge(looks, 8);
    dial.group.position.set(-HALF_X + 30, FRONT_Y - 4, 60);
    const ctl = panel(looks, 22, 34);
    ctl.group.position.set(HALF_X + 24, -40, FLOOR);
    const beacon = lamp(looks, 2.6);
    beacon.group.position.set(-HALF_X + 6, 36, ROOF_Z + 16);
    group.add(dial.group, ctl.group, beacon.group);

    const hum = ctx.audio.loop('oven-hum', { x: ctx.origin[0], gain: 0.25 });
    const shots = oneShots();
    let on: boolean | null = null;
    return {
      begin() { shots.reset(); },
      update(_dt, job, t, product) {
        const live = !!job && !job.isSpace;
        if (job) product?.shape('baked', t);
        strips.forEach((s, i) => { s.scale.z = live ? 1 + 0.3 * Math.sin(ctx.now() * 0.007 + i) : 1; });
        curtains.forEach((c, i) => { c.rotation.y = live ? 0.12 * Math.sin(ctx.now() * 0.004 + i) : 0; });
        if (live && t > 0.9 && shots.once('vent')) ctx.audio.play('hiss', { x: ctx.origin[0] });
        if (live) ctx.particles.emit('smoke', { pos: world(ctx, 60, 30, ROOF_Z + 50), count: 1, vel: [0, 0, 20], spread: 3, floor: world(ctx, 0, 0, 0)[2] });
        if (live && t > 0.85) ctx.particles.emit('steam', { pos: world(ctx, HALF_X - 6, 0, 24), count: 1, vel: [8, 0, 12], spread: 4, floor: world(ctx, 0, 0, 0)[2] });
        dial.set(live ? 0.75 : 0.3);
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() {
        hum.stop();
        teardown(group);
      },
    };
  },
};
