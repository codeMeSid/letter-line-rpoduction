import type * as THREE from 'three';
import type { StationCtx } from '../../../engine/station';
import { beam, gauge, lamp, panel, piston } from '../../shared/parts';
import { FLOOR } from '../../shared/stationKit';

/** Control cabinet, pressure dial and status beacon every station carries; `tick(live, load)` animates them. */
export function controls(ctx: StationCtx, cabinet: [number, number], dial: [number, number, number], beacon: [number, number, number]) {
  const { group, looks } = ctx;
  const d = gauge(looks, 5);
  d.group.position.set(...dial);
  const p = panel(looks, 20, 32);
  p.group.position.set(cabinet[0], cabinet[1], FLOOR);
  const b = lamp(looks, 2.6);
  b.group.position.set(...beacon);
  group.add(d.group, p.group, b.group);
  let on: boolean | null = null;
  return {
    tick(live: boolean, load = 0.5) {
      p.update(ctx.now());
      d.set(0.4 + 0.45 * load);
      if (live !== on) { on = live; b.set(live); }
    },
  };
}

/** Portal press: two posts either side of the belt, a bridge and a hydraulic ram hanging at `mount`. The tool is parented to `ram.rodEnd` (hangs below it). */
export function portal(ctx: StationCtx, mount: number, tool: number, contact: number, body = 8) {
  const { group, looks } = ctx;
  const stroke = mount - tool - contact;
  const top = mount + stroke + 14; // bridge sits on the cylinder cap (body length stroke + 8, lug 6 above it)
  for (const y of [-36, 36]) group.add(beam(looks, [0, y, FLOOR], [0, y, top + 4], 7, 'paint'), beam(looks, [0, y, top], [0, 0, top], 6, 'paint'));
  const ram = piston(looks, { body, rod: body * 0.45, len: stroke + 8, stroke, role: 'steel' });
  ram.group.position.z = mount;
  group.add(ram.group);
  return { ram, stroke, mount, rodZ: (ext: number) => mount - stroke * ext };
}
export type Portal = ReturnType<typeof portal>;
export type Obj = THREE.Object3D;
