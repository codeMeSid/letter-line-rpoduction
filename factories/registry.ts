import { campusLayout, PAD_LEFT, PAD_RIGHT, SITE_SIZE, type Plot } from '../engine/campus';
import type { FactoryDef } from '../engine/factory';
import { layoutStations } from '../engine/layout';
import { LAYOUT_MODES, PRODUCT_KINDS, type ProductKind, type Vec3 } from '../engine/types';
import { shelfWidth } from '../shelf/view';
import { bottleFactory } from './bottle';
import { letterFactory } from './letter';
import { BELT_TOP } from './shared/dims';

/** ProductKind → FactoryDef (built factories only; the rest are construction sites). */
export const FACTORIES: Partial<Record<ProductKind, FactoryDef>> = { letter: letterFactory, bottle: bottleFactory };

/** Plot width: the widest the factory gets in any layout mode (or its shelf), plus the left pad and the dock pad. */
export function plotWidth(def: FactoryDef): number {
  let w = shelfWidth(def.product.size);
  for (const m of LAYOUT_MODES) {
    const b = layoutStations(def.stations, m, [0, 0, BELT_TOP]).bounds;
    w = Math.max(w, b.max[0] - b.min[0]);
  }
  return PAD_LEFT + w + PAD_RIGHT;
}

/** The campus: one plot per kind along +x in PRODUCT_KINDS order. */
export const PLOTS: readonly Plot[] = campusLayout(PRODUCT_KINDS.map((kind) => {
  const def = FACTORIES[kind];
  return { kind, width: def ? plotWidth(def) : SITE_SIZE[0], built: !!def };
}));

export const plotOf = (kind: ProductKind): Plot => PLOTS.find((p) => p.kind === kind)!;

/** World origin of a factory (its layout origin) on the campus. */
export const factoryOrigin = (kind: ProductKind): Vec3 => plotOf(kind).origin;
