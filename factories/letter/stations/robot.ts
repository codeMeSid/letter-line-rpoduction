import { railRobot } from '../../shared/railRobot';
import { LETTER_H, LETTER_R, PALLET_T } from '../product';

export { RAIL_BEHIND } from '../../shared/railRobot';

/** Station 7: tip height over the product root: just above the flat letter, and above the upright one. */
export const robot = railRobot('letter-robot', PALLET_T + 2 * LETTER_R + 2, LETTER_H + 2 * LETTER_R);
