import * as THREE from 'three';
import { letterGeometry } from '../../../engine/letterSolid';
import type { StationDef } from '../../../engine/station';
import { beam, flange, gauge, hazardBand, housing, lamp, lathe, panel, pipe, piston } from '../../shared/parts';
import { LETTER_H, LETTER_R, SAND_TOP } from '../product';
import { FLOOR, ease, floorZ, oneShots, ss, stationBase, teardown, world } from './common';

const MOUNT = 78;     // ram mount line = underside of the head
const HEAD_TOP = 92;
const PLATE = 4;
/** Plate underside at full stroke: just above the flask rim (z 19), so the pattern presses into the sand (SAND_TOP 17). */
const PRESS_Z = SAND_TOP + 2.4;
const STROKE = MOUNT - PRESS_Z - PLATE;
const PATTERN = { height: LETTER_H, radius: LETTER_R };
const PATTERN_HALF = LETTER_R * 0.6; // half thickness after the (1, 0.6, 1) scale
/** Hopper sits beside the ram cylinder (which stands above the head), its chute ends outside the plate's path. */
const HOP: [number, number] = [-30, 22];
const SPOUT: [number, number, number] = [-25, -6, 44];

/**
 * Station 1: squeeze moulding machine. A C-frame (back columns, cantilevered head) carries a tall hydraulic
 * ram with a squeeze plate and the letter pattern; a hopper beside the ram feeds sand down a chute into the flask.
 */
export const moulder: StationDef = {
  id: 'letter-moulder',
  label: 'Sand moulder',
  footprint: [110, 100],
  height: MOUNT + STROKE + 6 + 6, // ram cylinder cap and lug stand above the head
  duration: 1.6,
  spaceDuration: 0.3,
  outputStage: 'moulded',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    // C-frame: back plinth, two columns, a back web, knee braces, cantilevered head.
    const plinth = housing(looks, 104, 16, 8, 'paint', 2);
    plinth.position.set(0, 40, FLOOR);
    const web = housing(looks, 84, 4, MOUNT + 14, 'paint', 1);
    web.position.set(0, 42, FLOOR + 8);
    group.add(plinth, web);
    for (const x of [-46, 46]) {
      group.add(beam(looks, [x, 40, FLOOR], [x, 40, HEAD_TOP], 8));
      group.add(beam(looks, [x, 36, 46], [x, 6, MOUNT + 1], 5));
    }
    const head = housing(looks, 104, 70, HEAD_TOP - MOUNT, 'paint', 2);
    head.position.set(0, 5, MOUNT);
    const stripe = hazardBand(looks, 100, 5, 0.5);
    stripe.position.set(0, -26.5, HEAD_TOP);
    group.add(head, stripe);

    // Hydraulic ram: cylinder stands above the head, rod comes out of its underside.
    const ram = piston(looks, { body: 9, rod: 3.5, len: STROKE + 6, stroke: STROKE, role: 'steel' });
    ram.group.position.set(0, 0, MOUNT);
    group.add(ram.group);
    const plate = housing(looks, 40, 40, PLATE, 'steel', 1);
    plate.position.z = -PLATE;
    const pattern = looks.part(letterGeometry('A', PATTERN), 'steel');
    pattern.rotation.x = -Math.PI / 2;
    pattern.scale.set(1, 0.6, 1);
    ram.rodEnd.add(plate, pattern);
    const seat = (geom: THREE.BufferGeometry) => {
      const bb = geom.boundingBox!;
      pattern.geometry = geom;
      pattern.position.set(0, -(bb.min.z + bb.max.z) / 2, -PLATE - PATTERN_HALF);
    };
    seat(pattern.geometry);

    // Sand hopper on a bolted flange, chute down through the head to a spout beside the flask.
    const hopFlange = flange(looks, 9, 6);
    hopFlange.position.set(HOP[0], HOP[1], HEAD_TOP);
    const hopper = lathe(looks, [[0, 0], [6, 0], [24, 22], [24, 40], [0, 40]], 'paint');
    hopper.position.set(HOP[0], HOP[1], HEAD_TOP + 2);
    const rim = lathe(looks, [[23.5, 0], [25.5, 0], [25.5, 3], [23.5, 3], [23.5, 0]], 'steel');
    rim.position.set(HOP[0], HOP[1], HEAD_TOP + 2 + 37.5);
    const hatch = housing(looks, 12, 12, 2, 'steel', 1);
    hatch.position.set(HOP[0], HOP[1], HEAD_TOP + 42);
    const chute = pipe(looks, [[HOP[0], HOP[1], HEAD_TOP + 2], [HOP[0], 16, 80], [-28, 4, 60], SPOUT], 3);
    group.add(hopFlange, hopper, rim, hatch, chute);

    // Controls: pressure gauge on the head, control box out front (clear of the conveyor), status beacon.
    const dial = gauge(looks, 5.5);
    dial.group.position.set(-30, -31, 85);
    const ctl = panel(looks, 22, 34);
    ctl.group.position.set(42, -40, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(44, -22, HEAD_TOP + 3);
    group.add(dial.group, ctl.group, beacon.group);

    const shots = oneShots();
    let ext = 0;
    let active: boolean | null = null;
    return {
      begin(job) {
        shots.reset();
        if (job.isSpace) return;
        seat(letterGeometry(job.char, PATTERN));
        ctx.audio.play('pour-sand', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const now = ctx.now();
        const live = !!job && !job.isSpace;
        if (live) {
          ext = t < 0.6 ? ss(0.35, 0.55, t) : 1 - ss(0.6, 0.8, t);
          if (t < 0.35) {
            ctx.particles.emit('sand', { pos: world(ctx, SPOUT[0], SPOUT[1], SPOUT[2] - 2), count: 3, vel: [40, 12, -20], spread: 2, floor: floorZ(ctx) });
          }
          if (t >= 0.55 && shots.once('thump')) {
            ctx.audio.play('press-thump', { x: ctx.origin[0] });
            for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              ctx.particles.emit('powder', { pos: world(ctx, sx * 20, sy * 20, PRESS_Z), count: 3, vel: [sx * 18, sy * 18, 10], spread: 3, floor: floorZ(ctx) });
            }
          }
        } else {
          ext = ease(ext, 0, dt, 5);
        }
        ram.set(ext);
        if (job) product?.shape('moulded', t);
        dial.set(0.4 + 0.1 * Math.sin(now / 700) + 0.45 * ext);
        ctl.update(now);
        if (live !== active) {
          active = live;
          beacon.set(live);
        }
      },
      finish: () => 'pass',
      destroy() {
        teardown(group, [pattern]); // pattern geometry is the cached letterGeometry
      },
    };
  },
};
