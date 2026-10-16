import type { FactoryDef } from '../../engine/factory';
import { letterProduct } from './product';
import { cooling } from './stations/cooling';
import { grinder } from './stations/grinder';
import { moulder } from './stations/moulder';
import { polish } from './stations/polish';
import { pour } from './stations/pour';
import { robot } from './stations/robot';
import { shakeout } from './stations/shakeout';

export const letterFactory: FactoryDef = {
  kind: 'letter',
  label: 'Cast metal letter',
  product: letterProduct,
  stations: [moulder, pour, cooling, shakeout, grinder, polish, robot],
};
