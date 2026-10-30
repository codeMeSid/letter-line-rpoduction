import type { FactoryDef } from '../../engine/factory';
import { carProduct } from './product';
import { axler } from './stations/axler';
import { boxer } from './stations/boxer';
import { chiller } from './stations/chiller';
import { heater } from './stations/heater';
import { hopper } from './stations/hopper';
import { inspect } from './stations/inspect';
import { paint } from './stations/paint';
import { press } from './stations/press';
import { printer } from './stations/printer';
import { robot } from './stations/robot';
import { trimmer } from './stations/trimmer';
import { wheeler } from './stations/wheeler';

export const carFactory: FactoryDef = {
  kind: 'car',
  label: 'Toy car',
  product: carProduct,
  stations: [hopper, heater, press, chiller, trimmer, axler, wheeler, paint, printer, inspect, boxer, robot],
};
