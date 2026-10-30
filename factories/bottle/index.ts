import type { FactoryDef } from '../../engine/factory';
import { bottleProduct } from './product';
import { capper } from './stations/capper';
import { coder } from './stations/coder';
import { filler } from './stations/filler';
import { furnace } from './stations/furnace';
import { gobShear } from './stations/gobShear';
import { inspection } from './stations/inspection';
import { isMachine } from './stations/isMachine';
import { labeler } from './stations/labeler';
import { lehr } from './stations/lehr';
import { mixer } from './stations/mixer';
import { rinser } from './stations/rinser';
import { robot } from './stations/robot';
import { silos } from './stations/silos';

export const bottleFactory: FactoryDef = {
  kind: 'bottle',
  label: 'Glass bottle',
  product: bottleProduct,
  stations: [silos, mixer, furnace, gobShear, isMachine, lehr, inspection, rinser, filler, capper, labeler, coder, robot],
};
