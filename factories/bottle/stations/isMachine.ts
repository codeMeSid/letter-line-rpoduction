import * as THREE from 'three';
import type { StationDef } from '../../../engine/station';
import { beam, column, flange, gauge, gear, housing, lamp, lathe, panel, pipe, piston } from '../../shared/parts';
import { FLOOR, ease, oneShots, ss, stationBase, teardown, world } from '../../shared/stationKit';

const OPEN = 40;        // mould half offset in y when open
const NECK_Z = 39;      // parison neck above the belt (puck 3 + finish 36)
const PIVOT_X = 34;     // invert arm pivot, to the +x side of the neck
const BLANK_H = 36;
const BLOW_H = 42;

/**
 * Station 5: one IS section: blank mould (short, thick) closes round the gob to form the parison, an invert arm swings it over to the blow
 * mould, which closes while the blow head descends and puffs it out against the walls (the letter is embossed then).
 */
export const isMachine: StationDef = {
  id: 'bottle-is',
  label: 'IS forming machine',
  footprint: [150, 130],
  height: 150,
  duration: 2.6,
  spaceDuration: 0.3,
  outputStage: 'bottle-hot',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));

    // Mould halves: half rings (arc measured from -y toward +x) with cooling ribs, sliding in y on guide rods.
    const mould = (rIn: number, rOut: number, h: number, role: 'steel' | 'paint-accent') => [-1, 1].map((s) => {
      const g = new THREE.Group();
      const arc: [number, number] = s < 0 ? [-Math.PI / 2, Math.PI] : [Math.PI / 2, Math.PI];
      g.add(lathe(looks, [[rIn, 0], [rOut, 0], [rOut, h], [rIn, h], [rIn, 0]], role, 24, arc));
      for (const z of [h * 0.25, h * 0.55, h * 0.85]) g.add(lathe(looks, [[rOut, z - 1], [rOut + 2, z - 1], [rOut + 2, z + 1], [rOut, z + 1]], 'steel', 24, arc));
      const yoke = housing(looks, 22, 8, 9, 'paint', 1);
      yoke.position.set(0, s * (rOut + 3), h / 2 - 3);
      const rod = beam(looks, [0, s * (rOut + 6), h / 2], [0, s * (rOut + 38), h / 2], 3.5, 'steel');
      g.add(yoke, rod);
      return g;
    });
    const blank = mould(6.5, 15, BLANK_H, 'steel');
    const blow = mould(10.6, 19, BLOW_H, 'paint-accent');
    for (const g of [...blank, ...blow]) { g.position.z = 3; group.add(g); }

    // Mould carriers (hydraulic cylinders at the front and back) and the base manifold.
    for (const s of [-1, 1]) {
      const cyl = column(looks, 6, 26, 'paint', 16);
      cyl.rotation.x = -s * Math.PI / 2; // lies along y, away from the belt
      cyl.position.set(0, s * 50, 22);
      group.add(cyl);
    }
    const manifold = housing(looks, 110, 20, 18 - FLOOR, 'paint', 2);
    manifold.position.set(0, 66, FLOOR);
    group.add(manifold);

    // Invert arm: axle through a pedestal at the +x side, arm and neck-ring tongs; one full turn flips the parison across.
    const pedestal = column(looks, 7, NECK_Z - FLOOR, 'paint', 16);
    pedestal.position.set(PIVOT_X, -37, FLOOR);
    const hub = gear(looks, 9, 12, 5, 'steel');
    hub.rotation.x = Math.PI / 2;
    hub.position.set(PIVOT_X, -34, NECK_Z);
    const armG = new THREE.Group();
    armG.position.set(PIVOT_X, 0, NECK_Z);
    armG.add(beam(looks, [0, 0, 0], [-PIVOT_X + 8, 0, 0], 5, 'paint-accent'));
    for (const s of [-1, 1]) armG.add(beam(looks, [-PIVOT_X + 8, 0, 0], [-PIVOT_X + 1, s * 7, 0], 3, 'steel'));
    group.add(pedestal, hub, armG, beam(looks, [PIVOT_X, -34, NECK_Z], [PIVOT_X, 0, NECK_Z], 4, 'steel'));

    // Blow head: air cylinder on a cantilevered head above the neck; the funnel seals the finish.
    const gantry = housing(looks, 54, 40, 8, 'paint', 2);
    gantry.position.set(0, 14, 112);
    for (const x of [-22, 22]) group.add(beam(looks, [x, 34, FLOOR], [x, 34, 112], 5, 'paint'));
    const air = piston(looks, { body: 6, rod: 2.8, len: 34, stroke: 24, role: 'steel' });
    air.group.position.set(0, 0, 112);
    const head = lathe(looks, [[0, 0], [5.5, 0], [5.5, -4], [4.2, -6], [0, -6]], 'copper', 16);
    head.position.z = -6;
    air.rodEnd.add(head);
    const airFlange = flange(looks, 6, 6);
    airFlange.position.z = 144;
    group.add(gantry, air.group, airFlange, pipe(looks, [[0, 0, 146], [18, 14, 150], [40, 30, 150]], 2.5, 'copper'));
    const dial = gauge(looks, 5);
    dial.group.position.set(-26, -12, 96);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(-50, -44, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(24, 30, 124);
    group.add(dial.group, ctl.group, beacon.group);

    const shots = oneShots();
    let blankK = 0;
    let blowK = 0;
    let blast = 0;
    let swing = 0;
    let on: boolean | null = null;
    const setHalves = (set: THREE.Group[], k: number) => {
      set.forEach((g, i) => { g.position.y = (i ? 1 : -1) * (OPEN + (0.5 - OPEN) * k); });
    };
    return {
      begin() { shots.reset(); },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        const now = ctx.now();
        const bt = ss(0.0, 0.1, t) * (1 - ss(0.3, 0.38, t));
        const wt = ss(0.58, 0.66, t) * (1 - ss(0.92, 1, t));
        blankK = live ? bt : ease(blankK, 0, dt, 6);
        blowK = live ? wt : ease(blowK, 0, dt, 6);
        setHalves(blank, blankK);
        setHalves(blow, blowK);
        const lowered = live ? ss(0.62, 0.7, t) * (1 - ss(0.9, 0.95, t)) : 0;
        blast = ease(blast, lowered, dt, 20);
        air.set(blast);
        // Invert swing: a full turn of the arm carries the parison over from the blank side to the blow side.
        swing = live ? ss(0.38, 0.56, t) : ease(swing, 0, dt, 6);
        const th = 2 * Math.PI * swing;
        armG.rotation.y = th;
        hub.rotation.z = th;
        if (job && product) {
          const c = Math.cos(th);
          const s = Math.sin(th);
          product.root.rotation.y = swing < 1 ? th : 0; // a full turn reads as upright; leave no residue
          product.root.position.x += PIVOT_X - (PIVOT_X * c + NECK_Z * s);
          product.root.position.z += NECK_Z - (-PIVOT_X * s + NECK_Z * c);
          const parison = ss(0.05, 0.32, t);
          if (t < 0.56) product.shape('parison', parison);
          else product.shape('bottle-hot', ss(0.6, 0.94, t));
        }
        if (live) {
          if (t > 0.08 && shots.once('clamp1')) ctx.audio.play('mould-clamp', { x: ctx.origin[0] });
          if (t > 0.6 && shots.once('clamp2')) ctx.audio.play('mould-clamp', { x: ctx.origin[0] });
          if (t > 0.7 && shots.once('blow')) ctx.audio.play('air-blow', { x: ctx.origin[0] });
          if (t > 0.7 && t < 0.9) ctx.particles.emit('steam', { pos: world(ctx, 0, 0, NECK_Z + 12), count: 1, vel: [0, 0, 15], spread: 6, floor: world(ctx, 0, 0, 0)[2] });
          if (t > 0.1 && t < 0.3) ctx.particles.emit('steam', { pos: world(ctx, 0, 0, 36), count: 1, vel: [0, 0, 10], spread: 8, floor: world(ctx, 0, 0, 0)[2] });
        }
        dial.set(0.4 + 0.1 * Math.sin(now / 420) + 0.4 * blast);
        ctl.update(now);
        if (live !== on) { on = live; beacon.set(live); }
      },
      finish: () => 'pass',
      destroy() { teardown(group); },
    };
  },
};
