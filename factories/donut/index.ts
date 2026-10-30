import type { FactoryDef } from '../../engine/factory';
import { donutProduct } from './product';
import { cooler } from './stations/cooler';
import { depositor } from './stations/depositor';
import { flour } from './stations/flour';
import { fryer } from './stations/fryer';
import { glazer } from './stations/glazer';
import { inspection } from './stations/inspection';
import { mixer } from './stations/mixer';
import { piper } from './stations/piper';
import { proofer } from './stations/proofer';
import { robot } from './stations/robot';
import { sprinkler } from './stations/sprinkler';

export const donutFactory: FactoryDef = {
  kind: 'donut',
  label: 'Glazed donut',
  product: donutProduct,
  stations: [flour, mixer, proofer, depositor, fryer, cooler, glazer, sprinkler, piper, inspection, robot],
};
