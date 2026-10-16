import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, gear, housing, lathe, panel, pipe } from '../../shared/parts';
import { SAND_TOP } from '../product';
import { FLOOR, ease, floorZ, helix, oneShots, ss, stationBase, teardown, world } from './common';

/** Induction furnace behind the belt (its coil clears the conveyor rails at y ±27.5). */
const FX = 26;
const FY = 58;
const FURNACE_TOP = FLOOR + 50;
const GANTRY_Y = 44;
const GANTRY_X = 62;
const BEAM_Z = 100;
const ARM_Z = 85;
const HOOK_Z = 78; // underside of the hook block
/** Trolley travel stays inboard of the knee braces (they reach x ±40 under the beam; carriage half-width 9). */
const REST_X = 28;
const POUR_X = 6;
const REST_Z = 44; // ladle bowl bottom (bail top just under the hook block)
const POUR_Z = 34;
const TILT = -1.0;
/** Ladle trunnion height above the bowl bottom, and the pour lip relative to the trunnion. */
const PIVOT = 9;
const LIP: [number, number] = [-17, 14.5 - PIVOT];
const BAIL_R = 15;
/** Ladle scale: at 1 it read as a toy next to the 124-wide gantry. */
const LADLE_S = 1.25;
/** Ingot feeder: an inclined belt rising from the right into the furnace mouth. */
const FEED_L = 44;
const FEED_RISE = 16;
const FEED_ANGLE = Math.atan2(FEED_RISE, FEED_L);
const FEED_TOP: [number, number] = [FX + 12, FURNACE_TOP + 5]; // upper (left) end of the belt surface, over the bath opening
const INGOT_TRAVEL = 2.4; // s along the belt
const INGOT_DROP = 0.4;   // s hidden ("dropped in")

/** Lip position (station-local x, z) for a trolley x, ladle z and tilt. */
function lipAt(x: number, z: number, tilt: number): [number, number] {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  return [x + LADLE_S * (LIP[0] * c + LIP[1] * s), z + LADLE_S * (PIVOT - LIP[0] * s + LIP[1] * c)];
}

/**
 * Station 2: induction furnace (copper coil, yoke, ingot feeder, power cabinet with bus bars) and a gantry
 * hoist whose lip-pour ladle travels over the flask, tilts on its trunnions and pours a molten stream.
 */
