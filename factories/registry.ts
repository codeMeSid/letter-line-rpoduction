import type { FactoryDef } from '../engine/factory';
import { PRODUCT_KINDS, type ProductKind, type Vec3 } from '../engine/types';
import { demoFactory } from './demo';

/** ProductKind → FactoryDef. Demo stands in for `bottle` until Task 6; other products land later. */
export const FACTORIES: Partial<Record<ProductKind, FactoryDef>> = {
  bottle: demoFactory,
};

export const FACTORY_SPACING = 1600;

/** World origin of a factory: side by side along +x in PRODUCT_KINDS order. */
export function factoryOrigin(kind: ProductKind): Vec3 {
  return [PRODUCT_KINDS.indexOf(kind) * FACTORY_SPACING, 0, 0];
}
