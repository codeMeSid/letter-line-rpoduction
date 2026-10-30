import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { box, column, gear, housing, lathe } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';
import { controls, portal } from './controls';

const TOOL = 26;
const KNIFE_Z = 47.4;   // cut height: the can is trimmed to 48

/**
 * Station 5: trimmer. A rotary knife on a spindle drops over the tall can and shaves the ragged ear off the rim; the offcut ring
 * falls into the scrap bin beside the line.
 */
export const trimmer: StationDef = {
  id: 'can-trimmer',
  label: 'Trimmer',
  footprint: [100, 130],
  height: 150,
  duration: 1.8,
  spaceDuration: 0.3,
  outputStage: 'trimmed',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    const press = portal(ctx, 90, TOOL, KNIFE_Z);
    const spindle = new THREE.Group();
    spindle.position.z = -TOOL;
    spindle.add(
      column(looks, 5, TOOL - 4, 'steel', 20),
      lathe(looks, [[12.6, 0], [17, 0], [17, 3], [12.6, 3]], 'copper', 32),
      lathe(looks, [[5, 3], [17, 3], [17, 6], [5, 6]], 'steel', 32),
    );
    (spindle.children[0] as THREE.Mesh).position.z = 4;
    press.ram.rodEnd.add(spindle);
    const bin = box(looks, 34, 26, -4 - FLOOR, 'rubber');
    bin.position.set(0, 52, FLOOR);
    const motor = housing(looks, 22, 22, 30, 'paint-accent', 3);
    motor.position.set(-30, -52, FLOOR);
    const drive = gear(looks, 9, 14, 4, 'steel');
    drive.rotation.x = Math.PI / 2;
    drive.position.set(-30, -40, FLOOR + 18);
    const offcut = lathe(looks, [[11.9, 0], [12.5, 0], [12.5, 1.6], [11.9, 1.6]], 'steel', 32);
    offcut.visible = false;
    group.add(bin, motor, drive, offcut);
    const ui = controls(ctx, [48, -52], [-36, -34, 70], [36, -34, 156]);

    const shots = oneShots();
    let ext = 0;
    let spin = 0;
    return {
      begin(job) {
        shots.reset();
        if (!job.isSpace) ctx.audio.play('crunch', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        ext = ease(ext, live ? ss(0.1, 0.35, t) * (1 - ss(0.62, 0.85, t)) : 0, dt, 26);
        press.ram.set(ext);
        spin += dt * (live && ext > 0.2 ? 30 : 1);
        spindle.rotation.z = spin;
        drive.rotation.z = spin * 0.6;
        const s = ss(0.5, 0.95, t);
        offcut.visible = live && t > 0.5;
        offcut.position.set(0, 52 * s, Math.max(-2, KNIFE_Z - 70 * s * s));
        offcut.rotation.x = 1.4 * s;
        if (live && t > 0.3 && t < 0.55) {
          ctx.particles.emit('spark', { pos: world(ctx, 0, 0, KNIFE_Z), count: 1, spread: 4, vel: [0, 0, 6], floor: world(ctx, 0, 0, 0)[2] });
        }
        if (job) product?.shape('trimmed', ss(0.3, 0.6, t));
        ui.tick(live, ext);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
