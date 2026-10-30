import type { FactoryDef } from '../../engine/factory';
import { mugProduct } from './product';
import { bisqueKiln } from './stations/bisqueKiln';
import { blunger } from './stations/blunger';
import { caster } from './stations/caster';
import { clayBin } from './stations/clayBin';
import { dryer } from './stations/dryer';
import { glazeKiln } from './stations/glazeKiln';
import { glazer } from './stations/glazer';
import { handler } from './stations/handler';
import { inspection } from './stations/inspection';
import { printer } from './stations/printer';
import { robot } from './stations/robot';

export const mugFactory: FactoryDef = {
  kind: 'mug',
  label: 'Ceramic mug',
  product: mugProduct,
  stations: [clayBin, blunger, caster, handler, dryer, bisqueKiln, inspection, glazer, glazeKiln, printer, robot],
};
