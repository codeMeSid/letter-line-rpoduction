import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, housing, lathe } from '../../shared/parts';
import { FLOOR, oneShots, ss, stationBase, teardown } from '../../shared/stationKit';
import { controls } from './kit';
import { PUCK_T } from '../product';

const PAD_OUT = -62;   // pad face when retracted
const PAD_HIT = -14;   // pad face on the mug's front (radius 12) and on the cliche plate
const PAD_Z = 13 + PUCK_T;
const PLATE_X = -50;

/**
 * Station 10: pad printer. A carriage on a cross rail holds a pneumatic ram with a silicone pad: it dips into the inked cliche
 * plate on the side, shifts to the mug, presses the character onto its front, and the glyph appears.
 */
export const printer: StationDef = {
  id: 'mug-printer',
  label: 'Pad printer',
  footprint: [150, 150],
  height: 90,
  duration: 1.8,
  spaceDuration: 0.3,
  outputStage: 'printed',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    // Inked cliche plate on a stand, with its ink cup.
    const plate = housing(looks, 24, 5, 24, 'steel', 1);
    plate.position.set(PLATE_X, PAD_HIT + 2.5, 1);
    const cup = looks.part(new THREE.CylinderGeometry(6, 6, 7, 20).rotateX(Math.PI / 2), 'paint-accent');
    cup.position.set(PLATE_X, PAD_HIT + 12, 4);
    group.add(plate, cup, beam(looks, [PLATE_X, PAD_HIT + 6, FLOOR], [PLATE_X, PAD_HIT + 6, 1], 8, 'paint'));
    // Cross rail in front; the carriage runs on it.
    group.add(beam(looks, [-70, -92, FLOOR + 6], [70, -92, FLOOR + 6], 8, 'steel'));
    const carriage = new THREE.Group();
    const cyl = housing(looks, 22, 36, 24, 'paint', 3);
    cyl.position.set(0, -92, PAD_Z - 12);
    carriage.add(cyl, beam(looks, [0, -92, FLOOR + 6], [0, -92, PAD_Z - 12], 18, 'paint'));
    const ram = new THREE.Group();
    const rod = column(looks, 2.8, 40, 'steel', 10);
    rod.rotation.x = Math.PI / 2;        // z -> -y: extends back into the cylinder
    const holder = housing(looks, 16, 4, 16, 'paint-accent', 1);
    holder.position.set(0, 1, -8);
    const pad = lathe(looks, [[0, 0], [7, 0], [6, 4], [3, 8], [0, 9]], 'rubber', 20);
    pad.rotation.x = -Math.PI / 2;       // lathe z -> +y: the dome faces the mug
    pad.position.y = 2;
    ram.add(rod, holder, pad);
    ram.position.z = PAD_Z;
    carriage.add(ram);
    group.add(carriage);
    const tick = controls(ctx, group, [0, -92, 18]);

    const shots = oneShots();
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        let face = PAD_OUT;
        let x = PLATE_X;
        if (live) {
          // Ink at the plate (0.05-0.3), shift across (0.35-0.5), print (0.55-0.9), return (0.92-1).
          const ink = ss(0.05, 0.18, t) - ss(0.22, 0.32, t);
          const hit = ss(0.55, 0.68, t) - ss(0.76, 0.9, t);
          face = PAD_OUT + (PAD_HIT - PAD_OUT) * Math.max(ink, hit);
          x = PLATE_X * (1 - ss(0.35, 0.5, t) + ss(0.92, 1, t));
        }
        carriage.position.x = x;
        ram.position.y = face - 9;
        if (live && t >= 0.12 && shots.once('ink')) ctx.audio.play('press-thump', { x: ctx.origin[0], gain: 0.4 });
        if (live && t >= 0.62 && shots.once('print')) ctx.audio.play('press-thump', { x: ctx.origin[0], gain: 0.7 });
        if (job) product?.shape('printed', ss(0.65, 0.95, t));
        tick(live);
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
