import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, housing, lathe } from '../../shared/parts';
import { FLOOR, ease, ss, stationBase, teardown } from '../../shared/stationKit';
import { controls } from './controls';

const DRUM_R = 17;
const DRUM_Y = 29.6;     // drum surface just touches the can sleeve (r 12.25) at y = 12.4
const WHEEL_R = 4;

/**
 * Station 7: decorator. The can spins on the belt against a friction wheel while the blanket drum rolls the print over it;
 * three inking rollers, fed from the fountain behind, charge the drum's print plate.
 */
export const printer: StationDef = {
  id: 'can-printer',
  label: 'Decorator',
  footprint: [110, 170],
  height: 100,
  duration: 2.2,
  spaceDuration: 0.3,
  outputStage: 'printed',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    // Drum assembly (slides in y to engage the can).
    const slide = new THREE.Group();
    slide.position.set(0, DRUM_Y + 8, 0);
    const drum = new THREE.Group();
    drum.add(
      lathe(looks, [[0, 8], [DRUM_R, 8], [DRUM_R, 44], [0, 44]], 'steel', 36),
      lathe(looks, [[DRUM_R, 9], [DRUM_R + 0.7, 9], [DRUM_R + 0.7, 43], [DRUM_R, 43]], 'rubber', 20, [Math.PI * 0.55, Math.PI * 0.7]),
      lathe(looks, [[0, 44], [6, 44], [6, 52], [0, 52]], 'paint-accent', 16),
    );
    slide.add(drum);
    const rolls = [[-24, 24], [24, 24], [0, 38]].map(([x, y], i) => {
      const r = column(looks, 5, 34, i === 2 ? 'rubber' : 'paint-accent', 20);
      r.position.set(x, y, 9);
      slide.add(r);
      return r;
    });
    const fountain = housing(looks, 36, 14, 40, 'paint', 3);
    fountain.position.set(0, 54, FLOOR);
    const trough = housing(looks, 28, 8, 5, 'paint-accent', 1);
    trough.position.set(0, 49, 18);
    const ink = column(looks, 3.4, 28, 'paint-accent', 12);
    ink.rotation.y = Math.PI / 2;
    ink.position.set(-14, 48, 24);
    group.add(slide, fountain, trough, ink, beam(looks, [0, 66, FLOOR], [0, 66, 70], 8, 'paint'), beam(looks, [0, 66, 70], [0, DRUM_Y + 8, 70], 6, 'paint'));
    // Friction wheel on the near side spins the can.
    const wheelSlide = new THREE.Group();
    const wheel = column(looks, WHEEL_R, 34, 'rubber', 18);
    wheel.position.z = 8;
    wheelSlide.add(wheel, beam(looks, [0, -18, 26], [0, -34, 26], 5, 'steel'));
    wheelSlide.position.y = -(12.25 + WHEEL_R) - 8;
    group.add(wheelSlide, beam(looks, [0, -46, FLOOR], [0, -46, 40], 8, 'paint'), beam(looks, [0, -46, 26], [0, -34, 26], 5, 'steel'));
    const ui = controls(ctx, [-56, -50], [-38, -48, 60], [38, -48, 62]);

    let eng = 0;
    return {
      begin(job) {
        if (!job.isSpace) ctx.audio.play('coder-tick', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        eng = ease(eng, live ? ss(0.05, 0.15, t) * (1 - ss(0.93, 1, t)) : 0, dt, 18);
        slide.position.y = DRUM_Y + 8 * (1 - eng);
        wheelSlide.position.y = -(12.25 + WHEEL_R) - 8 * (1 - eng);
        const turn = ss(0.12, 0.92, t) * Math.PI * 2;
        if (live && product) product.root.rotation.z = turn % (Math.PI * 2);
        const a = live ? turn : ctx.now() / 3000;
        drum.rotation.z = -a * (12.25 / DRUM_R);
        wheel.rotation.z = a * (12.25 / WHEEL_R);
        rolls.forEach((r, i) => { r.rotation.z = a * (i === 2 ? 1.2 : -1.5); });
        if (job) product?.shape('printed', ss(0.12, 0.92, t));
        ui.tick(live, eng);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
