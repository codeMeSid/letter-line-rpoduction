import type { FactoryDef } from '../../engine/factory';
import { cookieProduct } from './product';
import { cooler } from './stations/cooler';
import { cutter } from './stations/cutter';
import { depositor } from './stations/depositor';
import { extruder } from './stations/extruder';
import { hopper } from './stations/hopper';
import { icer } from './stations/icer';
import { mixer } from './stations/mixer';
import { oven } from './stations/oven';
import { packer } from './stations/packer';
import { robot } from './stations/robot';
import { sprinkler } from './stations/sprinkler';

export const cookieFactory: FactoryDef = {
  kind: 'cookie',
  label: 'Chocolate chip cookie',
  product: cookieProduct,
  stations: [hopper, mixer, extruder, cutter, depositor, oven, cooler, icer, sprinkler, packer, robot],
};
