import * as THREE from 'three';
import { glyph } from '../../../engine/glyphs';
import type { StationDef } from '../../../engine/station';
import { beam, gauge, housing, lamp, lathe, panel, piston } from '../../shared/parts';
import { FLOOR, oneShots, stationBase, teardown, world } from '../../shared/stationKit';
import { BED_T } from '../product';
import { BAKED_H } from '../visual';

const BRIDGE_Z = 70;
const TIP_Z = BED_T + BAKED_H + 1.5;
const GLYPH_H = 8; // matches the piped glyph height in product.ts

/** Glyph strokes → one polyline in cookie-local x/y (centred like the icing solid; v is down, y is up). */
function pathOf(ch: string): [number, number][] {
  const pts = glyph(ch).flat().map(([u, v]) => [u * GLYPH_H, -v * GLYPH_H] as [number, number]);
  if (!pts.length) return [];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return pts.map(([x, y]) => [x - cx, y - cy]);
}

/**
 * Station 8: icing piper. A pressure tank with a ram feeds a piping nozzle on an x-y gantry; the nozzle follows the glyph
 * strokes of the typed character while the white icing line appears on the cookie.
 */
export const icer: StationDef = {
  id: 'cookie-icer',
  label: 'Icing piper',
  footprint: [100, 110],
  height: 130,
  duration: 2.4,
  spaceDuration: 0.3,
  outputStage: 'iced',
  create(ctx) {
    const { group, looks } = ctx;
    group.add(stationBase(looks, 48, 44));
    for (const x of [-42, 42]) {
      group.add(beam(looks, [x, -40, BRIDGE_Z], [x, 40, BRIDGE_Z], 4, 'steel'));
      for (const y of [-40, 40]) group.add(beam(looks, [x, y, FLOOR], [x, y, BRIDGE_Z], 5, 'paint'));
    }
    const bridge = new THREE.Group();
    bridge.add(beam(looks, [-46, 0, BRIDGE_Z + 5], [46, 0, BRIDGE_Z + 5], 5, 'paint'));
    const head = new THREE.Group();
    head.add(housing(looks, 10, 10, 14, 'paint-accent', 2));
    const bag = lathe(looks, [[0, 0], [1.2, 0], [1.2, 2], [4.5, 14], [0, 14]], 'steel', 16); // piping cone
    bag.position.z = -14; // cone tip at TIP_Z
    head.add(bag);
    head.position.z = TIP_Z + 14;
    bridge.add(head);
    group.add(bridge);

    // Icing tank at the back with a press ram on top.
    const tank = lathe(looks, [[0, 0], [14, 0], [14, 30], [11, 34], [0, 34]], 'paint', 28);
    tank.position.set(0, 54, FLOOR);
    const ram = piston(looks, { body: 5, rod: 2.5, len: 30, stroke: 24, role: 'paint' });
    ram.group.position.set(0, 54, FLOOR + 34 + 30);
    const dial = gauge(looks, 5);
    dial.group.position.set(-34, 54, 20);
    const ctl = panel(looks, 20, 32);
    ctl.group.position.set(46, -44, FLOOR);
    const beacon = lamp(looks, 2.5);
    beacon.group.position.set(42, 40, BRIDGE_Z + 6);
    group.add(tank, ram.group, dial.group, ctl.group, beacon.group, beam(looks, [0, 54, 30], [0, 20, TIP_Z + 20], 1.8, 'rubber'));

    const shots = oneShots();
    let path: [number, number][] = [];
    let hx = 0;
    let hy = 0;
    let on: boolean | null = null;
    return {
      begin(job) {
        shots.reset();
        path = job.isSpace ? [] : pathOf(job.char);
      },
      update(dt, job, t, product) {
        const live = !!job && !job.isSpace;
        let tx = 0;
        let ty = 0;
        if (live && path.length) {
          const f = Math.min(path.length - 1, t * (path.length - 1));
          const a = path[Math.floor(f)];
          const b = path[Math.ceil(f)];
          const k = f - Math.floor(f);
          tx = a[0] + (b[0] - a[0]) * k;
          ty = a[1] + (b[1] - a[1]) * k;
        }
        const k = 1 - Math.exp(-16 * dt);
        hx += (tx - hx) * k;
        hy += (ty - hy) * k;
        bridge.position.y = hy;
        head.position.x = hx;
        ram.set(live ? t : 0);
        if (job) product?.shape('iced', t);
        if (live && t > 0.02 && t < 0.98) {
          if (shots.once('pipe')) ctx.audio.play('filler-pour', { x: ctx.origin[0] });
          ctx.particles.emit('liquid', { pos: world(ctx, hx, hy, TIP_Z), count: 1, vel: [0, 0, -4], spread: 0.5, floor: world(ctx, 0, 0, BED_T + BAKED_H)[2] });
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
