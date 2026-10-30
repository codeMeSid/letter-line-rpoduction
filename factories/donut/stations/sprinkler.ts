import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, gauge, housing, lamp, lathe, panel, pipe } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';

const DRUM_Z = 78;

/** Station 8: sprinkler. A hopper feeds a perforated shaker drum above the belt; sprinkles rain onto the glazed ring while a vibrating chute shakes. */
export const sprinkler: StationDef = {
  id: 'donut-sprinkler',
  label: 'Sprinkler',
  footprint: [110, 120],
  height: 120,
  duration: 1.3,
  spaceDuration: 0.3,
  outputStage: 'sprinkled',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    for (const x of [-24, 24]) group.add(beam(looks, [x, 34, FLOOR], [x, 34, DRUM_Z + 10], 5, 'paint'));
    const hopper = lathe(looks, [[0, 0], [6, 0], [18, 24], [18, 32], [0, 32]], 'steel');
    hopper.position.set(0, 34, DRUM_Z + 6);
    // Shaker drum along x with perforation dots.
    const drum = new THREE.Group();
    drum.position.set(0, 0, DRUM_Z);
    const shell = lathe(looks, [[0, -26], [12, -26], [12, 26], [0, 26]], 'copper', 20);
    shell.rotation.y = Math.PI / 2;
    drum.add(shell);
    for (let i = 0; i < 8; i++) {
      const hole = looks.part(new THREE.CylinderGeometry(1.2, 1.2, 1, 8), 'rubber', false);
      hole.position.set((i - 3.5) * 6, 0, -11.6);
      drum.add(hole);
    }
    group.add(hopper, drum, pipe(looks, [[0, 34, DRUM_Z + 6], [0, 18, DRUM_Z + 10], [0, 4, DRUM_Z + 6]], 3, 'steel'));
    const motor = housing(looks, 14, 12, 12, 'paint-accent', 2);
    motor.position.set(-34, 0, DRUM_Z - 6);
    group.add(motor);
    const dial = gauge(looks, 5);
    dial.group.position.set(24, 28, DRUM_Z - 16);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(48, -42, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(-24, 32, DRUM_Z + 16);
    group.add(dial.group, ctl.group, beacon.group);

    const shots = oneShots();
    let spin = 0;
    let rate = 0;
    let on: boolean | null = null;
    return {
      begin(job) { shots.reset(); if (!job.isSpace) ctx.audio.play('whoosh', { x: ctx.origin[0] }); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        rate = ease(rate, live ? ss(0.05, 0.15, t) * (1 - ss(0.85, 0.95, t)) : 0, dt, 18);
        spin += dt * (1 + 12 * rate);
        drum.rotation.x = spin;
        drum.position.y = Math.sin(ctx.now() * 0.06) * 0.5 * rate;
        if (live && rate > 0.3) ctx.particles.emit('confetti', { pos: world(ctx, 0, 0, DRUM_Z - 12), count: 2, vel: [0, 0, -20], spread: 6, floor: world(ctx, 0, 0, 14)[2] });
        if (job) product?.shape('sprinkled', t);
        dial.set(0.4 + 0.4 * rate);
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
