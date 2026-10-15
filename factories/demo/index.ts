import { hl } from '@/lib/hl';
import type { FactoryDef } from '../../engine/factory';
import type { ProductRenderer } from '../../engine/product';
import type { ParticleKind } from '../../engine/particles';
import type { StationCtx, StationDef } from '../../engine/station';
import { flatSurface, glyphPaths } from '../../engine/surface';
import type { SoundName } from '../../audio/types';

/**
 * Temporary generic factory (Task 5) so the whole loop is visible: four box stations and a rounded
 * block product with its glyph on the front face. Replaced by the bottle factory in Tasks 6–7.
 */

interface BoxOpts {
  id: string;
  label: string;
  duration: number;
  outputStage?: string;
  sound: SoundName;
  headDrop: number;                       // how far the head moves down at mid-process
  fx?: { kind: ParticleKind; z: number; count: number; vel?: [number, number, number] };
  headClass?: string;                     // accent on the head crease
}

const FOOT = 56;
const POST_H = 46;

function boxStation(o: BoxOpts): StationDef {
  return {
    id: o.id, label: o.label, footprint: [FOOT, FOOT], height: POST_H + 10, duration: o.duration,
    outputStage: o.outputStage,
    create(ctx: StationCtx) {
      const HL = hl();
      const front = HL.facing(HL.Cam(45, 0.5, 1));
      const [ax, ay, az] = ctx.origin;
      const h = FOOT / 2 - 4;
      const box = (parent: Element, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number) => {
        const [ring, inner] = HL.rings(x0, y0, x1, y1, 2.5, 2);
        const el = HL.solid(parent);
        HL.put(el, HL.prism(ctx.P, front, ring, inner, z0, z1));
        return el;
      };
      // back posts (paint first), then the head that moves
      box(ctx.layer, ax - h, ay - h, ax - h + 6, ay - h + 6, az, az + POST_H);
      box(ctx.layer, ax + h - 6, ay - h, ax + h, ay - h + 6, az, az + POST_H);
      box(ctx.layer, ax - h, ay + h - 6, ax - h + 6, ay + h, az, az + POST_H);
      const headG = HL.mk('g', {}, ctx.layer);
      const head = box(headG, ax - h, ay - h, ax + h, ay + h, az + POST_H, az + POST_H + 10);
      if (o.headClass) head.cr.setAttribute('class', `${o.headClass} nf`);
      const [, y0] = ctx.P(0, 0, 0);
      let lastDz = -1;
      return {
        begin(job) {
          if (!job.isSpace) ctx.audio.play(o.sound, { x: ax });
        },
        update(_dt, job, t) {
          const dz = job && !job.isSpace ? o.headDrop * Math.sin(Math.PI * t) : 0;
          if (Math.abs(dz - lastDz) > 0.05) {
            headG.setAttribute('transform', `translate(0 ${HL.r2(ctx.P(0, 0, -dz)[1] - y0)})`);
            lastDz = dz;
          }
          if (o.fx && job && !job.isSpace && t > 0.2 && t < 0.8 && Math.random() < 0.5) {
            ctx.particles.emit(o.fx.kind, { pos: [ax, ay, az + o.fx.z], count: o.fx.count, vel: o.fx.vel, floor: az });
          }
        },
        finish: () => 'pass',
        destroy() {
          ctx.layer.replaceChildren();
        },
      };
    },
  };
}

const SIZE = 16;
const HEIGHT = 20;

export const demoProduct: ProductRenderer = {
  kind: 'bottle',
  stages: ['raw', 'block', 'pressed', 'baked'],
  size: [SIZE, SIZE, HEIGHT],
  draw(g, job, _marks, P) {
    const HL = hl();
    const front = HL.facing(HL.Cam(45, 0.5, 1));
    const solid = (r: number, b: number, half: number, z1: number) => {
      const [ring, inner] = HL.rings(-half, -half, half, half, r, b);
      HL.put(HL.solid(g), HL.prism(P, front, ring, inner, 0, z1));
    };
    if (job.isSpace) return solid(2, 1, 9, 2);       // empty carrier tray
    if (job.stage === 'raw') return solid(4, 1.5, 6, 6); // lump of raw material
    const s = SIZE / 2;
    solid(3, 1.5, s, job.stage === 'pressed' || job.stage === 'baked' ? HEIGHT : HEIGHT + 4);
    // glyph on the +y face (left-front on screen, the side the shelf shows); u runs +x (screen right), v down
    const surf = flatSurface([-s, s + 0.01, HEIGHT], [1, 0, 0], [0, 0, -1], [SIZE, HEIGHT]);
    const d = glyphPaths(job.char, surf, P, { scale: 0.75, offset: [0, 0.1] });
    HL.mk('path', { d, class: job.stage === 'baked' ? 'acc-molten nf' : 'hi nf' }, g);
  },
};

export const demoFactory: FactoryDef = {
  kind: 'bottle',
  label: 'Demo line',
  rawMaterials: ['clay'],
  product: demoProduct,
  stations: [
    boxStation({ id: 'hopper', label: 'Hopper', duration: 0.8, outputStage: 'block', sound: 'pour-sand', headDrop: 0,
      fx: { kind: 'sand', z: POST_H, count: 3 } }),
    boxStation({ id: 'press', label: 'Press', duration: 0.7, outputStage: 'pressed', sound: 'press-thump', headDrop: 22,
      fx: { kind: 'spark', z: HEIGHT, count: 2, vel: [0, 0, 60] } }),
    boxStation({ id: 'oven', label: 'Oven', duration: 1.0, outputStage: 'baked', sound: 'hiss', headDrop: 6,
      fx: { kind: 'ember', z: POST_H, count: 1, vel: [0, 0, 20] }, headClass: 'acc-molten' }),
    boxStation({ id: 'robot', label: 'Robot', duration: 0.5, sound: 'robot-servo', headDrop: 12 }),
  ],
};
