import { railRobot } from '../../shared/railRobot';
import { BED_T } from '../product';

/** Station 11: tip height over the product root on the belt and on the shelf: the cookie is gripped on its cup; on the shelf the baking disc is gone, so it sits BED_T lower. */
export const robot = railRobot('cookie-robot', BED_T + 6, 6);
