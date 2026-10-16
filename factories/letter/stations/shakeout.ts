import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, box, column, flange, gear, hazardBand, housing, lamp, lathe, panel, pipe } from '../../shared/parts';
import { FLOOR, ease, floorZ, helix, oneShots, ss, stationBase, teardown, world } from './common';

const DECK_Z = -1.8;      // grate bar bottoms; tops stand 1.2 proud of the belt
const RAIL_BOTTOM = -6;   // conveyor side rails span z -6..1 at y ±26
const SIDE_Y = 31;        // deck side members, outside the conveyor rails (y ±27.5)
const FRAME_TOP = FLOOR + 6;
const SPRING_H = DECK_Z - 1.2 - FRAME_TOP; // frame top → deck spring cap
const HOPPER_X = 56;      // the flask halves slide out to x ±49 and drop in here
const HOOD_Z = 62; // hood skirt top
const AMP = 0.8;

/**
 * Station 4: vibrating shakeout. A grate deck on four coil springs, shaken by an unbalanced motor with spinning
 * eccentric weights, knocks the casting out; the flask halves slide into catch hoppers at both ends and the
 * sand rains through the grate. An extraction hood with its duct hangs over the deck.
 */
export const shakeout: StationDef = {
  id: 'letter-shakeout',
  label: 'Shakeout',
  footprint: [130, 110],
  height: 90,
  duration: 1.5,
  spaceDuration: 0.3,
  outputStage: 'cast',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44, [100, 80]));
    const frame = housing(looks, 90, 70, 6, 'steel', 1.5);
    frame.position.z = FLOOR;
    group.add(frame);

    // Springs (scaled with the deck's travel) between frame and deck.
    const springs = [-28, 28].flatMap((x) => [-SIDE_Y, SIDE_Y].map((y) => {
      const s = new THREE.Group();
      s.position.set(x, y, FRAME_TOP);
      s.add(pipe(looks, helix(4, 5, 0, SPRING_H, 0, 0, 6), 0.9, 'steel', 8)); // ~half the triangles of the default tube
      const seat = column(looks, 5, 1, 'steel', 14);
      s.add(seat);
      group.add(s);
      return s;
    }));

    // Vibrating deck: grate bars on the belt, end and side members, spring caps, motor bracket.
    const deck = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const bar = box(looks, 70, 3, 3, 'steel');
      bar.position.set(0, -21 + i * 5.25, DECK_Z);
      deck.add(bar);
    }
    for (const s of [-1, 1]) {
      // End members pass under the belt and its side rails (rail bottoms at z -6); corner posts tie them to the side members.
      const end = box(looks, 3, 2 * SIDE_Y + 3, 3, 'steel');
      end.position.set(s * 36.5, 0, RAIL_BOTTOM - 4);
      const side = box(looks, 76, 3, 3, 'paint-accent');
      side.position.set(0, s * SIDE_Y, DECK_Z);
      deck.add(end, side);
      for (const y of [-SIDE_Y, SIDE_Y]) {
        const post = box(looks, 3, 3, DECK_Z - (RAIL_BOTTOM - 1), 'steel');
        post.position.set(s * 36.5, y, RAIL_BOTTOM - 1);
        deck.add(post);
      }
      for (const x of [-28, 28]) {
        const cap = column(looks, 5, 1.2, 'steel', 14);
        cap.position.set(x, s * SIDE_Y, DECK_Z - 1.2);
        deck.add(cap);
      }
    }
    // Unbalanced vibrator motor bolted under the back side member, eccentric weights on both shaft ends.
    const bracket = box(looks, 24, 8, 2.5, 'steel');
    bracket.position.set(0, 35, -3);
    const motor = column(looks, 7, 22, 'paint', 20);
    motor.rotation.y = Math.PI / 2;
    motor.position.set(-11, 39, -8);
    deck.add(bracket, motor);
    const weights = [-1, 1].map((s) => {
      const spinner = new THREE.Group();
      spinner.position.set(s * 11, 39, -8);
      const g = gear(looks, 5.5, 10, 2.5, 'paint-accent');
      g.rotation.y = s * (Math.PI / 2); // axis → ±x, outward from the motor
      spinner.add(g);
      deck.add(spinner);
      return spinner;
    });
    group.add(deck);

    // Catch hoppers: funnel under the belt into a tote, cheek plates rising either side of the belt.
    for (const s of [-1, 1]) {
      const x = s * HOPPER_X;
      const funnel = lathe(looks, [[0, 0], [4, 0], [4, 3], [16, 15], [17.5, 15], [17.5, 16], [0, 16]], 'paint');
      funnel.position.set(x, 0, FLOOR + 2);
      const tote = housing(looks, 26, 26, 3, 'steel', 1);
      tote.position.set(x, 0, FLOOR);
      group.add(funnel, tote);
      for (const sy of [-1, 1]) {
        // Cheek plates flare outward like a hopper mouth.
        const cheek = new THREE.Group();
        cheek.position.set(x, sy * SIDE_Y, -4);
        cheek.rotation.x = -sy * 0.3;
        const plate = box(looks, 30, 2, 18, 'paint');
        const lip = box(looks, 32, 3, 1.5, 'steel');
        lip.position.z = 18;
        cheek.add(plate, lip);
        if (sy < 0) {
          const warn = hazardBand(looks, 30, 5, 0.5);
          warn.rotation.x = Math.PI / 2; // stand the stripes up on the front face
          warn.position.set(0, -1, 14.5);
          cheek.add(warn);
        }
        group.add(cheek);
      }
    }

    // Extraction hood: open-fronted pyramid canopy on two back posts, duct running back to a flange.
    // A 4-segment lathe turned 45° is a square frustum; non-indexed so its faces shade flat.
    const hoodGeom = new THREE.LatheGeometry([new THREE.Vector2(40 * Math.SQRT2, 0), new THREE.Vector2(9 * Math.SQRT2, 10), new THREE.Vector2(0, 10)], 4)
      .rotateX(Math.PI / 2).rotateZ(Math.PI / 4).toNonIndexed();
    hoodGeom.computeVertexNormals();
    const hood = looks.part(hoodGeom, 'paint');
    hood.scale.y = 0.85;
    hood.position.z = HOOD_Z;
    group.add(hood);
    for (const s of [-1, 1]) {
      const skirt = box(looks, 2, 68, 8, 'paint');
      skirt.position.set(s * 40, 0, HOOD_Z - 8);
      group.add(skirt);
      group.add(beam(looks, [s * 37, 36, FLOOR], [s * 37, 36, HOOD_Z], 5)); // inboard of the flared hopper cheeks (x ≥ 40), behind the deck
    }
    const backSkirt = box(looks, 80, 2, 8, 'paint');
    backSkirt.position.set(0, 33, HOOD_Z - 8);
    const frontLip = box(looks, 80, 2, 2, 'steel');
    frontLip.position.set(0, -33, HOOD_Z - 2);
    const collar = column(looks, 7, 4, 'steel', 20);
    collar.position.set(0, 0, HOOD_Z + 10);
    const duct = pipe(looks, [[0, 0, HOOD_Z + 12], [0, 0, HOOD_Z + 17], [0, 12, HOOD_Z + 22], [0, 50, HOOD_Z + 22]], 4.5, 'paint');
    const ductEnd = flange(looks, 8, 6);
    ductEnd.rotation.x = -Math.PI / 2; // face +y
    ductEnd.position.set(0, 50, HOOD_Z + 22);
    group.add(backSkirt, frontLip, collar, duct, ductEnd);

    const ctl = panel(looks, 20, 30);
    ctl.group.position.set(-40, -46, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(34, -33, HOOD_Z + 3); // on the hood front lip
    group.add(ctl.group, beacon.group);

    const shots = oneShots();
    let spin = 2;
    let active: boolean | null = null;
    return {
      begin() {
        shots.reset();
      },
      update(dt, job, t, product) {
        const now = ctx.now();
        const live = !!job && !job.isSpace;
        const env = live ? ss(0.08, 0.13, t) * (1 - ss(0.7, 0.75, t)) : 0;
        const off = Math.sin(now * 0.09) * AMP * env;
        deck.position.z = off;
        for (const s of springs) s.scale.z = (SPRING_H + off) / SPRING_H;
        spin = ease(spin, env > 0.5 ? 45 : 2, dt, 4);
        for (const w of weights) w.rotation.x += spin * dt;
        if (job && product) {
          product.root.position.set(job.pos[0] + off * 0.5, job.pos[1], job.pos[2] + off); // absolute: never accumulates
          product.shape('cast', t);
        }
        if (live) {
          if (t >= 0.2 && t <= 0.85) {
            const u = (Math.random() * 2 - 1) * 20;
            const [px, py] = [[20, u], [-20, u], [u, 20], [u, -20]][Math.floor(Math.random() * 4)];
            ctx.particles.emit('sand', { pos: world(ctx, px, py, 12), count: 4, vel: [px * 0.6, py * 0.6, 4], spread: 1.5, floor: floorZ(ctx) });
          }
          if (t >= 0.2 && shots.once('crunch')) ctx.audio.play('crunch', { x: ctx.origin[0] });
          if (t >= 0.55 && shots.once('thump')) {
            ctx.audio.play('press-thump', { x: ctx.origin[0] });
            for (const s of [-1, 1]) {
              ctx.particles.emit('crumb', { pos: world(ctx, s * 48, 0, 10), count: 6, vel: [s * 12, 0, -10], spread: 2, floor: floorZ(ctx) });
            }
          }
        }
        ctl.update(now);
        if (live !== active) {
          active = live;
          beacon.set(live);
        }
      },
      finish: () => 'pass',
      destroy() {
        teardown(group);
      },
    };
  },
};
