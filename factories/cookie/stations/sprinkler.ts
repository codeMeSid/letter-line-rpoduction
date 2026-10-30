import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, gauge, gear, housing, lamp, lathe, panel } from '../../shared/parts';
import { FLOOR, oneShots, stationBase, teardown, world } from '../../shared/stationKit';
import { BED_T } from '../product';
import { BAKED_H } from '../visual';

const DRUM_Z = 54;

/**
 * Station 9: sprinkle dispenser. A perforated rotating drum over the belt turns while a vibrating feeder tray shakes;
 * coloured sprinkles fall onto the cookie.
 */
export const sprinkler: StationDef = {
  id: 'cookie-sprinkler',
  label: 'Sprinkle dispenser',
  footprint: [100, 110],
  height: 100,
  duration: 1.8,
  spaceDuration: 0.3,
  outputStage: 'sprinkled',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    for (const y of [-26, 26]) for (const x of [-34, 34]) group.add(beam(looks, [x, y, FLOOR], [x, y, DRUM_Z], 5, 'paint'));
    for (const y of [-26, 26]) group.add(beam(looks, [-34, y, DRUM_Z], [34, y, DRUM_Z], 4, 'paint'));

    // Drum on the x axis: an outer group turned onto x carries a spinning inner group (ribs, end discs, shaft).
    const axis = new THREE.Group();
    axis.rotation.y = Math.PI / 2;
    axis.position.set(0, 0, DRUM_Z + 10);
    const drum = new THREE.Group();
    const shell = column(looks, 10, 56, 'steel', 24);
    shell.position.z = -28;
    drum.add(shell);
    for (const z of [-26, -8, 8, 26]) {
      const band = lathe(looks, [[10, 0], [11.2, 0], [11.2, 2], [10, 2]], 'paint-accent', 24);
      band.position.z = z;
      drum.add(band);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rib = beam(looks, [Math.cos(a) * 10.4, Math.sin(a) * 10.4, -26], [Math.cos(a) * 10.4, Math.sin(a) * 10.4, 26], 1.6, 'copper');
      drum.add(rib);
    }
    axis.add(drum);
    group.add(axis);
    // Feed hopper above, vibrating tray below.
    const feed = lathe(looks, [[0, 0], [4, 0], [4, 3], [14, 18], [14, 20], [0, 20]], 'paint', 24);
    feed.position.set(0, 0, DRUM_Z + 22);
    const tray = housing(looks, 40, 24, 2, 'steel', 0.5);
    tray.position.set(0, 0, DRUM_Z - 14);
    const motor = housing(looks, 12, 10, 12, 'paint', 2);
    motor.position.set(-44, 0, DRUM_Z + 4);
    const drive = gear(looks, 6, 8, 2, 'steel');
    drive.position.set(-36, -14, DRUM_Z + 10);
    const dial = gauge(looks, 5);
    dial.group.position.set(36, 40, 30);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(46, -44, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(-34, 26, DRUM_Z + 6);
    group.add(feed, tray, motor, drive, dial.group, ctl.group, beacon.group);

    const shots = oneShots();
    let spin = 0;
    let on: boolean | null = null;
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        spin += dt * (live ? 5 : 0.6);
        drum.rotation.z = spin;
        drive.rotation.z = -spin * 2;
        tray.position.y = live ? Math.sin(ctx.now() * 0.05) * 0.6 : 0;
        if (job) product?.shape('sprinkled', t);
        if (live && shots.once('shake')) ctx.audio.play('pour-sand', { x: ctx.origin[0] });
        if (live && t > 0.05 && t < 0.9) {
          ctx.particles.emit('confetti', { pos: world(ctx, 0, 0, DRUM_Z - 16), count: 2, vel: [0, 0, -10], spread: 5, floor: world(ctx, 0, 0, BED_T + BAKED_H)[2] });
        }
        dial.set(live ? 0.6 : 0.2);
        ctl.update(ctx.now());
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
