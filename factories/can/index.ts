import type { FactoryDef } from '../../engine/factory';
import { canProduct } from './product';
import { blanker } from './stations/blanker';
import { bodymaker } from './stations/bodymaker';
import { cupper } from './stations/cupper';
import { filler } from './stations/filler';
import { necker } from './stations/necker';
import { printer } from './stations/printer';
import { robot } from './stations/robot';
import { seamer } from './stations/seamer';
import { tester } from './stations/tester';
import { trimmer } from './stations/trimmer';
import { uncoiler } from './stations/uncoiler';
import { washer } from './stations/washer';

export const canFactory: FactoryDef = {
  kind: 'can',
  label: 'Aluminium can',
  product: canProduct,
  stations: [uncoiler, blanker, cupper, bodymaker, trimmer, washer, printer, necker, tester, filler, seamer, robot],
};
