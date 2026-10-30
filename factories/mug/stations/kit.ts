import type * as THREE from 'three';
import type { StationCtx } from '../../../engine/station';
import type { Vec3 } from '../../../engine/types';
import { gauge, lamp, panel } from '../../shared/parts';
import { FLOOR } from '../../shared/stationKit';

/** Controller cabinet, pressure dial and beacon common to every mug station; `tick(live)` every frame. */
export function controls(ctx: StationCtx, group: THREE.Group, beaconAt: Vec3, side = -1) {
  const { looks } = ctx;
  const dial = gauge(looks, 5);
  dial.group.position.set(side * 34, -34, 40);
  const ctl = panel(looks, 22, 34);
  ctl.group.position.set(side * 54, -44, FLOOR);
  const beacon = lamp(looks, 2.6);
  beacon.group.position.set(...beaconAt);
  group.add(dial.group, ctl.group, beacon.group);
  let on: boolean | null = null;
  return (live: boolean) => {
    ctl.update(ctx.now());
    dial.set(0.5 + 0.25 * Math.sin(ctx.now() / 900));
    if (live !== on) { on = live; beacon.set(live); }
  };
}
