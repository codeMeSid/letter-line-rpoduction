import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, box, column, flange, gauge, housing, lathe, legs, pipe } from '../../shared/parts';
import { ease, floorZ, stationBase, teardown, world } from './common';

const LEN = 120;   // tunnel length along the belt
const WALL_Y = 32;
/** Tall enough that the camera sees the letter lying in its flask through the glass (at 46 the fascia hid it). */
const ROOF_Z = 58;
const ROOF_T = 6;
const TOP = ROOF_Z + ROOF_T;
const FAN_X = 30;
const FAN_SPIN = 12; // rad/s
const STACK: [number, number] = [-50, 20];
const STACK_TOP = TOP + 24;
/** Strip curtains stop just above the flask (z 19), so products pass under them without clipping. */
const STRIP_LEN = ROOF_Z - 3 - 21;
const STRIP_Y = [-25, -15, -5, 5, 15, 25];

/**
 * Station 3: cooling tunnel on legs straddling the belt. Back wall, glazed front (the glowing letter shows
 * through), louvred roof with two exhaust fans, strip curtains at both ends, a spray manifold inside,
 * a steam stack and a temperature dial that falls as the letter cools.
 */
export const cooling: StationDef = {
  id: 'letter-cooling',
  label: 'Cooling tunnel',
  footprint: [130, 90],
  height: STACK_TOP + 3,
  duration: 1.7,
  spaceDuration: 0.3,
  outputStage: 'cooled',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    // Shell: legs, back wall, roof, corner posts, glazed front between a lower lip and a fascia.
    group.add(legs(looks, LEN + 4, 2 * WALL_Y + 6, 22));
    const back = housing(looks, LEN, 4, ROOF_Z, 'paint', 1);
    back.position.set(0, WALL_Y, 0);
    const roof = housing(looks, LEN + 4, 2 * WALL_Y + 6, ROOF_T, 'paint', 2);
    roof.position.z = ROOF_Z;
    const lip = housing(looks, LEN, 4, 6, 'paint', 1);
    lip.position.set(0, -WALL_Y, 0);
    const fascia = housing(looks, LEN, 4, 6, 'paint', 1);
    fascia.position.set(0, -WALL_Y, ROOF_Z - 6);
    const glass = box(looks, LEN, 2, ROOF_Z - 12, 'glass');
    glass.position.set(0, -WALL_Y, 6);
    group.add(back, roof, lip, fascia, glass);
    for (const x of [-LEN / 2, -FAN_X, FAN_X, LEN / 2]) {
      const end = Math.abs(x) === LEN / 2;
      for (const y of end ? [-WALL_Y, WALL_Y] : [-WALL_Y]) group.add(beam(looks, [x, y, 0], [x, y, ROOF_Z], end ? 4 : 2.5));
    }

    // Spray manifold under the roof, seen through the glass.
    group.add(pipe(looks, [[-LEN / 2 + 4, 14, ROOF_Z - 5], [LEN / 2 - 4, 14, ROOF_Z - 5]], 1.5));
    for (let x = -44; x <= 44; x += 22) {
      const nozzle = column(looks, 0.9, 3, 'steel', 8);
      nozzle.position.set(x, 14, ROOF_Z - 9);
      group.add(nozzle);
    }

    // Louvred vent between the fans.
    const vent = box(looks, 36, 60, 0.4, 'rubber'); // dark opening behind the slats
    vent.position.z = TOP;
    group.add(vent);
    for (let i = 0; i < 10; i++) {
      const slat = box(looks, 4, 60, 1.5, 'paint-accent');
      slat.position.set(-16 + (i * 32) / 9, 0, TOP + 0.6);
      slat.rotation.y = 1.0;
      group.add(slat);
    }
    for (const s of [-1, 1]) {
      const rail = box(looks, 40, 2, 3, 'steel');
      rail.position.set(0, s * 31, TOP);
      group.add(rail);
    }

    // Roof exhaust fans: shroud, motor, four pitched blades, wire guard.
    const rotors = [-FAN_X, FAN_X].map((x) => {
      const shroud = lathe(looks, [[10, 0], [11.5, 0], [11.5, 7], [10, 7], [10, 0]], 'steel');
      shroud.position.set(x, 0, TOP);
      const motor = column(looks, 3, 4, 'paint', 14);
      motor.position.set(x, 0, TOP);
      const rotor = new THREE.Group();
      rotor.position.set(x, 0, TOP + 4.5);
      for (let k = 0; k < 4; k++) {
        const arm = new THREE.Group();
        arm.rotation.z = (k * Math.PI) / 2;
        const blade = looks.part(new THREE.BoxGeometry(8, 3, 0.8).translate(5.5, 0, 0), 'steel');
        blade.rotation.x = 0.4;
        arm.add(blade);
        rotor.add(arm);
      }
      rotor.add(column(looks, 1.6, 1.5, 'steel', 10));
      group.add(shroud, motor, rotor);
      for (const a of [Math.PI / 4, -Math.PI / 4]) {
        const bar = box(looks, 23, 0.8, 0.8, 'steel');
        bar.position.set(x, 0, TOP + 7);
        bar.rotation.z = a;
        group.add(bar);
      }
      return rotor;
    });

    // Strip curtains at both ends, each strip pivoting about its top.
    const strips: THREE.Mesh[] = [];
    for (const x of [-LEN / 2 - 1, LEN / 2 + 1]) {
      const header = box(looks, 2, 2 * WALL_Y, 3, 'steel');
      header.position.set(x, 0, ROOF_Z - 3);
      group.add(header);
      for (const y of STRIP_Y) {
        const strip = looks.part(new THREE.BoxGeometry(1, 6, STRIP_LEN).translate(0, 0, -STRIP_LEN / 2), 'rubber');
        strip.position.set(x, y, ROOF_Z - 3);
        strips.push(strip);
        group.add(strip);
      }
    }

    // Steam stack and the temperature dial on a roof pedestal.
    const collar = flange(looks, 6, 6);
    collar.position.set(STACK[0], STACK[1], TOP);
    const stack = pipe(looks, [[STACK[0], STACK[1], TOP + 2], [STACK[0], STACK[1], STACK_TOP]], 3);
    const band = lathe(looks, [[3, 0], [4.2, 0], [4.2, 2.5], [3, 2.5], [3, 0]], 'steel');
    band.position.set(STACK[0], STACK[1], STACK_TOP - 2.5);
    const pedestal = housing(looks, 14, 6, 13, 'paint', 1);
    pedestal.position.set(46, -28, TOP);
    const dial = gauge(looks, 5);
    dial.group.position.set(46, -31, TOP + 7);
    group.add(collar, stack, band, pedestal, dial.group);

    // Line-art draws glass as an opaque background panel; hide it there so the letter stays visible.
    const restyle = () => { glass.visible = looks.opts.look !== 'lineart'; };
    restyle();

    let sway = 0;
    let temp = 0.15;
    return {
      begin(job) {
        if (!job.isSpace) ctx.audio.play('hiss', { x: ctx.origin[0] });
      },
      update(dt, job, t, product) {
        const now = ctx.now();
        const live = !!job && !job.isSpace;
        for (const r of rotors) r.rotation.z += FAN_SPIN * dt;
        sway = ease(sway, live ? 1 : 0, dt, 3);
        strips.forEach((s, i) => { s.rotation.y = 0.15 * sway * Math.sin(now * 0.005 + i * 1.3); });
        if (live) {
          temp = 1 - 0.85 * t;
          if (Math.random() < 1 - t) {
            ctx.particles.emit('steam', { pos: world(ctx, STACK[0], STACK[1], STACK_TOP + 1), count: 1, vel: [0, 0, 20], spread: 1.5, floor: floorZ(ctx) });
          }
        } else {
          temp = ease(temp, 0.15, dt, 2);
        }
        dial.set(temp);
        if (job) product?.shape('cooled', t);
      },
      finish: () => 'pass',
      restyle,
      destroy() {
        teardown(group);
      },
    };
  },
};