export const pour: StationDef = {
  id: 'letter-pour',
  label: 'Furnace & pour',
  footprint: [130, 110],
  height: 130,
  duration: 1.8,
  spaceDuration: 0.3,
  outputStage: 'poured',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    // ---- Induction furnace ----
    const furnace = new THREE.Group();
    furnace.position.set(FX, FY, 0);
    const body = lathe(looks, [[0, 0], [22, 0], [22, 46], [19, 50], [0, 50]], 'paint-accent');
    body.position.z = FLOOR;
    const coil = pipe(looks, helix(23.5, 8, -18, 22), 1.6, 'copper');
    // Refractory lid ring narrows the open bath (a full-width molten disc blooms over the whole gantry).
    const rim = lathe(looks, [[11, 0], [20, 0], [20, 2.4], [12, 3.4], [11, 3.4], [11, 0]], 'steel');
    rim.position.z = FURNACE_TOP;
    const pool = lathe(looks, [[0, 0], [17, 0], [17, 0.6], [0, 0.6]], 'molten');
    pool.position.z = FURNACE_TOP - 0.5;
    furnace.add(body, coil, rim, pool);
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const [x, y] = [Math.cos(a) * 26.5, Math.sin(a) * 26.5];
      furnace.add(beam(looks, [x, y, FLOOR], [x, y, FURNACE_TOP - 2], 4)); // magnetic yokes
    }
    const plinth = housing(looks, 56, 56, 3, 'concrete', 1);
    plinth.position.z = FLOOR;
    furnace.add(plinth);
    group.add(furnace);

    // Power cabinet with copper bus bars to the coil.
    const cabinet = panel(looks, 24, 40);
    cabinet.group.position.set(FX - 46, FY + 2, FLOOR);
    group.add(cabinet.group);
    for (const z of [-2, 6]) group.add(beam(looks, [FX - 34, FY + 2, z], [FX - 22, FY + 2, z], 2.5, 'copper'));

    // Ingot feeder: inclined belt on two legs; ingots ride it and drop into the furnace.
    const feeder = new THREE.Group();
    feeder.position.set(FEED_TOP[0] + (FEED_L / 2) * Math.cos(FEED_ANGLE), FY, FEED_TOP[1] - (FEED_L / 2) * Math.sin(FEED_ANGLE));
    feeder.rotation.y = FEED_ANGLE;
    const belt = housing(looks, FEED_L, 14, 3, 'belt', 1);
    belt.position.z = -3;
    feeder.add(belt);
    for (const s of [-1, 1]) {
      const side = housing(looks, FEED_L + 2, 2, 5, 'steel', 0.5);
      side.position.set(0, s * 8, -4);
      feeder.add(side);
    }
    const ingots = [0, 1, 2].map(() => {
      const ingot = housing(looks, 10, 6, 4, 'steel', 1);
      feeder.add(ingot);
      return ingot;
    });
    group.add(feeder);
    const zOnFeed = (x: number) => feeder.position.z - (x - feeder.position.x) * Math.tan(FEED_ANGLE) - 4;
    for (const x of [FX + 26, FX + 50]) group.add(beam(looks, [x, FY, FLOOR], [x, FY, zOnFeed(x)], 3));

    // ---- Gantry ----
    for (const s of [-1, 1]) {
      const x = s * GANTRY_X;
      group.add(beam(looks, [x, GANTRY_Y, FLOOR], [x, GANTRY_Y, BEAM_Z + 4], 8));
      const brace = beam(looks, [x, GANTRY_Y, BEAM_Z - 24], [x - s * 20, GANTRY_Y, BEAM_Z - 4], 4);
      brace.name = s < 0 ? 'brace-left' : 'brace-right';
      group.add(brace);
      const foot = housing(looks, 16, 16, 2, 'steel', 0.5);
      foot.position.set(x, GANTRY_Y, FLOOR);
      const stop = housing(looks, 4, 10, 6, 'paint-accent', 0.5);
      stop.position.set(s * (GANTRY_X - 8), GANTRY_Y, BEAM_Z - 10);
      group.add(foot, stop);
    }
    group.add(beam(looks, [-GANTRY_X - 4, GANTRY_Y, BEAM_Z], [GANTRY_X + 4, GANTRY_Y, BEAM_Z], 8));

    // Trolley with a jib arm reaching over the line, hook block, hoist motor and drum.
    const trolley = new THREE.Group();
    const carriage = housing(looks, 18, 18, 8, 'paint-accent', 1.5);
    carriage.name = 'trolley';
    carriage.position.set(0, GANTRY_Y, BEAM_Z - 12);
    const arm = beam(looks, [0, GANTRY_Y, ARM_Z], [0, -3, ARM_Z], 6);
    const hook = housing(looks, 7, 7, ARM_Z - 3 - HOOK_Z, 'steel', 1);
    hook.position.z = HOOK_Z;
    const motor = housing(looks, 9, 10, 6, 'paint', 1);
    motor.position.set(0, 10, ARM_Z + 3);
    const drum = column(looks, 3, 8, 'steel', 8); // octagonal, so its spin reads
    drum.rotation.y = Math.PI / 2; // axis → x
    drum.position.x = -4;
    const drumAxis = new THREE.Group(); // spins the drum about its own (x) axis
    drumAxis.position.set(0, 0, ARM_Z + 6.2);
    drumAxis.add(drum);
    const cable = column(looks, 0.6, 1, 'rubber', 6);
    trolley.add(carriage, arm, hook, motor, drumAxis, cable);
    group.add(trolley);

    // Ladle: bail hangs from the cable; the bowl tilts on trunnions through a tilt gear and handwheel (on the back, so the pour stays in view).
    const ladle = new THREE.Group();
    const bail = looks.part(new THREE.TorusGeometry(BAIL_R, 1, 8, 24, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), 'steel');
    bail.position.z = PIVOT;
    const gearbox = housing(looks, 8, 4, 8, 'paint-accent', 1);
    gearbox.position.set(0, BAIL_R + 3, PIVOT - 4);
    const wheel = new THREE.Group();
    wheel.position.set(0, BAIL_R + 5.5, PIVOT);
    wheel.add(looks.part(new THREE.TorusGeometry(4.5, 0.6, 6, 20).rotateX(Math.PI / 2), 'steel'));
    for (const a of [0, Math.PI / 2]) {
      const spoke = looks.part(new THREE.BoxGeometry(9, 0.8, 0.8), 'steel');
      spoke.rotation.y = a;
      wheel.add(spoke);
    }
    const tilt = new THREE.Group();
    tilt.position.z = PIVOT;
    const bowl = lathe(looks, [[0, 0], [10, 0], [13, 10], [13.5, 14], [12, 14], [9.5, 2], [0, 2]], 'steel');
    bowl.position.z = -PIVOT;
    const melt = lathe(looks, [[0, 0], [11.3, 0], [11.3, 0.5], [0, 0.5]], 'molten');
    melt.position.z = 11 - PIVOT;
    const lip = housing(looks, 7, 6, 2.5, 'steel', 1);
    lip.position.set(-14, 0, 12 - PIVOT);
    const tilter = gear(looks, 5, 12, 1.5);
    tilter.rotation.x = -Math.PI / 2; // axis → +y
    tilter.position.set(0, 13, 0);
    tilt.add(bowl, melt, lip, tilter);
    for (const s of [-1, 1]) {
      const trunnion = column(looks, 1.8, 3.5, 'steel', 10);
      trunnion.rotation.x = s * (Math.PI / 2);
      trunnion.position.y = s * -12;
      tilt.add(trunnion);
    }
    ladle.add(bail, gearbox, wheel, tilt);
    ladle.scale.setScalar(LADLE_S);
    group.add(ladle);

    // Molten stream from the lip to the sand.
    const stream = column(looks, 1.6, 1, 'molten', 10);
    stream.visible = false;
    group.add(stream);

    const roar = ctx.audio.loop('furnace-roar', { x: ctx.origin[0], gain: 0.4 });
    const shots = oneShots();
    let tx = REST_X;
    let lz = REST_Z;
    let tl = 0;
    return {
      begin() {
        shots.reset();
      },
      update(dt, job, t, product) {
        const now = ctx.now();
        const live = !!job && !job.isSpace;
        if (live) {
          const travel = ss(0, 0.2, t) * (1 - ss(0.9, 1, t));
          tx = REST_X + (POUR_X - REST_X) * travel;
          lz = REST_Z + (POUR_Z - REST_Z) * travel;
          tl = TILT * ss(0.2, 0.3, t) * (1 - ss(0.8, 0.9, t));
        } else {
          tx = ease(tx, REST_X, dt, 4);
          lz = ease(lz, REST_Z, dt, 4);
          tl = ease(tl, 0, dt, 6);
        }
        trolley.position.x = tx;
        ladle.position.set(tx, 0, lz);
        tilt.rotation.y = tl;
        wheel.rotation.y = tl * 4;
        // Liquid stays level as the bowl tips: counter-rotate and shrink the melt surface.
        melt.rotation.y = -tl;
        melt.scale.setScalar(1 - 0.45 * Math.abs(tl / TILT));
        const bailTop = lz + LADLE_S * (PIVOT + BAIL_R + 1);
        cable.position.set(0, 0, bailTop);
        cable.scale.z = Math.max(0.01, HOOK_Z - bailTop);
        drumAxis.rotation.x = (HOOK_Z - bailTop) * 0.35;

        if (live && t >= 0.3 && shots.once('hiss')) ctx.audio.play('hiss', { x: ctx.origin[0] });
        const pouring = live && t >= 0.3 && t <= 0.8;
        stream.visible = pouring;
        if (pouring) {
          const [lx, lzLip] = lipAt(tx, lz, tl);
          const wobble = 1 + 0.15 * Math.sin(now * 0.03);
          stream.position.set(lx, 0, SAND_TOP);
          stream.scale.set(wobble, wobble, Math.max(0.01, lzLip - SAND_TOP));
          const hit = world(ctx, lx, 0, SAND_TOP);
          ctx.particles.emit('glow', { pos: hit, count: 1, spread: 1, floor: floorZ(ctx) });
          ctx.particles.emit('ember', { pos: hit, count: 2, vel: [0, 0, 25], spread: 2, floor: floorZ(ctx) });
        }
        if (job) product?.shape('poured', ss(0.3, 0.8, t));

        // Ambient: furnace bath shimmer, ingots riding up the feeder, cabinet lamps.
        const sh = 1 + 0.02 * Math.sin(now * 0.004);
        pool.scale.set(sh, sh, 1);
        const cycle = INGOT_TRAVEL + INGOT_DROP;
        ingots.forEach((ingot, i) => {
          const ph = ((now / 1000 + (i * cycle) / 3) % cycle) / INGOT_TRAVEL; // 0 low end → 1 top end, >1 hidden
          ingot.visible = ph <= 1;
          ingot.position.set(FEED_L / 2 - 5 - ph * (FEED_L + 2), 0, 0); // ends tipping off the top end, over the bath
        });
        cabinet.update(now);
      },
      finish: () => 'pass',
      destroy() {
        roar.stop();
        teardown(group);
      },
    };
  },
};
