import type { ProductKind } from './types';
import type { StationDef } from './station';
import type { ProductRenderer } from './product';

export interface FactoryDef {
  kind: ProductKind;
  label: string;              // HUD dropdown label e.g. 'Glass bottle'
  stations: StationDef[];     // in process order; last must be the robot/placer
  product: ProductRenderer;
  rawMaterials: string[];     // names for the pour animation at station 0
}
