import type { ProductModel } from './product';
import type { StationDef } from './station';
import type { ProductKind } from './types';

export interface FactoryDef {
  kind: ProductKind;
  label: string;           // HUD label, e.g. 'Cast metal letter'
  stations: StationDef[];  // process order; last places on the shelf
  product: ProductModel;
}
